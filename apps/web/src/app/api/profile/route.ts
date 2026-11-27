import { z } from 'zod';
import { db, schema } from '@/server/db';
import { requireUser } from '@/server/auth';
import { handler, body } from '@/server/http';

const Input = z.object({
  goal: z.string().trim().max(500).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  selfRatedLevel: z.number().int().min(1).max(5).optional(),
  dailyGoalMinutes: z.number().int().min(5).max(180).optional(),
});

export const PUT = handler(async (req: Request) => {
  const user = await requireUser();
  const input = await body(req, Input);
  await db
    .insert(schema.learnerProfiles)
    .values({ userId: user.id, ...input })
    .onConflictDoUpdate({ target: schema.learnerProfiles.userId, set: { ...input, updatedAt: new Date() } });
  return { ok: true };
});
