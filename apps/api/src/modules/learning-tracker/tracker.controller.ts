import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Param,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TrackerService } from './tracker.service';
import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class RateConfidenceDto {
  @ApiProperty({ example: 'attempt-id-here' })
  attemptId: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 4 })
  @IsInt()
  @Min(1)
  @Max(4)
  grade: number;
}

@ApiTags('tracker')
@Controller('tracker')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TrackerController {
  constructor(private readonly tracker: TrackerService) {}

  // ─── GET /tracker/stats ──────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Live dashboard stats — XP, streak (+ multiplier), mastery counts, accuracy' })
  async getDashboardStats(@Request() req: any) {
    // Passively detect and apply streak breaks on every dashboard load
    this.tracker.checkAndBreakStreak(req.user.sub).catch(() => {});
    const [stats, dueCount] = await Promise.all([
      this.tracker.getDashboardStats(req.user.sub),
      this.tracker.getDueConceptCount(req.user.sub),
    ]);
    return { ...stats, dueConceptCount: dueCount };
  }

  // ─── GET /tracker/streak ─────────────────────────────────────────────────

  @Get('streak')
  @ApiOperation({ summary: 'Current streak info with freeze count and XP multiplier' })
  getStreakInfo(@Request() req: any) {
    return this.tracker.getStreakInfo(req.user.sub);
  }

  // ─── GET /tracker/recommendations ────────────────────────────────────────

  @Get('recommendations')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Personalised recommendations (REVISE / LEARN_NEW / PRACTICE)' })
  getRecommendations(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ) {
    return this.tracker.generateRecommendations(req.user.sub, domain);
  }

  // ─── GET /tracker/mastery ─────────────────────────────────────────────────

  @Get('mastery')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Full mastery overview with live FSRS retention scores' })
  getMasteryOverview(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.tracker.getMasteryOverview(req.user.sub, domain);
  }

  // ─── GET /tracker/plan ────────────────────────────────────────────────────

  @Get('plan')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: "Today's personalised study plan — revisions + 1 new + 1 practice" })
  getDailyPlan(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ) {
    return this.tracker.getDailyPlan(req.user.sub, domain);
  }

  // ─── GET /tracker/due-concepts ────────────────────────────────────────────

  @Get('due-concepts')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Concepts due for review today (Smart Review session)' })
  getDueConcepts(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.tracker.getDueConcepts(req.user.sub, domain);
  }

  // ─── GET /tracker/insights ────────────────────────────────────────────────

  @Get('insights')
  @ApiOperation({ summary: 'Learning insights — optimal study hours, best day-of-week' })
  getInsights(@Request() req: any) {
    return this.tracker.getInsights(req.user.sub);
  }

  // ─── POST /tracker/rate-confidence ───────────────────────────────────────

  @Post('rate-confidence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rate confidence after seeing answer (1-4 FSRS grade)',
    description:
      '1=Again (blackout), 2=Hard (wrong but familiar), 3=Good (correct with effort), 4=Easy (confident). ' +
      'Updates the QuestionAttempt record and re-runs FSRS with the explicit grade.',
  })
  @ApiResponse({ status: 200, schema: { example: { updated: true } } })
  rateConfidence(
    @Request() req: any,
    @Body() dto: RateConfidenceDto,
  ) {
    if (!dto.attemptId || dto.grade < 1 || dto.grade > 4) {
      throw new BadRequestException('Invalid attemptId or grade (must be 1-4)');
    }
    return this.tracker.rateConfidence(req.user.sub, dto.attemptId, dto.grade);
  }

  // ─── GET /tracker/heatmap ─────────────────────────────────────────────────

  @Get('heatmap')
  @ApiOperation({ summary: 'Activity heatmap — daily attempt counts for past 365 days' })
  getHeatmap(@Request() req: any) {
    return this.tracker.getActivityHeatmap(req.user.sub);
  }

  // ─── GET /tracker/forecast ────────────────────────────────────────────────

  @Get('forecast')
  @ApiOperation({ summary: '30-day FSRS review load forecast — how many reviews are due per day' })
  getForecast(@Request() req: any) {
    return this.tracker.getForecast(req.user.sub);
  }

  // ─── GET /tracker/fading-soon ─────────────────────────────────────────────

  @Get('fading-soon')
  @ApiOperation({ summary: 'Concepts predicted to drop below 70% retention in next 72 hours (FSRS)' })
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiQuery({ name: 'windowHours', type: 'number', required: false })
  getFadingSoon(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
    @Query('windowHours') windowHours?: string,
  ) {
    return this.tracker.getFadingSoon(req.user.sub, domain, windowHours ? parseInt(windowHours) : 72);
  }

  // ─── GET /tracker/weekly ──────────────────────────────────────────────────

  @Get('weekly')
  @ApiOperation({ summary: 'Weekly digest — stats for the past 7 days' })
  getWeeklyDigest(@Request() req: any) {
    return this.tracker.getWeeklyDigest(req.user.sub);
  }

  // ─── GET /tracker/achievements ────────────────────────────────────────────

  @Get('achievements')
  @ApiOperation({ summary: 'All achievements with unlock status and timestamp' })
  getAchievements(@Request() req: any) {
    return this.tracker.getAchievements(req.user.sub);
  }

  // ─── POST /tracker/seed-assessment ───────────────────────────────────────

  @Post('seed-assessment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed FSRS with user self-assessment rating (1-5) before first practice',
    description: 'Primes memory stability so spaced repetition intervals are accurate from day 1.',
  })
  seedAssessment(
    @Request() req: any,
    @Body() body: { conceptId: string; conceptName: string; domain: 'DSA' | 'SYSTEM_DESIGN'; rating: number },
  ) {
    const { conceptId, conceptName, domain, rating } = body;
    if (!conceptId || rating < 1 || rating > 5) {
      throw new BadRequestException('conceptId required; rating must be 1-5');
    }
    return this.tracker.seedSelfAssessment(req.user.sub, conceptId, conceptName, domain, rating);
  }
}

