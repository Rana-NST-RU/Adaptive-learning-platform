// ─────────────────────────────────────────────────────────────────────────────
// Sensor-free affect detection from interaction logs (in the spirit of Baker
// et al.'s log-based detectors). We only use signals we actually have:
// correctness, latency, hints, and self-reported confidence.
//
//   frustrated – repeated errors, often with heavy hint use
//   bored      – long runs of fast, confident, correct answers (too easy)
//   confused   – slow answers with low confidence
//   disengaged – very fast wrong answers (rapid guessing)
// ─────────────────────────────────────────────────────────────────────────────

import type { AffectEstimate, AffectState, AttemptSignal } from './types.js';

const DEFAULT_EXPECTED_MS = 30_000;

export function detectAffect(recent: AttemptSignal[], window = 8): AffectEstimate {
  const w = recent.slice(-window);
  if (w.length < 3) {
    return { state: 'unknown', confidence: 0, evidence: ['Not enough answers yet to read how it is going.'] };
  }

  const n = w.length;
  const accuracy = w.filter((a) => a.correct).length / n;
  const speed = w.map((a) => a.latencyMs / (a.expectedLatencyMs ?? DEFAULT_EXPECTED_MS));
  const rapidWrong = w.filter((a, i) => !a.correct && (speed[i] ?? 1) < 0.2).length;
  const fastCertainCorrect = w.filter(
    (a, i) => a.correct && (speed[i] ?? 1) < 0.6 && (a.confidence ?? 3) >= 3 && a.hintsUsed === 0,
  ).length;
  const slowUnsure = w.filter((a, i) => (speed[i] ?? 1) > 1.5 && (a.confidence ?? 3) <= 2).length;
  const hints = w.reduce((s, a) => s + a.hintsUsed, 0);

  let trailingWrong = 0;
  for (let i = w.length - 1; i >= 0 && !w[i]!.correct; i--) trailingWrong++;

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const scores: Array<[AffectState, number, string[]]> = [
    [
      'disengaged',
      rapidWrong / n >= 0.4 ? 0.5 + rapidWrong / n / 2 : 0,
      [`${rapidWrong} of the last ${n} answers were very fast and wrong (possible guessing).`],
    ],
    [
      'frustrated',
      (trailingWrong >= 3 ? 0.55 : trailingWrong === 2 ? 0.2 : 0) +
        (accuracy < 0.4 ? 0.25 : 0) +
        (hints / n > 1 ? 0.15 : 0),
      [
        `${trailingWrong} wrong answer${trailingWrong === 1 ? '' : 's'} in a row.`,
        `Recent accuracy ${pct(accuracy)}.`,
        ...(hints > 0 ? [`${hints} hints used recently.`] : []),
      ],
    ],
    [
      'bored',
      fastCertainCorrect / n >= 0.75 && accuracy >= 0.85 ? 0.5 + fastCertainCorrect / n / 2 : 0,
      [`${fastCertainCorrect} of the last ${n} answers were fast, certain and correct, so items may be too easy.`],
    ],
    [
      'confused',
      slowUnsure / n >= 0.4 ? 0.4 + slowUnsure / n / 2 : 0,
      [`${slowUnsure} slow, low-confidence answers recently.`],
    ],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [state, score, evidence] = scores[0]!;
  if (score < 0.5) {
    return {
      state: 'flow',
      confidence: Math.min(0.9, 0.5 + (1 - Math.abs(accuracy - 0.72)) * 0.4),
      evidence: [`Recent accuracy ${pct(accuracy)}, so challenge and skill look balanced.`],
    };
  }
  return { state, confidence: Math.min(0.95, score), evidence };
}
