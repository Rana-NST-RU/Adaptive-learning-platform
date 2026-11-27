import { describe, expect, it } from 'vitest';
import {
  bktUpdate,
  bktPredict,
  guessFor,
  eloPredict,
  eloUpdate,
  difficultyForTarget,
  authoredDifficultyToLogit,
  gradeFor,
  reviewMemory,
  retrievability,
  isDue,
  detectAffect,
  targetSuccess,
  calibration,
  topoSort,
  validateGraph,
  propagate,
  newConceptState,
  type AttemptSignal,
  type ConceptNode,
} from '../src/index.js';
import { Rating } from 'ts-fsrs';

const sig = (correct: boolean, o: Partial<AttemptSignal> = {}): AttemptSignal => ({
  conceptId: 'a',
  correct,
  confidence: 3,
  latencyMs: 20_000,
  hintsUsed: 0,
  at: new Date().toISOString(),
  ...o,
});

describe('BKT', () => {
  it('correct answers raise and wrong answers lower P(known), within bounds', () => {
    const up = bktUpdate(0.3, true);
    const down = bktUpdate(0.3, false);
    expect(up).toBeGreaterThan(0.3);
    expect(down).toBeLessThan(up);
    let p = 0.5;
    for (let i = 0; i < 50; i++) p = bktUpdate(p, true);
    expect(p).toBeLessThan(1);
    expect(p).toBeGreaterThan(0.95);
  });

  it('hints weaken the evidence of a correct answer', () => {
    expect(bktUpdate(0.3, true, undefined, 2)).toBeLessThan(bktUpdate(0.3, true, undefined, 0));
  });

  it('guess follows item format', () => {
    expect(guessFor(4)).toBe(0.25);
    expect(guessFor(2)).toBe(0.5);
    expect(guessFor(0)).toBeLessThan(0.1);
    expect(bktPredict(0)).toBeCloseTo(0.2);
  });
});

describe('Elo / IRT', () => {
  it('predicts 50% (plus guessing) when ability equals difficulty', () => {
    expect(eloPredict(0, 0)).toBeCloseTo(0.5);
    expect(eloPredict(0, 0, 0.25)).toBeCloseTo(0.625);
  });

  it('a correct answer raises ability and lowers item difficulty', () => {
    const r = eloUpdate(0, 0, true, 0, 0);
    expect(r.ability).toBeGreaterThan(0);
    expect(r.difficulty).toBeLessThan(0);
  });

  it('steps shrink as evidence accumulates', () => {
    const early = eloUpdate(0, 0, true, 0, 0).ability;
    const late = eloUpdate(0, 0, true, 200, 0).ability;
    expect(late).toBeLessThan(early);
  });

  it('difficultyForTarget inverts eloPredict', () => {
    const b = difficultyForTarget(0.4, 0.72, 0.2);
    expect(eloPredict(0.4, b, 0.2)).toBeCloseTo(0.72, 5);
    expect(authoredDifficultyToLogit(1)).toBeLessThan(authoredDifficultyToLogit(5));
  });
});

describe('FSRS memory', () => {
  it('maps answers to grades using confidence and hints', () => {
    expect(gradeFor(false, 4, 0, true)).toBe(Rating.Again);
    expect(gradeFor(true, 1, 0, false)).toBe(Rating.Hard);
    expect(gradeFor(true, 3, 1, false)).toBe(Rating.Hard);
    expect(gradeFor(true, 3, 0, false)).toBe(Rating.Good);
    expect(gradeFor(true, 4, 0, true)).toBe(Rating.Easy);
  });

  it('schedules a review in the future and retrievability decays', () => {
    const t0 = new Date('2026-01-01T10:00:00Z');
    let m = reviewMemory(null, Rating.Good, t0);
    m = reviewMemory(m, Rating.Good, new Date(new Date(m.due).getTime() + 60_000));
    const due = new Date(m.due);
    expect(due.getTime()).toBeGreaterThan(t0.getTime());
    const soon = retrievability(m, new Date(due.getTime() - 86_400_000));
    const later = retrievability(m, new Date(due.getTime() + 30 * 86_400_000));
    expect(later).toBeLessThan(soon);
    expect(isDue(m, new Date(due.getTime() + 1000))).toBe(true);
    expect(retrievability(null, t0)).toBe(1);
  });
});

