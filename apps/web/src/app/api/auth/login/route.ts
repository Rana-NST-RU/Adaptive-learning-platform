import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/server/db';
import { verifyPassword, startUserSession, HttpError } from '@/server/auth';
import { handler, body } from '@/server/http';

const Input = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const POST = handler(async (req: Request) => {
  const { email, password } = await body(req, Input);
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
  await startUserSession(user.id);
  return { id: user.id, name: user.name };
});
