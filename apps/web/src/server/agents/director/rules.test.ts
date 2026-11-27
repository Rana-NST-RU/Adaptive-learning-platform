import { describe, expect, it } from 'vitest';
import { toSessionPlan, validatePlan, type PlanContext, type PlanDraft } from './rules';

const ctx = (affect: PlanContext['affect'] = 'flow'): PlanContext => ({
  affect,
  concepts: new Map([
    ['arrays', { id: 'c-arrays', name: 'Arrays', status: 'learning' }],
    ['bfs', { id: 'c-bfs', name: 'Breadth-first search', status: 'available' }],
    ['dijkstra', { id: 'c-dijkstra', name: 'Dijkstra', status: 'locked' }],
  ]),
});

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  headline: 'Two easier array warm-ups, then back to BFS',
  steps: ['Warm up on arrays', 'Return to BFS'],
  reason: 'The last few BFS questions were tough, so a quick win first.',
  focusConcept: 'arrays',
  targetDelta: 0.08,
  modeOverride: 'recovery',
  durationMinutes: 8,
  ...over,
});

describe('validatePlan', () => {
  it('accepts a sensible recovery plan', () => {
    expect(validatePlan(draft(), ctx('frustrated'))).toEqual([]);
  });

  it('bounds the target shift to ±0.1', () => {
    expect(validatePlan(draft({ targetDelta: 0.25 }), ctx())).toEqual([expect.stringContaining('targetDelta')]);
    expect(validatePlan(draft({ targetDelta: -0.1 }), ctx())).toEqual([]);
  });

  it('never makes things harder for a frustrated or disengaged learner', () => {
    const errs = validatePlan(draft({ targetDelta: -0.05, modeOverride: 'challenge' }), ctx('frustrated'));
    expect(errs).toHaveLength(2);
    expect(validatePlan(draft({ modeOverride: 'challenge' }), ctx('disengaged'))).toHaveLength(1);
    expect(validatePlan(draft({ targetDelta: -0.08, modeOverride: 'challenge' }), ctx('bored'))).toEqual([]);
  });

  it('rejects unknown and locked focus concepts', () => {
    expect(validatePlan(draft({ focusConcept: 'heaps' }), ctx())[0]).toContain('unknown focusConcept');
    expect(validatePlan(draft({ focusConcept: 'dijkstra' }), ctx())[0]).toContain('locked');
    expect(validatePlan(draft({ focusConcept: null }), ctx())).toEqual([]);
  });

  it('bounds duration and step count, and requires a reason', () => {
    expect(validatePlan(draft({ durationMinutes: 60 }), ctx())).toHaveLength(1);
    expect(validatePlan(draft({ durationMinutes: 2 }), ctx())).toHaveLength(1);
    expect(validatePlan(draft({ steps: [] }), ctx())).toHaveLength(1);
    expect(validatePlan(draft({ reason: ' ' }), ctx())).toHaveLength(1);
  });

  it('keeps ids out of learner-facing text', () => {
    const errs = validatePlan(draft({ headline: 'Focus on 3f2b9c1e-1111-4a4a-8b8b-123456789abc next' }), ctx());
    expect(errs[0]).toContain('must not contain ids');
  });
});

describe('toSessionPlan', () => {
  it('maps the slug to an id, sets the expiry and records the trigger', () => {
    const now = new Date('2026-11-27T10:00:00Z');
    const plan = toSessionPlan(draft(), ctx(), 'struggling', now);
    expect(plan).toMatchObject({
      by: 'director',
      focusConceptId: 'c-arrays',
      targetDelta: 0.08,
      modeOverride: 'recovery',
      trigger: 'struggling',
      reasons: ['The last few BFS questions were tough, so a quick win first.'],
      expiresAt: '2026-11-27T10:08:00.000Z',
    });
  });
});
