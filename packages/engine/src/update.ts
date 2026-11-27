// ─────────────────────────────────────────────────────────────────────────────
// applyAttempt: the single write path into the learner model. Given one
// graded answer, update knowledge (BKT), ability and item difficulty (Elo),
// memory (FSRS), misconceptions, and propagate evidence through the graph.
// Emits events the Conductor uses to wake agents.
// ─────────────────────────────────────────────────────────────────────────────

import { bktUpdate, guessFor, DEFAULT_BKT } from './bkt.js';
import { eloUpdate } from './elo.js';
import { gradeFor, reviewMemory } from './memory.js';
import { propagate, MASTERY_THRESHOLD } from './graph.js';
import { effectiveMastery } from './policy.js';
import type { ConceptNode, ConceptState, ItemSummary } from './types.js';

export type EngineEvent =
  | { type: 'mastered'; conceptId: string }
  | { type: 'lapse'; conceptId: string }
  | { type: 'misconception_repeat'; conceptId: string; misconceptionId: string; count: number }
  | { type: 'struggling'; conceptId: string; streak: number };

export interface AttemptInput {
  correct: boolean;
  confidence: number | null;
  latencyMs: number;
  hintsUsed: number;
  misconceptionId?: string | null;
  expectedLatencyMs?: number;
}

export interface AttemptResult {
  state: ConceptState;
  itemDifficulty: number;
  /** Predicted P(correct) before the answer, for calibration logging. */
  expected: number;
  propagated: Record<string, number>;
  events: EngineEvent[];
}

export function newConceptState(conceptId: string, prior = DEFAULT_BKT_PRIOR): ConceptState {
  return {
    conceptId,
    pKnown: prior,
    // Seed ability from the prior so a confident self-rating starts higher.
    ability: Math.log(prior / (1 - prior)) * 0.5,
    attempts: 0,
    correct: 0,
    streak: 0,
    memory: null,
    misconceptions: {},
    lastSeenAt: null,
    trend: 0,
    velocity: 0,
  };
}

export const DEFAULT_BKT_PRIOR = 0.2;

export function applyAttempt(
  state: ConceptState,
  item: ItemSummary,
  attempt: AttemptInput,
  graph: { nodes: ConceptNode[]; states: Record<string, ConceptState> },
  now: Date = new Date(),
): AttemptResult {
  const events: EngineEvent[] = [];
  const wasMastered = effectiveMastery(state, now) >= MASTERY_THRESHOLD;
  const guess = guessFor(item.optionCount);

  const pKnown = bktUpdate(state.pKnown, attempt.correct, { ...DEFAULT_BKT, guess }, attempt.hintsUsed);
  const elo = eloUpdate(state.ability, item.difficulty, attempt.correct, state.attempts, item.timesServed, guess, {
    trend: state.trend,
    velocity: state.velocity,
  });

  const fast = attempt.latencyMs < (attempt.expectedLatencyMs ?? 30_000) * 0.5;
  const memory = reviewMemory(state.memory, gradeFor(attempt.correct, attempt.confidence, attempt.hintsUsed, fast), now);

  const misconceptions = { ...state.misconceptions };
  if (!attempt.correct && attempt.misconceptionId) {
    const c = (misconceptions[attempt.misconceptionId] ?? 0) + 1;
    misconceptions[attempt.misconceptionId] = c;
    if (c >= 2) {
      events.push({ type: 'misconception_repeat', conceptId: state.conceptId, misconceptionId: attempt.misconceptionId, count: c });
    }
  } else if (attempt.correct) {
    // A correct answer is evidence a misconception is fading.
    for (const k of Object.keys(misconceptions)) {
      misconceptions[k] = Math.max(0, misconceptions[k]! - 0.5);
      if (misconceptions[k] === 0) delete misconceptions[k];
    }
  }

  const streak = attempt.correct ? Math.max(0, state.streak) + 1 : Math.min(0, state.streak) - 1;
  const next: ConceptState = {
    ...state,
    pKnown,
    ability: elo.ability,
    trend: elo.trend,
    velocity: elo.velocity,
    attempts: state.attempts + 1,
    correct: state.correct + (attempt.correct ? 1 : 0),
    streak,
    memory,
    misconceptions,
    lastSeenAt: now.toISOString(),
  };

  const isMastered = effectiveMastery(next, now) >= MASTERY_THRESHOLD;
  if (!wasMastered && isMastered) events.push({ type: 'mastered', conceptId: state.conceptId });
  if (wasMastered && !attempt.correct) events.push({ type: 'lapse', conceptId: state.conceptId });
  if (streak <= -3) events.push({ type: 'struggling', conceptId: state.conceptId, streak });

  const propagated = propagate(
    state.conceptId,
    attempt.correct,
    { ...graph.states, [state.conceptId]: next },
    graph.nodes,
  );

  return { state: next, itemDifficulty: elo.difficulty, expected: elo.expected, propagated, events };
}
