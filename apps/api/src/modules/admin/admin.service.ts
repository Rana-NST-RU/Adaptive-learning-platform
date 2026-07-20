// ─────────────────────────────────────────────────────────────────────────────
// Admin Service — Sprint 6
// Provides ADMIN/TEACHER-only access to:
//   • Platform analytics (DAU, question stats, avg session time)
//   • User management (list, update role, deactivate)
//   • Question moderation (list pending, approve, reject, edit)
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsGateway,
  ) {}

  // ─── Platform Analytics ────────────────────────────────────────────────────

  async getPlatformAnalytics() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      totalUsers,
      activeUsersToday,
      activeUsersWeek,
      activeUsersMonth,
      totalQuestions,
      totalAttempts,
      correctAttempts,
      totalSessions,
      avgSessionResult,
      newUsersThisWeek,
      domainBreakdown,
    ] = await Promise.all([
      // Total registered users
      this.prisma.user.count({ where: { isActive: true } }),

      // DAU - users with an attempt today
      this.prisma.questionAttempt.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: today } },
      }).then(r => r.length),

      // WAU - users active in last 7 days
      this.prisma.questionAttempt.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: sevenDaysAgo } },
      }).then(r => r.length),

      // MAU - users active in last 30 days
      this.prisma.questionAttempt.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: thirtyDaysAgo } },
      }).then(r => r.length),

      // Total questions generated
      this.prisma.question.count({ where: { isActive: true } }),

      // Total attempts
      this.prisma.questionAttempt.count(),

      // Correct attempts
      this.prisma.questionAttempt.count({ where: { isCorrect: true } }),

      // Total sessions
      this.prisma.learningSession.count(),

      // Average session duration (seconds)
      this.prisma.learningSession.aggregate({
        _avg: { durationSeconds: true },
        where: { durationSeconds: { not: null } },
      }),

      // New users this week
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),

      // Attempts by domain
      this.prisma.questionAttempt.groupBy({
        by: ['questionId'],
        _count: { _all: true },
      }).then(async () => {
        // Simpler: group via question join
        const dsaCount = await this.prisma.question.count({ where: { domain: 'DSA' } });
        const sdCount = await this.prisma.question.count({ where: { domain: 'SYSTEM_DESIGN' } });
        return { DSA: dsaCount, SYSTEM_DESIGN: sdCount };
      }),
    ]);

    const globalAccuracy = totalAttempts > 0
      ? Math.round((correctAttempts / totalAttempts) * 100)
      : null;

    return {
      users: {
        total: totalUsers,
        dau: activeUsersToday,
        wau: activeUsersWeek,
        mau: activeUsersMonth,
        newThisWeek: newUsersThisWeek,
      },
      questions: {
        total: totalQuestions,
        totalAttempts,
        correctAttempts,
        globalAccuracy,
        domainBreakdown,
      },
      sessions: {
        total: totalSessions,
        avgDurationSeconds: Math.round(avgSessionResult._avg.durationSeconds ?? 0),
      },
    };
  }

  // DAU trend for last 14 days
  async getDauTrend() {
    const results: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date();
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = await this.prisma.questionAttempt.groupBy({
        by: ['userId'],
        where: { timestamp: { gte: day, lt: nextDay } },
      }).then(r => r.length);

      results.push({ date: day.toISOString().split('T')[0], count });
    }
    return results;
  }

  // ─── User Management ───────────────────────────────────────────────────────

  async listUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          profile: {
            select: { totalXP: true, currentLevel: true },
          },
          _count: {
            select: { questionAttempts: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserRole(userId: string, role: 'STUDENT' | 'TEACHER' | 'ADMIN') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, role: true },
    });
  }

  async toggleUserActive(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, name: true, isActive: true },
    });
  }

  // ─── Question Moderation ───────────────────────────────────────────────────

  async listQuestions(page = 1, limit = 20, domain?: string, difficulty?: string, isFlagged?: boolean) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (domain) where.domain = domain;
    if (difficulty) where.difficulty = difficulty;
    if (isFlagged !== undefined) where.isFlagged = isFlagged;

    const [questions, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          conceptId: true,
          conceptName: true,
          domain: true,
          content: true,
          questionType: true,
          difficulty: true,
          isActive: true,
          createdAt: true,
          _count: { select: { attempts: true } },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    return {
      questions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateQuestion(
    id: string,
    data: {
      content?: string;
      correctAnswer?: string;
      explanation?: string;
      isActive?: boolean;
      difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
    },
  ) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    return this.prisma.question.update({ where: { id }, data });
  }

  async deleteQuestion(id: string) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    // Soft delete
    return this.prisma.question.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ─── Top concept stats for admin ──────────────────────────────────────────

  async getTopConcepts(limit = 10) {
    // Concepts with most attempts
    const mastery = await this.prisma.conceptMastery.groupBy({
      by: ['conceptId', 'conceptName'],
      _count: { _all: true },
      _avg: { masteryScore: true, retentionScore: true },
      orderBy: { _count: { conceptId: 'desc' } },
      take: limit,
    });
    return mastery.map(m => ({
      conceptId: m.conceptId,
      conceptName: m.conceptName,
      learners: m._count._all,
      avgMastery: Math.round((m._avg.masteryScore ?? 0) * 100),
      avgRetention: Math.round((m._avg.retentionScore ?? 0) * 100),
    }));
  }

  // ─── Concept Mastery & Audit Logs (Sprint 6 Additional) ───────────────────

  async overrideMastery(userId: string, conceptId: string, masteryScore: number, actorId: string, actorName: string) {
    const mastery = await this.prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId } },
    });
    if (!mastery) throw new NotFoundException('Mastery record not found for user and concept');

    const updated = await this.prisma.conceptMastery.update({
      where: { userId_conceptId: { userId, conceptId } },
      data: { masteryScore },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        actorId,
        actorName,
        action: 'MASTERY_OVERRIDE',
        targetType: 'MASTERY',
        targetId: `${userId}:${conceptId}`,
        targetName: mastery.conceptName,
        before: { masteryScore: mastery.masteryScore },
        after: { masteryScore },
      },
    });

    // Real-time notification to the affected student
    await this.notifications.sendToUser(userId, 'mastery_override', {
      conceptId,
      conceptName: mastery.conceptName,
      previousScore: Math.round(mastery.masteryScore * 100),
      newScore: Math.round(masteryScore * 100),
      overriddenBy: actorName,
    });

    return updated;
  }

  async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminAuditLog.count(),
    ]);

    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ─── Per-Student Analytics ────────────────────────────────────────────────

  async getUserAnalytics(userId: string) {
    const [user, profile, streak, masteries, recentAttempts, attemptStats] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, role: true, createdAt: true, isActive: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId },
        select: { totalXP: true, currentLevel: true, preferredDomain: true, institution: true, targetExam: true },
      }),
      this.prisma.learningStreak.findUnique({
        where: { userId },
        select: { currentStreak: true, longestStreak: true, totalActiveDays: true, lastActiveDate: true },
      }),
      // Top 10 most practiced concepts
      this.prisma.conceptMastery.findMany({
        where: { userId },
        orderBy: { totalAttempts: 'desc' },
        take: 10,
        select: {
          conceptId: true, conceptName: true, domain: true,
          masteryScore: true, masteryLevel: true, totalAttempts: true,
          correctAttempts: true, nextRevisionDue: true, lastAttemptAt: true,
        },
      }),
      // Last 30 attempts for timeline
      this.prisma.questionAttempt.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        take: 30,
        select: {
          id: true, isCorrect: true, score: true, timeTakenMs: true,
          timestamp: true, hintsUsed: true,
          question: { select: { conceptName: true, domain: true, difficulty: true, questionType: true } },
        },
      }),
      // Aggregate accuracy and counts
      this.prisma.questionAttempt.aggregate({
        where: { userId },
        _count: { id: true },
        _avg: { score: true, timeTakenMs: true },
        _sum: { isCorrect: true } as any,
      }),
    ]);

    if (!user) throw new Error('User not found');

    // 14-day daily activity trend
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const dailyActivity = await this.prisma.questionAttempt.groupBy({
      by: ['timestamp'],
      where: { userId, timestamp: { gte: fourteenDaysAgo } },
      _count: { id: true },
    });

    // Aggregate by date string
    const activityMap: Record<string, number> = {};
    dailyActivity.forEach(row => {
      const day = (row.timestamp as Date).toISOString().slice(0, 10);
      activityMap[day] = (activityMap[day] || 0) + row._count.id;
    });
    const activityTrend = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: activityMap[key] || 0 };
    });

    // Accuracy by domain
    const [dsaStats, sdStats] = await Promise.all([
      this.prisma.questionAttempt.findMany({
        where: { userId, question: { domain: 'DSA' } },
        select: { isCorrect: true },
      }),
      this.prisma.questionAttempt.findMany({
        where: { userId, question: { domain: 'SYSTEM_DESIGN' } },
        select: { isCorrect: true },
      }),
    ]);

    const calcAccuracy = (arr: { isCorrect: boolean }[]) =>
      arr.length > 0 ? Math.round((arr.filter(a => a.isCorrect).length / arr.length) * 100) : null;

    const totalAttempts = (attemptStats as any)._count?.id ?? 0;

    return {
      user,
      profile,
      streak,
      stats: {
        totalAttempts,
        overallAccuracy: calcAccuracy(recentAttempts.map(a => ({ isCorrect: a.isCorrect }))),
        avgScore: Math.round(((attemptStats as any)._avg?.score ?? 0) * 100),
        avgTimeSec: Math.round(((attemptStats as any)._avg?.timeTakenMs ?? 0) / 1000),
        dsaAccuracy: calcAccuracy(dsaStats),
        sdAccuracy: calcAccuracy(sdStats),
      },
      masteries,
      recentAttempts,
      activityTrend,
    };
  }
}
