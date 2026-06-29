import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus, 
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { QuestionsService } from './questions.service';
import {
  GenerateQuestionsDto,
  GetQuestionsDto,
  SubmitAttemptDto,
  QuestionResponseDto,
  AttemptResultDto,
} from './dto/question.dto';

@ApiTags('questions')
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // ─── GET /questions ──────────────────────────────────────────────────────
  // Public — fetch cached questions for a concept (no LLM call)

  @Get()
  @ApiOperation({ summary: 'Fetch stored questions for a concept' })
  @ApiQuery({ name: 'conceptId', required: false })
  @ApiQuery({ name: 'difficulty', required: false, enum: ['EASY', 'MEDIUM', 'HARD'] })
  @ApiQuery({ name: 'domain', required: false, enum: ['DSA', 'SYSTEM_DESIGN'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiResponse({ status: 200, type: [QuestionResponseDto] })
  getQuestions(@Query() query: GetQuestionsDto): Promise<QuestionResponseDto[]> {
    return this.questionsService.getQuestions(query);
  }

  // ─── POST /questions/generate ─────────────────────────────────────────────

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate questions via LLM for a concept (public)',
    description: 'Calls Groq (llama-3.3-70b-versatile) and saves to PostgreSQL. No auth required.',
  })
  @ApiResponse({ status: 201, type: [QuestionResponseDto] })
  generateQuestions(
    @Body() dto: GenerateQuestionsDto,
  ): Promise<QuestionResponseDto[]> {
    return this.questionsService.generateQuestions(dto);
  }

  // ─── POST /questions/attempt ──────────────────────────────────────────────

  @Post('attempt')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit an answer for a question',
    description:
      'Validates correctness server-side, saves attempt, updates mastery, awards XP. Works anonymously — auth unlocks XP tracking.',
  })
  @ApiResponse({ status: 200, type: AttemptResultDto })
  submitAttempt(
    @Request() req: any,
    @Body() dto: SubmitAttemptDto,
  ): Promise<AttemptResultDto> {
    return this.questionsService.submitAttempt(req.user?.id ?? null, dto);
  }

  // ─── GET /questions/attempts/me ───────────────────────────────────────────
  // NOTE: all static GET routes must be declared BEFORE @Get(':id')

  @Get('attempts/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my recent question attempts' })
  getMyAttempts(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.questionsService.getMyAttempts(req.user.id, limit);
  }

  // ─── GET /questions/mastery ───────────────────────────────────────────────

  @Get('mastery')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get mastery data for a list of concept IDs (auth optional)' })
  @ApiQuery({ name: 'conceptIds', required: true, description: 'Comma-separated concept IDs' })
  getMastery(
    @Request() req: any,
    @Query('conceptIds') conceptIds: string,
  ) {
    if (!req.user?.id || !conceptIds) return {};
    const ids = conceptIds.split(',').filter(Boolean);
    return this.questionsService.getMasteryForConcepts(req.user.id, ids);
  }

  // ─── GET /questions/:id ──────────────────────────────────────────────────
  // IMPORTANT: keep this LAST — the :id wildcard would shadow all routes above it

  @Get(':id')
  @ApiOperation({ summary: 'Get a single question by ID' })
  @ApiResponse({ status: 200, type: QuestionResponseDto })
  getOne(@Param('id') id: string): Promise<QuestionResponseDto> {
    return this.questionsService.getQuestionById(id);
  }
}
