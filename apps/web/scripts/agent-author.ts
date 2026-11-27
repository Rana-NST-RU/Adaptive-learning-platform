// Run the Item Author → Verifier pipeline for one concept from the command line.
// Spends real tokens. Usage:
//   npm run agents:author -- <concept-slug> [count]
//   npm run agents:author -- two-pointers 2
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const [slug, countArg] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npm run agents:author -- <concept-slug> [count]');
  process.exit(1);
}

const { eq, desc } = await import('drizzle-orm');
const { db, schema } = await import('../src/server/db/index');
const { agentsEnabled } = await import('../src/server/agents/runtime');
const { generateItems } = await import('../src/server/agents/items/pipeline');

if (!agentsEnabled()) {
  console.error('No Claude credential: set ANTHROPIC_API_KEY in apps/web/.env.local');
  process.exit(1);
}
const concept = await db.query.concepts.findFirst({ where: eq(schema.concepts.slug, slug) });
if (!concept) {
  console.error(`No concept with slug "${slug}"`);
  process.exit(1);
}

const t0 = Date.now();
const res = await generateItems({ conceptId: concept.id, trigger: 'cli', count: Number(countArg ?? 2) });
console.log(`\n${concept.name}: generated ${res.generated}, accepted ${res.accepted}, rejected ${res.rejected}${res.skipped ? ` (${res.skipped})` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const runs = await db.select().from(schema.agentRuns).orderBy(desc(schema.agentRuns.createdAt)).limit(1 + res.generated);
for (const r of runs.reverse()) {
  console.log(`  ${r.agent.padEnd(9)} ${r.status.padEnd(9)} in=${r.inputTokens} out=${r.outputTokens} ${r.latencyMs}ms tools=${r.toolCalls.map((t) => t.name + (t.ok ? '' : '✗')).join(',')}`);
}
const fresh = await db.select().from(schema.items).where(eq(schema.items.conceptId, concept.id)).orderBy(desc(schema.items.createdAt)).limit(res.generated);
for (const it of fresh) {
  console.log(`\n[${it.status}] (level ${it.authoredLevel}) ${it.stem}`);
  it.options.forEach((o) => console.log(`   ${o.id === it.answer ? '✓' : ' '} ${o.id}) ${o.text}${o.misconceptionId ? `  ← ${o.misconceptionId}` : ''}`));
  console.log(`   ${it.verifierNotes?.split('\n')[0]}`);
}
process.exit(0);
