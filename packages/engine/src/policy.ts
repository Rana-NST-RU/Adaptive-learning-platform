// ─────────────────────────────────────────────────────────────────────────────
// Next-best-action policy and item selection.
//
// Every candidate gets a transparent score and a plain-language reason. The
// UI shows the winning reasons ("why this question?"), and evals can assert
// on the scores directly.
// ─────────────────────────────────────────────────────────────────────────────

import { eloPredict, difficultyForTarget } from './elo.js';
import { guessFor } from './bkt.js';
import { retrievability, isDue, DESIRED_RETENTION } from './memory.js';
import { statusOf, topoSort } from './graph.js';
import { targetSuccess } from './zpd.js';
import type {
  ActionKind,
  AffectState,
  AttemptSignal,
  ConceptNode,
  ConceptState,
  ItemSummary,
  NextAction,
} from './types.js';

/**
 * Mastery shown to the learner and used for unlocking decisions.
 * Two independent models must agree: BKT's P(known) and Elo's probability of
 * answering an average-difficulty item. That product is then discounted by
 * FSRS retrievability, so unreviewed mastery visibly fades.
 * (BKT alone saturates after ~3 correct MCQ answers; see simulated-learner test.)
 */
export function effectiveMastery(s: ConceptState, now: Date = new Date()): number {
  const eloKnown = 1 / (1 + Math.exp(-s.ability));
  return Math.min(s.pKnown, eloKnown) * retrievability(s.memory, now);
}

export interface DirectorOverride {
  /** Bounded shift of the success target (clamped to ±0.1). */
  targetDelta?: number;
  /** Concept the Director wants prioritised (e.g. a misconception to fix). */
  focusConceptId?: string;
  /** ISO time after which the override is ignored. */
  expiresAt?: string;
}

export interface PolicyInput {
  nodes: ConceptNode[];
  states: Record<string, ConceptState>;
  recent: AttemptSignal[];
  affect: AffectState;
  now?: Date;
  sessionMinutes?: number;
  questionsThisSession?: number;
  override?: DirectorOverride | null;
}

const name = (nodes: ConceptNode[], id: string) => nodes.find((n) => n.id === id)?.name ?? id;

