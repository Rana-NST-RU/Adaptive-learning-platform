// Tutor endpoint. POST streams the reply as server-sent events:
//   event: delta   data: {"text": "..."}
//   event: done    data: {"reply": "...", "blocked": null | "reason", "hintRevealed": bool}
//   event: error   data: {"error": "..."}
// GET returns the conversation so far for one item.
import { z } from 'zod';
import { requireUser, HttpError } from '@/server/auth';
import { handler, body } from '@/server/http';
import { agentsEnabled, BudgetExceededError } from '@/server/agents/runtime';
import { runTutor, tutorHistory } from '@/server/agents/tutor/tutor';

const Input = z.object({ itemId: z.uuid(), message: z.string().trim().min(1).max(2000) });

export const POST = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (!agentsEnabled()) throw new HttpError(503, 'The AI tutor is not configured on this server.');
  const sessionId = z.uuid().parse((await ctx.params).id);
  const { itemId, message } = await body(req, Input);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const res = await runTutor({ userId: user.id, sessionId, itemId, message, onText: (text) => send('delta', { text }) });
        send('done', res);
      } catch (e) {
        const msg =
          e instanceof BudgetExceededError
            ? "You've reached today's AI tutoring limit. Hints and explanations still work."
            : e instanceof HttpError
              ? e.message
              : 'The tutor is unavailable right now.';
        if (!(e instanceof HttpError) && !(e instanceof BudgetExceededError)) console.error('[tutor]', e);
        send('error', { error: msg });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  });
});

export const GET = handler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const sessionId = z.uuid().parse((await ctx.params).id);
  const itemId = z.uuid().parse(new URL(req.url).searchParams.get('itemId'));
  return tutorHistory(user.id, sessionId, itemId);
});
