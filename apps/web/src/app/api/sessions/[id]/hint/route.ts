import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler, body } from '@/server/http';
import { getHint } from '@/server/learner/service';

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const { itemId, level } = await body(req, z.object({ itemId: z.uuid(), level: z.number().int().min(0).max(10) }));
  return getHint(user.id, z.uuid().parse(id), itemId, level);
});
