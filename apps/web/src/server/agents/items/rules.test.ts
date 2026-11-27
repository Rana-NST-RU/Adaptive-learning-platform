import { describe, expect, it } from 'vitest';
import { decide, levelFromLogit, similarity, validateDraft, type Audit, type BlindSolve, type DraftItem } from './rules';

const good: DraftItem = {
  stem: 'In a sorted array, the sum at the two pointers is less than the target. Which pointer should move?',
  code: null,
  codeLanguage: null,
  options: [
    { text: 'Move the right pointer one step left', correct: false, misconceptionId: 'tp-move-both', feedback: 'That shrinks the sum further.' },
    { text: 'Move the left pointer one step right', correct: true, misconceptionId: null, feedback: 'Yes, this increases the sum.' },
    { text: 'Move both pointers one step inward', correct: false, misconceptionId: 'tp-move-both', feedback: 'You could skip the answer.' },
    { text: 'Restart with the left pointer at 0', correct: false, misconceptionId: 'tp-unsorted', feedback: 'Pairs with smaller sums are already ruled out.' },
  ],
  explanation: 'Because the array is sorted, moving the left pointer right is the only move that can increase the sum.',
  hints: ['Which move makes the sum bigger?', 'The array is sorted ascending.'],
  level: 2,
  bloom: 'apply',
  citations: ['c1'],
};

const ctx = {
  misconceptionIds: ['tp-move-both', 'tp-unsorted'],
  existingStems: ['What is the time complexity of binary search?'],
  retrievedChunkIds: new Set(['c1']),
};

describe('validateDraft', () => {
  it('accepts a well-formed item', () => {
    expect(validateDraft(good, ctx)).toEqual([]);
  });

  it('rejects zero or multiple correct options', () => {
    const two = { ...good, options: good.options.map((o) => ({ ...o, correct: true, misconceptionId: null })) };
    expect(validateDraft(two, ctx).join()).toMatch(/Exactly one option/);
  });

  it('rejects unknown misconceptions, untagged distractors and invented citations', () => {
    const bad = {
      ...good,
      options: good.options.map((o) => (o.correct ? o : { ...o, misconceptionId: 'made-up' })),
      citations: ['not-retrieved'],
    };
    const errs = validateDraft(bad, ctx).join('\n');
    expect(errs).toMatch(/Unknown misconceptionId/);
    expect(errs).toMatch(/At least two distractors/);
    expect(errs).toMatch(/not returned by search_knowledge/);
  });

  it('rejects giveaways: letter prefixes, all-of-the-above, long correct option, answer in stem', () => {
    const lettered = { ...good, options: good.options.map((o, i) => ({ ...o, text: `${'ABCD'[i]}) ${o.text}` })) };
    expect(validateDraft(lettered, ctx).join()).toMatch(/prefix/);
    const aota = { ...good, options: good.options.map((o, i) => (i === 3 ? { ...o, text: 'All of the above' } : o)) };
    expect(validateDraft(aota, ctx).join()).toMatch(/all\/none/);
    const longKey = {
      ...good,
      options: good.options.map((o) =>
        o.correct ? { ...o, text: 'Move the left pointer one step right, because sorted order means a larger value is there and the sum grows' } : o,
      ),
    };
    expect(validateDraft(longKey, ctx).join()).toMatch(/much longer/);
    const leaked = { ...good, stem: `${good.stem} (Hint: move the left pointer one step right)` };
    expect(validateDraft(leaked, ctx).join()).toMatch(/gives away/);
  });

  it('rejects near-duplicates of existing and same-batch stems', () => {
    expect(validateDraft(good, { ...ctx, existingStems: [good.stem.replace('Which', 'which')] }).join()).toMatch(/Too similar/);
    expect(validateDraft(good, { ...ctx, acceptedStems: [good.stem] }).join()).toMatch(/Too similar/);
    expect(similarity('binary search halves the range', 'completely unrelated words here')).toBe(0);
  });
});

describe('verifier decision', () => {
  const blind: BlindSolve = { reasoning: '…', answerIndex: 1, confidence: 0.9, ambiguity: [] };
  const audit: Audit = {
    keyCorrect: true,
    singleBestAnswer: true,
    grounded: true,
    distractorsMatchMisconceptions: true,
    estimatedLevel: 3,
    issues: [],
    verdict: 'accept',
    repairedExplanation: null,
  };

  it('accepts when the blind solve matches the key and the audit passes', () => {
    const d = decide(good, blind, audit);
    expect(d.accept).toBe(true);
    expect(d.level).toBe(3); // round((2 + 3) / 2)
  });

  it('rejects when the blind solver disagrees, even if the audit passes', () => {
    expect(decide(good, { ...blind, answerIndex: 0 }, audit).accept).toBe(false);
  });

  it('rejects on audit failures', () => {
    expect(decide(good, blind, { ...audit, keyCorrect: false }).accept).toBe(false);
    expect(decide(good, blind, { ...audit, singleBestAnswer: false }).accept).toBe(false);
    expect(decide(good, blind, { ...audit, grounded: false }).accept).toBe(false);
    expect(decide(good, blind, { ...audit, verdict: 'reject' }).accept).toBe(false);
  });

  it('rejects ambiguity flagged with low confidence', () => {
    expect(decide(good, { ...blind, confidence: 0.4, ambiguity: ['two options defensible'] }, audit).accept).toBe(false);
  });
});

describe('levelFromLogit', () => {
  it('inverts the authoring scale and clamps', () => {
    expect(levelFromLogit(0)).toBe(3);
    expect(levelFromLogit(-1.8)).toBe(1);
    expect(levelFromLogit(1.8)).toBe(5);
    expect(levelFromLogit(9)).toBe(5);
  });
});
