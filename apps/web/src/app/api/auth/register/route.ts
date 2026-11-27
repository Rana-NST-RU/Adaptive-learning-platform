import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { hashPassword, startUserSession, HttpError } from '@/server/auth';
import { handler, body } from '@/server/http';

const Input = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

export const POST = handler(async (req: Request) => {
  const { name, email, password } = await body(req, Input);
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (existing) throw new HttpError(409, 'An account with this email already exists');
  const [user] = await db.insert(schema.users).values({ name, email, passwordHash: await hashPassword(password) }).returning();
  await db.insert(schema.learnerProfiles).values({ userId: user!.id });
  await startUserSession(user!.id);
  return { id: user!.id, name: user!.name };
});
