import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler, body } from '@/server/http';
import { submitAnswer } from '@/server/learner/service';

const Input = z.object({
  itemId: z.uuid(),
  response: z.string().min(1).max(2000),
  confidence: z.number().int().min(1).max(4).nullable(),
  latencyMs: z.number().int().min(0).max(3_600_000),
  hintsUsed: z.number().int().min(0).max(10),
});

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return submitAnswer(user.id, z.uuid().parse(id), await body(req, Input));
});
