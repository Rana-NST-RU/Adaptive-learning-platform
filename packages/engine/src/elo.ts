// ─────────────────────────────────────────────────────────────────────────────
// Elo-style IRT (Pelánek 2016, "Applications of the Elo rating system in
// adaptive educational systems").
//
// Both learner ability and item difficulty live on the same logit scale and
// are updated after every answer. This is what makes the LLM-generated item
// bank *self-calibrating*: the author agent only proposes an initial
// difficulty; real answers correct it over time.
//
// Plain Elo assumes the learner stands still. Learners don't: they improve
// while practising, the ability estimate trails behind, and every answer the
// learner "beats" was booked against the item instead. Under adaptive
// selection that is a feedback loop (an item that looks easy gets served to
// improving learners, who beat it, so it looks easier still). The simulated-
// learner study (evals, sim suite) measured the most-served items drifting
// ~3.8 logits too easy, success running at 82% against a 72% target, and
// boredom quits dominating dropout. Three changes close it:
//   1. Learning velocity: an alpha-beta filter on ability, so the estimate
//      keeps up with a learner who is improving instead of lagging forever.
//   2. Residual gate: a running mean of the learner's residuals on this
//      concept; while it shows the estimate is clearly behind (or ahead), the
//      surprise is about the learner, not the item, and the item is left alone.
//   3. Item steps shrink faster with exposure, so a shared item settles.
// ─────────────────────────────────────────────────────────────────────────────

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** P(correct) with guessing correction: g + (1 - g)·σ(θ − b). */
export function eloPredict(ability: number, difficulty: number, guess = 0): number {
  return guess + (1 - guess) * sigmoid(ability - difficulty);
}

/**
 * Uncertainty function K(n) = a / (1 + b·n): large steps while we know little,
 * small steps once estimates are stable.
 */
export function uncertainty(n: number, a = 1.0, b = 0.06): number {
  return a / (1 + b * n);
}

/** Tuning, chosen on the simulated-learner study (seeds 2026, 7, 99). */
export const ELO_TUNING = {
  /** Item step K(n) = 0.6 / (1 + 0.1·n): shared items settle after ~100 answers. */
  itemK: { a: 0.6, b: 0.1 },
  /** Weight of the newest residual in the running mean (≈ last 5 answers). */
  trendRate: 0.2,
  /** |running residual| at which item updates stop entirely (linear fade to it). */
  itemGate: 0.15,
  /** Velocity filter: v ← clamp(decay·v + gain·residual, ±max), logits per answer. */
  velocityGain: 0.1,
  velocityDecay: 0.95,
  velocityMax: 0.4,
} as const;

export interface EloTracking {
  /** Running mean of (outcome − expected) on this concept. */
  trend: number;
  /** Estimated learning velocity, logits per answer. */
  velocity: number;
}

export interface EloUpdate extends EloTracking {
  ability: number;
  difficulty: number;
  expected: number;
}

const clamp = (x: number, m: number) => Math.max(-m, Math.min(m, x));

export function eloUpdate(
  ability: number,
  difficulty: number,
  correct: boolean,
  learnerAttempts: number,
  itemAttempts: number,
  guess = 0,
  tracking: Partial<EloTracking> = {},
): EloUpdate {
  const t = ELO_TUNING;
  const trend = tracking.trend ?? 0;
  const expected = eloPredict(ability, difficulty, guess);
  const delta = (correct ? 1 : 0) - expected;

  const velocity = clamp(t.velocityDecay * (tracking.velocity ?? 0) + t.velocityGain * delta, t.velocityMax);
  // Judged on the residual trend *before* this answer: is the learner's estimate already off?
  const itemWeight = Math.max(0, 1 - Math.abs(trend) / t.itemGate);

  return {
    ability: ability + uncertainty(learnerAttempts) * delta + velocity,
    // Items calibrate more slowly; they are shared across many learners.
    difficulty: difficulty - uncertainty(itemAttempts, t.itemK.a, t.itemK.b) * itemWeight * delta,
    expected,
    trend: trend + t.trendRate * (delta - trend),
    velocity,
  };
}

/** Map a 1..5 authoring difficulty (from the LLM) onto the logit scale. */
export function authoredDifficultyToLogit(level: number): number {
  const l = Math.min(5, Math.max(1, level));
  return (l - 3) * 0.9; // 1 → -1.8, 3 → 0, 5 → +1.8
}

/** Inverse of eloPredict: the item difficulty that gives P(correct) = target. */
export function difficultyForTarget(ability: number, target: number, guess = 0): number {
  const t = Math.min(0.97, Math.max(guess + 0.02, target));
  const p = (t - guess) / (1 - guess);
  return ability - Math.log(p / (1 - p));
}
