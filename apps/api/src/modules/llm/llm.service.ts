// ─────────────────────────────────────────────────────────────────────────────
// LLM Service — Groq (llama-3.3-70b-versatile)
// Generates structured JSON questions from a concept name/domain.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';

export interface GeneratedQuestion {
  content: string;
  questionType: 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'CODE_SNIPPET';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  options?: string[];         // MCQ only: ['A) ...', 'B) ...', 'C) ...', 'D) ...']
  correctAnswer: string;      // For MCQ: 'A', 'B', 'C', or 'D'. For T/F: 'true'/'false'
  explanation: string;
  hints: string[];
  codeSnippet?: string;       // CODE_SNIPPET only
  language?: string;          // CODE_SNIPPET only: 'python', 'java', 'cpp'
  tags: string[];
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: Groq;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Groq({
      apiKey: this.config.get<string>('GROQ_API_KEY'),
    });
    this.model = this.config.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';
    this.logger.log(`✅ Groq LLM initialized (model: ${this.model})`);
  }

  /**
   * Generate questions for a specific concept.
   * Returns an array of validated GeneratedQuestion objects.
   */
  async generateQuestions(
    conceptId: string,
    conceptName: string,
    domain: string,
    difficulty: 'EASY' | 'MEDIUM' | 'HARD' = 'MEDIUM',
    count: number = 5,
    questionTypes: GeneratedQuestion['questionType'][] = ['MCQ', 'TRUE_FALSE'],
  ): Promise<GeneratedQuestion[]> {
    // For HARD difficulty, include CODE_SNIPPET by default unless caller specified types
    const defaultTypes =
      difficulty === 'HARD'
        ? ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER', 'CODE_SNIPPET']
        : ['MCQ', 'TRUE_FALSE'];
    const resolvedTypes =
      questionTypes.length > 0 ? questionTypes : defaultTypes;

    const typesStr = resolvedTypes.join(', ');
    const prompt = this.buildPrompt(conceptName, domain, difficulty, count, typesStr);

    this.logger.log(
      `Generating ${count} ${difficulty} questions for concept "${conceptName}" (${domain}) — types: ${typesStr}`,
    );

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert computer science educator and assessment creator. ' +
            'Always respond with valid JSON only. No markdown, no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    return this.parseResponse(raw, difficulty, conceptName, domain);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private buildPrompt(
    conceptName: string,
    domain: string,
    difficulty: string,
    count: number,
    types: string,
  ): string {
    return `
Generate ${count} ${difficulty}-level educational questions about "${conceptName}" (domain: ${domain}).

Question types to generate (mix them): ${types}

Rules:
- MCQ: must have exactly 4 options labeled "A) ...", "B) ...", "C) ...", "D) ...". correctAnswer must be "A", "B", "C", or "D"
- TRUE_FALSE: correctAnswer must be "true" or "false"
- SHORT_ANSWER: correctAnswer is a concise 1-3 sentence answer. Leave options as null.
- CODE_SNIPPET: The "content" field is the question text asking the user to fix/complete the code. The "codeSnippet" field must contain actual runnable code with a bug or a blank (use ___ for blanks). correctAnswer is the fixed code or blank answer. Set "language" to the relevant language (e.g. "python", "java", "javascript", "cpp"). Leave options as null.

Return ONLY this JSON structure:
{
  "questions": [
    {
      "content": "Question text here?",
      "questionType": "MCQ",
      "difficulty": "${difficulty}",
      "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
      "correctAnswer": "B",
      "explanation": "Detailed explanation of why this answer is correct",
      "hints": ["hint 1", "hint 2"],
      "codeSnippet": null,
      "language": null,
      "tags": ["${conceptName.toLowerCase().replace(/ /g, '-')}", "${domain.toLowerCase()}"]
    }
  ]
}`;
  }       

  private parseResponse(
    raw: string,
    difficulty: 'EASY' | 'MEDIUM' | 'HARD',
    conceptName: string,
    domain: string,
  ): GeneratedQuestion[] {
    try {
      const parsed = JSON.parse(raw);
      const questions: GeneratedQuestion[] = parsed.questions ?? [];

      return questions
        .filter((q) => q.content && q.questionType && q.correctAnswer)
        .map((q) => ({
          content: q.content,
          questionType: q.questionType,
          difficulty: q.difficulty ?? difficulty,
          options: q.options ?? undefined,
          correctAnswer: String(q.correctAnswer),
          explanation: q.explanation ?? '',
          hints: Array.isArray(q.hints) ? q.hints : [],
          codeSnippet: q.codeSnippet ?? undefined,
          language: q.language ?? undefined,
          tags: Array.isArray(q.tags)
            ? q.tags
            : [conceptName.toLowerCase(), domain.toLowerCase()],
        }));
    } catch (err) {
      this.logger.error('Failed to parse LLM response', err);
      return [];
    }
  }
}
