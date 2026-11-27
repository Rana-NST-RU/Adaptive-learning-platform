// ─────────────────────────────────────────────────────────────────────────────
// Agent runtime: one Claude client, per-agent model/effort, tracing into
// agent_runs, per-learner daily token budgets, refusal handling.
// See docs/ARCHITECTURE.md §7.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { and, eq, gte, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { db, schema } from '../db';

export type AgentName = 'author' | 'verifier' | 'director' | 'tutor' | 'diagnostician' | 'architect' | 'coach' | 'librarian';
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Agents run only when a Claude credential is configured. */
export function agentsEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ALP_AGENTS === 'on');
}

export function modelFor(agent: AgentName): string {
  return process.env[`ALP_MODEL_${agent.toUpperCase()}`] ?? process.env.ALP_MODEL ?? 'claude-opus-5-5';
}

let client: Anthropic | null = null;
export function claude(): Anthropic {
  client ??= new Anthropic({ maxRetries: 3, timeout: 180_000 });
  return client;
}

/** Server-side refusal fallback: routes a declined request to a fallback model. */
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

export class AgentError extends Error {}
export class BudgetExceededError extends AgentError {}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface RunContext {
  id: string;
  agent: AgentName;
  model: string;
  recordUsage(u: Usage | null | undefined): void;
  recordTool(name: string, input: unknown, ok: boolean): void;
}

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

function checkStop(stop: string | null | undefined, agent: string) {
  if (stop === 'refusal') throw new AgentError(`${agent}: request declined by the model`);
  if (stop === 'max_tokens') throw new AgentError(`${agent}: output truncated (max_tokens)`);
}

/** Single-shot structured output, validated against a Zod schema. */
export async function structured<S extends z.ZodType>(
  run: RunContext,
  opts: { system: string; prompt: string; schema: S; effort: Effort; maxTokens?: number },
): Promise<z.infer<S>> {
  const res = await claude().beta.messages.parse({
    model: run.model,
    max_tokens: opts.maxTokens ?? 16_000,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.prompt }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    ...FALLBACK,
  });
  run.recordUsage(res.usage);
  checkStop(res.stop_reason, run.agent);
  if (res.parsed_output == null) throw new AgentError(`${run.agent}: response did not match the schema`);
  return res.parsed_output as z.infer<S>;
}

/** Tool-using agent loop (SDK Tool Runner). Returns the final message text. */
export async function toolAgent(
  run: RunContext,
  opts: {
    system: string;
    prompt: string;
    tools: Array<BetaRunnableTool<any>>;
    effort: Effort;
    maxIterations: number;
    maxTokens?: number;
  },
): Promise<string> {
  const runner = claude().beta.messages.toolRunner({
    model: run.model,
    max_tokens: opts.maxTokens ?? 16_000,
    system: [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: opts.prompt }],
    tools: opts.tools,
    output_config: { effort: opts.effort },
    max_iterations: opts.maxIterations,
    ...FALLBACK,
  });
  let finalText = '';
  for await (const message of runner) {
    run.recordUsage(message.usage);
    if (message.stop_reason === 'refusal') throw new AgentError(`${run.agent}: request declined by the model`);
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
    if (text) finalText = text;
  }
  return finalText;
}

/**
 * Streaming tool-using agent: text deltas go to `onText` as they arrive.
 * `guard` sees the accumulated text of the current turn; returning a reason
 * aborts the stream immediately (used by the Tutor's answer-leak guard).
 */
export async function streamingToolAgent(
  run: RunContext,
  opts: {
    system: Anthropic.Beta.Messages.BetaTextBlockParam[];
    messages: Anthropic.Beta.Messages.BetaMessageParam[];
    tools: Array<BetaRunnableTool<any>>;
    effort: Effort;
    maxIterations: number;
    maxTokens?: number;
  },
  hooks: { onText: (delta: string) => void; guard?: (turnText: string) => string | null },
): Promise<{ text: string; stoppedBy: string | null }> {
  const runner = claude().beta.messages.toolRunner({
    model: run.model,
    max_tokens: opts.maxTokens ?? 4_000,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    output_config: { effort: opts.effort },
    max_iterations: opts.maxIterations,
    stream: true,
    ...FALLBACK,
  });

  let all = '';
  let stoppedBy: string | null = null;
  for await (const stream of runner) {
    let turn = '';
    stream.on('text', (delta) => {
      if (stoppedBy) return;
      const reason = hooks.guard?.(turn + delta) ?? null;
      if (reason) {
        stoppedBy = reason;
        stream.abort();
        return;
      }
      turn += delta;
      all += delta;
      hooks.onText(delta);
    });
    try {
      const message = await stream.finalMessage();
      run.recordUsage(message.usage);
      if (message.stop_reason === 'refusal') throw new AgentError(`${run.agent}: request declined by the model`);
    } catch (e) {
      if (stoppedBy) break; // our own abort
      throw e;
    }
    if (stoppedBy) break;
  }
  return { text: all, stoppedBy };
}

/** Wrap a tool's run() so every call is traced on the agent run. */
export function traced<I, O>(run: RunContext, name: string, fn: (input: I) => Promise<O>) {
  return async (input: I) => {
    try {
      const out = await fn(input);
      run.recordTool(name, input, true);
      return out;
    } catch (e) {
      run.recordTool(name, input, false);
      throw e;
    }
  };
}
