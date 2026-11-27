// ─────────────────────────────────────────────────────────────────────────────
// Knowledge retrieval for agents (docs/ARCHITECTURE.md §5).
// Current stage: Postgres full-text search scoped to the course, boosted for
// the target concept and its prerequisites (graph expansion). Vector search
// and reciprocal-rank fusion join once the Librarian embeds chunks.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '../db';

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  conceptId: string | null;
  score: number;
}

export async function searchKnowledge(opts: {
  courseId: string;
  query: string;
  conceptId?: string;
  k?: number;
}): Promise<RetrievedChunk[]> {
  const k = Math.min(10, opts.k ?? 5);
  const rows = await db.execute<{ id: string; context: string | null; content: string; concept_id: string | null; score: number }>(sql`
    with recursive near(id, depth) as (
      select ${opts.conceptId ?? null}::uuid, 0
      union
      select e.from_concept, near.depth + 1
      from concept_edges e join near on e.to_concept = near.id
      where near.depth < 2 and e.kind = 'prerequisite'
    ),
    q as (select websearch_to_tsquery('english', ${opts.query}) as tsq)
    select c.id, c.context, c.content, c.concept_id,
      ts_rank(c.tsv, q.tsq)
        + case when c.concept_id = ${opts.conceptId ?? null}::uuid then 0.5
               when c.concept_id in (select id from near) then 0.15 else 0 end as score
    from chunks c, q
    where c.course_id = ${opts.courseId}::uuid
      and (c.tsv @@ q.tsq or c.concept_id = ${opts.conceptId ?? null}::uuid)
    order by score desc
    limit ${k}`);
  return rows.map((r) => ({
    id: r.id,
    title: r.context ?? 'Untitled',
    content: r.content,
    conceptId: r.concept_id,
    score: Number(r.score),
  }));
}
