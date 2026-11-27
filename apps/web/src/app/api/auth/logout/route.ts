import { endUserSession } from '@/server/auth';
import { handler } from '@/server/http';

export const POST = handler(async () => {
  await endUserSession();
  return { ok: true };
});
