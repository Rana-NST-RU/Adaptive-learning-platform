// ─────────────────────────────────────────────────────────────────────────────
// Metacognitive calibration: does the learner's confidence match reality?
// Confidence 1..4 maps to subjective probabilities; we report the Brier
// score and the signed bias (positive = over-confident).
// ─────────────────────────────────────────────────────────────────────────────

import type { AttemptSignal } from './types.js';

export const CONFIDENCE_PROB: Record<number, number> = { 1: 0.25, 2: 0.5, 3: 0.75, 4: 0.95 };

export interface Calibration {
  n: number;
  brier: number | null;
  /** mean(confidence prob) − accuracy. > 0.1 over-confident, < −0.1 under-confident. */
  bias: number | null;
  label: 'well_calibrated' | 'overconfident' | 'underconfident' | 'insufficient_data';
}

export function calibration(attempts: AttemptSignal[]): Calibration {
  const rated = attempts.filter((a) => a.confidence !== null && a.confidence >= 1 && a.confidence <= 4);
  if (rated.length < 5) return { n: rated.length, brier: null, bias: null, label: 'insufficient_data' };

  let brier = 0;
  let conf = 0;
  let acc = 0;
  for (const a of rated) {
    const p = CONFIDENCE_PROB[a.confidence!]!;
    const o = a.correct ? 1 : 0;
    brier += (p - o) ** 2;
    conf += p;
    acc += o;
  }
  const n = rated.length;
  const bias = conf / n - acc / n;
  return {
    n,
    brier: brier / n,
    bias,
    label: bias > 0.1 ? 'overconfident' : bias < -0.1 ? 'underconfident' : 'well_calibrated',
  };
}
