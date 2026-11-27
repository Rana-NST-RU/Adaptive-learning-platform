// ─────────────────────────────────────────────────────────────────────────────
// Learning Director agent (docs/ARCHITECTURE.md §3 #1, §4.5).
// The orchestrator of a live session. Woken by the Conductor on
// session_started · struggling · affect_changed · mastered, it reads a
// snapshot of the learner model and decides whether to re-plan the next few
// minutes. It never picks questions: it sets a bounded, expiring override
// (focus concept, ±0.1 success target, UX mode) that the engine applies.
// This file loads the snapshot from Postgres and applies the decision; the
// decision itself (prompt, tools, validation) lives in decide.ts.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import {
  calibration,
  chooseNextAction,
  detectAffect,
  effectiveMastery,
  isDue,
  statusOf,
  BASE_TARGET,
} from '@alp/engine';
import { db, schema } from '../../db';
import type { SessionPlan } from '../../db/schema';
import { emit } from '../../conductor';
import { readMemory } from '../../learner/memory';
import { loadGraph, loadStates, recentSignals, sessionSignals } from '../../learner/repo';
import { withAgentRun } from '../runtime';
import { decidePlan, type DirectorSnapshot } from './decide';

export { DIRECTOR_SYSTEM } from './decide';

export interface ReplanRequest {
  userId: string;
  sessionId: string;
  trigger: string;
  /** Event detail (e.g. which concept was mastered). */
  detail?: Record<string, unknown>;
}

export interface ReplanOutput {
  applied: boolean;
  plan?: SessionPlan;
  reason?: string;
}

export async function replanSession(req: ReplanRequest) {
  const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, req.sessionId) });
  if (!session || session.endedAt || session.userId !== req.userId) return null;

  const { nodes, byId, concepts } = await loadGraph(session.courseId);
  const [states, signals, allSignals, memory, profile, course] = await Promise.all([
    loadStates(req.userId, nodes.map((n) => n.id)),
    sessionSignals(req.sessionId),
    recentSignals(req.userId),
    readMemory(req.userId, 8),
    db.query.learnerProfiles.findFirst({ where: eq(schema.learnerProfiles.userId, req.userId) }),
    db.query.courses.findFirst({ where: eq(schema.courses.id, session.courseId) }),
  ]);

  const now = new Date();
  const minutes = (now.getTime() - session.startedAt.getTime()) / 60_000;
  const affect = detectAffect(signals);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const slugOf = new Map(concepts.map((c) => [c.id, c.slug]));

  // What the engine would do on its own, ignoring any current plan.
  const engineView = chooseNextAction({
    nodes, states, recent: signals, affect: affect.state, now,
    sessionMinutes: minutes, questionsThisSession: signals.length,
  });

  const poolRows = await db
    .select({ conceptId: schema.items.conceptId })
    .from(schema.items)
    .where(and(eq(schema.items.status, 'active'), inArray(schema.items.conceptId, nodes.map((n) => n.id))));
  const poolSize = new Map<string, number>();
  for (const r of poolRows) poolSize.set(r.conceptId, (poolSize.get(r.conceptId) ?? 0) + 1);

  const currentPlan = session.plan && (!session.plan.expiresAt || new Date(session.plan.expiresAt) > now) ? session.plan : null;

  const snapshot: DirectorSnapshot = {
    trigger: req.trigger,
    event: describeTrigger(req, (id) => byId.get(id)?.name ?? id),
    course: course?.title ?? 'unknown',
    goal: profile?.goal ?? null,
    session: signals.length
      ? `${signals.length} answered, ${signals.filter((a) => a.correct).length} correct, ${Math.round(minutes)} min in; last 5: ${signals
          .slice(-5)
          .map((a) => (a.correct ? '✓' : '✗'))
          .join('')}`
      : `just started (${Math.round(minutes)} min)`,
    dailyGoalMinutes: profile?.dailyGoalMinutes ?? 20,
    affect: { state: affect.state, confidence: affect.confidence, evidence: affect.evidence },
    calibration: calibration(allSignals).label,
    engine: {
      kind: engineView.kind,
      conceptSlug: engineView.conceptId ? (slugOf.get(engineView.conceptId) ?? null) : null,
      targetSuccess: engineView.targetSuccess,
      baseTarget: BASE_TARGET,
      reasons: engineView.reasons,
    },
    currentPlan: currentPlan ? { headline: currentPlan.headline, by: currentPlan.by, expiresAt: currentPlan.expiresAt ?? null } : null,
    concepts: concepts.map((c) => {
      const s = states[c.id]!;
      return {
        slug: c.slug,
        id: c.id,
        name: c.name,
        status: statusOf(nodeById.get(c.id)!, states, (x) => effectiveMastery(x, now)),
        mastery: effectiveMastery(s, now),
        attempts: s.attempts,
        correct: s.correct,
        streak: s.streak,
        due: isDue(s.memory, now),
        pool: poolSize.get(c.id) ?? 0,
        mistakes: Object.entries(s.misconceptions)
          .filter(([, n]) => n > 0)
          .map(([id, n]) => `${c.misconceptions.find((m) => m.id === id)?.description ?? id} (×${n})`),
        misconceptionIds: c.misconceptions.map((m) => m.id),
      };
    }),
    memory: memory.map((m) => ({ source: m.source, note: m.note })),
  };

  return withAgentRun<ReplanOutput>(
    { agent: 'director', trigger: req.trigger, userId: req.userId, input: { sessionId: req.sessionId, trigger: req.trigger, detail: req.detail ?? null } },
    async (run) => {
      const { decision } = await decidePlan(run, snapshot, {
        onRequestItems: (c, misconceptionId) => {
          const st = states[c.id]!;
          if (misconceptionId) {
            void emit({ type: 'misconception_repeat', userId: req.userId, conceptId: c.id, misconceptionId, count: st.misconceptions[misconceptionId] ?? 0 });
          } else {
            // Item difficulty that gives P(correct) ≈ base target for this learner.
            const idealDifficulty = st.ability - Math.log(BASE_TARGET / (1 - BASE_TARGET));
            void emit({ type: 'pool_low', userId: req.userId, conceptId: c.id, idealDifficulty });
          }
        },
      });

      if (decision?.kind === 'plan') {
        // Only apply to a session that is still live.
        const live = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, req.sessionId) });
        if (!live || live.endedAt) return { output: { applied: false, reason: 'session ended' } };
        await db.update(schema.sessions).set({ plan: decision.plan }).where(eq(schema.sessions.id, req.sessionId));
        return { output: { applied: true, plan: decision.plan }, summary: `Re-planned your session: ${decision.plan.headline}` };
      }
      return {
        output: { applied: false, reason: decision?.kind === 'keep' ? decision.reason : 'no decision' },
        summary: decision?.kind === 'keep' ? 'Checked your session plan: on track' : undefined,
      };
    },
  );
}

function describeTrigger(req: ReplanRequest, nameOf: (id: string) => string): string {
  const d = req.detail ?? {};
  switch (req.trigger) {
    case 'session_started':
      return 'session started: set an opening plan if it would help';
    case 'struggling':
      return `the learner is struggling on "${nameOf(String(d.conceptId))}" (repeated errors or a memory lapse)`;
    case 'affect_changed':
      return `the learner's state shifted: UX mode went from ${String(d.from)} to ${String(d.to)}`;
    case 'mastered':
      return `milestone: the learner just mastered "${nameOf(String(d.conceptId))}"`;
    default:
      return req.trigger;
  }
}
