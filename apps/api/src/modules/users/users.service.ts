import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User, UserProfile } from '@prisma/client';

type UserWithProfile = User & { profile: UserProfile | null };

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Finders ─────────────────────────────────────────────────

  async findById(id: string): Promise<UserWithProfile | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { googleId } });
  }

  // ─── Profile ──────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserWithProfile> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(
    userId: string,
    data: Partial<{
      name: string;
      avatar: string;
      bio: string;
      institution: string;
      targetExam: string;
      dailyGoalMins: number;
      timezone: string;
      preferredDomain: 'DSA' | 'SYSTEM_DESIGN';
    }>,
  ) {
    const { name, avatar, ...profileData } = data;

    return this.prisma.$transaction(async (tx) => {
      if (name || avatar) {
        await tx.user.update({
          where: { id: userId },
          data: { ...(name && { name }), ...(avatar && { avatar }) },
        });
      }

      if (Object.keys(profileData).length > 0) {
        await tx.userProfile.upsert({
          where: { userId },
          update: profileData,
          create: { userId, ...profileData },
        });
      }

      return tx.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      });
    });
  }

  // ─── Stats ───────────────────────────────────────────────────

  async getUserStats(userId: string) {
    const [user, streak, masteryCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      }),
      this.prisma.learningStreak.findUnique({ where: { userId } }),
      this.prisma.conceptMastery.count({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    return {
      user,
      streak,
      stats: {
        conceptsLearned: masteryCount,
        totalXP: user.profile?.totalXP ?? 0,
        currentLevel: user.profile?.currentLevel ?? 1,
        currentStreak: streak?.currentStreak ?? 0,
        longestStreak: streak?.longestStreak ?? 0,
      },
    };
  }

  // ─── Leaderboard ─────────────────────────────────────────────

  async getLeaderboard(requestingUserId: string, _domain?: 'DSA' | 'SYSTEM_DESIGN') {
    // Fetch top 50 users by totalXP from UserProfile
    const profiles = await this.prisma.userProfile.findMany({
      take: 50,
      orderBy: { totalXP: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    const leaderboard = profiles.map((p, index) => ({
      rank: index + 1,
      userId: p.userId,
      name: p.user.name,
      avatar: p.user.avatar,
      totalXP: p.totalXP,
      currentLevel: p.currentLevel,
      isCurrentUser: p.userId === requestingUserId,
    }));

    // Find requesting user's rank if not in top 50
    const currentUserEntry = leaderboard.find(e => e.userId === requestingUserId);
    let currentUserRank: number | null = null;

    if (!currentUserEntry) {
      const higherCount = await this.prisma.userProfile.count({
        where: {
          totalXP: {
            gt: (await this.prisma.userProfile.findUnique({
              where: { userId: requestingUserId },
            }))?.totalXP ?? 0,
          },
        },
      });
      currentUserRank = higherCount + 1;
    }

    return {
      leaderboard,
      currentUserRank: currentUserEntry?.rank ?? currentUserRank,
    };
  }

  // ─── Streak Freeze ────────────────────────────────────────────

  async useStreakFreeze(userId: string): Promise<{ freezesLeft: number; message: string }> {
    const streak = await this.prisma.learningStreak.findUnique({
      where: { userId },
    });

    if (!streak) {
      throw new NotFoundException('No streak record found. Start learning first!');
    }

    if (streak.streakFreezes <= 0) {
      throw new BadRequestException('No streak freezes left.');
    }

    const updated = await this.prisma.learningStreak.update({
      where: { userId },
      data: {
        streakFreezes: { decrement: 1 },
        // Extend lastActiveDate to today to protect the streak
        lastActiveDate: new Date(),
      },
    });

    this.logger.log(`[StreakFreeze] user=${userId} froze streak, ${updated.streakFreezes} left`);

    return {
      freezesLeft: updated.streakFreezes,
      message: `Streak freeze used! You have ${updated.streakFreezes} freeze${updated.streakFreezes !== 1 ? 's' : ''} remaining.`,
    };
  }
}
