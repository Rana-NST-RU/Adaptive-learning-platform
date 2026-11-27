import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { nextStep } from '@/server/learner/service';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return nextStep(user.id, z.uuid().parse(id));
});
