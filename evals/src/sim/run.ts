// ─────────────────────────────────────────────────────────────────────────────
// Simulated-learner study (docs/EVALS.md §1). Free and deterministic: runs on
// every commit in CI.
//
// The same population of simulated learners works through the 12-concept
// seed course (DSA Foundations) over six spaced sessions, once per policy:
//   engine            the real policy (chooseNextAction + selectItem)
//   random            random concept, random item
//   fixed-order       curriculum order, move on after 4 of the last 5 correct
//   mastery-no-spacing  curriculum order, move on at P(known) ≥ 0.95, never review
// Every policy updates the same engine learner model (so the engine's
// estimates can be scored), but only `engine` uses it to choose.
//
//   npm run eval:sim            (EVAL_SIM_LEARNERS=60 EVAL_SIM_SEED=2026 to vary)
// ─────────────────────────────────────────────────────────────────────────────

import {
  applyAttempt,
  authoredDifficultyToLogit,
  chooseNextAction,
  detectAffect,
  effectiveMastery,
  newConceptState,
  selectItem,
  topoSort,
  type AttemptSignal,
  type ConceptNode,
  type ConceptState,
  type ItemSummary,
} from '@alp/engine';
import { DSA_CONCEPTS } from '../../../apps/web/src/server/db/seed/dsa';
import { finish, fmt, type Metric } from '../lib/report';
import { auc, mean, reliability, rmse, rng, sigmoid, type Rng } from '../lib/stats';
import { answer, effectiveSkill, isMastered, makeLearner, EXPECTED_MS, type SimLearner } from './learner';

const LEARNERS = Number(process.env.EVAL_SIM_LEARNERS ?? 150);
const SEED = Number(process.env.EVAL_SIM_SEED ?? 2026);
const SESSION_DAYS = [0, 1, 3, 6, 10, 15];
const QUESTIONS_PER_SESSION = 25;
const ITEMS_PER_CONCEPT = 16;
const SECONDS_PER_QUESTION = 90;
const QUITS_TO_DROP_OUT = 2;

type PolicyName = 'engine' | 'random' | 'fixed-order' | 'mastery-no-spacing';
const POLICIES: PolicyName[] = ['engine', 'random', 'fixed-order', 'mastery-no-spacing'];

// ── Course graph and item bank ─────────────────────────────────────────────

const nodes: ConceptNode[] = DSA_CONCEPTS.map((c, i) => ({ id: c.slug, name: c.name, prerequisites: c.prerequisites, order: i }));
const order = topoSort(nodes);
const nodeById = new Map(nodes.map((n) => [n.id, n]));

interface SimItem extends ItemSummary {
  trueDifficulty: number;
}

/** Items have a true difficulty; the engine starts from a noisy authored estimate and calibrates online. */
function makeBank(r: Rng): SimItem[] {
  return nodes.flatMap((n) =>
    Array.from({ length: ITEMS_PER_CONCEPT }, (_, i) => {
      const trueDifficulty = -2.4 + (4.4 * i) / (ITEMS_PER_CONCEPT - 1) + r.normal(0, 0.15);
      const level = Math.min(5, Math.max(1, Math.round(trueDifficulty / 0.9 + 3 + r.normal(0, 0.6))));
      return { id: `${n.id}#${i}`, conceptId: n.id, difficulty: authoredDifficultyToLogit(level), optionCount: 4, timesServed: 0, trueDifficulty };
    }),
  );
}

// ── Policies ───────────────────────────────────────────────────────────────

interface Ctx {
  states: Record<string, ConceptState>;
  session: AttemptSignal[];
  recentItems: string[];
  bank: SimItem[];
  now: Date;
  minutes: number;
  asked: number;
  pointer: { i: number; window: boolean[] };
  r: Rng;
}
type Choice = { item: SimItem; target: number | null; kind: string } | null;

function itemFor(ctx: Ctx, conceptId: string, target: number): SimItem {
  const pool = ctx.bank.filter((b) => b.conceptId === conceptId);
  const recent = new Set(ctx.recentItems.slice(-15));
  const pick = selectItem(pool, ctx.states[conceptId]!, target, recent).item ?? selectItem(pool, ctx.states[conceptId]!, target, new Set()).item;
  return pick as SimItem;
}

function randomItem(ctx: Ctx, conceptId: string): SimItem {
  const recent = new Set(ctx.recentItems.slice(-15));
  const pool = ctx.bank.filter((b) => b.conceptId === conceptId);
  const fresh = pool.filter((b) => !recent.has(b.id));
  return ctx.r.pick(fresh.length ? fresh : pool);
}

