// ─────────────────────────────────────────────────────────────────────────────
// Learner service: the hot path. Every step and every answer runs through the
// deterministic engine. No LLM call is on this path. Agents are woken
// asynchronously through the Conductor (docs/ARCHITECTURE.md §4.2).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  applyAttempt,
  calibration,
  chooseNextAction,
  deriveUxPolicy,
  detectAffect,
  effectiveMastery,
  retrievability,
  selectItem,
  statusOf,
  isDue,
  type AffectEstimate,
  type NextAction,
  type UxPolicy,
} from '@alp/engine';
import { db, schema } from '../db';
import type { ItemOption, SessionPlan } from '../db/schema';
import { HttpError } from '../auth';
import { emit, type ConductorEvent } from '../conductor';
import { agentsEnabled } from '../agents/runtime';
import { gradeOpenResponse, gradeToCorrect } from '../agents/diagnostician';
import {
  EXPECTED_LATENCY_MS,
  loadGraph,
  loadItemSummaries,
  loadStates,
  recentItemIds,
  recentSignals,
  saveState,
  sessionSignals,
} from './repo';

// ── View models sent to the client (never include answers) ─────────────────

export interface ItemView {
  id: string;
  format: 'mcq' | 'true_false' | 'short_answer' | 'code_output';
  stem: string;
  code: string | null;
  codeLanguage: string | null;
  options: Array<{ id: string; text: string }>;
  hintCount: number;
}

export interface StepView {
  sessionId: string;
  kind: NextAction['kind'];
  concept: { id: string; name: string; summary: string; lesson: string | null } | null;
  item: ItemView | null;
  ux: UxPolicy;
  affect: AffectEstimate;
  why: string[];
  plan: SessionPlan | null;
  progress: { answered: number; correct: number; minutes: number };
  /** Whether AI agents (tutor etc.) are available on this server. */
  agents: boolean;
}

export interface FeedbackView {
  correct: boolean;
  correctOptionId: string | null;
  correctAnswer: string;
  explanation: string;
  optionFeedback: string | null;
  misconception: string | null;
  mastery: { conceptId: string; name: string; before: number; after: number };
  events: string[];
}

function toItemView(row: typeof schema.items.$inferSelect): ItemView {
  return {
    id: row.id,
    format: row.format,
    stem: row.stem,
    code: row.code,
    codeLanguage: row.codeLanguage,
    options: row.options.map((o) => ({ id: o.id, text: o.text })),
    hintCount: row.hints.length,
  };
}

async function getSession(userId: string, sessionId: string) {
  const s = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
  if (!s || s.userId !== userId) throw new HttpError(404, 'Session not found');
  return s;
}

// ── Enrolment & sessions ───────────────────────────────────────────────────

export async function enroll(userId: string, courseId: string) {
  const course = await db.query.courses.findFirst({ where: eq(schema.courses.id, courseId) });
  if (!course || course.status !== 'ready' || (course.ownerId && course.ownerId !== userId)) throw new HttpError(404, 'Course not available');
  await db.insert(schema.enrollments).values({ userId, courseId }).onConflictDoNothing();
  const { nodes } = await loadGraph(courseId);
  await loadStates(userId, nodes.map((n) => n.id)); // initialise priors
  return course;
}

export async function startSession(userId: string, courseId: string): Promise<StepView> {
  const enrolled = await db.query.enrollments.findFirst({
    where: and(eq(schema.enrollments.userId, userId), eq(schema.enrollments.courseId, courseId)),
  });
  if (!enrolled) throw new HttpError(403, 'Not enrolled in this course');

  // Close any session left open.
  await db
    .update(schema.sessions)
    .set({ endedAt: new Date() })
    .where(and(eq(schema.sessions.userId, userId), sql`${schema.sessions.endedAt} is null`));

  const [session] = await db.insert(schema.sessions).values({ userId, courseId }).returning();
  void emit({ type: 'session_started', userId, sessionId: session!.id });
  return nextStep(userId, session!.id);
}

