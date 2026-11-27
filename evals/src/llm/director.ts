// ─────────────────────────────────────────────────────────────────────────────
// Learning Director decision suite (docs/EVALS.md §5). Calls Claude.
// Each fixture in goldens/director-decisions.jsonl is a labelled learner
// situation with the set of acceptable decisions. The real decidePlan (same
// prompt, tools and validation as production) runs on it; a deterministic
// grader checks the decision. Repeats measure consistency.
//
//   EVAL_MAX_USD=2 EVAL_REPEATS=1 npm run eval:director
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AffectState, ConceptStatus, UxMode } from '@alp/engine';
import { decidePlan, type DecideResult, type DirectorSnapshot } from '../../../apps/web/src/server/agents/director/decide';
import { DSA_CONCEPTS } from '../../../apps/web/src/server/db/seed/dsa';
import { BudgetStop, evalRun, requireCredential, Spend } from '../lib/budget';
import { finish, type Metric } from '../lib/report';

requireCredential('director');

type DeltaRule = 'any' | 'not_harder' | 'not_easier' | 'small' | 'not_easier_than_recovery';
interface Fixture {
  id: string;
  description: string;
  trigger: string;
  event: string;
  affect: { state: AffectState; confidence: number; evidence: string[] };
  session: string;
  calibration: string;
  engine: { kind: string; conceptSlug: string | null; targetSuccess: number; reasons: string[] };
  currentPlan: DirectorSnapshot['currentPlan'];
  concepts: Record<string, Partial<DirectorSnapshot['concepts'][number]> & { status: ConceptStatus }>;
  memory: Array<{ source: string; note: string }>;
  accept: { decisions: Array<'plan' | 'keep'>; delta: DeltaRule; modes: Array<UxMode | null>; focus: Array<string | null>; requestItems?: string };
}

