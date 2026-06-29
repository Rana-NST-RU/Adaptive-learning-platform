// ─────────────────────────────────────────────────────────────────────────────
// Tracker Service — Sprint 4: Adaptive Engine & Mastery Tracking
//
// Implements:
//   • Ebbinghaus Forgetting Curve (retentionScore, nextRevisionDue, memoryStrength)
//   • Learning Streak tracking (daily, freeze support)
//   • Recommendation Engine (Neo4j prerequisites + PostgreSQL mastery → REVISE/LEARN_NEW/PRACTICE)
//   • Dashboard stats aggregation
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { Domain } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Neo4jService } from '../knowledge-graph/neo4j.service';

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly neo4j: Neo4jService,
  ) {}

  // ─── Ebbinghaus Forgetting Curve ─────────────────────────────────────────

  /**
   * Called after every question attempt.
   * Updates retentionScore, memoryStrength, nextRevisionDue, revisionCount.
   *
   * Algorithm:
   *   - Correct: memoryStrength *= ease (1.5 + masteryScore * 2.0), min 0.5 days
   *   - Incorrect: memoryStrength *= 0.5, min 0.25 days
   *   - retentionScore = e^(-elapsed_days / memoryStrength)
   *   - nextRevisionDue = now + memoryStrength days
   */
  async updateRetention(
    userId: string,
    conceptId: string,
    isCorrect: boolean,
  ): Promise<void> {
    try {
      const record = await this.prisma.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId } },
      });

      if (!record) return; // ConceptMastery is created in questions.service first

      const now = new Date();
      const currentStrength = record.memoryStrength || 0.5;
      const masteryScore = record.masteryScore || 0;

      let newStrength: number;
      if (isCorrect) {
        // Ease factor: 1.5 (weak learner) → 3.5 (expert), based on current mastery
        const ease = 1.5 + masteryScore * 2.0;
        newStrength = Math.min(365, currentStrength * ease + 0.5);
      } else {
        // Forgetting: reduce strength by half, but keep at least 0.25 days
        newStrength = Math.max(0.25, currentStrength * 0.5);
      }

      // retentionScore = e^(-elapsed / strength), based on time since last revision
      const lastRevision = record.lastRevisionAt ?? record.firstAttemptAt ?? now;
      const elapsedDays =
        (now.getTime() - lastRevision.getTime()) / (1000 * 60 * 60 * 24);
      const retentionScore = Math.min(
        1.0,
        Math.exp(-elapsedDays / Math.max(newStrength, 0.1)),
      );

      // nextRevisionDue = now + memoryStrength days
      const nextRevisionDue = new Date(
        now.getTime() + newStrength * 24 * 60 * 60 * 1000,
      );

      await this.prisma.conceptMastery.update({
        where: { userId_conceptId: { userId, conceptId } },
        data: {
          memoryStrength: newStrength,
          retentionScore,
          nextRevisionDue,
          lastRevisionAt: now,
          revisionCount: { increment: 1 },
        },
      });

      this.logger.debug(
        `[Retention] user=${userId} concept=${conceptId} strength=${newStrength.toFixed(2)}d ` +
          `retention=${(retentionScore * 100).toFixed(0)}% nextDue=${nextRevisionDue.toISOString()}`,
      );
    } catch (err) {
      // Non-blocking — don't fail the attempt if retention update fails
      this.logger.warn(`[Retention] updateRetention failed: ${err}`);
    }
  }

  // ─── Learning Streak ─────────────────────────────────────────────────────

  /**
   * Call after any question attempt.
   * - Same day: no-op (already counted today)
   * - Yesterday: increment currentStreak
   * - Gap > 1 day: consume streakFreeze if available, otherwise reset
   */
  async updateStreak(userId: string): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const streak = await this.prisma.learningStreak.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          currentStreak: 0,
          longestStreak: 0,
          streakFreezes: 2,
          totalActiveDays: 0,
        },
      });

      const lastActive = streak.lastActiveDate
        ? new Date(streak.lastActiveDate)
        : null;

      if (lastActive) {
        lastActive.setHours(0, 0, 0, 0);
        const diffDays = Math.round(
          (today.getTime() - lastActive.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (diffDays === 0) return; // Already active today
        if (diffDays === 1) {
          // Consecutive day!
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
          // Gap > 1 day but freeze available — keep streak, consume freeze
          await this.prisma.learningStreak.update({
            where: { userId },
            data: {
              streakFreezes: { decrement: 1 },
              lastActiveDate: today,
              totalActiveDays: { increment: 1 },
            },
          });
          this.logger.log(`[Streak] user=${userId} consumed a streak freeze`);
        } else {
          // Streak broken
          await this.prisma.learningStreak.update({
            where: { userId },
            data: {
              currentStreak: 1,
              lastActiveDate: today,
              totalActiveDays: { increment: 1 },
            },
          });
        }
      } else {
        // First ever activity
        await this.prisma.learningStreak.update({
          where: { userId },
          data: {
            currentStreak: 1,
            longestStreak: 1,
            lastActiveDate: today,
            totalActiveDays: { increment: 1 },
          },
        });
      }
    } catch (err) {
      this.logger.warn(`[Streak] updateStreak failed: ${err}`);
    }
  }

  // ─── Recommendation Engine ───────────────────────────────────────────────

  /**
   * Generates personalised recommendations by combining:
   *   - Neo4j graph: concept prerequisites and relationships
   *   - PostgreSQL mastery: per-user concept mastery scores + forgetting curve data
   *
   * Priority:
   *   1. REVISE  — concepts where nextRevisionDue is overdue (retentionScore decaying)
   *   2. LEARN_NEW — concepts with no mastery but all prerequisites met (masteryLevel >= 2)
   *   3. PRACTICE — concepts in progress but score < 0.6
   */
  async generateRecommendations(
    userId: string,
    domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ): Promise<any[]> {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 6 * 60 * 60 * 1000); // +6h window

    // Fetch all concepts from Neo4j (runQuery returns plain mapped objects)
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

    // Fetch all user masteries
    const masteries = await this.prisma.conceptMastery.findMany({
      where: { userId, domain: domain as Domain },
    });
    const masteryMap = new Map(masteries.map((m) => [m.conceptId, m]));

    const recommendations: Array<{
      conceptId: string;
      conceptName: string;
      type: 'LEARN_NEW' | 'REVISE' | 'PRACTICE';
      reason: string;
      priority: number;
    }> = [];

    for (const concept of concepts) {
      const mastery = masteryMap.get(concept.id);

      if (mastery) {
        // REVISE: nextRevisionDue is in the past or within 6h
        if (
          mastery.nextRevisionDue &&
          mastery.nextRevisionDue <= soonThreshold &&
          mastery.totalAttempts >= 3
        ) {
          const retention = Math.round((mastery.retentionScore ?? 1) * 100);
          recommendations.push({
            conceptId: concept.id,
            conceptName: concept.name,
            type: 'REVISE',
            reason: `Retention at ${retention}% — review due to stay sharp`,
            priority: 1,
          });
        } else if (mastery.masteryScore < 0.6 && mastery.totalAttempts >= 2) {
          // PRACTICE: struggling concept
          const accuracy = Math.round(mastery.masteryScore * 100);
          recommendations.push({
            conceptId: concept.id,
            conceptName: concept.name,
            type: 'PRACTICE',
            reason: `Accuracy at ${accuracy}% — more practice needed`,
            priority: 3,
          });
        }
      } else {
        // LEARN_NEW: no mastery yet, check if prerequisites are satisfied
        const prereqsMet = concept.prerequisiteIds.every((pid) => {
          const prereqMastery = masteryMap.get(pid);
          return !prereqMastery || prereqMastery.masteryLevel >= 2;
        });

        if (prereqsMet) {
          recommendations.push({
            conceptId: concept.id,
            conceptName: concept.name,
            type: 'LEARN_NEW',
            reason:
              concept.prerequisiteIds.length === 0
                ? 'Foundational concept — great starting point'
                : 'Prerequisites mastered — ready to learn this!',
            priority: 2,
          });
        }
      }
    }

    // Sort: REVISE first, then LEARN_NEW, then PRACTICE. Shuffle within same priority
    recommendations.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return Math.random() - 0.5; // Shuffle within same priority
    });

    const top = recommendations.slice(0, 10);

    // Upsert into Recommendation table (delete stale + insert fresh)
    if (top.length > 0) {
      await this.prisma.recommendation.deleteMany({
        where: { userId, isActedOn: false },
      });
      await this.prisma.recommendation.createMany({
        data: top.map((r, i) => ({
          userId,
          conceptId: r.conceptId,
          conceptName: r.conceptName,
          type: r.type,
          reason: r.reason,
          priority: i + 1,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
        })),
      });
    }

    return top;
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
    const accuracy =
      totalAttempts > 0 ? Math.round((sumScore / totalAttempts) * 100) : null;

    const masteredCount = masteries.filter((m) => m.masteryLevel >= 3).length;

    const dsaMasteries = masteries.filter((m) => m.domain === 'DSA');
    const sdMasteries = masteries.filter((m) => m.domain === 'SYSTEM_DESIGN');

    return {
      totalXP: profile?.totalXP ?? 0,
      currentLevel: profile?.currentLevel ?? 1,
      streak: {
        current: streak?.currentStreak ?? 0,
        longest: streak?.longestStreak ?? 0,
        freezes: streak?.streakFreezes ?? 2,
        lastActiveDate: streak?.lastActiveDate ?? null,
      },
      mastery: {
        totalConcepts: masteries.length,
        masteredCount,
        dsaMastered: dsaMasteries.filter((m) => m.masteryLevel >= 3).length,
        sdMastered: sdMasteries.filter((m) => m.masteryLevel >= 3).length,
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
      // Recalculate live retentionScore since it may have decayed since last update
      const elapsed = m.lastRevisionAt
        ? (now.getTime() - m.lastRevisionAt.getTime()) /
          (1000 * 60 * 60 * 24)
        : null;
      const liveRetention =
        elapsed !== null && m.memoryStrength > 0
          ? Math.max(0, Math.min(1, Math.exp(-elapsed / m.memoryStrength)))
          : m.retentionScore;

      return {
        conceptId: m.conceptId,
        conceptName: m.conceptName,
        domain: m.domain,
        masteryLevel: m.masteryLevel,
        masteryScore: m.masteryScore,
        retentionScore: liveRetention,
        memoryStrength: m.memoryStrength,
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
      create: {
        userId,
        currentStreak: 0,
        longestStreak: 0,
        streakFreezes: 2,
        totalActiveDays: 0,
      },
    });

    return {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      streakFreezes: streak.streakFreezes,
      totalActiveDays: streak.totalActiveDays,
      lastActiveDate: streak.lastActiveDate,
    };
  }
}
