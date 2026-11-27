import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { sessionReflection } from '@/server/learner/service';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return sessionReflection(user.id, z.uuid().parse(id));
});