function choose(policy: PolicyName, ctx: Ctx): Choice {
  switch (policy) {
    case 'engine': {
      const a = chooseNextAction({
        nodes, states: ctx.states, recent: ctx.session, affect: detectAffect(ctx.session).state,
        now: ctx.now, sessionMinutes: ctx.minutes, questionsThisSession: ctx.asked,
      });
      if (a.kind === 'break' || !a.conceptId) return null;
      return { item: itemFor(ctx, a.conceptId, a.targetSuccess), target: a.targetSuccess, kind: a.kind };
    }
    case 'random':
      return { item: randomItem(ctx, ctx.r.pick(nodes).id), target: null, kind: 'random' };
    case 'fixed-order': {
      const c = order[Math.min(ctx.pointer.i, order.length - 1)]!;
      return { item: ctx.pointer.i >= order.length ? randomItem(ctx, ctx.r.pick(order)) : randomItem(ctx, c), target: null, kind: 'in-order' };
    }
    case 'mastery-no-spacing': {
      while (ctx.pointer.i < order.length && ctx.states[order[ctx.pointer.i]!]!.pKnown >= 0.95) ctx.pointer.i++;
      const c = ctx.pointer.i < order.length ? order[ctx.pointer.i]! : ctx.r.pick(order);
      return { item: itemFor(ctx, c, 0.72), target: 0.72, kind: 'in-order' };
    }
  }
}

function afterAnswer(policy: PolicyName, ctx: Ctx, conceptId: string, correct: boolean) {
  if (policy !== 'fixed-order' || order[ctx.pointer.i] !== conceptId) return;
  ctx.pointer.window = [...ctx.pointer.window, correct].slice(-5);
  if (ctx.pointer.window.filter(Boolean).length >= 4) {
    ctx.pointer.i++;
    ctx.pointer.window = [];
  }
}

// ── One policy over the whole population ───────────────────────────────────

interface PolicyResult {
  gain: number[];
  masteredEnd: number[];
  ret7: number[];
  ret30: number[];
  droppedOut: boolean[];
  answered: number[];
  success: number[];
  // engine-model quality (all policies feed the model; meaningful for every one)
  masteryScores: number[];
  masteryLabels: boolean[];
  predicted: number[];
  outcomes: boolean[];
  zpdGap: number[];
  quitReasons: Record<string, number>;
  kinds: Record<string, number>;
  targets: number[];
  /** Mean (estimated − true) item difficulty after each learner: drift of the shared bank's calibration. */
  itemBias: number[];
}

