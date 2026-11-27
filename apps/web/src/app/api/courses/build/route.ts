// Build a course from a goal (+ optional PDFs/notes/URL). Returns immediately;
// the Librarian and Curriculum Architect run as a background job.
import { z } from 'zod';
import { db, schema } from '@/server/db';
import { requireUser, HttpError } from '@/server/auth';
import { handler } from '@/server/http';
import { agentsEnabled } from '@/server/agents/runtime';
import { ingestDocument } from '@/server/agents/librarian';
import { courseSlug } from '@/server/agents/architect/rules';
import { parseFile, parseUrl, ParseError } from '@/server/rag/parse';
import { emit } from '@/server/conductor';

const Fields = z.object({
  goal: z.string().trim().min(5).max(500),
  url: z.union([z.literal(''), z.url()]).optional(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  if (!agentsEnabled()) throw new HttpError(503, 'Course building needs the AI agents, which are not configured on this server.');
  const form = await req.formData();
  const { goal, url } = Fields.parse({ goal: form.get('goal'), url: form.get('url') ?? undefined });
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 3) throw new HttpError(400, 'Up to 3 files per course');

  // Parse everything before creating the course, so bad uploads fail fast.
  const sources: Array<{ title: string; kind: 'upload' | 'web'; sourceUrl?: string; text: string }> = [];
  try {
    for (const f of files) sources.push({ title: f.name, kind: 'upload', text: await parseFile(f.name, f.type, new Uint8Array(await f.arrayBuffer())) });
    if (url) {
      const page = await parseUrl(url);
      sources.push({ title: page.title, kind: 'web', sourceUrl: url, text: page.text });
    }
  } catch (e) {
    if (e instanceof ParseError) throw new HttpError(400, e.message);
    throw e;
  }

  const [course] = await db
    .insert(schema.courses)
    .values({
      slug: courseSlug(goal),
      title: goal.length > 60 ? `${goal.slice(0, 57)}…` : goal,
      description: 'Being designed by the Curriculum Architect…',
      goal,
      ownerId: user.id,
      source: 'agent',
      status: 'building',
    })
    .returning();
  for (const s of sources) await ingestDocument({ courseId: course!.id, ownerId: user.id, ...s });
  await emit({ type: 'course_requested', userId: user.id, courseId: course!.id });
  return { courseId: course!.id, sources: sources.length };
});
