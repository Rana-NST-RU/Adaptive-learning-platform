import { db, schema } from '@/server/db';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';
import { visibleCourses } from '@/server/learner/visibility';

export const GET = handler(async () => {
  const user = await requireUser();
  return db.query.courses.findMany({ where: visibleCourses(user.id) });
});
