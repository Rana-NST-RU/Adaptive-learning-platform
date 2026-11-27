// ─────────────────────────────────────────────────────────────────────────────
// Simulated learners with known ground truth (docs/EVALS.md §1).
//
// Each learner has, per concept, a latent skill (logit) that grows with
// practice (most near their zone of proximal development, little while
// prerequisites are weak), and a memory that fades between sessions unless
// practice is spaced (spacing raises stability). Traits drive behaviour the
// engine has to cope with: frustration and boredom tolerance (quitting a
// session), rapid guessing when frustrated, and over-confidence.
// The engine never sees any of this, only answers, latency and confidence.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConceptNode } from '@alp/engine';
import { sigmoid, type Rng } from '../lib/stats';

export const GUESS = 0.25; // 4-option MCQ
export const SLIP = 0.05;
export const MAX_DECAY = 1.6; // logits lost when a memory fully fades
export const MASTERED_P = 0.8; // ground-truth mastery: P(correct on an average item, no guessing) ≥ 0.8
export const EXPECTED_MS = 30_000;

export type Archetype = 'novice' | 'intermediate' | 'uneven';

export interface SimLearner {
  id: number;
  archetype: Archetype;
  initial: Record<string, number>;
  skill: Record<string, number>;
  stability: Record<string, number>; // days
  lastPractice: Record<string, number | null>; // sim day
  learnRate: number;
  frustrationTolerance: number; // wrong answers in a row before quitting the session
  boredomTolerance: number; // too-easy answers in a row before quitting the session
  guessesWhenFrustrated: boolean;
  overconfident: boolean;
}

export function depthOf(nodes: ConceptNode[]): Map<string, number> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map<string, number>();
  const depth = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const n = byId.get(id)!;
    const d = n.prerequisites.length ? 1 + Math.max(...n.prerequisites.map(depth)) : 0;
    memo.set(id, d);
    return d;
  };
  nodes.forEach((n) => depth(n.id));
  return memo;
}

export function makeLearner(id: number, nodes: ConceptNode[], r: Rng): SimLearner {
  const archetype: Archetype = (['novice', 'intermediate', 'uneven'] as const)[id % 3]!;
  const depth = depthOf(nodes);
  const initial: Record<string, number> = {};
  for (const n of nodes) {
    const d = depth.get(n.id)!;
    const base =
      archetype === 'novice' ? -1.2 - 0.4 * d : archetype === 'intermediate' ? 0.6 - 0.6 * d : r.normal(-0.8, 1.0);
    initial[n.id] = base + r.normal(0, 0.3);
  }
  return {
    id,
    archetype,
    initial,
    skill: { ...initial },
    stability: Object.fromEntries(nodes.map((n) => [n.id, 1])),
    lastPractice: Object.fromEntries(nodes.map((n) => [n.id, null])),
    learnRate: r.uniform(0.22, 0.42),
    frustrationTolerance: r.int(4, 7),
    boredomTolerance: r.int(6, 10),
    guessesWhenFrustrated: r.next() < 0.35,
    overconfident: r.next() < 0.3,
  };
}

/**
 * Skill after forgetting since the last practice. Only what was learned here
 * fades (towards the learner's prior knowledge, never below it), by at most
 * MAX_DECAY logits, at a rate set by the memory's stability.
 */
export function effectiveSkill(l: SimLearner, c: string, day: number): number {
  const last = l.lastPractice[c];
  const learned = l.skill[c]! - l.initial[c]!;
  if (last == null || learned <= 0) return l.skill[c]!;
  const dt = Math.max(0, day - last);
  return l.skill[c]! - Math.min(learned, MAX_DECAY) * (1 - Math.exp(-dt / l.stability[c]!));
}

export const pNoGuess = (l: SimLearner, c: string, trueDifficulty: number, day: number) =>
  sigmoid(effectiveSkill(l, c, day) - trueDifficulty);

export const pCorrect = (l: SimLearner, c: string, trueDifficulty: number, day: number) =>
  GUESS + (1 - GUESS) * (1 - SLIP) * pNoGuess(l, c, trueDifficulty, day);

export const isMastered = (l: SimLearner, c: string, day: number) => sigmoid(effectiveSkill(l, c, day)) >= MASTERED_P;

/** One answer: outcome, the signals the engine sees, and learning. */
export function answer(
  l: SimLearner,
  node: ConceptNode,
  trueDifficulty: number,
  day: number,
  mood: { wrongStreak: number },
  r: Rng,
) {
  const c = node.id;
  const p = pNoGuess(l, c, trueDifficulty, day);
  const frustrated = mood.wrongStreak >= l.frustrationTolerance - 1;
  const rapidGuess = frustrated && l.guessesWhenFrustrated;
  const correct = rapidGuess ? r.next() < GUESS : r.next() < GUESS + (1 - GUESS) * (1 - SLIP) * p;

  // Signals: easy items are answered fast and confidently; guesses are very fast.
  const speed = rapidGuess ? r.uniform(0.08, 0.18) : p > 0.9 ? r.uniform(0.3, 0.55) : correct ? r.uniform(0.6, 1.1) : r.uniform(0.9, 1.8);
  let confidence = p >= 0.9 ? 4 : p >= 0.65 ? 3 : p >= 0.4 ? 2 : 1;
  if (l.overconfident) confidence = Math.min(4, confidence + 1);
  if (rapidGuess) confidence = 1;

  // Learning: most from items near the edge of ability, gated by prerequisites.
  if (!rapidGuess) {
    const eff = effectiveSkill(l, c, day);
    const prereq = node.prerequisites.length ? Math.min(...node.prerequisites.map((q) => sigmoid(effectiveSkill(l, q, day) + 0.5))) : 1;
    const zpd = 4 * p * (1 - p);
    const gain = l.learnRate * prereq * zpd * (correct ? 1 : 0.6);
    // Practice also restores part of what was forgotten.
    l.skill[c] = eff + 0.5 * (l.skill[c]! - eff) + gain;
    const last = l.lastPractice[c];
    if (last == null) l.stability[c] = 1;
    else {
      const gap = day - last;
      l.stability[c] = Math.min(180, gap >= 0.5 ? l.stability[c]! * (1.4 + 0.35 * gap) : l.stability[c]! * 1.03);
    }
    l.lastPractice[c] = day;
  }

  return {
    correct,
    tooEasy: correct && p > 0.92,
    latencyMs: Math.round(EXPECTED_MS * speed),
    confidence,
  };
}
