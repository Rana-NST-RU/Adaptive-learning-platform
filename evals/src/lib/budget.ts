// Spend control for LLM eval suites (docs/EVALS.md §9: "hard spend cap").
// A RunContext stand-in records token usage per call; once the estimated
// spend reaches EVAL_MAX_USD the next check throws and the suite stops,
// reporting what it measured so far.

import type { AgentName, RunContext, Usage } from '../../../apps/web/src/server/agents/llm';
import { modelFor } from '../../../apps/web/src/server/agents/llm';

/** USD per million tokens (Anthropic first-party rates). Cache writes are billed at 1.25× input. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

export class BudgetStop extends Error {}

export class Spend {
  usd = 0;
  calls = 0;
  inputTokens = 0;
  outputTokens = 0;
  readonly max: number;
  private unknownModels = new Set<string>();

  constructor(max = Number(process.env.EVAL_MAX_USD ?? 2)) {
    this.max = max;
  }

  add(model: string, u: Usage) {
    const p = PRICES[model];
    if (!p) {
      // Unknown model: price as Opus so the cap errs on the safe side.
      this.unknownModels.add(model);
    }
    const price = p ?? PRICES['claude-opus-5-5']!;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    this.usd +=
      (u.input_tokens * price.input + cacheWrite * price.input * 1.25 + cacheRead * price.cacheRead + u.output_tokens * price.output) / 1e6;
    this.calls++;
    this.inputTokens += u.input_tokens + cacheRead + cacheWrite;
    this.outputTokens += u.output_tokens;
  }

  /** Call between cases: stops the suite once the cap is reached. */
  check() {
    if (this.usd >= this.max) throw new BudgetStop(`EVAL_MAX_USD=${this.max} reached ($${this.usd.toFixed(3)} spent)`);
  }

  notes(): string[] {
    return this.unknownModels.size ? [`No price for ${[...this.unknownModels].join(', ')}; priced as claude-opus-5-5.`] : [];
  }
}

/** A RunContext for evals: same interface agents expect, no database. */
export function evalRun(agent: AgentName, spend: Spend): RunContext & { tools: Array<{ name: string; ok: boolean }> } {
  const model = modelFor(agent);
  const tools: Array<{ name: string; ok: boolean }> = [];
  return {
    id: `eval-${agent}-${spend.calls}`,
    agent,
    model,
    tools,
    recordUsage(u) {
      if (u) spend.add(model, u);
    },
    recordTool(name, _input, ok) {
      tools.push({ name, ok });
    },
  };
}

/** LLM suites need a credential; without one they skip cleanly (exit 0). */
export function requireCredential(suite: string) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.log(`[${suite}] skipped: no ANTHROPIC_API_KEY. This suite calls Claude and is capped by EVAL_MAX_USD.`);
    process.exit(0);
  }
}
