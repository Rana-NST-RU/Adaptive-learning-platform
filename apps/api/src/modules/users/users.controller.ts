import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Request() req: any) {
    return this.usersService.getProfile(req.user.sub);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get user learning stats' })
  getStats(@Param('id') id: string) {
    return this.usersService.getUserStats(id);
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
    },
  ) {
    return this.usersService.updateProfile(req.user.sub, body);
  }
}