function runPolicy(policy: PolicyName): PolicyResult {
  const res: PolicyResult = {
    gain: [], masteredEnd: [], ret7: [], ret30: [], droppedOut: [], answered: [], success: [],
    masteryScores: [], masteryLabels: [], predicted: [], outcomes: [], zpdGap: [], quitReasons: { frustrated: 0, bored: 0 }, kinds: {}, targets: [], itemBias: [],
  };
  // Same population, bank and randomness for every policy.
  const bank = makeBank(rng(SEED + 1));
  const r = rng(SEED + 2);
  const start = new Date('2026-01-05T18:00:00Z').getTime();

  for (let id = 0; id < LEARNERS; id++) {
    const l: SimLearner = makeLearner(id, nodes, rng(SEED * 1000 + id));
    let states: Record<string, ConceptState> = Object.fromEntries(nodes.map((n) => [n.id, newConceptState(n.id)]));
    const recentItems: string[] = [];
    const pointer = { i: 0, window: [] as boolean[] };
    let quits = 0;
    let answered = 0;
    let correctTotal = 0;
    let lastDay = 0;

    for (const day0 of SESSION_DAYS) {
      if (quits >= QUITS_TO_DROP_OUT) break;
      lastDay = day0;
      const session: AttemptSignal[] = [];
      const targets: number[] = [];
      const mood = { wrongStreak: 0, easyStreak: 0 };

      for (let q = 0; q < QUESTIONS_PER_SESSION; q++) {
        const day = day0 + (q * SECONDS_PER_QUESTION) / 86_400;
        const now = new Date(start + day * 86_400_000);
        const ctx: Ctx = { states, session, recentItems, bank, now, minutes: (q * SECONDS_PER_QUESTION) / 60, asked: q, pointer, r };
        const choice = choose(policy, ctx);
        if (!choice) break; // engine suggested a break: session ends normally

        const item = choice.item;
        const node = nodeById.get(item.conceptId)!;
        const a = answer(l, node, item.trueDifficulty, day, mood, r);
        const result = applyAttempt(
          states[item.conceptId]!,
          item,
          { correct: a.correct, confidence: a.confidence, latencyMs: a.latencyMs, hintsUsed: 0, expectedLatencyMs: EXPECTED_MS },
          { nodes, states },
          now,
        );
        res.predicted.push(result.expected);
        res.outcomes.push(a.correct);
        states = { ...states, [item.conceptId]: result.state };
        for (const [cid, p] of Object.entries(result.propagated)) states[cid] = { ...states[cid]!, pKnown: p };
        item.difficulty = result.itemDifficulty;
        item.timesServed++;

        session.push({ conceptId: item.conceptId, correct: a.correct, confidence: a.confidence, latencyMs: a.latencyMs, hintsUsed: 0, expectedLatencyMs: EXPECTED_MS, at: now.toISOString() });
        if (choice.target != null) {
          targets.push(choice.target);
          res.targets.push(choice.target);
        }
        res.kinds[choice.kind] = (res.kinds[choice.kind] ?? 0) + 1;
        recentItems.push(item.id);
        afterAnswer(policy, { ...ctx, states }, item.conceptId, a.correct);
        answered++;
        if (a.correct) correctTotal++;

        mood.wrongStreak = a.correct ? 0 : mood.wrongStreak + 1;
        mood.easyStreak = a.tooEasy ? mood.easyStreak + 1 : 0;
        if (mood.wrongStreak >= l.frustrationTolerance) {
          quits++;
          res.quitReasons.frustrated!++;
          break;
        }
        if (mood.easyStreak >= l.boredomTolerance) {
          quits++;
          res.quitReasons.bored!++;
          break;
        }
      }

      // Session end: score the engine's mastery estimates against ground truth (practised concepts).
      const endDay = day0 + (session.length * SECONDS_PER_QUESTION) / 86_400;
      const endNow = new Date(start + endDay * 86_400_000);
      for (const n of nodes) {
        if (!states[n.id]!.attempts) continue;
        res.masteryScores.push(effectiveMastery(states[n.id]!, endNow));
        res.masteryLabels.push(isMastered(l, n.id, endDay));
      }
      if (session.length >= 5 && targets.length) {
        const realised = session.filter((s) => s.correct).length / session.length;
        res.zpdGap.push(Math.abs(realised - mean(targets)));
      }
    }

    const end = SESSION_DAYS[SESSION_DAYS.length - 1]! + 0.1;
    res.gain.push(mean(nodes.map((n) => effectiveSkill(l, n.id, end) - l.initial[n.id]!)));
    res.masteredEnd.push(nodes.filter((n) => isMastered(l, n.id, end)).length);
    res.ret7.push(mean(nodes.map((n) => sigmoid(effectiveSkill(l, n.id, end + 7)))));
    res.ret30.push(mean(nodes.map((n) => sigmoid(effectiveSkill(l, n.id, end + 30)))));
    res.droppedOut.push(quits >= QUITS_TO_DROP_OUT);
    res.answered.push(answered);
    res.success.push(answered ? correctTotal / answered : NaN);
    void lastDay;
    res.itemBias.push(mean(bank.map((b) => b.difficulty - b.trueDifficulty)));
  }
  return res;
}

// ── Run, compare, report ───────────────────────────────────────────────────

const startedAt = new Date().toISOString();
const results = Object.fromEntries(POLICIES.map((p) => [p, runPolicy(p)])) as Record<PolicyName, PolicyResult>;
const e = results.engine;
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
const baselines = POLICIES.filter((p) => p !== 'engine');
/** Best baseline value of a metric (the bar the engine has to clear). */
const best = (f: (r: PolicyResult) => number, dir: 'max' | 'min' = 'max') =>
  baselines.reduce((acc, p) => (dir === 'max' ? Math.max(acc, f(results[p])) : Math.min(acc, f(results[p]))), dir === 'max' ? -Infinity : Infinity);

const gain = (r: PolicyResult) => mean(r.gain);
const mastered = (r: PolicyResult) => mean(r.masteredEnd);
const ret30 = (r: PolicyResult) => mean(r.ret30);
const dropout = (r: PolicyResult) => rate(r.droppedOut);
const rel = reliability(e.predicted, e.outcomes);