const GOLDENS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../goldens');
const fixtures = readFileSync(path.join(GOLDENS, 'director-decisions.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as Fixture);
const only = process.env.EVAL_ONLY?.split(',');
const cases = only ? fixtures.filter((f) => only.includes(f.id)) : fixtures;
const REPEATS = Math.max(1, Number(process.env.EVAL_REPEATS ?? 1));

/** Expand a compact fixture into the full snapshot the Director sees. */
function snapshotOf(f: Fixture): DirectorSnapshot {
  return {
    trigger: f.trigger,
    event: f.event,
    course: 'DSA Foundations',
    goal: 'Solve common data-structure and algorithm problems confidently',
    session: f.session,
    dailyGoalMinutes: 20,
    affect: f.affect,
    calibration: f.calibration,
    engine: { ...f.engine, baseTarget: 0.72 },
    currentPlan: f.currentPlan,
    concepts: DSA_CONCEPTS.map((c) => {
      const o = f.concepts[c.slug];
      return {
        slug: c.slug,
        id: `id-${c.slug}`,
        name: c.name,
        status: o?.status ?? 'locked',
        mastery: o?.mastery ?? 0.1,
        attempts: o?.attempts ?? 0,
        correct: o?.correct ?? 0,
        streak: o?.streak ?? 0,
        due: o?.due ?? false,
        pool: o?.pool ?? 3,
        mistakes: o?.mistakes ?? [],
        misconceptionIds: c.misconceptions.map((m) => m.id),
      };
    }),
    memory: f.memory,
  };
}

function grade(f: Fixture, r: DecideResult): string[] {
  const why: string[] = [];
  const d = r.decision;
  if (!d) return ['no decision (neither set_session_plan accepted nor keep_current_plan)'];
  if (!f.accept.decisions.includes(d.kind)) why.push(`decision "${d.kind}" not in [${f.accept.decisions.join(', ')}]`);
  if (d.kind === 'plan') {
    const p = d.plan;
    const delta = p.targetDelta ?? 0;
    const mode = p.modeOverride ?? null;
    const ok: Record<DeltaRule, boolean> = {
      any: true,
      not_harder: delta >= 0 && mode !== 'challenge',
      not_easier: delta <= 0 && mode !== 'recovery',
      small: Math.abs(delta) <= 0.05,
      not_easier_than_recovery: delta <= 0.05 && mode !== 'recovery',
    };
    if (!ok[f.accept.delta]) why.push(`difficulty rule "${f.accept.delta}" broken (targetDelta ${delta}, mode ${mode})`);
    if (!f.accept.modes.includes(mode)) why.push(`mode ${mode} not acceptable`);
    const focus = p.focusConceptId ? p.focusConceptId.replace(/^id-/, '') : null;
    if (!f.accept.focus.includes(focus)) why.push(`focus ${focus} not acceptable`);
  }
  if (f.accept.requestItems && !r.requests.some((q) => q.concept === f.accept.requestItems)) {
    why.push(`expected request_items for ${f.accept.requestItems}`);
  }
  return why;
}

const signature = (r: DecideResult) =>
  r.decision?.kind === 'plan' ? `plan:${r.decision.plan.modeOverride ?? '-'}:${Math.sign(r.decision.plan.targetDelta ?? 0)}` : (r.decision?.kind ?? 'none');

const spend = new Spend();
const startedAt = new Date().toISOString();
const rows: Array<{ id: string; pass: boolean; why: string[]; sig: string; firstDraftOk: boolean | null; drafts: number }> = [];
const consistency: boolean[] = [];
let stopped: string | null = null;

outer: for (const f of cases) {
  const sigs: string[] = [];
  for (let k = 0; k < REPEATS; k++) {
    try {
      spend.check();
      const run = evalRun('director', spend);
      const r = await decidePlan(run, snapshotOf(f), { now: () => new Date('2026-11-28T10:00:00Z') });
      const why = grade(f, r);
      rows.push({ id: f.id, pass: why.length === 0, why, sig: signature(r), firstDraftOk: r.attempts.length ? r.attempts[0]!.errors.length === 0 : null, drafts: r.attempts.length });
      sigs.push(signature(r));
      console.log(`${f.id} #${k + 1}: ${why.length ? `FAIL ${why.join('; ')}` : 'pass'} (${signature(r)}, $${spend.usd.toFixed(3)})`);
    } catch (e) {
      if (e instanceof BudgetStop) {
        stopped = e.message;
        break outer;
      }
      rows.push({ id: f.id, pass: false, why: [`error: ${(e as Error).message.slice(0, 200)}`], sig: 'error', firstDraftOk: null, drafts: 0 });
      sigs.push('error');
    }
  }
  if (sigs.length > 1) consistency.push(sigs.every((s) => s === sigs[0]));
}

const share = (xs: boolean[]) => (xs.length ? xs.filter(Boolean).length / xs.length : NaN);
const withDrafts = rows.filter((r) => r.firstDraftOk !== null);
const metrics: Metric[] = [
  { name: 'Decisions within the acceptable set', value: share(rows.map((r) => r.pass)), threshold: ['>=', 0.8], target: ['>=', 0.9], format: 'pct', note: `${rows.length} runs` },
  { name: 'Runs ending in a valid decision', value: share(rows.map((r) => r.sig !== 'none' && r.sig !== 'error')), threshold: ['>=', 1], format: 'pct' },
  { name: 'First plan draft passed the rules', value: share(withDrafts.map((r) => r.firstDraftOk!)), format: 'pct', note: 'report: how often the guardrails had to step in' },
  ...(consistency.length ? [{ name: 'Consistency across repeats', value: share(consistency), threshold: ['>=', 0.8] as ['>=', number], format: 'pct' as const, note: `${REPEATS} repeats` }] : []),
  { name: 'Spend', value: spend.usd, format: 'usd', note: `${spend.calls} calls, cap $${spend.max}` },
];

finish({
  suite: 'director',
  startedAt,
  config: { fixtures: cases.length, repeats: REPEATS, model: evalRun('director', spend).model, maxUsd: spend.max },
  metrics,
  tables: [{ title: 'Per fixture', header: ['Fixture', 'Result', 'Decision', 'Drafts', 'Why'], rows: rows.map((r) => [r.id, r.pass ? '✅' : '❌', r.sig, r.drafts, r.why.join('; ') || '—']) }],
  failures: rows.filter((r) => !r.pass).map((r) => ({ id: r.id, why: r.why })),
  notes: [
    ...(stopped ? [`Stopped early: ${stopped}. Metrics cover the runs completed.`] : []),
    'Labels are the author’s first pass and should be reviewed by an educator (EVALS §5 asks for ~80 educator-labelled snapshots).',
    ...spend.notes(),
  ],
});
