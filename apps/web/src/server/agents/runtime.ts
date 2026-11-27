// ─────────────────────────────────────────────────────────────────────────────
// Agent runtime: tracing into agent_runs and per-learner daily token budgets,
// on top of the database-free LLM layer in llm.ts (re-exported here, so agents
// keep importing from './runtime'). See docs/ARCHITECTURE.md §7.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { BudgetExceededError, modelFor, type AgentName, type RunContext } from './llm';

export * from './llm';

export async function tokensUsedToday(userId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.agentRuns.inputTokens} + ${schema.agentRuns.outputTokens}), 0)::int` })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.userId, userId), gte(schema.agentRuns.createdAt, since)));
  return row?.total ?? 0;
}

/**
 * Trace one agent run. `fn` returns the output plus a learner-facing summary
 * line for the activity feed.
 */
export async function withAgentRun<T>(
  meta: { agent: AgentName; trigger: string; userId?: string | null; input: unknown },
  fn: (run: RunContext) => Promise<{ output: T; summary?: string }>,
): Promise<T> {
  const model = modelFor(meta.agent);
  const userId = meta.userId ?? null;

  if (userId) {
    const budget = Number(process.env.ALP_DAILY_TOKEN_BUDGET ?? 400_000);
    if ((await tokensUsedToday(userId)) >= budget) {
      await db.insert(schema.agentRuns).values({
        userId, agent: meta.agent, trigger: meta.trigger, status: 'skipped', model, input: meta.input,
        summary: 'Daily AI budget reached; using the existing question bank.',
      });
      throw new BudgetExceededError(`Daily token budget reached for ${userId}`);
    }
  }

  const [row] = await db
    .insert(schema.agentRuns)
    .values({ userId, agent: meta.agent, trigger: meta.trigger, status: 'running', model, input: meta.input })
    .returning({ id: schema.agentRuns.id });
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const toolCalls: Array<{ name: string; input: unknown; ok: boolean }> = [];

  const ctx: RunContext = {
    id: row!.id,
    agent: meta.agent,
    model,
    recordUsage(u) {
      if (!u) return;
      inputTokens += u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      outputTokens += u.output_tokens;
    },
    recordTool(name, input, ok) {
      toolCalls.push({ name, input, ok });
    },
  };

  try {
    const { output, summary } = await fn(ctx);
    await db
      .update(schema.agentRuns)
      .set({ status: 'succeeded', output: output as unknown, summary, toolCalls, inputTokens, outputTokens, latencyMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, ctx.id));
    return output;
  } catch (e) {
    await db
      .update(schema.agentRuns)
      .set({ status: 'failed', error: String((e as Error).message).slice(0, 4000), toolCalls, inputTokens, outputTokens, latencyMs: Date.now() - started })
      .where(eq(schema.agentRuns.id, ctx.id));
    throw e;
  }
}