export async function endSession(userId: string, sessionId: string) {
  const s = await getSession(userId, sessionId);
  if (!s.endedAt) {
    const signals = await sessionSignals(sessionId);
    const summary = {
      answered: signals.length,
      correct: signals.filter((a) => a.correct).length,
      minutes: Math.round((Date.now() - s.startedAt.getTime()) / 60_000),
      calibration: calibration(signals),
    };
    await db.update(schema.sessions).set({ endedAt: new Date(), summary, currentItemId: null }).where(eq(schema.sessions.id, sessionId));
    void emit({ type: 'session_ended', userId, sessionId });
    return summary;
  }
  return s.summary;
}

// ── Next step ──────────────────────────────────────────────────────────────

export async function nextStep(userId: string, sessionId: string): Promise<StepView> {
  const session = await getSession(userId, sessionId);
  if (session.endedAt) throw new HttpError(409, 'Session has ended');

  const profile = await db.query.learnerProfiles.findFirst({ where: eq(schema.learnerProfiles.userId, userId) });
  const { nodes, byId } = await loadGraph(session.courseId);
  const conceptIds = nodes.map((n) => n.id);
  const [states, signals, allSignals] = await Promise.all([
    loadStates(userId, conceptIds),
    sessionSignals(sessionId),
    recentSignals(userId),
  ]);

  const now = new Date();
  const minutes = (now.getTime() - session.startedAt.getTime()) / 60_000;
  const affect = detectAffect(signals);
  const plan = session.plan && (!session.plan.expiresAt || new Date(session.plan.expiresAt) > now) ? session.plan : null;

  const action = chooseNextAction({
    nodes,
    states,
    recent: signals,
    affect: affect.state,
    now,
    sessionMinutes: minutes,
    questionsThisSession: signals.length,
    override: plan ? { focusConceptId: plan.focusConceptId ?? undefined, targetDelta: plan.targetDelta, expiresAt: plan.expiresAt } : null,
  });

  const ux = deriveUxPolicy({
    affect,
    action,
    calibration: calibration(allSignals),
    sessionMinutes: minutes,
    questionsThisSession: signals.length,
    dailyGoalMinutes: profile?.dailyGoalMinutes ?? 20,
    modeOverride: plan?.modeOverride ?? null,
  });

  // Affect transitions wake the Learning Director.
  const prevMode = session.lastUx?.mode;
  if (prevMode && prevMode !== ux.mode && signals.length >= 3) {
    void emit({ type: 'affect_changed', userId, sessionId, from: prevMode, to: ux.mode });
  }

  const progress = {
    answered: signals.length,
    correct: signals.filter((a) => a.correct).length,
    minutes: Math.round(minutes),
  };

  let itemRow: typeof schema.items.$inferSelect | null = null;
  const why = [...action.reasons];

  if (action.kind !== 'break' && action.conceptId) {
    const st = states[action.conceptId]!;
    const pool = await loadItemSummaries([action.conceptId]);
    const recent = await recentItemIds(userId);
    const recentSet = new Set(recent.map((r) => r.itemId));
    let choice = selectItem(pool, st, action.targetSuccess, recentSet);

    if (choice.needsGeneration) {
      void emit({ type: 'pool_low', userId, conceptId: action.conceptId, idealDifficulty: choice.idealDifficulty });
    }
    // Everything seen recently: fall back to the least-recently seen item.
    if (!choice.item && pool.length) {
      const lastSeen = new Map<string, number>();
      recent.forEach((r, i) => {
        if (!lastSeen.has(r.itemId)) lastSeen.set(r.itemId, i);
      });
      const oldest = [...pool].sort((a, b) => (lastSeen.get(b.id) ?? 1e9) - (lastSeen.get(a.id) ?? 1e9))[0]!;
      choice = { ...selectItem([oldest], st, action.targetSuccess, new Set()), needsGeneration: true };
      why.push('Repeating an earlier question while fresh ones are being written for you.');
    }
    if (choice.item) {
      itemRow = (await db.query.items.findFirst({ where: eq(schema.items.id, choice.item.id) })) ?? null;
      why.push(choice.why);
    }
  }

  await db
    .update(schema.sessions)
    .set({ currentItemId: itemRow?.id ?? null, currentWhy: why, lastUx: ux })
    .where(eq(schema.sessions.id, sessionId));

  const c = action.conceptId ? byId.get(action.conceptId) : null;
  return {
    sessionId,
    kind: action.kind,
    concept: c ? { id: c.id, name: c.name, summary: c.summary, lesson: c.lesson } : null,
    item: itemRow ? toItemView(itemRow) : null,
    ux,
    affect,
    why,
    plan,
    progress,
    agents: agentsEnabled(),
  };
}

