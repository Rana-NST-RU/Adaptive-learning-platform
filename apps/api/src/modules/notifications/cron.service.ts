// ─────────────────────────────────────────────────────────────────────────────
// Cron Service
// Scheduled jobs for streak reminders and platform health.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Daily at 8 PM — find users at risk of losing their streak and nudge them.
   * A user is "at risk" if:
   *   - Their streak is > 0
   *   - lastActivityDate is NOT today
   *   - They haven't used a streak freeze today
   */
  @Cron('0 20 * * *', { name: 'streak-reminder', timeZone: 'UTC' })
  async handleStreakReminder(): Promise<void> {
    this.logger.log('⏰ Running daily streak reminder job…');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    try {
      // Find all users whose streak > 0 and haven't logged activity today
      const atRisk = await this.prisma.learningStreak.findMany({
        where: {
          currentStreak: { gt: 0 },
          lastActiveDate: { lt: today }, // hasn't studied today
        },
        select: {
          userId: true,
          currentStreak: true,
          streakFreezes: true,
        },
      });

      this.logger.log(`Found ${atRisk.length} users at risk of losing their streak.`);

      for (const record of atRisk) {
        const hasFreeze = record.streakFreezes > 0;

        // Emit real-time socket warning (no-ops silently if user is offline)
        await this.gateway.sendToUser(record.userId, 'streak_warning', {
          currentStreak: record.currentStreak,
          hasStreakFreeze: hasFreeze,
          message: hasFreeze
            ? `Your ${record.currentStreak}-day streak is at risk! You have a streak freeze available.`
            : `Study something today to keep your ${record.currentStreak}-day streak alive! 🔥`,
        });

        // Email stub — log to console; swap with real provider later
        this.logger.log(
          `[EMAIL STUB] → user:${record.userId} | ` +
          `"Don't lose your ${record.currentStreak}-day streak!" ` +
          `| freeze available: ${hasFreeze}`,
        );
      }

      this.logger.log('✅ Streak reminder job complete.');
    } catch (err) {
      this.logger.error('Streak reminder job failed:', err);
    }
  }

  /**
   * Exposed for manual triggering via debug/admin endpoint.
   * DO NOT expose this publicly in production.
   */
  async triggerStreakReminderNow(): Promise<{ notified: number }> {
    await this.handleStreakReminder();
    const count = await this.prisma.learningStreak.count({
      where: {
        currentStreak: { gt: 0 },
        lastActiveDate: {
          lt: (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })(),
        },
      },
    });
    return { notified: count };
  }
}
