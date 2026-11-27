import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { HttpError } from './auth';

/** Wrap a route handler: JSON errors, Zod validation messages, no stack leaks. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: 'Invalid request', issues: e.issues }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, 'Expected a JSON body');
  }
  return schema.parse(json);
}