// ── Answer ─────────────────────────────────────────────────────────────────

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9()+*/^.-]+/g, ' ').trim();

function gradeByRule(item: typeof schema.items.$inferSelect, response: string) {
  if (item.format === 'mcq' || item.format === 'true_false' || (item.format === 'code_output' && item.options.length)) {
    const chosen: ItemOption | undefined = item.options.find((o) => o.id === response);
    if (!chosen) throw new HttpError(400, 'Unknown option');
    return { correct: response === item.answer, chosen };
  }
  const r = normalise(response);
  const ok = [item.answer, ...item.acceptable].some((a) => normalise(a) === r);
  return { correct: ok, chosen: undefined };
}

export async function submitAnswer(
  userId: string,
  sessionId: string,
  input: { itemId: string; response: string; confidence: number | null; latencyMs: number; hintsUsed: number },
): Promise<FeedbackView> {
  const session = await getSession(userId, sessionId);
  if (session.endedAt) throw new HttpError(409, 'Session has ended');
  if (session.currentItemId !== input.itemId) throw new HttpError(409, 'That question is no longer active');

  const item = await db.query.items.findFirst({ where: eq(schema.items.id, input.itemId) });
  if (!item) throw new HttpError(404, 'Item not found');

  const { nodes, byId } = await loadGraph(session.courseId);
  const states = await loadStates(userId, nodes.map((n) => n.id));
  const before = states[item.conceptId]!;
  const now = new Date();

  const byRule = gradeByRule(item, input.response);
  let { correct } = byRule;
  const { chosen } = byRule;
  let misconceptionId = !correct ? (chosen?.misconceptionId ?? null) : null;
  let gradedBy: 'rule' | 'agent' = 'rule';
  let agentFeedback: string | null = null;

  // Free text the exact-match rule can't accept goes to the Diagnostician.
  if (item.format === 'short_answer' && !correct && agentsEnabled()) {
    const concept = (await db.query.concepts.findFirst({ where: eq(schema.concepts.id, item.conceptId) }))!;
    try {
      const g = await gradeOpenResponse({ userId, item, concept, response: input.response });
      correct = gradeToCorrect(g);
      misconceptionId = correct ? null : g.misconceptionId;
      agentFeedback = g.feedback;
      gradedBy = 'agent';
    } catch (e) {
      console.warn('[grading] agent grading unavailable, keeping rule result', (e as Error).message);
    }
  }

  const result = applyAttempt(
    before,
    {
      id: item.id,
      conceptId: item.conceptId,
      difficulty: item.difficulty,
      optionCount: item.format === 'short_answer' ? 0 : item.options.length,
      timesServed: item.timesServed,
    },
    {
      correct,
      confidence: input.confidence,
      latencyMs: input.latencyMs,
      hintsUsed: input.hintsUsed,
      misconceptionId,
      expectedLatencyMs: EXPECTED_LATENCY_MS[item.format],
    },
    { nodes, states },
    now,
  );

  await db.transaction(async (tx) => {
    await tx.insert(schema.attempts).values({
      userId,
      sessionId,
      itemId: item.id,
      conceptId: item.conceptId,
      response: input.response,
      correct,
      confidence: input.confidence,
      latencyMs: input.latencyMs,
      hintsUsed: input.hintsUsed,
      misconceptionId,
      expected: result.expected,
      pKnownBefore: before.pKnown,
      pKnownAfter: result.state.pKnown,
      gradedBy,
    });
    await tx
      .update(schema.items)
      .set({
        difficulty: result.itemDifficulty,
        timesServed: sql`${schema.items.timesServed} + 1`,
        timesCorrect: sql`${schema.items.timesCorrect} + ${correct ? 1 : 0}`,
      })
      .where(eq(schema.items.id, item.id));
    await tx.update(schema.sessions).set({ currentItemId: null }).where(eq(schema.sessions.id, sessionId));
  });
  await saveState(userId, result.state);
  for (const [cid, p] of Object.entries(result.propagated)) {
    const s = states[cid];
    if (s) await saveState(userId, { ...s, pKnown: p });
  }

  // Engine events → Conductor → agents (async, never blocks this response).
  const events: ConductorEvent[] = result.events.map((e) => {
    switch (e.type) {
      case 'mastered':
        return { type: 'mastered', userId, sessionId, conceptId: e.conceptId };
      case 'misconception_repeat':
        return { type: 'misconception_repeat', userId, conceptId: e.conceptId, misconceptionId: e.misconceptionId, count: e.count };
      case 'struggling':
      case 'lapse':
        return { type: 'struggling', userId, sessionId, conceptId: e.conceptId };
    }
  });
  if (events.length) void emit(...events);

  const concept = byId.get(item.conceptId)!;
  const misconception = misconceptionId ? concept.misconceptions.find((m) => m.id === misconceptionId)?.description ?? null : null;
  const correctOption = item.options.find((o) => o.id === item.answer);

  return {
    correct,
    correctOptionId: item.options.length ? item.answer : null,
    correctAnswer: correctOption?.text ?? item.answer,
    explanation: item.explanation,
    optionFeedback: agentFeedback ?? (!correct ? (chosen?.feedback ?? null) : null),
    misconception,
    mastery: {
      conceptId: concept.id,
      name: concept.name,
      before: effectiveMastery(before, now),
      after: effectiveMastery(result.state, now),
    },
    events: result.events.map((e) =>
      e.type === 'mastered'
        ? `🎉 You mastered ${concept.name}!`
        : e.type === 'misconception_repeat'
          ? 'A recurring mix-up was spotted. Targeted practice is on the way.'
          : e.type === 'lapse'
            ? `${concept.name} slipped a little. It will come back for review.`
            : 'This one is tough right now. The next step will be gentler.',
    ),
  };
}

