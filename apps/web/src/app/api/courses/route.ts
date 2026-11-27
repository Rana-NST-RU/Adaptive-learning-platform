import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { requireUser } from '@/server/auth';
import { handler } from '@/server/http';

export const GET = handler(async () => {
  await requireUser();
  return db.query.courses.findMany({ where: eq(schema.courses.status, 'ready') });
});
