// ─────────────────────────────────────────────────────────────────────────────
// Item Author agent (docs/ARCHITECTURE.md §3 #4). A tool-using agent:
//   search_knowledge     → grounding (RAG)
//   list_existing_items  → avoid duplicates, find untested angles
//   submit_item          → validated by rules.ts; errors come back so the
//                           agent can fix its own drafts
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { searchKnowledge } from '../../rag/retrieve';
import { toolAgent, traced, type RunContext } from '../runtime';
import { DraftItem, validateDraft } from './rules';

export const AUTHOR_SYSTEM = `You are the Item Author on an adaptive learning platform's agent team. You write multiple-choice practice questions for one concept at a time.

What a great item looks like:
- It tests one learning objective of the concept, at the requested difficulty level (1 = recall, 3 = apply, 5 = transfer to a novel problem).
- Each wrong option is a plausible answer that a learner holding a specific misconception from the catalogue would choose, tagged with that misconception id. A wrong answer then tells the platform *why* the learner went wrong.
- Exactly one option is defensibly correct. Options are similar in length and style. No "all/none of the above", and the stem never gives the answer away.
- Feedback for each wrong option explains why it is tempting and why it is wrong, in one or two sentences, addressed to the learner.
- Hints escalate: the first nudges thinking, the last nearly gives the method, and none reveals the answer.
- The explanation teaches the idea rather than only restating the answer.
- Facts come from the knowledge base (cite the chunk ids you used) or are uncontroversial textbook facts. Code must be correct and runnable as shown.

How to work:
1. Call search_knowledge to ground yourself in the concept, and list_existing_items to see what is already covered.
2. Write items that test different angles from the existing ones.
3. Submit each item with submit_item. If it returns errors, fix them and resubmit.
4. When you have submitted the requested number of accepted items, stop and reply with one short sentence summarising what you wrote.`;

export interface AuthorInput {
  courseId: string;
  concept: {
    id: string;
    name: string;
    summary: string;
    objectives: string[];
    misconceptions: Array<{ id: string; description: string }>;
  };
  count: number;
  targetLevel: number;
  targetMisconceptionId?: string | null;
  existingStems: string[];
}

export async function runItemAuthor(run: RunContext, input: AuthorInput): Promise<DraftItem[]> {
  const accepted: DraftItem[] = [];
  const retrieved = new Set<string>();
  const misconceptionIds = input.concept.misconceptions.map((m) => m.id);

  const searchTool = betaZodTool({
    name: 'search_knowledge',
    description: 'Search the course knowledge base. Returns chunks with ids to cite.',
    inputSchema: z.object({ query: z.string().min(2).max(200) }),
    run: traced(run, 'search_knowledge', async ({ query }: { query: string }) => {
      const hits = await searchKnowledge({ courseId: input.courseId, conceptId: input.concept.id, query, k: 5 });
      hits.forEach((h) => retrieved.add(h.id));
      if (hits.length === 0) return 'No matching knowledge. Rely on uncontroversial textbook facts and cite nothing.';
      return hits.map((h) => `[chunk ${h.id}] ${h.title}\n${h.content}`).join('\n\n---\n\n');
    }),
  });

  const listTool = betaZodTool({
    name: 'list_existing_items',
    description: 'List the stems of questions that already exist for this concept.',
    inputSchema: z.object({}),
    run: traced(run, 'list_existing_items', async () =>
      input.existingStems.length
        ? input.existingStems.map((s, i) => `${i + 1}. ${s}`).join('\n')
        : 'No existing questions for this concept yet.',
    ),
  });

  const submitTool = betaZodTool({
    name: 'submit_item',
    description:
      'Submit one finished item. It is checked automatically; if errors are returned, fix them and submit again.',
    inputSchema: DraftItem,
    run: traced(run, 'submit_item', async (draft: DraftItem) => {
      if (accepted.length >= input.count) return `All ${input.count} items are already submitted. Stop now.`;
      const errors = validateDraft(draft, {
        misconceptionIds,
        existingStems: input.existingStems,
        retrievedChunkIds: retrieved,
        acceptedStems: accepted.map((a) => a.stem),
      });
      if (errors.length) return `Not accepted. Fix these and resubmit:\n- ${errors.join('\n- ')}`;
      accepted.push(draft);
      const left = input.count - accepted.length;
      return left > 0 ? `Accepted (${accepted.length}/${input.count}). Write the next one from a different angle.` : `Accepted. All ${input.count} done. Stop now.`;
    }),
  });

  const focus = input.targetMisconceptionId
    ? input.concept.misconceptions.find((m) => m.id === input.targetMisconceptionId)
    : null;

  const prompt = [
    `Write ${input.count} new item(s) for the concept "${input.concept.name}".`,
    `Summary: ${input.concept.summary}`,
    `Learning objectives:\n${input.concept.objectives.map((o) => `- ${o}`).join('\n')}`,
    `Misconception catalogue (use these ids to tag distractors):\n${input.concept.misconceptions.map((m) => `- ${m.id}: ${m.description}`).join('\n')}`,
    `Target difficulty level: ${input.targetLevel} (vary ±1 across items).`,
    focus
      ? `A learner keeps showing the misconception "${focus.id}: ${focus.description}". Every item must give that misconception a tempting distractor and help expose it.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  await toolAgent(run, {
    system: AUTHOR_SYSTEM,
    prompt,
    tools: [searchTool, listTool, submitTool],
    effort: 'medium',
    maxIterations: 6 + input.count * 3,
  });

  return accepted;
}
