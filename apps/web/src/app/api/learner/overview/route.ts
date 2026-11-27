import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { learnerOverview } from '@/server/learner/service';

export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const courseId = z.uuid().parse(new URL(req.url).searchParams.get('courseId'));
  return learnerOverview(user.id, courseId);
});
