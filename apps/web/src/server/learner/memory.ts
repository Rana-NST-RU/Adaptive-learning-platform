// Long-term learner memory: short notes written by agents (Diagnostician,
// Tutor, Coach) and read by agents (Tutor, Author, Director) for
// personalisation. Bounded so prompts stay small.
import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import type { LearnerMemoryNote } from '../db/schema';

export const MAX_MEMORY_NOTES = 30;

export async function appendMemory(userId: string, source: LearnerMemoryNote['source'], note: string) {
  const entry: LearnerMemoryNote = { at: new Date().toISOString(), source, note: note.slice(0, 500) };
  await db
    .insert(schema.learnerProfiles)
    .values({ userId, memory: [entry] })
    .onConflictDoUpdate({
      target: schema.learnerProfiles.userId,
      // Append and keep only the newest MAX_MEMORY_NOTES entries.
      set: {
        memory: sql`(
          select coalesce(jsonb_agg(e order by (e->>'at') ), '[]'::jsonb) from (
            select e from jsonb_array_elements(${schema.learnerProfiles.memory} || ${JSON.stringify([entry])}::jsonb) e
            order by (e->>'at') desc limit ${MAX_MEMORY_NOTES}
          ) t
        )`,
        updatedAt: new Date(),
      },
    });
}

export async function readMemory(userId: string, limit = 10): Promise<LearnerMemoryNote[]> {
  const p = await db.query.learnerProfiles.findFirst({ where: eq(schema.learnerProfiles.userId, userId) });
  return (p?.memory ?? []).slice(-limit);
}
