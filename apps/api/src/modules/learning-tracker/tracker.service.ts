// ─────────────────────────────────────────────────────────────────────────────
// Tracker Service — Sprint 4: Adaptive Engine & Mastery Tracking
//
// Implements:
//   • FSRS-4.5 algorithm (state-of-the-art spaced repetition used by Anki/RemNote)
//   • Confidence rating → FSRS grade mapping (1=Again, 2=Hard, 3=Good, 4=Easy)
//   • Learning Streak tracking (daily, freeze support)
//   • Streak XP multiplier (3d=1.2×, 7d=1.5×, 14d=1.75×, 30d=2.0×)
//   • Recommendation Engine (Neo4j prerequisites + PostgreSQL mastery)
//   • "Today's Plan" daily session planner
//   • Due concepts endpoint (for Smart Review Session)
//   • Learning insights (optimal study hour detection)
//   • Dashboard stats aggregation
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Domain } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Neo4jService } from '../knowledge-graph/neo4j.service';

// ─── FSRS-4.5 Weight Vector ───────────────────────────────────────────────────
// Default weights from the FSRS-4.5 paper (Ye et al., 2024).
// Grade 1=Again, 2=Hard, 3=Good, 4=Easy
const FSRS_W = [
  0.4, 0.6, 2.4, 5.8,    // w[0-3]: initial stability by grade
  4.93, 0.94, 0.86, 0.01, // w[4-7]: difficulty params
  1.49, 0.14, 0.94,        // w[8-10]: stability after recall
  2.18, 0.05, 0.34, 1.26, // w[11-14]: stability after forgetting
  0.29, 2.61,              // w[15-16]: hard/easy modifiers
];

// ─── FSRS Algorithm Functions ─────────────────────────────────────────────────

function fsrsInitialStability(grade: number): number {
  return FSRS_W[Math.min(Math.max(grade, 1), 4) - 1]; // W[0..3]
}

function fsrsInitialDifficulty(grade: number): number {
  const d = FSRS_W[4] - Math.exp(FSRS_W[5] * (grade - 1)) + 1;
  return Math.max(1, Math.min(10, d));
}

function fsrsRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 1;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

function fsrsNextStabilityForgetting(d: number, s: number, r: number): number {
  return (
    FSRS_W[11] *
    Math.pow(Math.max(d, 0.1), -FSRS_W[12]) *
    (Math.pow(s + 1, FSRS_W[13]) - 1) *
    Math.exp(FSRS_W[14] * (1 - r))
  );
}

function fsrsNextStabilityRecall(d: number, s: number, r: number, grade: number): number {
  const easyBonus = grade === 4 ? FSRS_W[16] : 1;
  const hardPenalty = grade === 2 ? FSRS_W[15] : 1;
  return (
    s *
    (Math.exp(FSRS_W[8]) *
      (11 - d) *
      Math.pow(Math.max(s, 0.1), -FSRS_W[9]) *
      (Math.exp(FSRS_W[10] * (1 - r)) - 1) *
      easyBonus *
      hardPenalty +
      1)
  );
}

function fsrsUpdateDifficulty(d: number, grade: number): number {
  const delta = -FSRS_W[6] * (grade - 3);
  const newD = d + delta * ((10 - d) / 9);
  const d0_4 = fsrsInitialDifficulty(4);
  return Math.max(1, Math.min(10, FSRS_W[7] * d0_4 + (1 - FSRS_W[7]) * newD));
}

/**
 * Map user answer correctness + confidence to FSRS grade (1-4).
 * If confidenceRating is provided, it overrides the default mapping.
 */
