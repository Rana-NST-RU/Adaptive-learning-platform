// ─────────────────────────────────────────────────────────────────────────────
// Tracker Controller — Sprint 4: Adaptive Engine & Mastery Tracking
// ─────────────────────────────────────────────────────────────────────────────

import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TrackerService } from './tracker.service';

@Controller('tracker')
@UseGuards(JwtAuthGuard)
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  /**
   * GET /tracker/stats
   * Returns live dashboard stats: XP, streak, mastery counts, accuracy
   */
  @Get('stats')
  async getDashboardStats(@Request() req: any) {
    return this.tracker.getDashboardStats(req.user.id);
  }

  /**
   * GET /tracker/streak
   * Returns current streak info including freezes and total active days
   */
  @Get('streak')
  async getStreak(@Request() req: any) {
    return this.tracker.getStreakInfo(req.user.id);
  }

  /**
   * GET /tracker/recommendations?domain=DSA
   * Generates and returns personalised recommendations (REVISE / LEARN_NEW / PRACTICE)
   */
  @Get('recommendations')
  async getRecommendations(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ) {
    return this.tracker.generateRecommendations(req.user.id, domain);
  }

  /**
   * GET /tracker/mastery?domain=DSA
   * Returns full mastery overview per concept with live retention scores
   */
  @Get('mastery')
  async getMasteryOverview(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.tracker.getMasteryOverview(req.user.id, domain);
  }
}
