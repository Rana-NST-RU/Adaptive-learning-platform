// ─────────────────────────────────────────────────────────────────────────────
// Item Verifier agent (docs/ARCHITECTURE.md §3 #5). Two independent calls:
//   1. Blind solve: sees only the question and options, never the key.
//   2. Audit: sees the key, misconception tags and sources; checks
//      correctness, single best answer, grounding, distractor quality.
// The accept/reject decision is the deterministic rule in rules.decide().
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { structured, type RunContext } from '../llm';
import { Audit, BlindSolve, decide, type Decision, type DraftItem } from './rules';
import type { RetrievedChunk } from '../../rag/retrieve';

const BLIND_SYSTEM = `You are an expert solving a multiple-choice practice question. Work it out yourself, then choose the single best option. If the question is ambiguous, contains an error, or more than one option is defensible, say so in "ambiguity". Do not guess silently.`;

const AUDIT_SYSTEM = `You are the Item Verifier on an adaptive learning platform. You audit practice questions written by another agent before learners ever see them. Be strict: a wrong answer key or an ambiguous item damages learners' trust and corrupts the learner model.

Check:
- keyCorrect: the option marked correct really is correct.
- singleBestAnswer: no other option is also defensible.
- grounded: factual claims are supported by the provided sources or are uncontroversial textbook facts.
- distractorsMatchMisconceptions: each tagged distractor is what a learner holding that misconception would plausibly choose.
- estimatedLevel: 1 = recall … 5 = transfer to a novel problem.
Verdict: "accept" if sound, "repair" if only the explanation needs improving (then provide repairedExplanation), "reject" for anything else.`;

function renderQuestion(d: DraftItem) {
  return [
    d.stem,
    d.code ? `\n\`\`\`${d.codeLanguage ?? ''}\n${d.code}\n\`\`\`` : '',
    '',
    ...d.options.map((o, i) => `${i}. ${o.text}`),
  ].join('\n');
}

export async function blindSolve(run: RunContext, draft: DraftItem): Promise<BlindSolve> {
  return structured(run, {
    system: BLIND_SYSTEM,
    prompt: `${renderQuestion(draft)}\n\nAnswer with the 0-based index of the best option.`,
    schema: BlindSolve,
    effort: 'medium',
  });
}

export async function audit(
  run: RunContext,
  draft: DraftItem,
  concept: { name: string; misconceptions: Array<{ id: string; description: string }> },
  sources: RetrievedChunk[],
): Promise<Audit> {
  const tagged = draft.options
    .map((o, i) => `${i}. ${o.text}  [${o.correct ? 'CORRECT' : `misconception: ${o.misconceptionId ?? 'none'}`}]\n   feedback: ${o.feedback}`)
    .join('\n');
  const prompt = [
    `Concept: ${concept.name}`,
    `Misconception catalogue:\n${concept.misconceptions.map((m) => `- ${m.id}: ${m.description}`).join('\n')}`,
    `Question:\n${draft.stem}${draft.code ? `\n\`\`\`\n${draft.code}\n\`\`\`` : ''}`,
    `Options:\n${tagged}`,
    `Explanation: ${draft.explanation}`,
    `Hints: ${draft.hints.join(' | ')}`,
    `Author's level: ${draft.level}`,
    sources.length
      ? `Sources:\n${sources.map((s) => `[${s.id}] ${s.title}\n${s.content}`).join('\n\n')}`
      : 'Sources: none were cited. Judge against uncontroversial textbook knowledge.',
  ].join('\n\n');
  return structured(run, { system: AUDIT_SYSTEM, prompt, schema: Audit, effort: 'medium' });
}

export async function verifyItem(
  run: RunContext,
  draft: DraftItem,
  concept: { name: string; misconceptions: Array<{ id: string; description: string }> },
  sources: RetrievedChunk[],
): Promise<{ decision: Decision; blind: BlindSolve; audit: Audit; draft: DraftItem }> {
  // Run both in parallel: the blind pass never sees the audit's inputs.
  const [b, a] = await Promise.all([blindSolve(run, draft), audit(run, draft, concept, sources)]);
  const decision = decide(draft, b, a);
  const final = a.verdict === 'repair' && a.repairedExplanation ? { ...draft, explanation: a.repairedExplanation } : draft;
  return { decision, blind: b, audit: a, draft: final };
}
