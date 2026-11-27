import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler, body } from '@/server/http';
import { startSession } from '@/server/learner/service';

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { courseId } = await body(req, z.object({ courseId: z.uuid() }));
  return startSession(user.id, courseId);
});