// Gates are regression floors set below the worst of seeds 2026, 7 and 99 at
// 150 learners (the run is seeded, so a breach means behaviour changed). Targets are the aspirations
// in docs/EVALS.md §1, tracked but not gating until the engine meets them.
// Re-set in Step 12 (learning-aware Elo): every outcome floor rose; ECE and next-answer AUC
// floors were loosened on purpose, see the note in the report.
const metrics: Metric[] = [
  { name: 'Skill gain: engine − best baseline', value: gain(e) - best(gain), threshold: ['>=', 0.6], note: 'logits' },
  { name: 'Concepts mastered: engine ÷ best baseline', value: mastered(e) / best(mastered), threshold: ['>=', 2.8], note: 'ratio' },
  { name: '30-day recall: engine − best baseline', value: ret30(e) - best(ret30), threshold: ['>=', 0.09], format: 'pct' },
  { name: 'Mastery-estimate AUC', value: auc(e.masteryScores, e.masteryLabels), threshold: ['>=', 0.75], target: ['>=', 0.85] },
  { name: 'Next-answer AUC', value: auc(e.predicted, e.outcomes), threshold: ['>=', 0.55], target: ['>=', 0.75], note: 'compressed by adaptive selection' },
  { name: 'Next-answer calibration error (ECE)', value: rel.ece, threshold: ['<=', 0.1], target: ['<=', 0.03] },
  { name: 'ZPD tracking |realised − target|', value: mean(e.zpdGap), threshold: ['<=', 0.12], target: ['<=', 0.08] },
  { name: 'Item difficulty bias after all learners (engine)', value: e.itemBias.at(-1)!, threshold: ['>=', -0.4], target: ['>=', -0.2], note: 'estimated − true, logits' },
  { name: 'Dropout', value: dropout(e), format: 'pct' },
  { name: 'Dropout: engine − random', value: dropout(e) - dropout(results.random), threshold: ['<=', -0.2], target: ['<=', -0.3 * dropout(results.random)], format: 'pct' },
  { name: 'Sessions quit from boredom (engine)', value: e.quitReasons.bored!, format: 'int' },
];

const row = (p: PolicyName) => {
  const r = results[p];
  return [
    p,
    fmt(gain(r)),
    fmt(mean(r.masteredEnd), 'num'),
    fmt(mean(r.ret7), 'pct'),
    fmt(ret30(r), 'pct'),
    fmt(dropout(r), 'pct'),
    fmt(mean(r.answered), 'int'),
    fmt(mean(r.success.filter(Number.isFinite)), 'pct'),
    `${r.quitReasons.frustrated}/${r.quitReasons.bored}`,
    fmt(auc(r.predicted, r.outcomes)),
  ];
};

finish({
  suite: 'sim',
  startedAt,
  config: { learners: LEARNERS, seed: SEED, sessions: SESSION_DAYS, questionsPerSession: QUESTIONS_PER_SESSION, concepts: nodes.length, itemsPerConcept: ITEMS_PER_CONCEPT },
  metrics,
  tables: [
    {
      title: 'Policies compared (same learners, bank and randomness)',
      header: ['Policy', 'Skill gain (logits)', 'Concepts mastered /12', 'Recall @7d', 'Recall @30d', 'Dropout', 'Questions', 'Success rate', 'Quits frustrated/bored', 'Model next-answer AUC'],
      rows: POLICIES.map(row),
    },
    {
      title: 'Item calibration drift as learners pass through (shared bank)',
      header: ['Learners', ...POLICIES.map((p) => `${p}: bias / dropout`)],
      rows: Array.from({ length: Math.ceil(LEARNERS / 50) }, (_, k) => [
        `${k * 50 + 1}–${Math.min(LEARNERS, (k + 1) * 50)}`,
        ...POLICIES.map((p) => {
          const r = results[p];
          const hi = Math.min(LEARNERS, (k + 1) * 50);
          return `${fmt(r.itemBias[hi - 1]!)} / ${fmt(rate(r.droppedOut.slice(k * 50, hi)), 'pct')}`;
        }),
      ]),
    },
    {
      title: 'Engine prediction reliability (predicted vs observed P(correct))',
      header: ['Predicted bin', 'Answers', 'Mean predicted', 'Observed'],
      rows: rel.bins.map((b) => [`${b.lo.toFixed(1)}–${b.hi.toFixed(1)}`, b.n, fmt(b.pred, 'pct'), fmt(b.obs, 'pct')]),
    },
  ],
  notes: [
    'Ground truth: a concept is mastered when P(correct on an average item, no guessing) ≥ 0.8. Recall @Nd is that probability averaged over all 12 concepts N days after the last session.',
    'Learners quit a session after too many wrong answers in a row (frustration) or too many trivially easy ones (boredom); two quits = dropout.',
    'Item-calibration drift (found by this suite, fixed in Step 12): plain Elo booked learning as item easiness, so under adaptive selection the most-served items drifted ~3.8 logits too easy, success ran at 82% against a 72% target and boredom quits drove dropout to 14 points above random. The engine now tracks learning velocity and holds item updates while a learner\u2019s residuals show their estimate is behind (packages/engine/src/elo.ts).',
    'Trade-off accepted in Step 12: next-answer ECE rose from ~0.05 to ~0.08–0.09 and next-answer AUC from ~0.64 to ~0.60. The old ECE looked better because drifted items absorbed the lag; what remains is a steady ~5-point under-prediction for fast learners and off-target picks when a concept\u2019s bank runs short. Floors were loosened for these two only.',
    'The simulator is a model of learning, not learning itself: use it to compare policy changes, then confirm on real learners (EVALS §8).',
  ],
});
