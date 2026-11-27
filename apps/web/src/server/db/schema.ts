// ─────────────────────────────────────────────────────────────────────────────
// Database schema (PostgreSQL + pgvector). See docs/ARCHITECTURE.md §8.
// The concept graph lives here too (concepts + concept_edges); traversal is
// done with recursive CTEs, replacing the v1 Neo4j instance.
// ─────────────────────────────────────────────────────────────────────────────

import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { MemoryCard, UxPolicy } from '@alp/engine';

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1024})`;
  },
  toDriver(value) {
    return `[${value.join(',')}]`;
  },
  fromDriver(value) {
    return value.slice(1, -1).split(',').map(Number);
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// ── Identity & profile ─────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['learner', 'teacher', 'admin'] }).notNull().default('learner'),
  createdAt: createdAt(),
});

export interface LearnerMemoryNote {
  at: string;
  source: 'coach' | 'tutor' | 'diagnostician' | 'learner';
  note: string;
}

export const learnerProfiles = pgTable('learner_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  goal: text('goal'),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  selfRatedLevel: integer('self_rated_level').notNull().default(2), // 1 new … 5 expert
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(20),
  /** Long-term memory written by agents (Coach/Tutor/Diagnostician). */
  memory: jsonb('memory').$type<LearnerMemoryNote[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Curriculum graph ───────────────────────────────────────────────────────

export const courses = pgTable('courses', {
  id: id(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  goal: text('goal'),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  source: text('source', { enum: ['seed', 'agent', 'teacher'] }).notNull().default('seed'),
  status: text('status', { enum: ['building', 'ready', 'failed'] }).notNull().default('ready'),
  createdAt: createdAt(),
});

export interface Misconception {
  id: string;
  description: string;
}

export const concepts = pgTable(
  'concepts',
  {
    id: id(),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    summary: text('summary').notNull(),
    objectives: jsonb('objectives').$type<string[]>().notNull().default([]),
    misconceptions: jsonb('misconceptions').$type<Misconception[]>().notNull().default([]),
    /** Short lesson shown before the first question (learn_new). */
    lesson: text('lesson'),
    orderIndex: integer('order_index').notNull().default(0),
  },
  (t) => [uniqueIndex('concepts_course_slug').on(t.courseId, t.slug)],
);

export const conceptEdges = pgTable(
  'concept_edges',
  {
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    fromConcept: uuid('from_concept').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
    toConcept: uuid('to_concept').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
    /** prerequisite: `from` must be learned before `to`. */
    kind: text('kind', { enum: ['prerequisite', 'related'] }).notNull().default('prerequisite'),
  },
  (t) => [primaryKey({ columns: [t.fromConcept, t.toConcept, t.kind] })],
);

// ── Learner state ──────────────────────────────────────────────────────────

export const enrollments = pgTable(
  'enrollments',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

export const conceptStates = pgTable(
  'concept_states',
  {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
    pKnown: real('p_known').notNull(),
    ability: real('ability').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    correct: integer('correct').notNull().default(0),
    streak: integer('streak').notNull().default(0),
    memory: jsonb('memory').$type<MemoryCard | null>(),
    misconceptions: jsonb('misconceptions').$type<Record<string, number>>().notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conceptId] })],
);

// ── Item bank ──────────────────────────────────────────────────────────────

export interface ItemOption {
  id: string; // 'a' | 'b' | …
  text: string;
  /** Misconception this distractor encodes (wrong options only). */
  misconceptionId?: string | null;
  /** Targeted feedback when this option is chosen. */
  feedback?: string | null;
}

export const items = pgTable(
  'items',
  {
    id: id(),
    conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
    format: text('format', { enum: ['mcq', 'true_false', 'short_answer', 'code_output'] }).notNull(),
    stem: text('stem').notNull(),
    code: text('code'),
    codeLanguage: text('code_language'),
    options: jsonb('options').$type<ItemOption[]>().notNull().default([]),
    /** Option id for mcq/true_false; canonical answer for open formats. */
    answer: text('answer').notNull(),
    /** Accepted alternative answers / rubric for open formats. */
    acceptable: jsonb('acceptable').$type<string[]>().notNull().default([]),
    explanation: text('explanation').notNull(),
    hints: jsonb('hints').$type<string[]>().notNull().default([]),
    /** Elo difficulty (logit scale); calibrated online from real answers. */
    difficulty: real('difficulty').notNull().default(0),
    authoredLevel: integer('authored_level').notNull().default(3),
    bloom: text('bloom'),
    timesServed: integer('times_served').notNull().default(0),
    timesCorrect: integer('times_correct').notNull().default(0),
    source: text('source', { enum: ['seed', 'agent', 'teacher'] }).notNull().default('seed'),
    status: text('status', { enum: ['draft', 'active', 'flagged', 'retired', 'rejected'] }).notNull().default('active'),
    verifierNotes: text('verifier_notes'),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    createdBy: text('created_by'), // agent run id or user id
    createdAt: createdAt(),
  },
  (t) => [index('items_concept_status').on(t.conceptId, t.status)],
);

// ── Sessions & attempts ────────────────────────────────────────────────────

export interface SessionPlan {
  headline: string;
  steps: string[];
  focusConceptId?: string | null;
  targetDelta?: number;
  modeOverride?: UxPolicy['mode'] | null;
  expiresAt?: string;
  by: 'engine' | 'director';
}

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    plan: jsonb('plan').$type<SessionPlan | null>(),
    lastUx: jsonb('last_ux').$type<UxPolicy | null>(),
    summary: jsonb('summary').$type<Record<string, unknown> | null>(),
    /** Item currently shown to the learner (prevents answering stale items). */
    currentItemId: uuid('current_item_id'),
    currentWhy: jsonb('current_why').$type<string[]>(),
  },
  (t) => [index('sessions_user').on(t.userId, t.startedAt)],
);

export const attempts = pgTable(
  'attempts',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    itemId: uuid('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id').notNull().references(() => concepts.id, { onDelete: 'cascade' }),
    response: text('response').notNull(),
    correct: boolean('correct').notNull(),
    confidence: integer('confidence'),
    latencyMs: integer('latency_ms').notNull(),
    hintsUsed: integer('hints_used').notNull().default(0),
    misconceptionId: text('misconception_id'),
    expected: real('expected'),
    pKnownBefore: real('p_known_before'),
    pKnownAfter: real('p_known_after'),
    gradedBy: text('graded_by', { enum: ['rule', 'agent'] }).notNull().default('rule'),
    createdAt: createdAt(),
  },
  (t) => [index('attempts_user_time').on(t.userId, t.createdAt), index('attempts_item').on(t.itemId)],
);

// ── Tutor dialogue ─────────────────────────────────────────────────────────

export const tutorMessages = pgTable(
  'tutor_messages',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'set null' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('tutor_messages_session').on(t.sessionId, t.createdAt)],
);

// ── RAG ────────────────────────────────────────────────────────────────────

export const documents = pgTable('documents', {
  id: id(),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceUrl: text('source_url'),
  kind: text('kind', { enum: ['curriculum', 'upload', 'web'] }).notNull(),
  createdAt: createdAt(),
});

export const chunks = pgTable(
  'chunks',
  {
    id: id(),
    documentId: uuid('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id').references(() => concepts.id, { onDelete: 'set null' }),
    ordinal: integer('ordinal').notNull(),
    /** One- or two-line situating context prepended at index time. */
    context: text('context'),
    content: text('content').notNull(),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(context, '') || ' ' || content)`,
    ),
    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (t) => [
    index('chunks_tsv').using('gin', t.tsv),
    index('chunks_embedding').using('hnsw', t.embedding.op('vector_cosine_ops')),
    index('chunks_concept').on(t.conceptId),
  ],
);

// ── Agents: traces and job queue ───────────────────────────────────────────

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    agent: text('agent').notNull(),
    trigger: text('trigger').notNull(),
    status: text('status', { enum: ['running', 'succeeded', 'failed', 'skipped'] }).notNull(),
    model: text('model'),
    input: jsonb('input').$type<unknown>(),
    output: jsonb('output').$type<unknown>(),
    toolCalls: jsonb('tool_calls').$type<Array<{ name: string; input: unknown; ok: boolean }>>().notNull().default([]),
    /** Learner-facing one-liner for the activity feed. */
    summary: text('summary'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [index('agent_runs_user_time').on(t.userId, t.createdAt)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Prevents duplicate jobs for the same slot (e.g. item refill per concept). */
    dedupeKey: text('dedupe_key'),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] }).notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('jobs_status_run_after').on(t.status, t.runAfter),
    uniqueIndex('jobs_dedupe_active').on(t.dedupeKey).where(sql`status in ('queued','running')`),
  ],
);
