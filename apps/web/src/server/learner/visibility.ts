// Which courses a learner may see: seed/teacher courses and their own agent-built ones.
import 'server-only';
import { and, eq, isNull, or } from 'drizzle-orm';
import { schema } from '../db';

export function visibleCourses(userId: string) {
  return and(eq(schema.courses.status, 'ready'), or(isNull(schema.courses.ownerId), eq(schema.courses.ownerId, userId)));
}
