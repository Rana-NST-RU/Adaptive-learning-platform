// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the learner model.
//
// The engine is deliberately pure and deterministic: no I/O, no LLM calls.
// It is the single source of truth about "where the learner is". Agents read
// it through tools and may only write through narrow, validated actions.
// ─────────────────────────────────────────────────────────────────────────────

/** FSRS memory card, stored as plain JSON (dates as ISO strings). */
export interface MemoryCard {
  due: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number; // 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review?: string;
}

export type ConceptStatus = 'locked' | 'available' | 'learning' | 'mastered';

/** Per-learner, per-concept state. */
export interface ConceptState {
  conceptId: string;
  /** BKT probability that the concept is known, 0..1. */
  pKnown: number;
  /** Elo/IRT ability on the logit scale (0 = average item). */
  ability: number;
  /** Number of graded attempts (drives Elo uncertainty). */
  attempts: number;
  correct: number;
  /** Current run of correct (positive) or incorrect (negative) answers. */
  streak: number;
  /** FSRS memory card, null until the first graded attempt. */
  memory: MemoryCard | null;
  /** Count of observed misconceptions, keyed by misconception id. */
  misconceptions: Record<string, number>;
  lastSeenAt: string | null;
  /** Running mean of answer residuals (outcome − predicted); gates item calibration. Absent = 0. */
  trend?: number;
  /** Estimated learning velocity, logits per answer. Absent = 0. */
  velocity?: number;
}

export interface ConceptNode {
  id: string;
  name: string;
  /** Ids of prerequisite concepts. */
  prerequisites: string[];
  /** Order hint from the curriculum (lower = earlier). */
  order: number;
}

export interface ItemSummary {
  id: string;
  conceptId: string;
  /** Elo difficulty on the logit scale. */
  difficulty: number;
  /** Number of answer options for guessing correction (0 = open response). */
  optionCount: number;
  /** Times the item has been answered (drives item-side Elo uncertainty). */
  timesServed: number;
}

/** One observed interaction, the raw signal for affect + calibration. */
export interface AttemptSignal {
  conceptId: string;
  correct: boolean;
  /** Self-reported confidence 1..4 (guess, unsure, fairly sure, certain). */
  confidence: number | null;
  latencyMs: number;
  hintsUsed: number;
  /** Expected latency for the item (ms) if known; used to normalise speed. */
  expectedLatencyMs?: number;
  at: string;
}

export type AffectState = 'flow' | 'frustrated' | 'bored' | 'confused' | 'disengaged' | 'unknown';

export interface AffectEstimate {
  state: AffectState;
  /** 0..1 confidence in the label. */
  confidence: number;
  /** Human-readable evidence, shown in the "why" panel. */
  evidence: string[];
}

export type ActionKind = 'learn_new' | 'practice' | 'review' | 'remediate' | 'break' | 'reflect';

export interface NextAction {
  kind: ActionKind;
  conceptId: string | null;
  /** Target probability of a correct answer for the next item. */
  targetSuccess: number;
  /** Plain-language reasons; surfaced to the learner (open learner model). */
  reasons: string[];
  /** Score per candidate, for transparency/debugging. */
  candidates: Array<{ conceptId: string; kind: ActionKind; score: number; why: string }>;
}

export type UxMode = 'focus' | 'challenge' | 'recovery' | 'review' | 'explore';

/** Everything the UI needs to adapt itself to the learner right now. */
export interface UxPolicy {
  mode: UxMode;
  /** How hints are offered. */
  hintPolicy: 'proactive' | 'on_request' | 'after_attempt';
  explanationDepth: 'brief' | 'standard' | 'detailed';
  tone: 'encouraging' | 'neutral' | 'challenging';
  showTimer: boolean;
  /** Ask for a confidence rating before revealing the answer. */
  askConfidence: boolean;
  /** Celebration intensity for correct answers, 0..2. */
  celebration: 0 | 1 | 2;
  /** Fewer UI elements when the learner is struggling. */
  density: 'minimal' | 'standard' | 'rich';
  /** Suggested remaining questions in this session. */
  suggestedQuestionsLeft: number;
  suggestBreak: boolean;
  /** Whether the tutor should open proactively with a nudge. */
  tutorNudge: string | null;
  reasons: string[];
}

export interface LearnerSnapshot {
  states: Record<string, ConceptState>;
  recent: AttemptSignal[];
  /** Minutes in the current session so far. */
  sessionMinutes: number;
  questionsThisSession: number;
}
