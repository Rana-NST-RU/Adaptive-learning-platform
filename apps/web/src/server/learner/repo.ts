// Data access for the learner model: maps DB rows ⇄ engine types.
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  newConceptState,
  type AttemptSignal,
  type ConceptNode,
  type ConceptState,
  type ItemSummary,
} from '@alp/engine';
import { db, schema } from '../db';

export const EXPECTED_LATENCY_MS: Record<string, number> = {
  mcq: 30_000,
  true_false: 15_000,
  short_answer: 60_000,
  code_output: 60_000,
};

/** Prior P(known) from the learner's self-rating (1 new … 5 expert). */
export function priorFor(selfRated: number) {
  return [0.1, 0.15, 0.25, 0.4, 0.55][Math.min(5, Math.max(1, selfRated)) - 1]!;
}

export async function loadGraph(courseId: string) {
  const concepts = await db.query.concepts.findMany({
    where: eq(schema.concepts.courseId, courseId),
    orderBy: schema.concepts.orderIndex,
  });
  const edges = await db.query.conceptEdges.findMany({
    where: and(eq(schema.conceptEdges.courseId, courseId), eq(schema.conceptEdges.kind, 'prerequisite')),
  });
  const nodes: ConceptNode[] = concepts.map((c) => ({
    id: c.id,
    name: c.name,
    order: c.orderIndex,
    prerequisites: edges.filter((e) => e.toConcept === c.id).map((e) => e.fromConcept),
  }));
  return { concepts, nodes, byId: new Map(concepts.map((c) => [c.id, c])) };
}

function toState(r: typeof schema.conceptStates.$inferSelect): ConceptState {
  return {
    conceptId: r.conceptId,
    pKnown: r.pKnown,
    ability: r.ability,
    trend: r.trend,
    velocity: r.velocity,
    attempts: r.attempts,
    correct: r.correct,
    streak: r.streak,
    memory: r.memory ?? null,
    misconceptions: r.misconceptions,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
  };
}

/** Load states for every concept, creating missing ones from the prior. */
export async function loadStates(userId: string, conceptIds: string[]): Promise<Record<string, ConceptState>> {
  if (conceptIds.length === 0) return {};
  const rows = await db
    .select()
    .from(schema.conceptStates)
    .where(and(eq(schema.conceptStates.userId, userId), inArray(schema.conceptStates.conceptId, conceptIds)));
  const states: Record<string, ConceptState> = Object.fromEntries(rows.map((r) => [r.conceptId, toState(r)]));

  const missing = conceptIds.filter((id) => !states[id]);
  if (missing.length) {
    const profile = await db.query.learnerProfiles.findFirst({ where: eq(schema.learnerProfiles.userId, userId) });
    const prior = priorFor(profile?.selfRatedLevel ?? 2);
    const fresh = missing.map((id) => newConceptState(id, prior));
    await db
      .insert(schema.conceptStates)
      .values(fresh.map((s) => ({ userId, conceptId: s.conceptId, pKnown: s.pKnown, ability: s.ability })))
      .onConflictDoNothing();
    for (const s of fresh) states[s.conceptId] = s;
  }
  return states;
}

export async function saveState(userId: string, s: ConceptState) {
  const values = {
    pKnown: s.pKnown,
    ability: s.ability,
    trend: s.trend ?? 0,
    velocity: s.velocity ?? 0,
    attempts: s.attempts,
    correct: s.correct,
    streak: s.streak,
    memory: s.memory,
    misconceptions: s.misconceptions,
    lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt) : null,
    updatedAt: new Date(),
  };
  await db
    .insert(schema.conceptStates)
    .values({ userId, conceptId: s.conceptId, ...values })
    .onConflictDoUpdate({ target: [schema.conceptStates.userId, schema.conceptStates.conceptId], set: values });
}

export async function loadItemSummaries(conceptIds: string[]): Promise<ItemSummary[]> {
  if (conceptIds.length === 0) return [];
  const rows = await db
    .select({
      id: schema.items.id,
      conceptId: schema.items.conceptId,
      difficulty: schema.items.difficulty,
      options: schema.items.options,
      format: schema.items.format,
      timesServed: schema.items.timesServed,
    })
    .from(schema.items)
    .where(and(inArray(schema.items.conceptId, conceptIds), eq(schema.items.status, 'active')));
  return rows.map((r) => ({
    id: r.id,
    conceptId: r.conceptId,
    difficulty: r.difficulty,
    optionCount: r.format === 'short_answer' ? 0 : r.options.length,
    timesServed: r.timesServed,
  }));
}

export async function sessionSignals(sessionId: string): Promise<AttemptSignal[]> {
  const rows = await db
    .select({
      conceptId: schema.attempts.conceptId,
      correct: schema.attempts.correct,
      confidence: schema.attempts.confidence,
      latencyMs: schema.attempts.latencyMs,
      hintsUsed: schema.attempts.hintsUsed,
      createdAt: schema.attempts.createdAt,
      format: schema.items.format,
    })
    .from(schema.attempts)
    .innerJoin(schema.items, eq(schema.items.id, schema.attempts.itemId))
    .where(eq(schema.attempts.sessionId, sessionId))
    .orderBy(schema.attempts.createdAt);
  return rows.map((r) => ({
    conceptId: r.conceptId,
    correct: r.correct,
    confidence: r.confidence,
    latencyMs: r.latencyMs,
    hintsUsed: r.hintsUsed,
    expectedLatencyMs: EXPECTED_LATENCY_MS[r.format],
    at: r.createdAt.toISOString(),
  }));
}

/** All of the learner's recent signals (for calibration across sessions). */
export async function recentSignals(userId: string, limit = 60): Promise<AttemptSignal[]> {
  const rows = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, userId))
    .orderBy(desc(schema.attempts.createdAt))
    .limit(limit);
  return rows.reverse().map((r) => ({
    conceptId: r.conceptId,
    correct: r.correct,
    confidence: r.confidence,
    latencyMs: r.latencyMs,
    hintsUsed: r.hintsUsed,
    at: r.createdAt.toISOString(),
  }));
}

/** Items the learner saw recently, with when, to avoid repeats. */
export async function recentItemIds(userId: string, limit = 40) {
  const rows = await db
    .select({ itemId: schema.attempts.itemId, at: schema.attempts.createdAt })
    .from(schema.attempts)
    .where(eq(schema.attempts.userId, userId))
    .orderBy(desc(schema.attempts.createdAt))
    .limit(limit);
  return rows;
}
