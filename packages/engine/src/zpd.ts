// ─────────────────────────────────────────────────────────────────────────────
// Zone of Proximal Development controller.
//
// Adaptive *testing* targets 50% success (most information). Adaptive
// *practice* should be easier: Pelánek et al. used 75% by default and found
// learners preferred ~65–75%, with easier settings producing more practice.
// We start at 0.72 and move the target with affect, activity type, and the
// realised success rate on the last ten answers.
// ─────────────────────────────────────────────────────────────────────────────

import type { ActionKind, AffectState, AttemptSignal } from './types.js';

export const BASE_TARGET = 0.72;
export const MIN_TARGET = 0.55;
export const MAX_TARGET = 0.92;

export function targetSuccess(
  affect: AffectState,
  recent: AttemptSignal[],
  kind: ActionKind = 'practice',
  override = 0,
): number {
  let t = BASE_TARGET;

  if (kind === 'review') t = 0.8; // retrieval should mostly succeed
  if (kind === 'remediate') t = 0.8; // rebuild confidence on the weak spot
  if (kind === 'learn_new') t = 0.82; // first exposure: scaffold success

  if (affect === 'frustrated') t += 0.1;
  if (affect === 'disengaged') t += 0.05;
  if (affect === 'confused') t += 0.05;
  if (affect === 'bored') t -= 0.12;

  // Steer the realised success rate back towards the target.
  const last = recent.slice(-10);
  if (last.length >= 5) {
    const rate = last.filter((a) => a.correct).length / last.length;
    t += (t - rate) * 0.5;
  }

  // Bounded override from the Learning Director agent (±0.1 max).
  t += Math.max(-0.1, Math.min(0.1, override));

  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, t));
}
