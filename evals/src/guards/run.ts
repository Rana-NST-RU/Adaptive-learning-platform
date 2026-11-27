// ─────────────────────────────────────────────────────────────────────────────
// Deterministic guard suite (free, every commit). Golden datasets for the
// non-LLM checks that stand between an agent and a learner:
//   • Tutor answer-leak guard   goldens/leak.jsonl            (EVALS §4)
//   • Director plan rules       goldens/director-plans.jsonl  (EVALS §5)
//   • Item rules (validateDraft) seed bank + scripted defects (EVALS §2)
//
//   npm run eval:guards
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AffectState, ConceptStatus } from '@alp/engine';
import { makeLeakDetector } from '../../../apps/web/src/server/agents/tutor/leak';
import { validatePlan, type PlanDraft } from '../../../apps/web/src/server/agents/director/rules';
import { validateDraft, type DraftItem } from '../../../apps/web/src/server/agents/items/rules';
import { DSA_CONCEPTS, type SeedConcept, type SeedItem } from '../../../apps/web/src/server/db/seed/dsa';
import { finish, type Metric } from '../lib/report';

const GOLDENS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../goldens');
const jsonl = <T>(file: string): T[] =>
  readFileSync(path.join(GOLDENS, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

const failures: Array<Record<string, unknown>> = [];
const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : NaN);

// ── 1. Tutor leak guard ────────────────────────────────────────────────────

interface LeakCase {
  id: string;
  kind: 'direct' | 'paraphrase' | 'safe';
  text: string;
  answerId: string;
  answerText: string;
  optionTexts: string[];
}
const leakCases = jsonl<LeakCase>('leak.jsonl');
const leakResults = leakCases.map((c) => {
  const flagged = makeLeakDetector(c).call(null, c.text) !== null;
  const ok = c.kind === 'safe' ? !flagged : c.kind === 'direct' ? flagged : true;
  if (!ok) failures.push({ suite: 'leak', id: c.id, kind: c.kind, text: c.text, flagged });
  return { ...c, flagged };
});
const byKind = (k: LeakCase['kind']) => leakResults.filter((r) => r.kind === k);

// ── 2. Director plan rules ─────────────────────────────────────────────────

interface PlanCase {
  id: string;
  description: string;
  affect: AffectState;
  concepts: Array<{ slug: string; name: string; status: ConceptStatus }>;
  draft: PlanDraft;
  expectValid: boolean;
  expectError: string | null;
}
const planCases = jsonl<PlanCase>('director-plans.jsonl');
const planResults = planCases.map((c) => {
  const errs = validatePlan(c.draft, {
    affect: c.affect,
    concepts: new Map(c.concepts.map((x) => [x.slug, { id: `id-${x.slug}`, name: x.name, status: x.status }])),
  });
  const ok = c.expectValid ? errs.length === 0 : errs.length > 0 && (!c.expectError || errs.some((e) => e.includes(c.expectError!)));
  if (!ok) failures.push({ suite: 'director-plans', id: c.id, description: c.description, errors: errs });
  return ok;
});

// ── 3. Item rules: seed bank as known-good, scripted defects as known-bad ──

function toDraft(it: SeedItem): DraftItem {
  return {
    stem: it.stem,
    code: it.code ?? null,
    codeLanguage: it.code ? 'python' : null,
    options: it.options.map(([text, mis, feedback]) => ({
      text,
      correct: mis === null,
      misconceptionId: mis,
      feedback: feedback ?? (mis === null ? 'Correct.' : 'Not quite.'),
    })),
    explanation: it.explanation,
    hints: [...it.hints],
    level: it.level,
    bloom: 'apply',
    citations: [],
  };
}

type Mutation = { name: string; apply: (d: DraftItem, c: SeedConcept, other: string) => DraftItem | null };
const wrongIndex = (d: DraftItem) => d.options.findIndex((o) => !o.correct);
const MUTATIONS: Mutation[] = [
  { name: 'two correct options', apply: (d) => ({ ...d, options: d.options.map((o, i) => (i === wrongIndex(d) ? { ...o, correct: true, misconceptionId: null } : o)) }) },
  { name: 'letter-prefixed options', apply: (d) => ({ ...d, options: d.options.map((o, i) => ({ ...o, text: `${'ABCD'[i]}) ${o.text}` })) }) },
  {
    name: 'answer given away in stem',
    apply: (d) => {
      const key = d.options.find((o) => o.correct)!.text;
      return key.length > 12 ? { ...d, stem: `${d.stem} (Hint: ${key})` } : null;
    },
  },
  { name: 'invented misconception tag', apply: (d) => ({ ...d, options: d.options.map((o, i) => (i === wrongIndex(d) ? { ...o, misconceptionId: 'made-up-misconception' } : o)) }) },
  { name: 'duplicate of an existing stem', apply: (d, _c, other) => ({ ...d, stem: other }) },
  {
    name: 'correct option much longer',
    // The length rule is for 4-option items; true/false answers are one word by nature.
    apply: (d) => d.options.length !== 4 ? null : ({ ...d, options: d.options.map((o) => (o.correct ? { ...o, text: `${o.text}, which holds in every case because the reasoning above applies step by step without exception` } : o)) }),
  },
  { name: '"all of the above" option', apply: (d) => ({ ...d, options: d.options.map((o, i) => (i === wrongIndex(d) ? { ...o, text: 'All of the above' } : o)) }) },
  { name: 'untagged distractors', apply: (d) => (d.options.length === 4 ? { ...d, options: d.options.map((o) => (o.correct ? o : { ...o, misconceptionId: null })) } : null) },
  { name: 'citation not retrieved', apply: (d) => ({ ...d, citations: ['chunk-never-retrieved'] }) },
];

const allStems = DSA_CONCEPTS.flatMap((c) => c.items.map((i) => i.stem));
const goodOk: boolean[] = [];
const badCaught: Record<string, boolean[]> = Object.fromEntries(MUTATIONS.map((m) => [m.name, []]));

for (const c of DSA_CONCEPTS) {
  const ids = c.misconceptions.map((m) => m.id);
  c.items.forEach((it, idx) => {
    const draft = toDraft(it);
    const ctx = { misconceptionIds: ids, existingStems: allStems.filter((s) => s !== it.stem), retrievedChunkIds: new Set<string>() };
    const errs = validateDraft(draft, ctx);
    goodOk.push(errs.length === 0);
    if (errs.length) failures.push({ suite: 'items-good', concept: c.slug, item: idx, stem: it.stem.slice(0, 80), errors: errs });

    const other = c.items[(idx + 1) % c.items.length]!.stem;
    for (const m of MUTATIONS) {
      const bad = m.apply(structuredClone(draft), c, other);
      if (!bad) continue;
      // The duplicate-stem defect only counts against the existing bank.
      const caught = validateDraft(bad, ctx).length > 0;
      badCaught[m.name]!.push(caught);
      if (!caught) failures.push({ suite: 'items-bad', defect: m.name, concept: c.slug, item: idx });
    }
  });
}
const allBad = Object.values(badCaught).flat();

// ── Report ─────────────────────────────────────────────────────────────────

const metrics: Metric[] = [
  { name: 'Leak guard: direct leaks caught', value: share(byKind('direct').map((r) => r.flagged)), threshold: ['>=', 1], format: 'pct', note: `${byKind('direct').length} cases` },
  { name: 'Leak guard: safe replies flagged (false positives)', value: share(byKind('safe').map((r) => r.flagged)), threshold: ['<=', 0], format: 'pct', note: `${byKind('safe').length} cases` },
  { name: 'Leak guard: paraphrased leaks caught', value: share(byKind('paraphrase').map((r) => r.flagged)), format: 'pct', note: 'needs the LLM judge; report only' },
  { name: 'Director plan rules: agreement with labels', value: share(planResults), threshold: ['>=', 1], format: 'pct', note: `${planResults.length} cases` },
  { name: 'Item rules: seed items accepted', value: share(goodOk), threshold: ['>=', 0.9], format: 'pct', note: `${goodOk.length} items; EVALS: false-reject ≤ 10%` },
  { name: 'Item rules: defective drafts rejected', value: share(allBad), threshold: ['>=', 1], format: 'pct', note: `${allBad.length} drafts` },
];

finish({
  suite: 'guards',
  startedAt: new Date().toISOString(),
  config: { leakCases: leakCases.length, planCases: planCases.length, seedItems: goodOk.length, mutations: MUTATIONS.length },
  metrics,
  tables: [
    {
      title: 'Item defects: caught by validateDraft',
      header: ['Defect', 'Drafts', 'Caught'],
      rows: Object.entries(badCaught).map(([k, v]) => [k, v.length, `${v.filter(Boolean).length}/${v.length}`]),
    },
  ],
  failures,
  notes: [
    'Paraphrased leaks (e.g. "the second option", eliminating the others) are beyond a string guard by design; EVALS §4 assigns them to an LLM judge in the tutor suite.',
  ],
});