function computeFsrsGrade(isCorrect: boolean, confidenceRating?: number): number {
  if (confidenceRating && confidenceRating >= 1 && confidenceRating <= 4) {
    if (!isCorrect) {
      // Wrong answer: cap grade at 2 (Hard) regardless of overconfidence
      return Math.min(confidenceRating, 2);
    }
    // Correct answer: grade 3 or 4
    return Math.max(confidenceRating, 3);
  }
  // Default: correct→3 (Good), wrong→1 (Again)
  return isCorrect ? 3 : 1;
}

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
  ) {}

  // ─── FSRS Forgetting Curve ────────────────────────────────────────────────

  /**
   * Called after every question attempt.
   * Implements FSRS-4.5: tracks personalized difficulty (D) and stability (S)
   * per concept per user. Updates retentionScore and nextRevisionDue.
   */
  async updateRetention(
    userId: string,
    conceptId: string,
    isCorrect: boolean,
    confidenceRating?: number,
  ): Promise<void> {
    try {
      const record = await this.prisma.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId } },
      });

      if (!record) return; // ConceptMastery must exist first (created in questions.service)

      const now = new Date();
      const grade = computeFsrsGrade(isCorrect, confidenceRating);

      const lastRevision = record.lastRevisionAt ?? record.firstAttemptAt ?? now;
      const elapsedDays =
        (now.getTime() - lastRevision.getTime()) / (1000 * 60 * 60 * 24);

      let newStability: number;
      let newDifficulty: number;

      const currentStability = Math.max(record.memoryStrength, 0.1);
      const currentDifficulty = record.fsrsDifficulty ?? 5.0;
      const currentRetention = fsrsRetrievability(elapsedDays, currentStability);

      if (record.revisionCount === 0) {
        // First review — use initial FSRS values
        newStability = fsrsInitialStability(grade);
        newDifficulty = fsrsInitialDifficulty(grade);
      } else {
        // Subsequent reviews — apply FSRS update formulas
        newDifficulty = fsrsUpdateDifficulty(currentDifficulty, grade);
        if (grade === 1 || grade === 2) {
          // Forgetting: stability shrinks
          newStability = fsrsNextStabilityForgetting(
            newDifficulty,
            currentStability,
            currentRetention,
          );
        } else {
          // Recall: stability grows
          newStability = fsrsNextStabilityRecall(
            newDifficulty,
            currentStability,
            currentRetention,
            grade,
          );
        }
      }

      // Clamp stability to sensible range (30 min → 2 years)
      newStability = Math.max(0.02, Math.min(730, newStability));

      // nextRevisionDue: the day retention would drop to 0.9
      // R(t,S) = (1+t/(9S))^(-1) = 0.9 → t = S
      const nextRevisionDue = new Date(
        now.getTime() + newStability * 24 * 60 * 60 * 1000,
      );

      // Live retention score at time of review
      const retentionScore = Math.min(1, Math.max(0, currentRetention));

      await this.prisma.conceptMastery.update({
        where: { userId_conceptId: { userId, conceptId } },
        data: {
          memoryStrength: newStability,
          fsrsDifficulty: newDifficulty,
          retentionScore,
          nextRevisionDue,
          lastRevisionAt: now,
          revisionCount: { increment: 1 },
        },
      });

      this.logger.debug(
        `[FSRS] user=${userId} concept=${conceptId} grade=${grade} ` +
          `S=${newStability.toFixed(2)}d D=${newDifficulty.toFixed(2)} ` +
          `R=${(retentionScore * 100).toFixed(0)}% nextDue=${nextRevisionDue.toISOString()}`,
      );
    } catch (err) {
      this.logger.warn(`[FSRS] updateRetention failed: ${err}`);
    }
  }

  /**
   * Called from confidence rating endpoint AFTER the initial updateRetention.
   * Overrides the FSRS calculation with the user's explicit grade.
   */
  async rateConfidence(
    userId: string,
    attemptId: string,
    grade: number, // 1-4
  ): Promise<{ updated: boolean }> {
    const attempt = await this.prisma.questionAttempt.findUnique({
      where: { id: attemptId },
      include: { question: true },
    });
    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException('Attempt not found');
    }

    // Update the confidence rating on the attempt record
    await this.prisma.questionAttempt.update({
      where: { id: attemptId },
      data: { confidenceRating: grade },
    });

    // Re-run FSRS with the explicit grade (overrides the binary correct/incorrect)
    await this.updateRetention(userId, attempt.question.conceptId, attempt.isCorrect, grade);

    return { updated: true };
  }

  // ─── Streak XP Multiplier ─────────────────────────────────────────────────

  static getStreakMultiplier(streak: number): number {
    if (streak >= 30) return 2.0;
    if (streak >= 14) return 1.75;
    if (streak >= 7) return 1.5;
    if (streak >= 3) return 1.2;
    return 1.0;
  }

  async getStreakMultiplierForUser(userId: string): Promise<number> {
    const streak = await this.prisma.learningStreak.findUnique({
      where: { userId },
    });
    return TrackerService.getStreakMultiplier(streak?.currentStreak ?? 0);
  }

  // ─── Learning Streak ─────────────────────────────────────────────────────

  async updateStreak(userId: string): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const streak = await this.prisma.learningStreak.upsert({
        where: { userId },
        update: {},
        create: { userId, currentStreak: 0, longestStreak: 0, streakFreezes: 2, totalActiveDays: 0 },
      });

      const lastActive = streak.lastActiveDate ? new Date(streak.lastActiveDate) : null;

      if (lastActive) {
        lastActive.setHours(0, 0, 0, 0);
        const diffDays = Math.round(
          (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 0) return; // Already counted today

        if (diffDays === 1) {
          const newStreak = streak.currentStreak + 1;
          await this.prisma.learningStreak.update({
            where: { userId },
            data: {
              currentStreak: newStreak,
              longestStreak: Math.max(newStreak, streak.longestStreak),
              lastActiveDate: today,
              totalActiveDays: { increment: 1 },
            },
          });
        } else if (streak.streakFreezes > 0) {
          await this.prisma.learningStreak.update({
            where: { userId },
            data: { streakFreezes: { decrement: 1 }, lastActiveDate: today, totalActiveDays: { increment: 1 } },
          });
          this.logger.log(`[Streak] user=${userId} consumed a streak freeze`);
        } else {
          await this.prisma.learningStreak.update({
            where: { userId },
            data: { currentStreak: 1, lastActiveDate: today, totalActiveDays: { increment: 1 } },
          });
        }
      } else {
        await this.prisma.learningStreak.update({
          where: { userId },
          data: { currentStreak: 1, longestStreak: 1, lastActiveDate: today, totalActiveDays: { increment: 1 } },
        });
      }
    } catch (err) {
      this.logger.warn(`[Streak] updateStreak failed: ${err}`);
    }
  }

  // ─── Recommendation Engine ────────────────────────────────────────────────

  async generateRecommendations(
    userId: string,
    domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ): Promise<any[]> {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    const graphResult = await this.neo4j.runQuery<{
      id: string;
      name: string;
      domain: string;
      prerequisiteIds: string[];
    }>(
      `MATCH (c:Concept)
       WHERE c.domain = $domain OR c.domain = 'BOTH'
       OPTIONAL MATCH (prereq:Concept)-[:LEADS_TO]->(c)
       RETURN c.id AS id, c.name AS name, c.domain AS domain,
              collect(prereq.id) AS prerequisiteIds
       LIMIT 100`,
      { domain },
    );
    const concepts = graphResult.map((r) => ({
      id: r.id,
      name: r.name,
      prerequisiteIds: r.prerequisiteIds ?? [],
    }));

    const masteries = await this.prisma.conceptMastery.findMany({
      where: { userId, domain: domain as Domain },
    });
    const masteryMap = new Map(masteries.map((m) => [m.conceptId, m]));

    const recommendations: any[] = [];

    for (const concept of concepts) {
      const mastery = masteryMap.get(concept.id);

      if (mastery) {
        if (mastery.nextRevisionDue && mastery.nextRevisionDue <= soonThreshold && mastery.totalAttempts >= 3) {
          const retention = Math.round((mastery.retentionScore ?? 1) * 100);
          recommendations.push({
            conceptId: concept.id, conceptName: concept.name, type: 'REVISE',
            reason: `Retention at ${retention}% — review due to stay sharp`, priority: 1,
          });
        } else if (mastery.masteryScore < 0.6 && mastery.totalAttempts >= 2) {
          const accuracy = Math.round(mastery.masteryScore * 100);
          recommendations.push({
            conceptId: concept.id, conceptName: concept.name, type: 'PRACTICE',
            reason: `Accuracy at ${accuracy}% — more practice needed`, priority: 3,
          });
        }
      } else {
        const prereqsMet = concept.prerequisiteIds.every((pid) => {
          const m = masteryMap.get(pid);
          return !m || m.masteryLevel >= 2;
        });
        if (prereqsMet) {
          recommendations.push({
            conceptId: concept.id, conceptName: concept.name, type: 'LEARN_NEW',
            reason: concept.prerequisiteIds.length === 0
              ? 'Foundational concept — great starting point'
              : 'Prerequisites mastered — ready to learn this!',
            priority: 2,
          });
        }
      }
    }

    recommendations.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return Math.random() - 0.5;
    });

    const top = recommendations.slice(0, 10);

    if (top.length > 0) {
      await this.prisma.recommendation.deleteMany({ where: { userId, isActedOn: false } });
      await this.prisma.recommendation.createMany({
        data: top.map((r, i) => ({
          userId, conceptId: r.conceptId, conceptName: r.conceptName,
          type: r.type, reason: r.reason, priority: i + 1,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })),
      });
    }

    return top;
  }

  // ─── "Today's Plan" Session Planner ──────────────────────────────────────

  async getDailyPlan(userId: string, domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA') {
    const now = new Date();

    const [profile, streak, masteries] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.learningStreak.findUnique({ where: { userId } }),
      this.prisma.conceptMastery.findMany({ where: { userId, domain: domain as Domain } }),
    ]);

    const dailyGoalMins = profile?.dailyGoalMins ?? 30;
    const multiplier = TrackerService.getStreakMultiplier(streak?.currentStreak ?? 0);

    // 1. Revisions due (most urgent first, cap at 40% of time)
    const revisionDue = masteries
      .filter((m) => m.nextRevisionDue && m.nextRevisionDue <= now && m.totalAttempts >= 3)
      .sort((a, b) => (a.retentionScore ?? 1) - (b.retentionScore ?? 1))
      .slice(0, Math.max(1, Math.floor(dailyGoalMins / 10)));

    // 2. One new concept to learn (lowest difficulty prerequisite chain, not yet started)
    const allMasteredIds = new Set(masteries.filter(m => m.masteryLevel >= 2).map(m => m.conceptId));
    const graphResult = await this.neo4j.runQuery<{ id: string; name: string; prerequisiteIds: string[] }>(
      `MATCH (c:Concept) WHERE c.domain = $domain OR c.domain = 'BOTH'
       OPTIONAL MATCH (prereq:Concept)-[:LEADS_TO]->(c)
       RETURN c.id AS id, c.name AS name, collect(prereq.id) AS prerequisiteIds
       LIMIT 80`,
      { domain },
    );
    const masteredConceptIds = new Set(masteries.map(m => m.conceptId));
    const learnNew = graphResult
      .map(r => ({ id: r.id, name: r.name, prerequisiteIds: r.prerequisiteIds ?? [] }))
      .find(c => !masteredConceptIds.has(c.id) && c.prerequisiteIds.every(pid => allMasteredIds.has(pid)));

    // 3. One weak concept to practice
    const weakConcept = masteries
      .filter((m) => m.masteryScore < 0.6 && m.totalAttempts >= 2 && !revisionDue.find(r => r.conceptId === m.conceptId))
      .sort((a, b) => a.masteryScore - b.masteryScore)[0];

    // Estimate time: ~2 min per question, 5 questions per concept
    const revisionMins = revisionDue.length * 10;
    const learnMins = learnNew ? 8 : 0;
    const practiceMins = weakConcept ? 5 : 0;
    const totalMins = revisionMins + learnMins + practiceMins;

    return {
      totalEstimatedMins: totalMins,
      dailyGoalMins,
      multiplier,
      streak: streak?.currentStreak ?? 0,
      revisions: revisionDue.map(m => ({
        conceptId: m.conceptId,
        conceptName: m.conceptName,
        retentionScore: m.retentionScore ?? 0,
        nextRevisionDue: m.nextRevisionDue,
        estimatedMins: 10,
      })),
      learnNew: learnNew
        ? { conceptId: learnNew.id, conceptName: learnNew.name, estimatedMins: 8 }
        : null,
      practice: weakConcept
        ? {
            conceptId: weakConcept.conceptId,
            conceptName: weakConcept.conceptName,
            masteryScore: weakConcept.masteryScore,
            estimatedMins: 5,
          }
        : null,
    };
  }

  // ─── Due Concepts (Smart Review) ─────────────────────────────────────────

  async getDueConcepts(userId: string, domain?: 'DSA' | 'SYSTEM_DESIGN') {
    const now = new Date();
    const where: any = { userId, totalAttempts: { gte: 2 } };
    if (domain) where.domain = domain;

    const due = await this.prisma.conceptMastery.findMany({
      where: {
        ...where,
        nextRevisionDue: { lte: now },
      },
      orderBy: { retentionScore: 'asc' }, // lowest retention = most urgent
      take: 20,
    });

    return due.map(m => ({
      conceptId: m.conceptId,
      conceptName: m.conceptName,
      domain: m.domain,
      retentionScore: m.retentionScore,
      nextRevisionDue: m.nextRevisionDue,
      masteryScore: m.masteryScore,
      fsrsDifficulty: m.fsrsDifficulty,
    }));
  }

  // ─── Learning Insights ────────────────────────────────────────────────────

  async getInsights(userId: string) {
    // Fetch last 200 attempts to analyse patterns
    const attempts = await this.prisma.questionAttempt.findMany({
      where: { userId },
      select: { timestamp: true, isCorrect: true, score: true },
      orderBy: { timestamp: 'desc' },
      take: 200,
    });

    if (attempts.length < 10) {
      return { optimalHours: null, totalAttempts: attempts.length, message: 'Need at least 10 attempts for insights' };
    }

    // Group by hour of day
    const hourlyStats: Record<number, { count: number; correct: number }> = {};
    for (const a of attempts) {
      const hour = new Date(a.timestamp).getHours();
      if (!hourlyStats[hour]) hourlyStats[hour] = { count: 0, correct: 0 };
      hourlyStats[hour].count++;
      if (a.isCorrect) hourlyStats[hour].correct++;
    }

    // Find best 2-hour window (minimum 3 attempts)
    const hours = Object.entries(hourlyStats)
      .filter(([, s]) => s.count >= 3)
      .map(([h, s]) => ({ hour: parseInt(h), accuracy: s.correct / s.count, count: s.count }))
      .sort((a, b) => b.accuracy - a.accuracy);

    const bestHour = hours[0];
    const bestRange = bestHour
      ? `${bestHour.hour}:00–${bestHour.hour + 1}:59`
      : null;

    // Day-of-week analysis
    const dayStats: Record<number, { count: number; correct: number }> = {};
    for (const a of attempts) {
      const day = new Date(a.timestamp).getDay();
      if (!dayStats[day]) dayStats[day] = { count: 0, correct: 0 };
      dayStats[day].count++;
      if (a.isCorrect) dayStats[day].correct++;
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const bestDay = Object.entries(dayStats)
      .filter(([, s]) => s.count >= 2)
      .sort(([, a], [, b]) => b.correct / b.count - a.correct / a.count)[0];

    return {
      totalAttempts: attempts.length,
      optimalHours: bestRange,
      optimalHourAccuracy: bestHour ? Math.round(bestHour.accuracy * 100) : null,
      bestDay: bestDay ? dayNames[parseInt(bestDay[0])] : null,
      hourlyBreakdown: hours.slice(0, 5).map(h => ({
        hour: h.hour,
        label: `${h.hour}:00`,
        accuracy: Math.round(h.accuracy * 100),
        count: h.count,
      })),
    };
  }

  // ─── Dashboard Stats ─────────────────────────────────────────────────────

  async getDashboardStats(userId: string) {
    const [profile, streak, masteries, attemptAgg] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.learningStreak.findUnique({ where: { userId } }),
      this.prisma.conceptMastery.findMany({ where: { userId } }),
      this.prisma.questionAttempt.aggregate({
        where: { userId },
        _count: { id: true },
        _sum: { score: true },
      }),
    ]);

    const totalAttempts = attemptAgg._count.id ?? 0;
    const sumScore = attemptAgg._sum.score ?? 0;
    const accuracy = totalAttempts > 0 ? Math.round((sumScore / totalAttempts) * 100) : null;
    const masteredCount = masteries.filter((m) => m.masteryLevel >= 3).length;
    const currentStreak = streak?.currentStreak ?? 0;
    const multiplier = TrackerService.getStreakMultiplier(currentStreak);

    return {
      totalXP: profile?.totalXP ?? 0,
      currentLevel: profile?.currentLevel ?? 1,
      streak: {
        current: currentStreak,
        longest: streak?.longestStreak ?? 0,
        freezes: streak?.streakFreezes ?? 2,
        lastActiveDate: streak?.lastActiveDate ?? null,
        multiplier,
      },
      mastery: {
        totalConcepts: masteries.length,
        masteredCount,
        dsaMastered: masteries.filter((m) => m.domain === 'DSA' && m.masteryLevel >= 3).length,
        sdMastered: masteries.filter((m) => m.domain === 'SYSTEM_DESIGN' && m.masteryLevel >= 3).length,
        dueConcepts: masteries.filter(m => m.nextRevisionDue && m.nextRevisionDue <= new Date()).length,
      },
      accuracy,
      totalAttempts,
    };
  }

  // ─── Mastery Overview ─────────────────────────────────────────────────────

  async getMasteryOverview(userId: string, domain?: 'DSA' | 'SYSTEM_DESIGN') {
    const where: any = { userId };
    if (domain) where.domain = domain;

    const masteries = await this.prisma.conceptMastery.findMany({
      where,
      orderBy: [{ masteryLevel: 'desc' }, { lastAttemptAt: 'desc' }],
    });

    const now = new Date();
    return masteries.map((m) => {
      const elapsed = m.lastRevisionAt
        ? (now.getTime() - m.lastRevisionAt.getTime()) / (1000 * 60 * 60 * 24)
        : null;
      const liveRetention =
        elapsed !== null && m.memoryStrength > 0
          ? Math.max(0, Math.min(1, fsrsRetrievability(elapsed, m.memoryStrength)))
          : m.retentionScore;

      return {
        conceptId: m.conceptId,
        conceptName: m.conceptName,
        domain: m.domain,
        masteryLevel: m.masteryLevel,
        masteryScore: m.masteryScore,
        retentionScore: liveRetention,
        memoryStrength: m.memoryStrength,
        fsrsDifficulty: m.fsrsDifficulty,
        nextRevisionDue: m.nextRevisionDue,
        revisionCount: m.revisionCount,
        totalAttempts: m.totalAttempts,
        correctAttempts: m.correctAttempts,
        lastAttemptAt: m.lastAttemptAt,
        isDue: m.nextRevisionDue ? m.nextRevisionDue <= now : false,
      };
    });
  }

  // ─── Streak Info ──────────────────────────────────────────────────────────

  async getStreakInfo(userId: string) {
    const streak = await this.prisma.learningStreak.upsert({
      where: { userId },
      update: {},
      create: { userId, currentStreak: 0, longestStreak: 0, streakFreezes: 2, totalActiveDays: 0 },
    });

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakFreezes: streak.streakFreezes,
      totalActiveDays: streak.totalActiveDays,
      lastActiveDate: streak.lastActiveDate,
      multiplier: TrackerService.getStreakMultiplier(streak.currentStreak),
    };
  }
}
