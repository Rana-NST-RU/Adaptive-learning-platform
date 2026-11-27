import { describe, expect, it } from 'vitest';
import {
  applyAttempt,
  calibration,
  chooseNextAction,
  deriveUxPolicy,
  detectAffect,
  eloPredict,
  guessFor,
  newConceptState,
  selectItem,
  type AttemptSignal,
  type ConceptNode,
  type ConceptState,
  type ItemSummary,
} from '../src/index.js';

const nodes: ConceptNode[] = [
  { id: 'arrays', name: 'Arrays', prerequisites: [], order: 0 },
  { id: 'hashing', name: 'Hash maps', prerequisites: ['arrays'], order: 1 },
  { id: 'two-pointers', name: 'Two pointers', prerequisites: ['arrays'], order: 2 },
  { id: 'sliding-window', name: 'Sliding window', prerequisites: ['two-pointers', 'hashing'], order: 3 },
];

const fresh = () => Object.fromEntries(nodes.map((n) => [n.id, newConceptState(n.id)])) as Record<string, ConceptState>;

describe('next-best-action policy', () => {
  it('starts with the root concept and never serves a locked one', () => {
    const a = chooseNextAction({ nodes, states: fresh(), recent: [], affect: 'unknown' });
    expect(a.kind).toBe('learn_new');
    expect(a.conceptId).toBe('arrays');
    expect(a.reasons.length).toBeGreaterThan(0);
    expect(a.candidates.map((c) => c.conceptId)).not.toContain('sliding-window');
  });

  it('prioritises remediation after repeated failure', () => {
    const states = fresh();
    states['arrays'] = { ...states['arrays']!, pKnown: 0.7, attempts: 5, streak: -3 };
    const a = chooseNextAction({ nodes, states, recent: [], affect: 'flow' });
    expect(a.kind).toBe('remediate');
    expect(a.conceptId).toBe('arrays');
  });

  it('suggests a break when frustrated deep into a session', () => {
    const a = chooseNextAction({ nodes, states: fresh(), recent: [], affect: 'frustrated', sessionMinutes: 30 });
    expect(a.kind).toBe('break');
  });

  it('honours a director focus override until it expires', () => {
    const states = fresh();
    states['arrays'] = { ...states['arrays']!, pKnown: 0.9, attempts: 6 };
    const now = new Date('2026-01-01T00:00:00Z');
    const live = chooseNextAction({
      nodes, states, recent: [], affect: 'flow', now,
      override: { focusConceptId: 'two-pointers', expiresAt: '2026-01-01T00:10:00Z' },
    });
    expect(live.conceptId).toBe('two-pointers');
    const expired = chooseNextAction({
      nodes, states, recent: [], affect: 'flow', now,
      override: { focusConceptId: 'two-pointers', expiresAt: '2025-12-31T00:00:00Z' },
    });
    expect(expired.reasons.join(' ')).not.toContain('prioritised');
  });
});

describe('item selection', () => {
  it('picks the item closest to the target and flags thin pools', () => {
    const state = newConceptState('arrays');
    const items: ItemSummary[] = [-2, -1, 0, 1, 2].map((d, i) => ({
      id: `i${i}`, conceptId: 'arrays', difficulty: d, optionCount: 4, timesServed: 0,
    }));
    const target = 0.72;
    const choice = selectItem(items, state, target, new Set());
    const gaps = items.map((it) => Math.abs(eloPredict(state.ability, it.difficulty, guessFor(4)) - target));
    expect(choice.item?.id).toBe(items[gaps.indexOf(Math.min(...gaps))]!.id);
    expect(selectItem(items.slice(0, 2), state, target, new Set()).needsGeneration).toBe(true);
    expect(selectItem(items, state, target, new Set(items.map((i) => i.id))).item).toBeNull();
  });
});

describe('adaptive UX policy', () => {
  it('switches to recovery mode with proactive hints when frustrated', () => {
    const recent: AttemptSignal[] = [true, false, false, false].map((c) => ({
      conceptId: 'arrays', correct: c, confidence: 2, latencyMs: 25_000, hintsUsed: 1, at: '',
    }));
    const affect = detectAffect(recent);
    const action = chooseNextAction({ nodes, states: fresh(), recent, affect: affect.state });
    const ux = deriveUxPolicy({
      affect, action, calibration: calibration(recent), sessionMinutes: 5, questionsThisSession: 4, dailyGoalMinutes: 20,
    });
    expect(ux.mode).toBe('recovery');
    expect(ux.hintPolicy).toBe('proactive');
    expect(ux.tutorNudge).not.toBeNull();
  });

  it('ignores a stale challenge override from the Director while the learner is struggling', () => {
    const recent: AttemptSignal[] = [true, false, false, false].map((c) => ({
      conceptId: 'arrays', correct: c, confidence: 2, latencyMs: 25_000, hintsUsed: 1, at: '',
    }));
    const affect = detectAffect(recent);
    const action = chooseNextAction({ nodes, states: fresh(), recent, affect: affect.state });
    const base = { affect, action, calibration: calibration(recent), sessionMinutes: 5, questionsThisSession: 4, dailyGoalMinutes: 20 };
    expect(deriveUxPolicy({ ...base, modeOverride: 'challenge' }).mode).toBe('recovery');
    expect(deriveUxPolicy({ ...base, modeOverride: 'review' }).mode).toBe('review');
  });
});

