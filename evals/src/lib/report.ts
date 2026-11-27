// Eval reports: every suite produces metrics with thresholds. Gated metrics
// decide the exit code (CI fails on a regression); ungated ones are reported
// so they can be watched before they are trusted. Output goes to
// evals/reports/<suite>.json and .md (the .md is meant for PR descriptions).

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Metric {
  name: string;
  value: number;
  /** Pass condition, e.g. ['>=', 0.85]. Omit for report-only metrics. */
  threshold?: ['>=' | '<=', number];
  /** Gated metrics fail the run when they miss their threshold. Default true when a threshold exists. */
  gate?: boolean;
  /** Aspirational target from docs/EVALS.md, shown next to the gate but never failing the run. */
  target?: ['>=' | '<=', number];
  /** How to print the value. */
  format?: 'pct' | 'num' | 'int' | 'usd';
  note?: string;
}

export interface Report {
  suite: string;
  startedAt: string;
  finishedAt: string;
  config: Record<string, unknown>;
  metrics: Array<Metric & { pass: boolean | null }>;
  tables?: Array<{ title: string; header: string[]; rows: Array<Array<string | number>> }>;
  failures?: Array<Record<string, unknown>>;
  notes?: string[];
}

export const REPORT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../reports');

export function fmt(v: number, f: Metric['format'] = 'num'): string {
  if (!Number.isFinite(v)) return 'n/a';
  switch (f) {
    case 'pct':
      return `${(v * 100).toFixed(1)}%`;
    case 'int':
      return String(Math.round(v));
    case 'usd':
      return `$${v.toFixed(3)}`;
    default:
      return v.toFixed(3);
  }
}

function judge(m: Metric): boolean | null {
  if (!m.threshold) return null;
  if (!Number.isFinite(m.value)) return false;
  const [op, t] = m.threshold;
  return op === '>=' ? m.value >= t : m.value <= t;
}

export function finish(r: Omit<Report, 'metrics' | 'finishedAt'> & { metrics: Metric[] }): never {
  const metrics = r.metrics.map((m) => ({ ...m, pass: judge(m) }));
  const report: Report = { ...r, metrics, finishedAt: new Date().toISOString() };
  const failedGates = metrics.filter((m) => m.pass === false && m.gate !== false);

  const md: string[] = [
    `## Eval: ${r.suite}`,
    '',
    `| Metric | Value | Gate | Status | Target | Meets target |`,
    `|---|---|---|---|---|---|`,
    ...metrics.map((m) => {
      const th = m.threshold ? `${m.threshold[0]} ${fmt(m.threshold[1], m.format)}` : '—';
      const status = m.pass === null ? 'report' : m.pass ? '✅ pass' : m.gate === false ? '⚠️ below (not gated)' : '❌ FAIL';
      const tg = m.target ? `${m.target[0]} ${fmt(m.target[1], m.format)}` : '—';
      const meets = m.target ? (judge({ ...m, threshold: m.target }) ? '✅' : '❌ not yet') : '—';
      return `| ${m.name}${m.note ? ` (${m.note})` : ''} | ${fmt(m.value, m.format)} | ${th} | ${status} | ${tg} | ${meets} |`;
    }),
  ];
  for (const t of r.tables ?? []) {
    md.push('', `### ${t.title}`, '', `| ${t.header.join(' | ')} |`, `|${t.header.map(() => '---').join('|')}|`, ...t.rows.map((row) => `| ${row.join(' | ')} |`));
  }
  if (r.failures?.length) {
    md.push('', `### Failing cases (${r.failures.length})`, '', ...r.failures.slice(0, 25).map((f) => `- \`${JSON.stringify(f).slice(0, 300)}\``));
  }
  if (r.notes?.length) md.push('', '### Notes', '', ...r.notes.map((n) => `- ${n}`));
  md.push('', `Config: \`${JSON.stringify(r.config)}\``);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(path.join(REPORT_DIR, `${r.suite}.json`), JSON.stringify(report, null, 2));
  writeFileSync(path.join(REPORT_DIR, `${r.suite}.md`), md.join('\n') + '\n');
  console.log(md.join('\n'));
  console.log(`\nReport: evals/reports/${r.suite}.{json,md}`);
  if (failedGates.length) {
    console.error(`\n${failedGates.length} gated metric(s) failed: ${failedGates.map((m) => m.name).join(', ')}`);
    process.exit(1);
  }
  process.exit(0);
}
