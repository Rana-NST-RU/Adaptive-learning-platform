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
  getDashboardStats(@Request() req: any) {
    return this.tracker.getDashboardStats(req.user.id);
  }

  // ─── GET /tracker/streak ─────────────────────────────────────────────────

  @Get('streak')
  @ApiOperation({ summary: 'Current streak info with freeze count and XP multiplier' })
  getStreakInfo(@Request() req: any) {
    return this.tracker.getStreakInfo(req.user.id);
  }

  // ─── GET /tracker/recommendations ────────────────────────────────────────

  @Get('recommendations')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Personalised recommendations (REVISE / LEARN_NEW / PRACTICE)' })
  getRecommendations(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ) {
    return this.tracker.generateRecommendations(req.user.id, domain);
  }

  // ─── GET /tracker/mastery ─────────────────────────────────────────────────

  @Get('mastery')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Full mastery overview with live FSRS retention scores' })
  getMasteryOverview(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.tracker.getMasteryOverview(req.user.id, domain);
  }

  // ─── GET /tracker/plan ────────────────────────────────────────────────────

  @Get('plan')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: "Today's personalised study plan — revisions + 1 new + 1 practice" })
  getDailyPlan(
    @Request() req: any,
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ) {
    return this.tracker.getDailyPlan(req.user.id, domain);
  }

  // ─── GET /tracker/due-concepts ────────────────────────────────────────────

  @Get('due-concepts')
  @ApiQuery({ name: 'domain', enum: ['DSA', 'SYSTEM_DESIGN'], required: false })
  @ApiOperation({ summary: 'Concepts due for review today (Smart Review session)' })
  getDueConcepts(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.tracker.getDueConcepts(req.user.id, domain);
  }

  // ─── GET /tracker/insights ────────────────────────────────────────────────

  @Get('insights')
  @ApiOperation({ summary: 'Learning insights — optimal study hours, best day-of-week' })
  getInsights(@Request() req: any) {
    return this.tracker.getInsights(req.user.id);
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
    return this.tracker.rateConfidence(req.user.id, dto.attemptId, dto.grade);
  }
}
