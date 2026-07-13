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
import { NotificationsGateway } from '../notifications/notifications.gateway';
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
    private readonly notifications: NotificationsGateway,
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

    // Fetch a wide candidate pool so we can shuffle — prevents same questions every session
    const pool = await this.prisma.question.findMany({
      where: {
        isActive: true,
        ...(conceptId && { conceptId }),
        ...(difficulty && { difficulty }),
        ...(domain && { domain }),
        ...(questionType && { questionType }),
      },
      take: Math.min(limit * 6, 60), // up to 60-question pool
      orderBy: { id: 'asc' },
    });

    // Fisher-Yates shuffle for true randomness each session
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, limit).map(this.toResponseDto);
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

      // Sprint 4: FSRS retention + streak + achievements (all fire-and-forget)
      this.tracker.updateRetention(userId, question.conceptId, isCorrect, confidenceRating).catch(() => {});
      this.tracker.updateStreak(userId).catch(() => {});

      // Achievement check — returns newly unlocked types (non-blocking)
      let newAchievements: string[] = [];
      try {
        newAchievements = await this.tracker.checkAndUnlockAchievements(userId, {
          isCorrect,
          timeTakenMs,
          conceptName: question.conceptName,
          masteryLevel: newMasteryLevel,
          hadConfidenceRating: !!confidenceRating,
        });
      } catch {
        // achievement check errors should never fail the request
      }

      // Auto-difficulty suggestion based on concept accuracy
      let suggestedDifficulty: string | undefined;
      try {
        const masteryRecord = await this.prisma.conceptMastery.findUnique({
          where: { userId_conceptId: { userId, conceptId: question.conceptId } },
          select: { masteryScore: true, totalAttempts: true },
        });
        if (masteryRecord && masteryRecord.totalAttempts >= 3) {
          if (masteryRecord.masteryScore >= 0.85) suggestedDifficulty = 'HARD';
          else if (masteryRecord.masteryScore <= 0.35) suggestedDifficulty = 'EASY';
        }
      } catch {
        // ignore
      }

      // ── LearningEvent analytics record ─────────────────────────────────────
      // Fire-and-forget: records time-spent, hints, XP per concept for insights
      this.prisma.learningEvent.create({
        data: {
          userId,
          eventType: 'QUESTION_ATTEMPTED',
          conceptId: question.conceptId,
          conceptName: question.conceptName,
          domain: question.domain,
          ...(sessionId && { sessionId }),
          payload: {
            isCorrect,
            timeTakenMs: timeTakenMs ?? null,
            hintsUsed,
            xpEarned: Math.round(baseXP * xpMultiplier),
            confidenceRating: confidenceRating ?? null,
            difficulty: question.difficulty,
            score,
          },
        },
      }).catch((err) => this.logger.warn(`[LearningEvent] failed to create: ${err}`));

      // Award XP with streak multiplier
      this.logger.log(`[XP] userId=${userId} baseXP=${baseXP} multiplier=${xpMultiplier} xpWithBonus=${xpWithBonus} isCorrect=${isCorrect}`);
      if (xpWithBonus > 0) {
        const result = await this.prisma.userProfile.upsert({
          where: { userId },
          update: { totalXP: { increment: xpWithBonus } },
          create: { userId, totalXP: xpWithBonus },
        });
        this.logger.log(`[XP] Awarded ${xpWithBonus} XP → totalXP now ${result.totalXP}`);
      }

      // Emit level_up WebSocket event if masteryLevel increased (fire-and-forget)
      if (
        prevMasteryLevel !== undefined &&
        newMasteryLevel !== undefined &&
        newMasteryLevel !== prevMasteryLevel
      ) {
        this.notifications.sendToUser(userId, 'level_up', {
          conceptName: question.conceptName,
          prevLevel: prevMasteryLevel,
          newLevel: newMasteryLevel,
          xpEarned: xpWithBonus,
        }).catch(() => {});
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
        newAchievements,
        suggestedDifficulty,
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
      // Two-pass check: Jaccard on meaningful words OR key-term coverage
      const jaccard = this.wordOverlapScore(correct, given);
      if (jaccard >= 0.25) return true;
      // Key-term check: ≥50% of non-trivial expected words appear in user answer
      const keyTermCoverage = this.keyTermCoverage(correct, given);
      return keyTermCoverage >= 0.5;
    }
    // CODE_SNIPPET — exact or contains
    return correct === given || correct.includes(given) || given.includes(correct);
  }

  /** Stop words stripped before Jaccard — prevents common words from skewing score */
  private static readonly STOP_WORDS = new Set([
    'a','an','the','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could',
    'should','may','might','shall','can','need','dare','used',
    'in','on','at','to','for','of','with','by','from','as',
    'into','through','during','before','after','above','below',
    'between','out','off','over','under','this','that','these',
    'those','it','its','and','or','but','if','so','yet','both',
    'not','no','nor','than','then','when','where','which','who',
    'what','how','all','each','every','both','few','more','most',
    'other','some','such','any','only','same','than','too','very',
  ]);

  /**
   * Compute Jaccard similarity between two strings after stripping stop words.
   * Returns 0.0–1.0.
   */
  private wordOverlapScore(a: string, b: string): number {
    const tokenize = (s: string) =>
      new Set(
        s.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 1 && !QuestionsService.STOP_WORDS.has(w)),
      );
    const setA = tokenize(a);
    const setB = tokenize(b);
    if (setA.size === 0 && setB.size === 0) return 1;
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Key-term coverage: what fraction of meaningful words in `expected`
   * appear in `given`? Useful when the user answer is much shorter.
   */
  private keyTermCoverage(expected: string, given: string): number {
    const tokenize = (s: string) =>
      s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !QuestionsService.STOP_WORDS.has(w));
    const keyTerms = tokenize(expected);
    if (keyTerms.length === 0) return 1;
    const givenSet = new Set(tokenize(given));
    const matched = keyTerms.filter(w => givenSet.has(w)).length;
    return matched / keyTerms.length;
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

  async flagQuestion(id: string, userId: string, reason: string) {
    const q = await this.prisma.question.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');

    return this.prisma.question.update({
      where: { id },
      data: {
        isFlagged: true,
        flagReason: reason,
        flaggedBy: userId,
      },
    });
  }
}