describe('affect detection', () => {
  it('detects frustration from a run of errors', () => {
    const a = detectAffect([sig(true), sig(false), sig(false, { hintsUsed: 2 }), sig(false, { hintsUsed: 2 })]);
    expect(a.state).toBe('frustrated');
  });

  it('detects boredom from fast, certain, correct answers', () => {
    const run = Array.from({ length: 8 }, () => sig(true, { latencyMs: 5_000, confidence: 4 }));
    expect(detectAffect(run).state).toBe('bored');
  });

  it('detects disengagement from rapid wrong guesses', () => {
    const run = Array.from({ length: 6 }, (_, i) => sig(i % 3 === 0, { latencyMs: 2_000, confidence: 1 }));
    expect(detectAffect(run).state).toBe('disengaged');
  });

  it('reports flow when balanced and unknown when data is thin', () => {
    const run = [true, true, false, true, true, false, true, true].map((c) => sig(c));
    expect(detectAffect(run).state).toBe('flow');
    expect(detectAffect([sig(true)]).state).toBe('unknown');
  });
});

describe('ZPD controller', () => {
  it('eases when frustrated, hardens when bored, stays bounded', () => {
    expect(targetSuccess('frustrated', [])).toBeGreaterThan(targetSuccess('flow', []));
    expect(targetSuccess('bored', [])).toBeLessThan(targetSuccess('flow', []));
    const allWrong = Array.from({ length: 10 }, () => sig(false));
    expect(targetSuccess('frustrated', allWrong, 'remediate', 0.1)).toBeLessThanOrEqual(0.92);
    const allRight = Array.from({ length: 10 }, () => sig(true));
    expect(targetSuccess('bored', allRight, 'practice', -0.1)).toBeGreaterThanOrEqual(0.55);
  });

  it('clamps director overrides to ±0.1', () => {
    expect(targetSuccess('flow', [], 'practice', 5) - targetSuccess('flow', [], 'practice', 0)).toBeCloseTo(0.1);
  });
});

describe('calibration', () => {
  it('flags over-confidence', () => {
    const run = Array.from({ length: 10 }, (_, i) => sig(i < 3, { confidence: 4 }));
    expect(calibration(run).label).toBe('overconfident');
    expect(calibration([sig(true)]).label).toBe('insufficient_data');
  });
});

describe('concept graph', () => {
  const nodes: ConceptNode[] = [
    { id: 'arrays', name: 'Arrays', prerequisites: [], order: 0 },
    { id: 'two-pointers', name: 'Two pointers', prerequisites: ['arrays'], order: 1 },
    { id: 'sliding-window', name: 'Sliding window', prerequisites: ['two-pointers'], order: 2 },
  ];

  it('sorts topologically and rejects cycles / dangling edges', () => {
    expect(topoSort(nodes)).toEqual(['arrays', 'two-pointers', 'sliding-window']);
    expect(validateGraph([...nodes, { id: 'x', name: 'x', prerequisites: ['nope'], order: 3 }]).ok).toBe(false);
    const cyc: ConceptNode[] = [
      { id: 'a', name: 'a', prerequisites: ['b'], order: 0 },
      { id: 'b', name: 'b', prerequisites: ['a'], order: 1 },
    ];
    expect(validateGraph(cyc).ok).toBe(false);
  });

  it('propagates success to prerequisites and failure to dependents', () => {
    const states = Object.fromEntries(nodes.map((n) => [n.id, newConceptState(n.id, 0.2)]));
    states['sliding-window']!.pKnown = 0.9;
    const up = propagate('sliding-window', true, states, nodes);
    expect(up['arrays']).toBeGreaterThan(0.2);
    expect(up['two-pointers']).toBeGreaterThan(0.2);

    const s2 = Object.fromEntries(nodes.map((n) => [n.id, newConceptState(n.id, 0.8)]));
    s2['arrays']!.pKnown = 0.1;
    const down = propagate('arrays', false, s2, nodes);
    expect(down['sliding-window']).toBeLessThan(0.8);
  });
});
