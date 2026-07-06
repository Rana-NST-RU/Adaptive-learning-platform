import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType, Difficulty, Domain } from '@prisma/client';

// ─── Request DTOs ─────────────────────────────────────────────────────────────

export class GenerateQuestionsDto {
  @ApiProperty({ example: 'binary-search' })
  @IsString()
  conceptId: string;

  @ApiProperty({ example: 'Binary Search' })
  @IsString()
  conceptName: string;

  @ApiProperty({ enum: Domain, example: 'DSA' })
  @IsEnum(Domain)
  domain: Domain;

  @ApiPropertyOptional({ enum: Difficulty, example: 'MEDIUM' })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ example: 5, default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  count?: number;

  @ApiPropertyOptional({
    isArray: true,
    enum: QuestionType,
    example: ['MCQ', 'TRUE_FALSE'],
  })
  @IsOptional()
  @IsArray()
  questionTypes?: QuestionType[];
}

export class SubmitAttemptDto {
  @ApiProperty({ example: 'clx1234...' })
  @IsString()
  questionId: string;

  @ApiProperty({ example: 'B' })
  @IsString()
  answer: string;

  @ApiProperty({ example: 3200 })
  @IsInt()
  @Min(0)
  timeTakenMs: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  hintsUsed?: number;

  @ApiPropertyOptional({ example: 'session-id-here' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  /**
   * FSRS confidence grade 1-4:
   * 1=Again (blackout), 2=Hard (wrong-familiar), 3=Good (correct-effort), 4=Easy (correct-confident)
   * If omitted, derived from isCorrect: correct→3, wrong→1
   */
  @ApiPropertyOptional({ example: 3, minimum: 1, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  confidenceRating?: number;
}

export class GetQuestionsDto {
  @ApiPropertyOptional({ example: 'binary-search' })
  @IsOptional()
  @IsString()
  conceptId?: string;

  @ApiPropertyOptional({ enum: Difficulty })
  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @ApiPropertyOptional({ enum: Domain })
  @IsOptional()
  @IsEnum(Domain)
  domain?: Domain;

  @ApiPropertyOptional({ enum: QuestionType })
  @IsOptional()
  @IsEnum(QuestionType)
  questionType?: QuestionType;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export class QuestionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  conceptId: string;

  @ApiProperty()
  conceptName: string;

  @ApiProperty({ enum: Domain })
  domain: Domain;

  @ApiProperty()
  content: string;

  @ApiProperty({ enum: QuestionType })
  questionType: QuestionType;

  @ApiProperty({ enum: Difficulty })
  difficulty: Difficulty;

  @ApiPropertyOptional({ isArray: true, type: String })
  options?: string[];

  @ApiPropertyOptional({ isArray: true, type: String })
  hints: string[];

  @ApiPropertyOptional()
  codeSnippet?: string;

  @ApiPropertyOptional()
  language?: string;

  @ApiProperty({ isArray: true, type: String })
  tags: string[];

  // correctAnswer is intentionally OMITTED from the client response
}

export class AttemptResultDto {
  @ApiProperty()
  attemptId: string;

  @ApiProperty()
  isCorrect: boolean;

  @ApiProperty()
  score: number;

  @ApiProperty()
  correctAnswer: string;

  @ApiProperty()
  explanation: string;

  @ApiProperty()
  xpEarned: number;

  @ApiProperty()
  timeTakenMs: number;

  /** Streak XP multiplier applied (1.0 = no bonus, 2.0 = 30-day streak) */
  @ApiProperty({ example: 1.5 })
  xpMultiplier: number;

  /** Mastery level before this attempt (0–4) */
  @ApiPropertyOptional({ example: 2 })
  prevMasteryLevel?: number;

  /** Mastery level after this attempt (0–4) — if different from prev, show level-up */
  @ApiPropertyOptional({ example: 3 })
  newMasteryLevel?: number;

  /** Achievement types newly unlocked by this attempt (e.g. ['FIRST_ANSWER', 'STREAK_3']) */
  @ApiPropertyOptional({ type: [String], example: ['FIRST_ANSWER'] })
  newAchievements?: string[];

  /** Auto-difficulty suggestion: 'EASY' if struggling, 'HARD' if mastered (based on concept accuracy) */
  @ApiPropertyOptional({ example: 'HARD' })
  suggestedDifficulty?: string;
}
