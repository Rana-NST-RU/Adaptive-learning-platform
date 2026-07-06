import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Profile ──────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Request() req: any) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @Request() req: any,
    @Body()
    body: {
      name?: string;
      bio?: string;
      institution?: string;
      targetExam?: string;
      dailyGoalMins?: number;
      timezone?: string;
      preferredDomain?: 'DSA' | 'SYSTEM_DESIGN';
    },
  ) {
    return this.usersService.updateProfile(req.user.sub, body);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get user learning stats' })
  getStats(@Param('id') id: string) {
    return this.usersService.getUserStats(id);
  }

  // ─── Leaderboard ──────────────────────────────────────────────

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get global leaderboard (top 50 by XP)' })
  @ApiQuery({ name: 'domain', required: false, enum: ['DSA', 'SYSTEM_DESIGN'] })
  getLeaderboard(
    @Request() req: any,
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ) {
    return this.usersService.getLeaderboard(req.user.sub, domain);
  }

  // ─── Streak Freeze ────────────────────────────────────────────

  @Post('streak-freeze/use')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Use a streak freeze to protect current streak' })
  useStreakFreeze(@Request() req: any) {
    return this.usersService.useStreakFreeze(req.user.sub);
  }
}
