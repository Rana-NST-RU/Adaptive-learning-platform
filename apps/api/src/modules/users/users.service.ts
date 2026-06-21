import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
}
