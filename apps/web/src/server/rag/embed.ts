// ─────────────────────────────────────────────────────────────────────────────
// Embeddings provider (docs/ARCHITECTURE.md §5.2): Voyage AI, the embeddings
// partner Anthropic recommends. Optional: without VOYAGE_API_KEY retrieval
// falls back to full-text search only. Vectors are 1024-d (schema column).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';

export const EMBEDDING_DIMS = 1024;
const BATCH = 64;

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

export async function embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]> {
  if (!embeddingsEnabled()) throw new Error('Embeddings are not configured (VOYAGE_API_KEY)');
  const base = process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com/v1';
  const model = process.env.VOYAGE_MODEL ?? 'voyage-3.5';
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const res = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.VOYAGE_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ input: texts.slice(i, i + BATCH), model, input_type: inputType, output_dimension: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Voyage embeddings failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const sorted = [...json.data].sort((a, b) => a.index - b.index);
    for (const d of sorted) {
      if (d.embedding.length !== EMBEDDING_DIMS) throw new Error(`Expected ${EMBEDDING_DIMS}-d embeddings, got ${d.embedding.length}`);
      out.push(d.embedding);
    }
  }
  return out;
}

/** Best-effort query embedding: null when disabled or on error (FTS still works). */
export async function embedQuery(q: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null;
  try {
    return (await embed([q], 'query'))[0] ?? null;
  } catch (e) {
    console.warn('[rag] query embedding failed, using full-text only:', (e as Error).message);
    return null;
  }
}
