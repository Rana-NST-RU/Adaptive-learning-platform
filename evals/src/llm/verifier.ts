// ─────────────────────────────────────────────────────────────────────────────
// Item Verifier suite (docs/EVALS.md §2). Calls Claude.
// Known-good items: the hand-written seed bank. Known-bad items: the same
// items with defects only judgement can catch (they pass every structural
// rule in validateDraft):
//   wrong key           a distractor is marked correct
//   two defensible      a distractor is replaced by a restatement of the key
//   false explanation   the explanation argues for a wrong option
// Metrics: recall on known-bad (≥ 90%) and false rejects on known-good (≤ 10%).
//
//   EVAL_MAX_USD=2 EVAL_LIMIT=8 npm run eval:verifier
// ─────────────────────────────────────────────────────────────────────────────

import { verifyItem } from '../../../apps/web/src/server/agents/items/verifier';
import type { DraftItem } from '../../../apps/web/src/server/agents/items/rules';
import { DSA_CONCEPTS, type SeedItem } from '../../../apps/web/src/server/db/seed/dsa';
import { BudgetStop, evalRun, requireCredential, Spend } from '../lib/budget';
import { finish, type Metric } from '../lib/report';

requireCredential('verifier');

const LIMIT = Number(process.env.EVAL_LIMIT ?? 8); // items per class (good, and each defect)

function toDraft(it: SeedItem): DraftItem {
  return {
    stem: it.stem,
    code: it.code ?? null,
    codeLanguage: it.code ? 'python' : null,
    options: it.options.map(([text, mis, feedback]) => ({ text, correct: mis === null, misconceptionId: mis, feedback: feedback ?? (mis === null ? 'Correct.' : 'Not quite.') })),
    explanation: it.explanation,
    hints: [...it.hints],
    level: it.level,
    bloom: 'apply',
    citations: [],
  };
}

const DEFECTS: Record<string, (d: DraftItem) => DraftItem | null> = {
  'wrong key': (d) => {
    const k = d.options.findIndex((o) => o.correct);
    const w = d.options.findIndex((o) => !o.correct);
    return {
      ...d,
      options: d.options.map((o, i) =>
        i === k ? { ...o, correct: false, misconceptionId: d.options[w]!.misconceptionId } : i === w ? { ...o, correct: true, misconceptionId: null } : o,
      ),
    };
  },
  'two defensible answers': (d) => {
    if (d.options.length !== 4) return null;
    const key = d.options.find((o) => o.correct)!;
    const w = d.options.findIndex((o) => !o.correct);
    return { ...d, options: d.options.map((o, i) => (i === w ? { ...o, text: `In other words: ${key.text}` } : o)) };
  },
  'false explanation': (d) => {
    const wrong = d.options.find((o) => !o.correct)!;
    return { ...d, explanation: `The answer is "${wrong.text}". ${d.explanation.split('.').slice(1).join('.').trim()}`.trim() };
  },
};

// Spread the sample across concepts deterministically.
const pool = DSA_CONCEPTS.flatMap((c) => c.items.map((it, i) => ({ c, it, key: `${c.slug}#${i}` })));
const stride = (n: number, offset: number) => Array.from({ length: Math.min(n, pool.length) }, (_, i) => pool[(i * Math.floor(pool.length / n) + offset) % pool.length]!);

type Case = { id: string; label: 'good' | string; draft: DraftItem; concept: (typeof DSA_CONCEPTS)[number] };
const cases: Case[] = [
  ...stride(LIMIT, 0).map((p) => ({ id: p.key, label: 'good', draft: toDraft(p.it), concept: p.c })),
  ...Object.entries(DEFECTS).flatMap(([name, mut], k) =>
    stride(LIMIT, k + 1).flatMap((p) => {
      const d = mut(toDraft(p.it));
      return d ? [{ id: `${p.key}:${name}`, label: name, draft: d, concept: p.c }] : [];
    }),
  ),
];

const spend = new Spend();
const startedAt = new Date().toISOString();
const results: Array<{ id: string; label: string; accepted: boolean; notes: string }> = [];
let stopped: string | null = null;

for (const c of cases) {
  try {
    spend.check();
    const run = evalRun('verifier', spend);
    const { decision } = await verifyItem(run, c.draft, { name: c.concept.name, misconceptions: c.concept.misconceptions }, []);
    results.push({ id: c.id, label: c.label, accepted: decision.accept, notes: decision.notes.split('\n')[0]! });
    console.log(`${c.id}: ${decision.accept ? 'accepted' : 'rejected'} ($${spend.usd.toFixed(3)})`);
  } catch (e) {
    if (e instanceof BudgetStop) {
      stopped = e.message;
      break;
    }
    // An agent error counts as "not accepted": the pipeline would not publish the item.
    results.push({ id: c.id, label: c.label, accepted: false, notes: `error: ${(e as Error).message.slice(0, 160)}` });
  }
}

const good = results.filter((r) => r.label === 'good');
const bad = results.filter((r) => r.label !== 'good');
const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : NaN);
const metrics: Metric[] = [
  { name: 'Known-bad items rejected (recall)', value: share(bad.map((r) => !r.accepted)), threshold: ['>=', 0.9], format: 'pct', note: `${bad.length} items` },
  { name: 'Known-good items rejected (false rejects)', value: share(good.map((r) => !r.accepted)), threshold: ['<=', 0.1], format: 'pct', note: `${good.length} items` },
  { name: 'Spend', value: spend.usd, format: 'usd', note: `${spend.calls} calls, cap $${spend.max}` },
];

finish({
  suite: 'verifier',
  startedAt,
  config: { perClass: LIMIT, defects: Object.keys(DEFECTS), model: evalRun('verifier', spend).model, maxUsd: spend.max },
  metrics,
  tables: [
    {
      title: 'By defect',
      header: ['Class', 'Items', 'Rejected'],
      rows: ['good', ...Object.keys(DEFECTS)].map((l) => {
        const rs = results.filter((r) => r.label === l);
        return [l, rs.length, `${rs.filter((r) => !r.accepted).length}/${rs.length}`];
      }),
    },
  ],
  failures: results.filter((r) => (r.label === 'good') === !r.accepted).map((r) => ({ id: r.id, label: r.label, accepted: r.accepted, notes: r.notes })),
  notes: [...(stopped ? [`Stopped early: ${stopped}. Metrics cover the items completed.`] : []), ...spend.notes()],
});
