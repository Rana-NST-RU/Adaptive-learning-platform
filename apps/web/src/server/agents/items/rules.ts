// ─────────────────────────────────────────────────────────────────────────────
// Deterministic rules for agent-written items. No LLM calls here, so this is
// unit-tested directly (items/rules.test.ts) and shared by the Author's
// submit tool, the Verifier decision and the eval harness.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const DraftOption = z.object({
  text: z.string().min(1).max(400).describe('Option text, without a leading letter'),
  correct: z.boolean(),
  misconceptionId: z
    .string()
    .nullable()
    .describe('For a wrong option: the id of the misconception it represents, from the catalogue. null for the correct option.'),
  feedback: z.string().min(1).max(400).describe('Shown when a learner picks this option. For wrong options: why it is tempting and why it is wrong.'),
});

export const DraftItem = z.object({
  stem: z.string().min(10).max(800).describe('The question. Do not put code here; use `code`.'),
  code: z.string().max(2000).nullable().describe('Optional code snippet the question refers to'),
  codeLanguage: z.string().max(20).nullable(),
  options: z.array(DraftOption).min(2).max(5),
  explanation: z.string().min(20).max(1200).describe('Why the correct answer is correct, at the level of the learner'),
  hints: z.array(z.string().min(5).max(300)).min(2).max(3).describe('Escalating hints. The first nudges thinking; the last almost gives the method, never the answer.'),
  level: z.number().int().min(1).max(5).describe('Difficulty 1 (recall) … 5 (transfer to a novel problem)'),
  bloom: z.enum(['remember', 'understand', 'apply', 'analyze', 'evaluate']),
  citations: z.array(z.string()).describe('Ids of knowledge chunks that support the facts in this item'),
});
export type DraftItem = z.infer<typeof DraftItem>;

export interface ValidationContext {
  misconceptionIds: string[];
  existingStems: string[];
  retrievedChunkIds: Set<string>;
  /** Stems already accepted in this run, for intra-batch dedupe. */
  acceptedStems?: string[];
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

/** Jaccard similarity of word sets. A cheap near-duplicate detector. */
export function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.75;

/** Returns a list of problems; empty means the draft is structurally valid. */
export function validateDraft(d: DraftItem, ctx: ValidationContext): string[] {
  const errs: string[] = [];
  const correct = d.options.filter((o) => o.correct);
  if (correct.length !== 1) errs.push(`Exactly one option must be correct (found ${correct.length}).`);
  const isTf = d.options.length === 2;
  if (!isTf && d.options.length !== 4) errs.push('Multiple-choice items need exactly 4 options (or 2 for true/false).');

  const texts = d.options.map((o) => o.text.trim().toLowerCase());
  if (new Set(texts).size !== texts.length) errs.push('Option texts must be distinct.');
  if (d.options.some((o) => /^[A-Da-d][).:]\s/.test(o.text))) errs.push('Do not prefix options with letters; the UI adds them.');
  if (d.options.some((o) => /all of the above|none of the above/i.test(o.text))) errs.push('Avoid "all/none of the above".');

  const known = new Set(ctx.misconceptionIds);
  const wrong = d.options.filter((o) => !o.correct);
  for (const o of wrong) {
    if (o.misconceptionId === null) continue;
    if (!known.has(o.misconceptionId)) errs.push(`Unknown misconceptionId "${o.misconceptionId}". Use one from the catalogue or null.`);
  }
  if (!isTf && wrong.filter((o) => o.misconceptionId !== null && known.has(o.misconceptionId)).length < 2) {
    errs.push('At least two distractors must be tagged with a catalogue misconception.');
  }
  if (correct[0] && correct[0].misconceptionId !== null) errs.push('The correct option must have misconceptionId null.');

  const correctText = correct[0]?.text.toLowerCase() ?? '';
  if (correctText.length > 12 && d.stem.toLowerCase().includes(correctText)) errs.push('The stem gives away the correct answer.');
  const lengths = d.options.map((o) => o.text.length);
  if (!isTf && correct[0] && correct[0].text.length > 1.8 * Math.max(...lengths.filter((l) => l !== correct[0]!.text.length), 1)) {
    errs.push('The correct option is much longer than the others (a giveaway). Balance option lengths.');
  }

  for (const c of d.citations) {
    if (!ctx.retrievedChunkIds.has(c)) errs.push(`Citation "${c}" was not returned by search_knowledge.`);
  }

  for (const s of [...ctx.existingStems, ...(ctx.acceptedStems ?? [])]) {
    if (similarity(s, d.stem) >= DUPLICATE_THRESHOLD) {
      errs.push(`Too similar to an existing question: "${s.slice(0, 90)}…". Test a different angle.`);
      break;
    }
  }
  return errs;
}

/** Elo logit → authoring level 1..5 (inverse of authoredDifficultyToLogit). */
export function levelFromLogit(logit: number): number {
  return Math.min(5, Math.max(1, Math.round(logit / 0.9 + 3)));
}

// ── Verifier ───────────────────────────────────────────────────────────────

export const BlindSolve = z.object({
  reasoning: z.string().max(1500).describe('Brief working'),
  answerIndex: z.number().int().min(0).max(4).describe('0-based index of the option you believe is correct'),
  confidence: z.number().min(0).max(1),
  ambiguity: z.array(z.string()).describe('Problems that make more than one answer defensible, or none'),
});
export type BlindSolve = z.infer<typeof BlindSolve>;

export const Audit = z.object({
  keyCorrect: z.boolean().describe('Is the marked answer actually correct?'),
  singleBestAnswer: z.boolean().describe('Is exactly one option defensibly correct?'),
  grounded: z.boolean().describe('Are the factual claims supported by the sources (or uncontroversial textbook facts)?'),
  distractorsMatchMisconceptions: z.boolean(),
  estimatedLevel: z.number().int().min(1).max(5),
  issues: z.array(z.string()),
  verdict: z.enum(['accept', 'repair', 'reject']),
  repairedExplanation: z.string().nullable().describe('Only when verdict = repair: an improved explanation'),
});
export type Audit = z.infer<typeof Audit>;

export interface Decision {
  accept: boolean;
  level: number;
  notes: string;
}

/**
 * Acceptance rule: the blind solver must independently reach the key, and the
 * audit must confirm correctness and a single best answer.
 */
export function decide(draft: DraftItem, blind: BlindSolve, audit: Audit): Decision {
  const keyIndex = draft.options.findIndex((o) => o.correct);
  const reasons: string[] = [];
  if (blind.answerIndex !== keyIndex) reasons.push(`blind solver chose option ${blind.answerIndex}, key is ${keyIndex}`);
  if (!audit.keyCorrect) reasons.push('audit: key incorrect');
  if (!audit.singleBestAnswer) reasons.push('audit: more than one defensible answer');
  if (!audit.grounded) reasons.push('audit: not grounded in sources');
  if (audit.verdict === 'reject') reasons.push('audit verdict: reject');
  if (blind.ambiguity.length > 0 && blind.confidence < 0.6) reasons.push('blind solver flagged ambiguity with low confidence');

  const level = Math.round((draft.level + audit.estimatedLevel) / 2);
  const notes = [
    reasons.length ? `REJECTED: ${reasons.join('; ')}` : 'ACCEPTED: blind solve matched key; audit passed',
    ...audit.issues.map((i) => `issue: ${i}`),
    ...blind.ambiguity.map((a) => `ambiguity: ${a}`),
  ].join('\n');
  return { accept: reasons.length === 0, level, notes };
}
