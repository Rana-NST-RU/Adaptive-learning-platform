import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { enroll } from '@/server/learner/service';

export const POST = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const course = await enroll(user.id, z.uuid().parse(id));
  return { courseId: course.id };
});
