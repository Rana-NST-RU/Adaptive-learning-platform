// ─────────────────────────────────────────────────────────────────────────────
// Hybrid knowledge retrieval for agents (docs/ARCHITECTURE.md §5).
//   1. full-text search (Postgres tsvector) and vector search (pgvector),
//   2. fused with reciprocal-rank fusion (RRF, k = 60),
//   3. graph expansion: boost chunks of the target concept and its
//      prerequisites (recursive CTE over concept_edges).
// Vector search is skipped when embeddings aren't configured.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '../db';
import { embedQuery } from './embed';

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  conceptId: string | null;
  score: number;
  via: string[];
}

const RRF_K = 60;

export async function searchKnowledge(opts: {
  courseId: string;
  query: string;
  conceptId?: string;
  k?: number;
}): Promise<RetrievedChunk[]> {
  const k = Math.min(10, opts.k ?? 5);
  const pool = k * 4;
  const conceptId = opts.conceptId ?? null;
  const qvec = await embedQuery(opts.query);

  const rows = await db.execute<{
    id: string;
    context: string | null;
    content: string;
    concept_id: string | null;
    fts_rank: number | null;
    vec_rank: number | null;
    near: boolean;
    exact: boolean;
  }>(sql`
    with recursive near(id, depth) as (
      select ${conceptId}::uuid, 0
      union
      select e.from_concept, near.depth + 1
      from concept_edges e join near on e.to_concept = near.id
      where near.depth < 2 and e.kind = 'prerequisite'
    ),
    q as (select websearch_to_tsquery('english', ${opts.query}) as tsq),
    fts as (
      select c.id, row_number() over (order by ts_rank(c.tsv, q.tsq) desc) as r
      from chunks c, q
      where c.course_id = ${opts.courseId}::uuid and c.tsv @@ q.tsq
      order by ts_rank(c.tsv, q.tsq) desc
      limit ${pool}
    ),
    vec as (
      select c.id, row_number() over (order by c.embedding <=> ${qvec ? `[${qvec.join(',')}]` : null}::vector) as r
      from chunks c
      where ${qvec !== null} and c.course_id = ${opts.courseId}::uuid and c.embedding is not null
      order by c.embedding <=> ${qvec ? `[${qvec.join(',')}]` : null}::vector
      limit ${pool}
    ),
    own as (
      select c.id from chunks c where c.course_id = ${opts.courseId}::uuid and c.concept_id = ${conceptId}::uuid limit 3
    ),
    ids as (select id from fts union select id from vec union select id from own)
    select c.id, c.context, c.content, c.concept_id,
           fts.r as fts_rank, vec.r as vec_rank,
           (c.concept_id in (select id from near where depth > 0)) as near,
           (c.concept_id = ${conceptId}::uuid) as exact
    from ids
    join chunks c on c.id = ids.id
    left join fts on fts.id = c.id
    left join vec on vec.id = c.id`);

  return rows
    .map((r) => {
      const via: string[] = [];
      let score = 0;
      if (r.fts_rank != null) {
        score += 1 / (RRF_K + Number(r.fts_rank));
        via.push('keyword');
      }
      if (r.vec_rank != null) {
        score += 1 / (RRF_K + Number(r.vec_rank));
        via.push('semantic');
      }
      if (r.exact) {
        score += 1 / RRF_K; // as strong as a rank-1 hit
        via.push('concept');
      } else if (r.near) {
        score += 0.3 / RRF_K;
        via.push('prerequisite');
      }
      return { id: r.id, title: r.context ?? 'Untitled', content: r.content, conceptId: r.concept_id, score, via };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
