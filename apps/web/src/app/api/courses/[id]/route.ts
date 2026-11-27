// Course status + the owner's recent agent activity (for the build progress page).
import { z } from 'zod';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { requireUser, HttpError } from '@/server/auth';
import { handler } from '@/server/http';

export const GET = handler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = z.uuid().parse((await ctx.params).id);
  const course = await db.query.courses.findFirst({ where: eq(schema.courses.id, id) });
  if (!course || (course.ownerId && course.ownerId !== user.id && course.status !== 'ready')) throw new HttpError(404, 'Course not found');
  const activity = await db
    .select({ agent: schema.agentRuns.agent, status: schema.agentRuns.status, summary: schema.agentRuns.summary, createdAt: schema.agentRuns.createdAt })
    .from(schema.agentRuns)
    .where(and(eq(schema.agentRuns.userId, user.id), gte(schema.agentRuns.createdAt, course.createdAt)))
    .orderBy(desc(schema.agentRuns.createdAt))
    .limit(12);
  const concepts = course.status === 'ready' ? await db.$count(schema.concepts, eq(schema.concepts.courseId, id)) : 0;
  return { id: course.id, title: course.title, description: course.description, status: course.status, concepts, activity };
});
