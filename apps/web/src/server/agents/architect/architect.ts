// ─────────────────────────────────────────────────────────────────────────────
// Curriculum Architect agent (docs/ARCHITECTURE.md §3 #2, §4.1).
// Turns a goal (+ optional learner material) into a validated concept DAG
// with objectives, misconception catalogues and first-exposure lessons.
// Tools: search_material (RAG over uploads), submit_curriculum (validated;
// errors come back to fix), and optionally Claude's server-side web_search.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db';
import { searchKnowledge } from '../../rag/retrieve';
import { emit } from '../../conductor';
import { toolAgent, traced, withAgentRun, AgentError } from '../runtime';
import { assignChunksToConcepts, indexDocument, ingestDocument } from '../librarian';
import { Curriculum, validateCurriculum } from './rules';

export const ARCHITECT_SYSTEM = `You are the Curriculum Architect on an adaptive learning platform. You turn a learner's goal into a concept graph that the platform's learner model and other agents run on.

A great curriculum:
- Breaks the goal into concepts that are each teachable in about 15–30 minutes of practice and testable with multiple-choice questions.
- Links concepts with true prerequisite edges: B requires A only if B can't be understood without A. Don't chain everything linearly. Parallel branches let the platform interleave topics.
- Starts where the learner is. Skip what their stated level makes trivial, but keep the foundations the goal depends on.
- Gives each concept 2–4 concrete objectives and 2–4 specific, commonly observed misconceptions. The misconceptions drive diagnostic questions, so make them precise beliefs ("thinks X implies Y"), not vague gaps ("doesn't understand X").
- Gives each concept a short first-exposure lesson (around 80–200 words): intuition first, then the key rule, with a tiny example if useful.
- Reflects the learner's own material when provided: search it, follow its scope and terminology, and cite the chunk ids you used.

How to work:
1. If material was provided, use search_material to understand its scope. If web_search is available and no material was provided, use it sparingly to check current syllabi.
2. Design the graph, then call submit_curriculum. If it returns errors, fix them and resubmit.
3. Once it is accepted, reply with one sentence describing the course.`;

export interface BuildRequest {
  courseId: string;
}

