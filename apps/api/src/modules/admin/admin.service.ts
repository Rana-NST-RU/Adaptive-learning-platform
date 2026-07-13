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
}