export function chooseNextAction(input: PolicyInput): NextAction {
  const now = input.now ?? new Date();
  const { nodes, states, recent, affect } = input;
  const minutes = input.sessionMinutes ?? 0;
  const asked = input.questionsThisSession ?? 0;
  const override =
    input.override && (!input.override.expiresAt || new Date(input.override.expiresAt) > now)
      ? input.override
      : null;

  // ── Break: protect the learner before anything else ──────────────────────
  if (
    (minutes >= 25 && (affect === 'frustrated' || affect === 'disengaged')) ||
    minutes >= 50 ||
    asked >= 40
  ) {
    return {
      kind: 'break',
      conceptId: null,
      targetSuccess: targetSuccess(affect, recent),
      reasons: [
        minutes >= 50 || asked >= 40
          ? `You have been at it for ${Math.round(minutes)} minutes. A short break helps consolidation.`
          : 'This has been a tough stretch. A 5-minute break usually helps more than pushing through.',
      ],
      candidates: [],
    };
  }

  const order = topoSort(nodes);
  const rank = new Map(order.map((id, i) => [id, i]));
  const lastConcepts = recent.slice(-3).map((a) => a.conceptId);
  const candidates: NextAction['candidates'] = [];

  for (const node of nodes) {
    const s = states[node.id];
    const status = statusOf(node, states, (x) => effectiveMastery(x, now));
    if (status === 'locked' || !s) continue;

    const R = retrievability(s.memory, now);
    const push = (kind: ActionKind, score: number, why: string) => {
      // Interleaving: avoid long runs on one concept (except brand-new learning).
      const run = lastConcepts.filter((c) => c === node.id).length;
      if (kind !== 'learn_new' && run >= 3) score -= 0.45;
      else if (kind === 'review' && run >= 1) score -= 0.2;

      if (affect === 'frustrated') {
        if (kind === 'learn_new') score -= 0.25;
        if (kind === 'review' && s.pKnown > 0.7) score += 0.15; // an easy win
      }
      if (affect === 'bored') {
        if (kind === 'learn_new') score += 0.2;
        if (kind === 'review') score -= 0.1;
      }
      if (override?.focusConceptId === node.id) {
        score += 0.3;
        why += ' (prioritised by your learning plan)';
      }
      candidates.push({ conceptId: node.id, kind, score, why });
    };

    const misconceptionHits = Object.values(s.misconceptions).reduce((a, b) => a + b, 0);
    if (s.streak <= -2 || misconceptionHits >= 2) {
      push(
        'remediate',
        0.7 + Math.min(0.2, misconceptionHits * 0.05) + (s.streak <= -2 ? 0.1 : 0),
        s.streak <= -2
          ? `"${node.name}" tripped you up ${-s.streak} times in a row, so let's fix it with an easier step.`
          : `You've shown a recurring misconception in "${node.name}". This question targets it.`,
      );
    }

    if (isDue(s.memory, now) || (s.memory && R < DESIRED_RETENTION - 0.05)) {
      push(
        'review',
        0.6 + Math.max(0, DESIRED_RETENTION - R) * 2,
        `"${node.name}" is fading from memory (recall chance ≈${Math.round(R * 100)}%). Reviewing now locks it in.`,
      );
    } else if (status === 'available' && s.attempts === 0) {
      push(
        'learn_new',
        0.5 - (rank.get(node.id) ?? 0) * 0.005,
        `You're ready for "${node.name}": its prerequisites are in place.`,
      );
    } else if (status === 'learning') {
      push(
        'practice',
        0.55 + (1 - effectiveMastery(s, now)) * 0.3,
        `"${node.name}" is at ${Math.round(effectiveMastery(s, now) * 100)}% mastery. A bit more practice gets it there.`,
      );
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  // Everything mastered and nothing due → keep memory fresh on the weakest one.
  if (candidates.length === 0) {
    const weakest = nodes
      .filter((n) => states[n.id])
      .sort((a, b) => effectiveMastery(states[a.id]!, now) - effectiveMastery(states[b.id]!, now))[0];
    const kind: ActionKind = 'review';
    return {
      kind,
      conceptId: weakest?.id ?? null,
      targetSuccess: targetSuccess(affect, recent, kind, override?.targetDelta),
      reasons: weakest
        ? [`Everything is in good shape. A light review of "${weakest.name}" keeps it that way.`]
        : ['No concepts available yet.'],
      candidates: [],
    };
  }

  const best = candidates[0]!;
  const reasons = [best.why];
  if (affect !== 'flow' && affect !== 'unknown') {
    reasons.push(
      {
        frustrated: 'Difficulty eased a little because the last few were tough.',
        bored: 'Difficulty raised because you are cruising.',
        confused: 'Pace slowed and explanations expanded because answers looked uncertain.',
        disengaged: 'Slowing down: quick guesses don’t help the model learn what you know.',
      }[affect],
    );
  }
  if (best.conceptId !== lastConcepts.at(-1) && lastConcepts.length > 0 && best.kind !== 'learn_new') {
    reasons.push(`Switching from "${name(nodes, lastConcepts.at(-1)!)}" on purpose: mixing topics strengthens recall.`);
  }

  return {
    kind: best.kind,
    conceptId: best.conceptId,
    targetSuccess: targetSuccess(affect, recent, best.kind, override?.targetDelta),
    reasons,
    candidates: candidates.slice(0, 6),
  };
}

export interface ItemChoice {
  item: ItemSummary | null;
  predicted: number | null;
  /** Elo difficulty the ideal next item would have; passed to the Item Author. */
  idealDifficulty: number;
  /** True when the pool can't serve this slot well and the Author should write more. */
  needsGeneration: boolean;
  why: string;
}

/**
 * Pick the item whose predicted success is closest to the target, skipping
 * recently seen items. Flags when the pool is thin or badly matched.
 */
export function selectItem(
  items: ItemSummary[],
  state: ConceptState,
  target: number,
  recentItemIds: Set<string>,
  minPool = 4,
): ItemChoice {
  const pool = items.filter((i) => i.conceptId === state.conceptId && !recentItemIds.has(i.id));
  const idealDifficulty = difficultyForTarget(state.ability, target, 0.2);

  let best: ItemSummary | null = null;
  let bestGap = Infinity;
  let bestP: number | null = null;
  for (const it of pool) {
    const p = eloPredict(state.ability, it.difficulty, guessFor(it.optionCount));
    const gap = Math.abs(p - target);
    if (gap < bestGap) {
      best = it;
      bestGap = gap;
      bestP = p;
    }
  }

  const needsGeneration = pool.length < minPool || bestGap > 0.15;
  return {
    item: best,
    predicted: bestP,
    idealDifficulty,
    needsGeneration,
    why: best
      ? `Predicted chance of success ${Math.round((bestP ?? 0) * 100)}% (target ${Math.round(target * 100)}%).`
      : 'No unseen items for this concept yet; generating fresh ones.',
  };
}
