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

  // ─── Activity Heatmap (52 weeks) ─────────────────────────────────────────

  /**
   * Returns daily attempt counts for the last 365 days.
   * Frontend renders a GitHub-style contribution heatmap.
   */
  async getActivityHeatmap(userId: string): Promise<{ date: string; count: number }[]> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const attempts = await this.prisma.questionAttempt.findMany({
      where: { userId, timestamp: { gte: oneYearAgo } },
      select: { timestamp: true },
    });

    const countByDate: Record<string, number> = {};
    for (const a of attempts) {
      const date = a.timestamp.toISOString().split('T')[0];
      countByDate[date] = (countByDate[date] ?? 0) + 1;
    }
    return Object.entries(countByDate).map(([date, count]) => ({ date, count }));
  }

  // ─── 30-Day FSRS Forecast ────────────────────────────────────────────────

  /**
   * For each of the next 30 days, counts how many concepts have their
   * nextRevisionDue on or before that day. Gives a review load forecast.
   */
  async getForecast(userId: string): Promise<{ date: string; dueCount: number }[]> {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const masteries = await this.prisma.conceptMastery.findMany({
      where: { userId, nextRevisionDue: { not: null, lte: in30Days } },
      select: { nextRevisionDue: true },
    });

    const today = now.toISOString().split('T')[0];
    const countByDate: Record<string, number> = {};

    for (const m of masteries) {
      if (!m.nextRevisionDue) continue;
      const date = m.nextRevisionDue.toISOString().split('T')[0];
      if (date >= today) {
        countByDate[date] = (countByDate[date] ?? 0) + 1;
      }
    }

    // Generate all 30 days so chart has no gaps
    const result: { date: string; dueCount: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      result.push({ date: dateStr, dueCount: countByDate[dateStr] ?? 0 });
    }
    return result;
  }

  // ─── Fading Soon (Predictive Alert) ──────────────────────────────────────

  /**
   * Returns concepts predicted to drop below 70% retention in the next 72 hours.
   * FSRS formula: R(t,S) = (1 + t/9S)^(-1)
   * R=0.70 occurs at: t_70 = 9S*(1/0.70 - 1) ≈ 3.857 * S days
   * Concept is "fading soon" if: lastRevisionAt + t_70 days is within now + 72h
   */
  async getFadingSoon(
    userId: string,
    domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
    windowHours = 72,
  ): Promise<any[]> {
    const now = Date.now();
    const windowMs = windowHours * 60 * 60 * 1000;
    const domainEnum = domain === 'DSA' ? Domain.DSA : Domain.SYSTEM_DESIGN;

    const masteries = await this.prisma.conceptMastery.findMany({
      where: {
        userId,
        domain: domainEnum,
        lastAttemptAt: { not: null },
        memoryStrength: { gt: 0 },
        masteryLevel: { gt: 0 },
        // Only concepts already reviewed (have nextRevisionDue)
        nextRevisionDue: { not: null },
      },
      select: {
        conceptId: true, conceptName: true, masteryLevel: true,
        retentionScore: true, memoryStrength: true, lastAttemptAt: true, nextRevisionDue: true,
      },
    });

    return masteries
      .filter((m) => {
        if (!m.lastAttemptAt || !m.memoryStrength) return false;
        const S = m.memoryStrength;
        const t70DaysMs = 3.857 * S * 24 * 60 * 60 * 1000;
        const fadingAt = m.lastAttemptAt.getTime() + t70DaysMs;
        return fadingAt > now && fadingAt <= now + windowMs;
      })
      .map((m) => {
        if (!m.lastAttemptAt || !m.memoryStrength) return null;
        const S = m.memoryStrength;
        const elapsed = (now - m.lastAttemptAt.getTime()) / (24 * 60 * 60 * 1000);
        const currentRetention = Math.pow(1 + elapsed / (9 * S), -1);
        const fadingAt = new Date(m.lastAttemptAt.getTime() + 3.857 * S * 24 * 60 * 60 * 1000);
        const hoursUntilFade = Math.round((fadingAt.getTime() - now) / (60 * 60 * 1000));
        return {
          conceptId: m.conceptId,
          conceptName: m.conceptName,
          currentRetention: Math.round(currentRetention * 100) / 100,
          hoursUntilFade,
          fadingAt,
          masteryLevel: m.masteryLevel,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a?.hoursUntilFade ?? 0) - (b?.hoursUntilFade ?? 0));
  }

  // ─── Weekly Digest ────────────────────────────────────────────────────────

  async getWeeklyDigest(userId: string) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [attempts, masteries, streak] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId, timestamp: { gte: weekStart } },
        select: { isCorrect: true, timeTakenMs: true, timestamp: true },
      }),
      this.prisma.conceptMastery.findMany({
        where: { userId, lastAttemptAt: { gte: weekStart } },
        select: { conceptName: true, masteryLevel: true, lastAttemptAt: true },
      }),
      this.prisma.learningStreak.findUnique({ where: { userId } }),
    ]);

    const correct = attempts.filter((a) => a.isCorrect).length;
    const accuracy = attempts.length > 0 ? Math.round((correct / attempts.length) * 100) : null;
    const avgTimeSec = attempts.length > 0
      ? Math.round(attempts.reduce((s, a) => s + a.timeTakenMs, 0) / attempts.length / 1000)
      : null;

    // Study days (unique calendar dates)
    const studyDays = new Set(
      attempts.map((a) => a.timestamp.toISOString().split('T')[0]),
    ).size;

    // Concepts that leveled up this week (masteryLevel >= 2)
    const improvedConcepts = masteries
      .filter((m) => m.masteryLevel >= 2)
      .slice(0, 6)
      .map((m) => ({ name: m.conceptName, level: m.masteryLevel }));

    // Daily activity breakdown (for mini-chart)
    const dailyCounts: Record<string, number> = {};
    for (const a of attempts) {
      const d = a.timestamp.toISOString().split('T')[0];
      dailyCounts[d] = (dailyCounts[d] ?? 0) + 1;
    }
    const dailyBreakdown = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = d.toISOString().split('T')[0];
      return { date: key, count: dailyCounts[key] ?? 0 };
    });

    return {
      totalAttempts: attempts.length,
      correctAttempts: correct,
      accuracy,
      avgTimeSec,
      studyDays,
      currentStreak: streak?.currentStreak ?? 0,
      improvedConceptsCount: improvedConcepts.length,
      improvedConcepts,
      dailyBreakdown,
    };
  }

  // ─── Achievements ─────────────────────────────────────────────────────────

  private static readonly ACHIEVEMENT_DEFS = [
    { type: 'FIRST_ANSWER', icon: '🎯', label: 'First Answer', desc: 'Submitted your first answer', rarity: 'COMMON' },
    { type: 'CORRECT_10', icon: '⚡', label: 'Quick Learner', desc: '10 correct answers', rarity: 'COMMON' },
    { type: 'CORRECT_50', icon: '🔥', label: 'On Fire', desc: '50 correct answers', rarity: 'RARE' },
    { type: 'CORRECT_100', icon: '💯', label: 'Century', desc: '100 correct answers', rarity: 'RARE' },
    { type: 'CORRECT_500', icon: '🏅', label: 'Elite', desc: '500 correct answers', rarity: 'EPIC' },
    { type: 'STREAK_3', icon: '🌱', label: '3-Day Streak', desc: 'Studied 3 days in a row', rarity: 'COMMON' },
    { type: 'STREAK_7', icon: '🔥', label: 'Week Warrior', desc: '7-day study streak', rarity: 'RARE' },
    { type: 'STREAK_14', icon: '⚡', label: 'Fortnight Focus', desc: '14-day study streak', rarity: 'EPIC' },
    { type: 'STREAK_30', icon: '🌟', label: 'Unstoppable', desc: '30-day study streak', rarity: 'LEGENDARY' },
    { type: 'ACCURACY_80', icon: '🎖️', label: 'Sharp Mind', desc: 'Reached 80% overall accuracy', rarity: 'RARE' },
    { type: 'ACCURACY_90', icon: '💎', label: 'Precision', desc: 'Reached 90% overall accuracy', rarity: 'EPIC' },
    { type: 'EXPERT_CONCEPT', icon: '🏆', label: 'First Expert', desc: 'Reached Expert level on a concept', rarity: 'EPIC' },
    { type: 'CONCEPTS_5', icon: '📚', label: 'Explorer', desc: 'Practised 5 different concepts', rarity: 'COMMON' },
    { type: 'CONCEPTS_10', icon: '🗺️', label: 'Knowledge Seeker', desc: 'Practised 10 different concepts', rarity: 'RARE' },
    { type: 'CONCEPTS_20', icon: '🧠', label: 'Polymath', desc: 'Practised 20 different concepts', rarity: 'EPIC' },
    { type: 'SPEED_DEMON', icon: '⚡', label: 'Speed Demon', desc: 'Answered correctly in under 15 seconds', rarity: 'RARE' },
    { type: 'NIGHT_OWL', icon: '🦉', label: 'Night Owl', desc: 'Studied after midnight', rarity: 'COMMON' },
    { type: 'EARLY_BIRD', icon: '🐦', label: 'Early Bird', desc: 'Studied before 7am', rarity: 'COMMON' },
    { type: 'SELF_AWARE', icon: '🪞', label: 'Self-Aware', desc: 'Rated confidence on 10 answers', rarity: 'RARE' },
  ];

  async getAchievements(userId: string) {
    const unlocked = await this.prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'desc' },
    });
    const unlockedSet = new Set(unlocked.map((a) => a.type));
    const unlockedMap = new Map(unlocked.map((a) => [a.type, a]));

    return TrackerService.ACHIEVEMENT_DEFS.map((def) => ({
      ...def,
      unlocked: unlockedSet.has(def.type),
      unlockedAt: unlockedMap.get(def.type)?.unlockedAt ?? null,
      metadata: (unlockedMap.get(def.type)?.metadata as any) ?? null,
    }));
  }

  /**
   * Checks eligibility for all achievements and persists newly unlocked ones.
   * Returns array of newly unlocked achievement types (for immediate push to UI).
   * Call fire-and-forget after submitAttempt.
   */
  async checkAndUnlockAchievements(
    userId: string,
    context: {
      isCorrect: boolean;
      timeTakenMs: number;
      conceptName?: string;
      masteryLevel?: number;
      hadConfidenceRating: boolean;
    },
  ): Promise<string[]> {
    // Fetch current state
    const [profile, streak, masteries, attempts, existingAchievements, ratedCount] =
      await Promise.all([
        this.prisma.userProfile.findUnique({ where: { userId } }),
        this.prisma.learningStreak.findUnique({ where: { userId } }),
        this.prisma.conceptMastery.findMany({
          where: { userId, masteryLevel: { gt: 0 } },
          select: { masteryLevel: true, conceptName: true },
        }),
        this.prisma.questionAttempt.aggregate({
          where: { userId, isCorrect: true },
          _count: { _all: true },
        }),
        this.prisma.userAchievement.findMany({
          where: { userId },
          select: { type: true },
        }),
        this.prisma.questionAttempt.count({
          where: { userId, confidenceRating: { not: null } },
        }),
      ]);

    const existing = new Set(existingAchievements.map((a) => a.type));
    const correctCount = attempts._count._all;
    const uniqueConcepts = new Set(masteries.map((m) => m.conceptName)).size;
    const currentStreak = streak?.currentStreak ?? 0;
    const accuracy = profile
      ? await this.prisma.questionAttempt
          .aggregate({ where: { userId }, _count: { _all: true }, _avg: { score: true } })
          .then((r) => Math.round((r._avg.score ?? 0) * 100))
      : 0;
    const hour = new Date().getHours();

    const toUnlock: { type: string; metadata?: any }[] = [];

    const check = (type: string, condition: boolean, metadata?: any) => {
      if (condition && !existing.has(type)) toUnlock.push({ type, metadata });
    };

    // Correct answer milestones
    check('FIRST_ANSWER', correctCount >= 1);
    check('CORRECT_10', correctCount >= 10);
    check('CORRECT_50', correctCount >= 50);
    check('CORRECT_100', correctCount >= 100);
    check('CORRECT_500', correctCount >= 500);

    // Streak milestones
    check('STREAK_3', currentStreak >= 3);
    check('STREAK_7', currentStreak >= 7);
    check('STREAK_14', currentStreak >= 14);
    check('STREAK_30', currentStreak >= 30);

    // Accuracy
    check('ACCURACY_80', accuracy >= 80);
    check('ACCURACY_90', accuracy >= 90);

    // Concept mastery
    check('EXPERT_CONCEPT', masteries.some((m) => m.masteryLevel >= 4), { conceptName: context.conceptName });
    check('CONCEPTS_5', uniqueConcepts >= 5);
    check('CONCEPTS_10', uniqueConcepts >= 10);
    check('CONCEPTS_20', uniqueConcepts >= 20);

    // Speed: correct answer in under 15s
    check('SPEED_DEMON', context.isCorrect && context.timeTakenMs < 15000);

    // Time-based
    check('NIGHT_OWL', hour >= 0 && hour < 4);
    check('EARLY_BIRD', hour >= 5 && hour < 7);

    // Self-awareness
    check('SELF_AWARE', ratedCount >= 10);

    if (toUnlock.length > 0) {
      await this.prisma.userAchievement.createMany({
        data: toUnlock.map(({ type, metadata }) => ({ userId, type, metadata })),
        skipDuplicates: true,
      });
    }

    return toUnlock.map((a) => a.type);
  }

  // ─── Seed Self-Assessment ─────────────────────────────────────────────────

  /**
   * Prime FSRS with a user's self-assessed familiarity rating (1-5).
   * Called before the first practice session on a concept.
   * Maps: 1→S=0.4, 2→S=0.6, 3→S=2.4, 4→S=5.8, 5→S=21.0
   */
  async seedSelfAssessment(
    userId: string,
    conceptId: string,
    conceptName: string,
    domain: 'DSA' | 'SYSTEM_DESIGN',
    rating: number, // 1-5
  ): Promise<void> {
    const STABILITY_MAP: Record<number, number> = {
      1: FSRS_W[0], // 0.4 — Again (no knowledge)
      2: FSRS_W[1], // 0.6 — Hard
      3: FSRS_W[2], // 2.4 — Good
      4: FSRS_W[3], // 5.8 — Easy
      5: 21.0,      // Very well known — long interval
    };
    const MASTERY_MAP: Record<number, number> = { 1: 0, 2: 0, 3: 1, 4: 2, 5: 3 };
    const MASTERY_SCORE_MAP: Record<number, number> = { 1: 0, 2: 0.1, 3: 0.25, 4: 0.5, 5: 0.75 };

    const s = STABILITY_MAP[rating] ?? FSRS_W[2];
    const d = fsrsInitialDifficulty(Math.min(rating, 4)); // grade 1-4 maps to diff
    const domainEnum = domain === 'DSA' ? Domain.DSA : Domain.SYSTEM_DESIGN;

    // nextRevisionDue = now + S days (review when retention = 0.90)
    const nextRevisionDue = new Date(Date.now() + s * 24 * 60 * 60 * 1000);

    await this.prisma.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId } },
      update: {
        memoryStrength: s,
        fsrsDifficulty: d,
        retentionScore: MASTERY_SCORE_MAP[rating] ?? 0.25,
        masteryLevel: MASTERY_MAP[rating] ?? 0,
        masteryScore: MASTERY_SCORE_MAP[rating] ?? 0.25,
        nextRevisionDue,
      },
      create: {
        userId, conceptId, conceptName, domain: domainEnum,
        masteryLevel: MASTERY_MAP[rating] ?? 0,
        masteryScore: MASTERY_SCORE_MAP[rating] ?? 0.25,
        retentionScore: MASTERY_SCORE_MAP[rating] ?? 0.25,
        memoryStrength: s,
        fsrsDifficulty: d,
        nextRevisionDue,
      },
    });

    this.logger.log(
      `[SeedAssessment] userId=${userId} conceptId=${conceptId} rating=${rating} → S=${s.toFixed(2)} D=${d.toFixed(2)}`,
    );
  }

  // ─── Passive Streak Break Detection ──────────────────────────────────────
  /**
   * Called whenever /tracker/stats is fetched (i.e. dashboard load).
   * If lastActiveDate is ≥2 days ago and no freeze is available, resets streak.
   * This avoids needing a cron job — streak breaks are detected on next login.
   */
  async checkAndBreakStreak(userId: string): Promise<void> {
    try {
      const streak = await this.prisma.learningStreak.findUnique({ where: { userId } });
      if (!streak || !streak.lastActiveDate) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const lastActive = new Date(streak.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);

      const diffDays = Math.round((today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays < 2) return; // streak still valid (today or yesterday)

      if (streak.streakFreezes > 0) {
        // Auto-consume a freeze to protect the streak
        await this.prisma.learningStreak.update({
          where: { userId },
          data: { streakFreezes: { decrement: 1 }, lastActiveDate: today },
        });
        this.logger.log(`[Streak] Auto-consumed freeze for user=${userId} (missed ${diffDays - 1}d)`);
      } else {
        // Break the streak
        await this.prisma.learningStreak.update({
          where: { userId },
          data: { currentStreak: 0 },
        });
        this.logger.log(`[Streak] Streak broken for user=${userId} (missed ${diffDays - 1}d, no freezes)`);
      }
    } catch (err) {
      this.logger.warn(`[Streak] checkAndBreakStreak failed: ${err}`);
    }
  }

  // ─── Due Concept Count (for dashboard banner) ─────────────────────────────
  async getDueConceptCount(userId: string, domain?: 'DSA' | 'SYSTEM_DESIGN'): Promise<number> {
    const now = new Date();
    return this.prisma.conceptMastery.count({
      where: {
        userId,
        nextRevisionDue: { lte: now },
        ...(domain && { domain: domain as Domain }),
      },
    });
  }
}


