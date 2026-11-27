// ─────────────────────────────────────────────────────────────────────────────
// Conductor: the code-level (non-LLM) orchestrator. It turns learner events
// into durable jobs and routes jobs to agent handlers. Rules:
//   • nothing here may block the learner's next question
//   • jobs are deduplicated per slot (e.g. one refill per concept at a time)
//   • a missing handler (e.g. no API key) marks the job done-as-skipped
// See docs/ARCHITECTURE.md §3 and §4.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db';

export type ConductorEvent =
  | { type: 'pool_low'; userId: string; conceptId: string; idealDifficulty: number }
  | { type: 'misconception_repeat'; userId: string; conceptId: string; misconceptionId: string; count: number }
  | { type: 'struggling'; userId: string; sessionId: string; conceptId: string }
  | { type: 'affect_changed'; userId: string; sessionId: string; from: string; to: string }
  | { type: 'mastered'; userId: string; sessionId: string; conceptId: string }
  | { type: 'session_started'; userId: string; sessionId: string }
  | { type: 'session_ended'; userId: string; sessionId: string };

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/** Agents register here (see server/agents/register.ts). */
export function registerJobHandler(kind: string, fn: JobHandler) {
  handlers.set(kind, fn);
}

/** Minimum minutes between two jobs for the same slot (dedupe key). */
const COOLDOWN_MINUTES: Record<string, number> = {
  author_items: 15,
  director_replan: 2,
  remember: 60,
};

/** Event → job routing table. */
function route(e: ConductorEvent): Array<{ kind: string; dedupeKey: string | null; payload: Record<string, unknown> }> {
  switch (e.type) {
    case 'pool_low':
      return [{ kind: 'author_items', dedupeKey: `author:${e.conceptId}`, payload: e }];
    case 'misconception_repeat':
      return [
        { kind: 'author_items', dedupeKey: `author:${e.conceptId}:${e.misconceptionId}`, payload: { ...e, targetMisconceptionId: e.misconceptionId } },
        { kind: 'remember', dedupeKey: `remember:${e.userId}:${e.misconceptionId}`, payload: e },
      ];
    case 'struggling':
    case 'affect_changed':
    case 'mastered':
    case 'session_started':
      return [{ kind: 'director_replan', dedupeKey: `director:${e.sessionId}`, payload: e }];
    case 'session_ended':
      return [{ kind: 'coach_reflect', dedupeKey: `coach:${e.sessionId}`, payload: e }];
  }
}

let agentsLoaded: Promise<void> | null = null;
/** Lazy import breaks the conductor ⇄ agents import cycle. */
function ensureAgents() {
  agentsLoaded ??= import('../agents/register').then((m) => m.registerAgents());
  return agentsLoaded;
}

export async function emit(...events: ConductorEvent[]) {
  await ensureAgents();
  // Only queue work some agent can actually do (none are registered when no
  // Claude credential is configured), so the queue doesn't fill with no-ops.
  const rows = events.flatMap(route).filter((r) => handlers.has(r.kind));
  if (rows.length === 0) return;
  for (const r of rows) {
    // Cooldown: don't redo the same slot soon after it last ran. Without this,
    // a thin item pool triggers an Author run on nearly every question.
    const cooldownMin = COOLDOWN_MINUTES[r.kind] ?? 0;
    if (r.dedupeKey && cooldownMin > 0) {
      const recent = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from jobs
        where dedupe_key = ${r.dedupeKey} and status in ('done', 'failed')
          and created_at > now() - make_interval(mins => ${cooldownMin})`);
      if ((recent[0]?.n ?? 0) > 0) continue;
    }
    // ON CONFLICT on the partial unique index keeps one active job per slot.
    await db
      .insert(schema.jobs)
      .values({ kind: r.kind, dedupeKey: r.dedupeKey, payload: r.payload })
      .onConflictDoNothing();
  }
  kick();
}

let draining = false;

/** Process queued jobs in-process, in the background. */
export function kick() {
  if (draining) return;
  draining = true;
  setImmediate(() => {
    drain()
      .catch((e) => console.error('[conductor] drain failed', e))
      .finally(() => {
        draining = false;
      });
  });
}

const MAX_ATTEMPTS = 3;

async function claim() {
  // SKIP LOCKED makes this safe with several app instances.
  const rows = await db.execute<{ id: string }>(sql`
    update jobs set status = 'running', attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'queued' and run_after <= now()
      order by created_at
      for update skip locked
      limit 1
    )
    returning id`);
  const id = rows[0]?.id;
  if (!id) return null;
  return db.query.jobs.findFirst({ where: eq(schema.jobs.id, id) });
}

export async function drain(maxJobs = 20) {
  for (let i = 0; i < maxJobs; i++) {
    const job = await claim();
    if (!job) return;
    const fn = handlers.get(job.kind);
    if (!fn) {
      await db.update(schema.jobs).set({ status: 'done', error: 'no handler (agents disabled?)' }).where(eq(schema.jobs.id, job.id));
      continue;
    }
    try {
      await fn(job.payload);
      await db.update(schema.jobs).set({ status: 'done', error: null }).where(eq(schema.jobs.id, job.id));
    } catch (e) {
      const failed = job.attempts >= MAX_ATTEMPTS;
      await db
        .update(schema.jobs)
        .set({
          status: failed ? 'failed' : 'queued',
          error: (e as Error).message.slice(0, 2000),
          runAfter: new Date(Date.now() + 2 ** job.attempts * 5_000),
        })
        .where(eq(schema.jobs.id, job.id));
    }
  }
}

export async function pendingJobs() {
  return db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.status, 'queued'), lte(schema.jobs.runAfter, new Date())))
    .orderBy(asc(schema.jobs.createdAt));
}
