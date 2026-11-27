import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { endSession } from '@/server/learner/service';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return endSession(user.id, z.uuid().parse(id));
});
