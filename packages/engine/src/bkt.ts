// ─────────────────────────────────────────────────────────────────────────────
// Bayesian Knowledge Tracing (Corbett & Anderson, 1995) with two practical
// extensions:
//   • guess probability follows the item format (1/options for MCQ)
//   • hints dampen the evidence of a correct answer (a hinted success is
//     weaker proof of knowledge than an unaided one)
// ─────────────────────────────────────────────────────────────────────────────

export interface BktParams {
  /** P(T): probability of learning on each practice opportunity. */
  learn: number;
  /** P(S): probability of slipping when the skill is known. */
  slip: number;
  /** P(G): probability of guessing when the skill is unknown. */
  guess: number;
}

export const DEFAULT_BKT: BktParams = { learn: 0.1, slip: 0.1, guess: 0.2 };

export function guessFor(optionCount: number): number {
  if (optionCount <= 1) return 0.05; // open response: guessing is rare
  return Math.min(0.5, 1 / optionCount);
}

const clamp = (x: number, lo = 0.001, hi = 0.999) => Math.min(hi, Math.max(lo, x));

/**
 * Posterior P(known) after observing one answer, then apply the learning
 * transition. `hintsUsed` reduces the weight of a correct observation.
 */
export function bktUpdate(
  pKnown: number,
  correct: boolean,
  params: BktParams = DEFAULT_BKT,
  hintsUsed = 0,
): number {
  const { learn, slip, guess } = params;
  const p = clamp(pKnown);

  let posterior: number;
  if (correct) {
    const num = p * (1 - slip);
    posterior = num / (num + (1 - p) * guess);
    // Each hint pulls the posterior halfway back towards the prior.
    for (let i = 0; i < hintsUsed; i++) posterior = (posterior + p) / 2;
  } else {
    const num = p * slip;
    posterior = num / (num + (1 - p) * (1 - guess));
  }

  return clamp(posterior + (1 - posterior) * learn);
}

/** Probability the learner answers correctly according to BKT alone. */
export function bktPredict(pKnown: number, params: BktParams = DEFAULT_BKT): number {
  return pKnown * (1 - params.slip) + (1 - pKnown) * params.guess;
}
