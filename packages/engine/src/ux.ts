// ─────────────────────────────────────────────────────────────────────────────
// Adaptive UX policy. The UI is a pure function of this object, so the whole
// experience (not just question difficulty) follows the learner's state.
// ─────────────────────────────────────────────────────────────────────────────

import type { Calibration } from './calibration.js';
import type { AffectEstimate, NextAction, UxMode, UxPolicy } from './types.js';

export interface UxInput {
  affect: AffectEstimate;
  action: NextAction;
  calibration: Calibration;
  sessionMinutes: number;
  questionsThisSession: number;
  /** Learner's daily goal in minutes. */
  dailyGoalMinutes: number;
  /** Optional bounded override from the Learning Director. */
  modeOverride?: UxMode | null;
}

export function deriveUxPolicy(input: UxInput): UxPolicy {
  const { affect, action, calibration } = input;
  const reasons: string[] = [];

  let mode: UxMode;
  if (affect.state === 'frustrated' || affect.state === 'disengaged') mode = 'recovery';
  else if (affect.state === 'bored') mode = 'challenge';
  else if (affect.state === 'confused') mode = 'focus';
  else if (action.kind === 'review') mode = 'review';
  else if (action.kind === 'learn_new') mode = 'explore';
  else mode = 'focus';

  if (input.modeOverride) {
    mode = input.modeOverride;
    reasons.push('Mode set by your learning plan.');
  } else {
    reasons.push(...affect.evidence.slice(0, 2));
  }

  const minutesLeft = Math.max(0, input.dailyGoalMinutes - input.sessionMinutes);
  const suggestedQuestionsLeft = Math.max(0, Math.round(minutesLeft / 1.5));

  const base: Omit<UxPolicy, 'mode' | 'reasons'> = {
    hintPolicy: 'on_request',
    explanationDepth: 'standard',
    tone: 'neutral',
    showTimer: false,
    askConfidence: true,
    celebration: 1,
    density: 'standard',
    suggestedQuestionsLeft,
    suggestBreak: action.kind === 'break',
    tutorNudge: null,
  };

  switch (mode) {
    case 'recovery':
      Object.assign(base, {
        hintPolicy: 'proactive',
        explanationDepth: 'detailed',
        tone: 'encouraging',
        density: 'minimal',
        celebration: 2,
        askConfidence: affect.state === 'disengaged', // slow guessers down
        tutorNudge:
          affect.state === 'disengaged'
            ? 'Quick check-in: want to slow down and think through one together?'
            : 'These have been tricky. Want me to walk through the idea with you?',
      });
      break;
    case 'challenge':
      Object.assign(base, {
        hintPolicy: 'after_attempt',
        explanationDepth: 'brief',
        tone: 'challenging',
        showTimer: true,
        density: 'rich',
        celebration: 0,
      });
      break;
    case 'focus':
      Object.assign(base, {
        explanationDepth: affect.state === 'confused' ? 'detailed' : 'standard',
        tutorNudge: affect.state === 'confused' ? 'Want a worked example before the next one?' : null,
      });
      break;
    case 'review':
      Object.assign(base, { explanationDepth: 'brief', density: 'minimal' });
      break;
    case 'explore':
      Object.assign(base, { hintPolicy: 'proactive', explanationDepth: 'detailed', tone: 'encouraging' });
      break;
  }

  if (calibration.label === 'overconfident') {
    base.askConfidence = true;
    reasons.push('Confidence ratings help you spot overconfidence. Your recent ones ran high.');
  }

  return { mode, ...base, reasons };
}