export async function buildCourse({ courseId }: BuildRequest) {
  const course = await db.query.courses.findFirst({ where: eq(schema.courses.id, courseId) });
  if (!course || course.status !== 'building') return;
  const ownerId = course.ownerId;
  const profile = ownerId ? await db.query.learnerProfiles.findFirst({ where: eq(schema.learnerProfiles.userId, ownerId) }) : null;

  try {
    // 1. Librarian: make the learner's material searchable.
    const docs = await db.select().from(schema.documents).where(eq(schema.documents.courseId, courseId));
    for (const d of docs) await indexDocument(d.id, ownerId);
    const hasMaterial = docs.length > 0;

    // 2. Architect: design and validate the curriculum.
    const curriculum = await withAgentRun(
      { agent: 'architect', trigger: 'course_requested', userId: ownerId, input: { courseId, goal: course.goal, hasMaterial } },
      async (run) => {
        let accepted: Curriculum | null = null;
        const retrieved = new Set<string>();

        const tools: Parameters<typeof toolAgent>[1]['tools'] = [
          betaZodTool({
            name: 'submit_curriculum',
            description: 'Submit the complete curriculum. It is validated automatically; fix any returned errors and resubmit.',
            inputSchema: Curriculum,
            run: traced(run, 'submit_curriculum', async (c: Curriculum) => {
              if (accepted) return 'Already accepted. Stop now.';
              const errs = validateCurriculum(c, { minConcepts: 4, maxConcepts: 30, retrievedChunkIds: retrieved });
              if (errs.length) return `Not accepted. Fix these and resubmit:\n- ${errs.join('\n- ')}`;
              accepted = c;
              return `Accepted: ${c.concepts.length} concepts. Reply with one sentence describing the course.`;
            }),
          }),
        ];
        if (hasMaterial) {
          tools.push(
            betaZodTool({
              name: 'search_material',
              description: "Search the learner's uploaded material. Returns chunks with ids you can cite.",
              inputSchema: z.object({ query: z.string().min(2).max(200) }),
              run: traced(run, 'search_material', async ({ query }: { query: string }) => {
                const hits = await searchKnowledge({ courseId, query, k: 6 });
                hits.forEach((h) => retrieved.add(h.id));
                return hits.length ? hits.map((h) => `[chunk ${h.id}] ${h.title}\n${h.content}`).join('\n\n---\n\n') : 'No matches.';
              }),
            }),
          );
        }
        const web = process.env.ALP_WEB_SEARCH === 'on' && !hasMaterial;
        if (web) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 4 });

        const outline = hasMaterial
          ? docs.map((d) => `- ${d.title}`).join('\n')
          : 'None. Design from your own knowledge' + (web ? ' (web_search is available).' : '.');

        await toolAgent(run, {
          system: ARCHITECT_SYSTEM,
          prompt: [
            `Learner goal: ${course.goal ?? course.title}`,
            `Self-rated level (1 new … 5 expert): ${profile?.selfRatedLevel ?? 2}`,
            profile?.dailyGoalMinutes ? `Daily time: ${profile.dailyGoalMinutes} minutes` : '',
            `Learner material:\n${outline}`,
            'Aim for roughly 8–16 concepts unless the goal clearly needs fewer or more.',
          ]
            .filter(Boolean)
            .join('\n\n'),
          tools,
          effort: 'high',
          maxIterations: 14,
          maxTokens: 32_000,
        });
        if (!accepted) throw new AgentError('Architect finished without an accepted curriculum');
        const c: Curriculum = accepted;
        return { output: c, summary: `Designed “${c.title}”: ${c.concepts.length} concepts` };
      },
    );

    // 3. Persist the graph + lessons (as curriculum chunks for RAG).
    const conceptIds = await db.transaction(async (tx) => {
      await tx.update(schema.courses).set({ title: curriculum.title, description: curriculum.description }).where(eq(schema.courses.id, courseId));
      const rows = await tx
        .insert(schema.concepts)
        .values(
          curriculum.concepts.map((c, i) => ({
            courseId,
            slug: c.slug,
            name: c.name,
            summary: c.summary,
            objectives: c.objectives,
            misconceptions: c.misconceptions,
            lesson: c.lesson,
            orderIndex: i,
          })),
        )
        .returning({ id: schema.concepts.id, slug: schema.concepts.slug });
      const id = new Map(rows.map((r) => [r.slug, r.id]));
      const edges = curriculum.concepts.flatMap((c) =>
        c.prerequisites.map((p) => ({ courseId, fromConcept: id.get(p)!, toConcept: id.get(c.slug)!, kind: 'prerequisite' as const })),
      );
      if (edges.length) await tx.insert(schema.conceptEdges).values(edges);
      return id;
    });

    const lessonsText = curriculum.concepts
      .map((c) => `# ${c.name}\n\n${c.summary}\n\n${c.lesson}\n\nObjectives: ${c.objectives.join('; ')}.\n\nCommon misconceptions: ${c.misconceptions.map((m) => m.description).join('; ')}.`)
      .join('\n\n');
    const { documentId } = await ingestDocument({ courseId, ownerId: ownerId!, title: `${curriculum.title} — curriculum`, kind: 'curriculum', text: lessonsText });
    // One chunk per concept heading: link each to its concept.
    const lessonChunks = await db.select().from(schema.chunks).where(eq(schema.chunks.documentId, documentId)).orderBy(asc(schema.chunks.ordinal));
    for (const ch of lessonChunks) {
      const concept = curriculum.concepts.find((c) => ch.context?.endsWith(c.name));
      if (concept) await db.update(schema.chunks).set({ conceptId: conceptIds.get(concept.slug)! }).where(eq(schema.chunks.id, ch.id));
    }
    await indexDocument(documentId, ownerId);
    await assignChunksToConcepts(courseId);

    // 4. Open the course, enrol the owner, and start writing questions for the entry points.
    await db.update(schema.courses).set({ status: 'ready' }).where(eq(schema.courses.id, courseId));
    if (ownerId) await db.insert(schema.enrollments).values({ userId: ownerId, courseId }).onConflictDoNothing();
    const roots = curriculum.concepts.filter((c) => c.prerequisites.length === 0).slice(0, 4);
    await emit(
      ...roots.map((c) => ({ type: 'pool_low' as const, userId: ownerId ?? '', conceptId: conceptIds.get(c.slug)!, idealDifficulty: -0.9 })),
    );
  } catch (e) {
    await db.update(schema.courses).set({ status: 'failed' }).where(eq(schema.courses.id, courseId));
    throw e;
  }
}
