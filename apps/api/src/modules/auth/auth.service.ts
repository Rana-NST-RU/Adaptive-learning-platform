import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthProvider } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    isVerified: boolean;
    avatar: string | null;
  };
};

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {};

  onModuleInit() {
    // Initialize Firebase Admin SDK (idempotent)
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.config.get<string>('FIREBASE_PROJECT_ID'),
          clientEmail: this.config.get<string>('FIREBASE_CLIENT_EMAIL'),
          privateKey: this.config
            .get<string>('FIREBASE_PRIVATE_KEY')
            ?.replace(/\\n/g, '\n'),
        }),
      });
      this.logger.log('✅ Firebase Admin SDK initialized');
    };
  };

  // ─────────────────────────────────────────────────────────────
  // FIREBASE PHONE AUTH (Primary method — 10k SMS/month free)
  // ─────────────────────────────────────────────────────────────

  /**
   * Verify Firebase ID Token from phone auth.
   * Flow: Client → Firebase → ID Token → This endpoint → App JWT
   */
  async verifyFirebasePhone(
    idToken: string,
    name?: string,
  ): Promise<AuthTokens> {
    // 1. Verify the Firebase ID token
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      this.logger.warn(`Firebase token verification failed: ${error.message}`);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    };

    const phone = decodedToken.phone_number;
    if (!phone) {
      throw new UnauthorizedException('Token does not contain a phone number');
    }; 

    // 2. Find or create user
    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      // First-time login → create account automatically
      user = await this.prisma.user.create({
        data: {
          phone,
          name: name || `User_${phone.slice(-4)}`,
          provider: AuthProvider.PHONE,
          isVerified: true, // Phone is verified by Firebase
          profile: {
            create: {}, // Default UserProfile
          },
          streak: {
            create: {}, // Initialize streak
          },
        },
      });
      this.logger.log(`✅ New user created via phone: ${phone}`);
    } else if (!user.isVerified) {
      // Mark existing phone user as verified
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isVerified: true },
      });
    };

    return this.generateTokens(user);
  };


  // ─────────────────────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────────────────────

  async loginWithGoogle(googleProfile: {
    googleId: string;
    email: string;
    name: string;
    avatar?: string | null;
  }): Promise<AuthTokens> {
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: googleProfile.googleId }, { email: googleProfile.email }],
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          googleId: googleProfile.googleId,
          email: googleProfile.email,
          name: googleProfile.name,
          avatar: googleProfile.avatar,
          provider: AuthProvider.GOOGLE,
          isVerified: true,
          profile: { create: {} },
          streak: { create: {} },
        },
      });
      this.logger.log(`✅ New user via Google: ${googleProfile.email}`);
    } else if (!user.googleId) {
      // Link Google to existing email account
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleProfile.googleId,
          avatar: googleProfile.avatar ?? user.avatar,
          isVerified: true,
        },
      });
    };  

    return this.generateTokens(user);
  };

  // ─────────────────────────────────────────────────────────────
  // EMAIL / PASSWORD AUTH
  // ─────────────────────────────────────────────────────────────

  async register(
    email: string,
    password: string,
    name: string,
  ): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    };

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        provider: AuthProvider.EMAIL,
        isVerified: false,
        profile: { create: {} },
        streak: { create: {} },
      },
    });

    // Store password hash in Redis (until we add passwordHash field to schema)
    await this.redis.set(`pwd:${user.id}`, passwordHash);

    return this.generateTokens(user);
  };

  /**
   * Validate email/password — used by LocalStrategy
   */
  async validateEmailPassword(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;

    const hash = await this.redis.get(`pwd:${user.id}`);
    if (!hash) return null;

    const isValid = await bcrypt.compare(password, hash);
    return isValid ? user : null;
  }; 

  async loginWithEmail(email: string, password: string): Promise<AuthTokens> {
    const user = await this.validateEmailPassword(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    };
    return this.generateTokens(user);
  };

  // ─────────────────────────────────────────────────────────────
  // TOKEN MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  async generateTokens(user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    name: string;
    role: string;
    isVerified: boolean;
    avatar?: string | null;
  }): Promise<AuthTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN') || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d',
      }),
    ]);

    // Store refresh token in Redis with 7-day TTL
    await this.redis.setex(`refresh:${user.id}`, 7 * 24 * 3600, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email ?? null,
        phone: user.phone ?? null,
        role: user.role, 
        isVerified: user.isVerified,
        avatar: user.avatar ?? null,
      },
    };
  };

  async refreshTokens(userId: string, token: string): Promise<AuthTokens> {
    const stored = await this.redis.get(`refresh:${userId}`);
    if (!stored || stored !== token) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    };

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    };

    return this.generateTokens(user);
  };

  async logout(userId: string): Promise<{ message: string }> {
    await this.redis.del(`refresh:${userId}`);
    return { message: 'Logged out successfully' };
  };
};

