// ─────────────────────────────────────────────────────────────────────────────
// Questions Service
// Handles LLM generation, question fetching, and attempt validation.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Difficulty, Domain, QuestionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { TrackerService } from '../learning-tracker/tracker.service';
import {
  GenerateQuestionsDto,
  GetQuestionsDto,
  SubmitAttemptDto,
  QuestionResponseDto,
  AttemptResultDto,
} from './dto/question.dto';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  // XP reward by difficulty
  private static readonly XP_MAP: Record<Difficulty, number> = {
    EASY: 15,
    MEDIUM: 30,
    HARD: 50,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly tracker: TrackerService,
  ) {}

  // ─── Generate Questions via LLM ───────────────────────────────────────────

  async generateQuestions(dto: GenerateQuestionsDto): Promise<QuestionResponseDto[]> {
    const {
      conceptId,
      conceptName,
      domain,
      difficulty = 'MEDIUM',
      count = 5,
      questionTypes = ['MCQ', 'TRUE_FALSE'],
    } = dto;

    // Generate via LLM
    const generated = await this.llm.generateQuestions(
      conceptId,
      conceptName,
      domain,
      difficulty,
      count,
      questionTypes as any,
    );

    if (!generated.length) {
      throw new BadRequestException('LLM returned no valid questions. Try again.');
    }

    // Persist to PostgreSQL
    const saved = await Promise.all(
      generated.map((q) =>
        this.prisma.question.create({
          data: {
            conceptId,
            conceptName,
            domain,
            content: q.content,
            questionType: q.questionType as QuestionType,
            difficulty: q.difficulty as Difficulty,
            options: q.options ?? [],
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            hints: q.hints,
            codeSnippet: q.codeSnippet ?? null,
            language: q.language ?? null,
            tags: q.tags,
            generatedByLLM: true,
            llmModel: this.llm['model'],
          },
        }),
      ),
    );

    this.logger.log(`Saved ${saved.length} questions for concept "${conceptName}"`);
    return saved.map(this.toResponseDto);
  }

  // ─── Fetch Questions ───────────────────────────────────────────────────────

  async getQuestions(dto: GetQuestionsDto): Promise<QuestionResponseDto[]> {
    const { conceptId, difficulty, domain, questionType, limit = 5 } = dto;

    const questions = await this.prisma.question.findMany({
      where: {
        isActive: true,
        ...(conceptId && { conceptId }),
        ...(difficulty && { difficulty }),
        ...(domain && { domain }),
        ...(questionType && { questionType }),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return questions.map(this.toResponseDto);
  }

  async getQuestionById(id: string): Promise<QuestionResponseDto> {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw new NotFoundException(`Question ${id} not found`);
    return this.toResponseDto(q);
  }

  // ─── Submit Attempt ────────────────────────────────────────────────────────

  async submitAttempt(
    userId: string | null,
    dto: SubmitAttemptDto,
  ): Promise<AttemptResultDto> {
    const { questionId, answer, timeTakenMs, hintsUsed = 0, sessionId, confidenceRating } = dto;

    // Fetch the question WITH the answer (server-side only)
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);

    // Validate answer
    const isCorrect = this.checkAnswer(question, answer);

    // Calculate score (partial credit for hints used)
    const baseScore = isCorrect ? 1.0 : 0.0;
    const hintPenalty = hintsUsed * 0.1;
    const score = Math.max(0, baseScore - hintPenalty);

    // Streak XP multiplier (Sprint 4: 3d=1.2×, 7d=1.5×, 14d=1.75×, 30d=2.0×)
    let xpMultiplier = 1.0;
    let prevMasteryLevel: number | undefined;
    let newMasteryLevel: number | undefined;
    let attemptId = 'anonymous-' + Date.now();

    const baseXP = isCorrect
      ? Math.round(QuestionsService.XP_MAP[question.difficulty] * (1 - hintPenalty))
      : 0;

    // Only persist to DB if user is authenticated
    if (userId) {
      // Fetch streak multiplier BEFORE saving attempt
      xpMultiplier = await this.tracker.getStreakMultiplierForUser(userId);
      const xpWithBonus = Math.round(baseXP * xpMultiplier);

      // Capture prev mastery level for level-up detection
      const prevMastery = await this.prisma.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId: question.conceptId } },
        select: { masteryLevel: true },
      });
      prevMasteryLevel = prevMastery?.masteryLevel;

      const attempt = await this.prisma.questionAttempt.create({
        data: {
          questionId,
          userId,
          answer,
          isCorrect,
          timeTakenMs,
          hintsUsed,
          score,
          ...(sessionId && { sessionId }),
          ...(confidenceRating && { confidenceRating }),
        },
      });
      attemptId = attempt.id;

      // Update ConceptMastery (upsert) — returns new level
      await this.updateConceptMastery(userId, question, isCorrect, timeTakenMs);

      // Fetch updated mastery level for level-up detection
      const afterMastery = await this.prisma.conceptMastery.findUnique({
        where: { userId_conceptId: { userId, conceptId: question.conceptId } },
        select: { masteryLevel: true },
      });
      newMasteryLevel = afterMastery?.masteryLevel;

      // Sprint 4: FSRS retention + streak (fire-and-forget)
      this.tracker.updateRetention(userId, question.conceptId, isCorrect, confidenceRating).catch(() => {});
      this.tracker.updateStreak(userId).catch(() => {});

      // Award XP with streak multiplier
      if (xpWithBonus > 0) {
        await this.prisma.userProfile.updateMany({
          where: { userId },
          data: { totalXP: { increment: xpWithBonus } },
        });
      }

      return {
        attemptId,
        isCorrect,
        score,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        xpEarned: xpWithBonus,
        timeTakenMs,
        xpMultiplier,
        prevMasteryLevel,
        newMasteryLevel,
      };
    }

    return {
      attemptId,
      isCorrect,
      score,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      xpEarned: baseXP,
      timeTakenMs,
      xpMultiplier: 1.0,
    };
  }

  // ─── My Attempt History ────────────────────────────────────────────────────

  async getMyAttempts(userId: string, limit = 20) {
    return this.prisma.questionAttempt.findMany({
      where: { userId },
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: {
        question: {
          select: {
            content: true,
            questionType: true,
            difficulty: true,
            conceptName: true,
            domain: true,
          },
        },
      },
    });
  }

  // ─── Concept Mastery for User ─────────────────────────────────────────────

  async getMasteryForConcepts(userId: string, conceptIds: string[]) {
    const records = await this.prisma.conceptMastery.findMany({
      where: { userId, conceptId: { in: conceptIds } },
      select: {
        conceptId: true,
        masteryLevel: true,
        masteryScore: true,
        totalAttempts: true,
        correctAttempts: true,
      },
    });
    // Return as map for O(1) lookups on frontend
    const map: Record<string, typeof records[0]> = {};
    for (const r of records) map[r.conceptId] = r;
    return map;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private checkAnswer(question: any, userAnswer: string): boolean {
    const correct = question.correctAnswer.trim().toLowerCase();
    const given = userAnswer.trim().toLowerCase();

    if (question.questionType === 'MCQ') {
      // Accept "B" or "B) ..." format
      return correct === given || correct === given.charAt(0);
    }
    if (question.questionType === 'TRUE_FALSE') {
      return correct === given;
    }
    if (question.questionType === 'SHORT_ANSWER') {
      // Fuzzy word-overlap (Jaccard ≥ 0.3 counts as correct)
      return this.wordOverlapScore(correct, given) >= 0.3;
    }
    // CODE_SNIPPET — exact or contains (code needs to be more precise)
    return correct === given || correct.includes(given) || given.includes(correct);
  }

  /**
   * Compute Jaccard similarity between two strings:
   * |intersection(words_a, words_b)| / |union(words_a, words_b)|
   * Returns 0.0–1.0. Used for SHORT_ANSWER fuzzy matching.
   */
  private wordOverlapScore(a: string, b: string): number {
    const tokenize = (s: string) =>
      new Set(
        s.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean),
      );
    const setA = tokenize(a);
    const setB = tokenize(b);
    const intersection = [...setA].filter((w) => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Return a partial score (0.0–1.0) based on question type.
   * Used alongside isCorrect for SHORT_ANSWER to give partial credit.
   */
  getAnswerScore(question: any, userAnswer: string): number {
    const correct = question.correctAnswer.trim().toLowerCase();
    const given = userAnswer.trim().toLowerCase();
    if (question.questionType === 'SHORT_ANSWER') {
      return Math.min(1.0, this.wordOverlapScore(correct, given) / 0.3);
    }
    return this.checkAnswer(question, userAnswer) ? 1.0 : 0.0;
  }

  private async updateConceptMastery(
    userId: string,
    question: any,
    isCorrect: boolean,
    timeTakenMs: number,
  ) {
    const existing = await this.prisma.conceptMastery.findUnique({
      where: { userId_conceptId: { userId, conceptId: question.conceptId } },
    });

    const totalAttempts = (existing?.totalAttempts ?? 0) + 1;
    const correctAttempts = (existing?.correctAttempts ?? 0) + (isCorrect ? 1 : 0);
    const masteryScore = correctAttempts / totalAttempts;
    const masteryLevel = this.scoreToLevel(masteryScore);

    await this.prisma.conceptMastery.upsert({
      where: { userId_conceptId: { userId, conceptId: question.conceptId } },
      update: {
        totalAttempts,
        correctAttempts,
        incorrectAttempts: totalAttempts - correctAttempts,
        masteryScore,
        masteryLevel,
        lastAttemptAt: new Date(),
        avgTimePerQuestion: timeTakenMs,
      },
      create: {
        userId,
        conceptId: question.conceptId,
        conceptName: question.conceptName,
        domain: question.domain,
        totalAttempts: 1,
        correctAttempts: isCorrect ? 1 : 0,
        incorrectAttempts: isCorrect ? 0 : 1,
        masteryScore,
        masteryLevel,
        firstAttemptAt: new Date(),
        lastAttemptAt: new Date(),
        avgTimePerQuestion: timeTakenMs,
      },
    });
  }

  private scoreToLevel(score: number): number {
    if (score >= 0.9) return 4; // Expert
    if (score >= 0.75) return 3; // Advanced
    if (score >= 0.5) return 2;  // Intermediate
    if (score > 0) return 1;     // Beginner
    return 0;                    // Not started
  }

  private toResponseDto(q: any): QuestionResponseDto {
    return {
      id: q.id,
      conceptId: q.conceptId,
      conceptName: q.conceptName,
      domain: q.domain,
      content: q.content,
      questionType: q.questionType,
      difficulty: q.difficulty,
      options: q.options?.length ? q.options : undefined,
      hints: q.hints ?? [],
      codeSnippet: q.codeSnippet ?? undefined,
      language: q.language ?? undefined,
      tags: q.tags ?? [],
    };
  }
}