// ─── Simulated learner study (see docs/EVALS.md §1) ─────────────────────────
// Synthetic learners with a hidden true skill per concept. They learn most
// near their zone of proximal development, little from items far too easy or
// hard, and cannot progress while prerequisites are weak. The engine never
// sees the hidden skill. Compared against a random-order baseline over a
// realistic 40-question session, across several seeds.
describe('simulated learner', () => {
  function mulberry32(seed: number) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

  function run(seed: number, policy: 'engine' | 'random', questions = 40) {
    const rand = mulberry32(seed);
    const trueSkill: Record<string, number> = { arrays: 0.3, hashing: -0.8, 'two-pointers': -1, 'sliding-window': -1.6 };
    const bank: ItemSummary[] = nodes.flatMap((n) =>
      Array.from({ length: 12 }, (_, i) => ({
        id: `${n.id}-${i}`, conceptId: n.id, difficulty: -1.5 + (i % 6) * 0.6, optionCount: 4, timesServed: 0,
      })),
    );
    let states = fresh();
    const recent: AttemptSignal[] = [];
    const seen: string[] = [];
    let now = new Date('2026-01-01T09:00:00Z');

    for (let q = 0; q < questions; q++) {
      let action = chooseNextAction({ nodes, states, recent, affect: detectAffect(recent).state, now, questionsThisSession: q });
      if (policy === 'random') {
        action = { ...action, kind: 'practice', conceptId: nodes[Math.floor(rand() * nodes.length)]!.id, targetSuccess: 0.72 };
      }
      if (action.kind === 'break' || !action.conceptId) { now = new Date(now.getTime() + 600_000); continue; }
      const cid = action.conceptId;
      const st = states[cid]!;
      const item = policy === 'random'
        ? bank.filter((b) => b.conceptId === cid)[Math.floor(rand() * 12)]!
        : selectItem(bank, st, action.targetSuccess, new Set(seen.slice(-15))).item;
      if (!item) continue;

      const correct = rand() < eloPredict(trueSkill[cid]!, item.difficulty, 0.25);
      const prereqReady = Math.min(1, ...nodes.find((n) => n.id === cid)!.prerequisites.map((p) => sigmoid(trueSkill[p]!)));
      const pz = eloPredict(trueSkill[cid]!, item.difficulty, 0);
      trueSkill[cid]! += 0.35 * prereqReady * 4 * pz * (1 - pz) * (correct ? 1 : 0.6);

      const res = applyAttempt(st, item, { correct, confidence: correct ? 3 : 2, latencyMs: 20_000, hintsUsed: 0 }, { nodes, states }, now);
      states = { ...states, [cid]: res.state };
      for (const [id, p] of Object.entries(res.propagated)) states[id] = { ...states[id]!, pKnown: p };
      item.difficulty = res.itemDifficulty;
      item.timesServed++;
      recent.push({ conceptId: cid, correct, confidence: 3, latencyMs: 20_000, hintsUsed: 0, at: now.toISOString() });
      seen.push(item.id);
      now = new Date(now.getTime() + 90_000);
    }
    const meanSkill = Object.values(trueSkill).reduce((a, b) => a + b, 0) / nodes.length;
    const success = recent.slice(5).filter((a) => a.correct).length / recent.slice(5).length;
    return { meanSkill, success };
  }

  const seeds = [42, 7, 99, 1234, 2026];

  it('learns more than a random-order baseline in a 40-question session', () => {
    const engine = seeds.map((s) => run(s, 'engine'));
    const random = seeds.map((s) => run(s, 'random'));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Observed when written: engine ≈ 1.21 vs random ≈ 0.69 mean true skill.
    expect(avg(engine.map((r) => r.meanSkill))).toBeGreaterThan(avg(random.map((r) => r.meanSkill)) * 1.3);
    engine.forEach((r, i) => expect(r.meanSkill).toBeGreaterThan(random[i]!.meanSkill));
  });

  it('keeps realised success inside the practice band (not testing-level 50%)', () => {
    for (const s of seeds) {
      const { success } = run(s, 'engine');
      expect(success).toBeGreaterThan(0.6);
      expect(success).toBeLessThan(0.92);
    }
  });
});
