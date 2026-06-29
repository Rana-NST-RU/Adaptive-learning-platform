import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { VerifyPhoneDto, RegisterDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─────────────────────────────────────────────────────────────
  // FIREBASE PHONE AUTH
  // ─────────────────────────────────────────────────────────────

  @Post('phone/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Firebase phone OTP token → get app JWT',
    description:
      'After Firebase SDK verifies the OTP on the client, send the Firebase ID token here. We verify it server-side and return app-level JWT tokens.',
  })
  async verifyPhone(
    @Body() dto: VerifyPhoneDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.verifyFirebasePhone(dto.idToken, dto.name);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return tokens;
  }

  // ─────────────────────────────────────────────────────────────
  // GOOGLE OAUTH
  // ─────────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  googleAuth() {
    // Redirects to Google — handled by Passport
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Request() req: any,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
      const tokens = await this.authService.loginWithGoogle(req.user);
      this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

      // Redirect to a dedicated Next.js callback page that stores token in localStorage.
      // Cookies are unreliable in cross-port dev (localhost:3001 → localhost:3000).
      const userData = Buffer.from(JSON.stringify(tokens.user)).toString('base64');
      return res.redirect(
        `${frontendUrl}/auth/callback?token=${encodeURIComponent(tokens.accessToken)}&refresh=${encodeURIComponent(tokens.refreshToken)}&user=${encodeURIComponent(userData)}`,
      );
    } catch (err: any) {
      // Authorization code already used, network error, etc. — redirect gracefully.
      console.error('[Auth] Google OAuth callback failed:', err?.message ?? err);
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // EMAIL / PASSWORD
  // ─────────────────────────────────────────────────────────────

  @Post('register')
  @ApiOperation({ summary: 'Register with email + password' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(
      dto.email,
      dto.password,
      dto.name,
    );
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return tokens;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.loginWithEmail(dto.email, dto.password);
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return tokens;
  }

  // ─────────────────────────────────────────────────────────────
  // TOKEN MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(
    @Body() dto: RefreshDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshTokens(
      dto.userId,
      dto.refreshToken,
    );
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — invalidates refresh token' })
  async logout(
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return this.authService.logout(req.user.sub);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user from JWT' })
  getMe(@Request() req: any) {
    return { user: req.user };
  }

  // ─────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie('access_token', accessToken, COOKIE_OPTIONS);
    res.cookie('refresh_token', refreshToken, REFRESH_COOKIE_OPTIONS);
  }
}