export async function getHint(userId: string, sessionId: string, itemId: string, level: number) {
  const session = await getSession(userId, sessionId);
  if (session.currentItemId !== itemId) throw new HttpError(409, 'That question is no longer active');
  const item = await db.query.items.findFirst({ where: eq(schema.items.id, itemId) });
  if (!item) throw new HttpError(404, 'Item not found');
  const hint = item.hints[level];
  if (!hint) throw new HttpError(404, 'No more hints');
  return { level, hint, remaining: item.hints.length - level - 1 };
}

// ── Overview (open learner model) ──────────────────────────────────────────

export async function learnerOverview(userId: string, courseId: string) {
  const { concepts, nodes } = await loadGraph(courseId);
  const states = await loadStates(userId, nodes.map((n) => n.id));
  const signals = await recentSignals(userId);
  const now = new Date();

  const conceptViews = nodes.map((n) => {
    const s = states[n.id]!;
    const c = concepts.find((x) => x.id === n.id)!;
    return {
      id: n.id,
      name: n.name,
      summary: c.summary,
      prerequisites: n.prerequisites,
      order: n.order,
      status: statusOf(n, states, (x) => effectiveMastery(x, now)),
      mastery: effectiveMastery(s, now),
      pKnown: s.pKnown,
      recall: retrievability(s.memory, now),
      due: isDue(s.memory, now),
      attempts: s.attempts,
      accuracy: s.attempts ? s.correct / s.attempts : null,
      misconceptions: Object.entries(s.misconceptions)
        .filter(([, v]) => v > 0)
        .map(([id]) => c.misconceptions.find((m) => m.id === id)?.description ?? id),
    };
  });

  const [{ total }] = await db.select({ total: count() }).from(schema.attempts).where(eq(schema.attempts.userId, userId));
  const activity = await db
    .select({
      agent: schema.agentRuns.agent,
      summary: schema.agentRuns.summary,
      status: schema.agentRuns.status,
      createdAt: schema.agentRuns.createdAt,
    })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.userId, userId), inArray(schema.agentRuns.status, ['succeeded', 'failed'])))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(12);

  return {
    concepts: conceptViews,
    totals: {
      answered: total ?? 0,
      mastered: conceptViews.filter((c) => c.status === 'mastered').length,
      due: conceptViews.filter((c) => c.due).length,
      concepts: conceptViews.length,
    },
    calibration: calibration(signals),
    activity,
  };
}
