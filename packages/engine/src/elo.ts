// ─────────────────────────────────────────────────────────────────────────────
// Elo-style IRT (Pelánek 2016, "Applications of the Elo rating system in
// adaptive educational systems").
//
// Both learner ability and item difficulty live on the same logit scale and
// are updated after every answer. This is what makes the LLM-generated item
// bank *self-calibrating*: the author agent only proposes an initial
// difficulty; real answers correct it over time.
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

export interface EloUpdate {
  ability: number;
  difficulty: number;
  expected: number;
}

export function eloUpdate(
  ability: number,
  difficulty: number,
  correct: boolean,
  learnerAttempts: number,
  itemAttempts: number,
  guess = 0,
): EloUpdate {
  const expected = eloPredict(ability, difficulty, guess);
  const outcome = correct ? 1 : 0;
  const delta = outcome - expected;
  return {
    ability: ability + uncertainty(learnerAttempts) * delta,
    // Items calibrate more slowly; they are shared across many learners.
    difficulty: difficulty - uncertainty(itemAttempts, 0.6, 0.03) * delta,
    expected,
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
