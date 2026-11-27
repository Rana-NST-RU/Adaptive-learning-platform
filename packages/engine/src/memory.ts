// ─────────────────────────────────────────────────────────────────────────────
// Long-term memory with FSRS-6 (via ts-fsrs). Knowledge tracing says whether
// a concept was learned; FSRS says whether it is still *remembered* and when
// it should be reviewed.
// ─────────────────────────────────────────────────────────────────────────────

import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import type { MemoryCard } from './types.js';

// ts-fsrs 6 still ships the classic `fsrs()` facade (marked deprecated in
// favour of DefaultScheduler). It is stable and FSRS-6 under the hood; migrate
// when ts-fsrs 7 removes it.
const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  // Concept-level memory works on a scale of days. Short-term (re)learning
  // steps of 1–10 minutes would make every concept "due" again mid-session.
  enable_short_term: false,
});

export const DESIRED_RETENTION = 0.9;

function toCard(m: MemoryCard): Card {
  return {
    ...m,
    due: new Date(m.due),
    last_review: m.last_review ? new Date(m.last_review) : undefined,
  } as Card;
}

function fromCard(c: Card): MemoryCard {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : undefined,
  };
}

/**
 * Translate an answer into an FSRS grade. Confidence matters: a correct but
 * unsure answer is a "Hard" recall; a fast, certain, unaided one is "Easy".
 */
export function gradeFor(
  correct: boolean,
  confidence: number | null,
  hintsUsed: number,
  fast: boolean,
): Grade {
  if (!correct) return Rating.Again;
  if (hintsUsed > 0 || (confidence !== null && confidence <= 2)) return Rating.Hard;
  if (confidence === 4 && fast) return Rating.Easy;
  return Rating.Good;
}

export function reviewMemory(
  memory: MemoryCard | null,
  grade: Grade,
  now: Date,
): MemoryCard {
  const card = memory ? toCard(memory) : createEmptyCard(now);
  const { card: next } = scheduler.next(card, now, grade);
  return fromCard(next);
}

/** Current probability of recall, 1 for never-reviewed concepts. */
export function retrievability(memory: MemoryCard | null, now: Date): number {
  if (!memory || memory.reps === 0) return 1;
  return scheduler.retrievability(toCard(memory), now);
}

export function isDue(memory: MemoryCard | null, now: Date): boolean {
  if (!memory || memory.reps === 0) return false;
  return new Date(memory.due).getTime() <= now.getTime();
}
