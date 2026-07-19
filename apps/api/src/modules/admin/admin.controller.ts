import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'TEACHER')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Platform Analytics ────────────────────────────────────────────────────

  @Get('analytics')
  @ApiOperation({ summary: 'Global platform analytics: DAU/WAU/MAU, accuracy, sessions' })
  getAnalytics() {
    return this.adminService.getPlatformAnalytics();
  }

  @Get('analytics/dau-trend')
  @ApiOperation({ summary: '14-day daily active user trend' })
  getDauTrend() {
    return this.adminService.getDauTrend();
  }

  @Get('analytics/top-concepts')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOperation({ summary: 'Top concepts by learner count' })
  getTopConcepts(@Query('limit') limit?: number) {
    return this.adminService.getTopConcepts(limit ? Number(limit) : 10);
  }

  // ─── User Management ──────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated, searchable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUsers(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      search,
    );
  }

  @Patch('users/:id/role')
  @Roles('ADMIN') // Only ADMIN can change roles (not TEACHER)
  @ApiOperation({ summary: 'Update a user role (ADMIN only)' })
  updateUserRole(
    @Param('id') id: string,
    @Body() body: { role: 'STUDENT' | 'TEACHER' | 'ADMIN' },
  ) {
    return this.adminService.updateUserRole(id, body.role);
  }

  @Patch('users/:id/active')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Activate or deactivate a user (ADMIN only)' })
  toggleUserActive(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.toggleUserActive(id, body.isActive);
  }

  @Get('users/:id/analytics')
  @ApiOperation({ summary: 'Per-student analytics: XP, streak, mastery, accuracy, activity trend' })
  getUserAnalytics(@Param('id') id: string) {
    return this.adminService.getUserAnalytics(id);
  }

  // ─── Question Moderation ──────────────────────────────────────────────────

  @Get('questions')
  @ApiOperation({ summary: 'List all questions (paginated, filterable)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'domain', required: false, enum: ['DSA', 'SYSTEM_DESIGN'] })
  @ApiQuery({ name: 'difficulty', required: false, enum: ['EASY', 'MEDIUM', 'HARD'] })
  @ApiQuery({ name: 'isFlagged', required: false, type: Boolean })
  listQuestions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('domain') domain?: string,
    @Query('difficulty') difficulty?: string,
    @Query('isFlagged') isFlagged?: string,
  ) {
    return this.adminService.listQuestions(
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
      domain,
      difficulty,
      isFlagged ? isFlagged === 'true' : undefined,
    );
  }

  @Patch('questions/:id')
  @ApiOperation({ summary: 'Edit a question (content, difficulty, isActive)' })
  updateQuestion(
    @Param('id') id: string,
    @Body()
    body: {
      content?: string;
      correctAnswer?: string;
      explanation?: string;
      isActive?: boolean;
      difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
    },
  ) {
    return this.adminService.updateQuestion(id, body);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete (deactivate) a question' })
  deleteQuestion(@Param('id') id: string) {
    return this.adminService.deleteQuestion(id);
  }

  // ─── Concept Mastery & Audit Logs (Sprint 6 Additional) ───────────────────

  @Patch('mastery/:userId/:conceptId')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Override a user\'s concept mastery score (ADMIN only)' })
  overrideMastery(
    @Param('userId') userId: string,
    @Param('conceptId') conceptId: string,
    @Body('masteryScore') masteryScore: number,
    @Request() req: any,
  ) {
    const actorId = req.user.sub;
    const actorName = req.user.name || 'Admin';
    return this.adminService.overrideMastery(userId, conceptId, masteryScore, actorId, actorName);
  }

  @Get('audit-logs')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List admin action audit logs (ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.adminService.getAuditLogs(page ? Number(page) : 1, limit ? Number(limit) : 50);
  }
}
