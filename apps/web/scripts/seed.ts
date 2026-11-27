// Seed the database with the DSA Foundations course. Idempotent: re-running
// replaces the seed course (and its seed items) but keeps learner data for
// other courses. Usage: npm run db:seed
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const { eq } = await import('drizzle-orm');
const { validateGraph, authoredDifficultyToLogit } = await import('@alp/engine');
const { db, schema } = await import('../src/server/db/index');
const { DSA_COURSE, DSA_CONCEPTS } = await import('../src/server/db/seed/dsa');

const graphCheck = validateGraph(
  DSA_CONCEPTS.map((c, i) => ({ id: c.slug, name: c.name, prerequisites: c.prerequisites, order: i })),
);
if (!graphCheck.ok) throw new Error(`Seed graph invalid: ${graphCheck.error}`);

await db.transaction(async (tx) => {
  await tx.delete(schema.courses).where(eq(schema.courses.slug, DSA_COURSE.slug));

  const [course] = await tx
    .insert(schema.courses)
    .values({ ...DSA_COURSE, source: 'seed', status: 'ready' })
    .returning();

  const conceptRows = await tx
    .insert(schema.concepts)
    .values(
      DSA_CONCEPTS.map((c, i) => ({
        courseId: course!.id,
        slug: c.slug,
        name: c.name,
        summary: c.summary,
        objectives: c.objectives,
        misconceptions: c.misconceptions,
        lesson: c.lesson,
        orderIndex: i,
      })),
    )
    .returning();
  const idBySlug = new Map(conceptRows.map((r) => [r.slug, r.id]));

  const edges = DSA_CONCEPTS.flatMap((c) =>
    c.prerequisites.map((p) => ({
      courseId: course!.id,
      fromConcept: idBySlug.get(p)!,
      toConcept: idBySlug.get(c.slug)!,
      kind: 'prerequisite' as const,
    })),
  );
  if (edges.length) await tx.insert(schema.conceptEdges).values(edges);

  const letters = 'abcdefgh';
  let itemCount = 0;
  for (const c of DSA_CONCEPTS) {
    for (const it of c.items) {
      const answers = it.options.filter((o) => o[1] === null);
      if (answers.length !== 1) throw new Error(`Item in ${c.slug} must have exactly one correct option: ${it.stem}`);
      const isTf = it.options.length === 2 && it.options[0]![0] === 'True';
      await tx.insert(schema.items).values({
        conceptId: idBySlug.get(c.slug)!,
        format: isTf ? 'true_false' : it.code ? 'code_output' : 'mcq',
        stem: it.stem,
        code: it.code ?? null,
        codeLanguage: it.code ? 'python' : null,
        options: it.options.map(([text, mis, fb], i) => ({
          id: letters[i]!,
          text,
          misconceptionId: mis,
          feedback: fb ?? null,
        })),
        answer: letters[it.options.findIndex((o) => o[1] === null)]!,
        explanation: it.explanation,
        hints: it.hints,
        authoredLevel: it.level,
        difficulty: authoredDifficultyToLogit(it.level),
        source: 'seed',
        status: 'active',
      });
      itemCount++;
    }
  }

  // Curriculum text is indexed for RAG (full-text now; embeddings added by the Librarian).
  const [doc] = await tx
    .insert(schema.documents)
    .values({ courseId: course!.id, title: `${DSA_COURSE.title} — curriculum`, kind: 'curriculum' })
    .returning();
  await tx.insert(schema.chunks).values(
    DSA_CONCEPTS.map((c, i) => ({
      documentId: doc!.id,
      courseId: course!.id,
      conceptId: idBySlug.get(c.slug)!,
      ordinal: i,
      context: `${DSA_COURSE.title} › ${c.name}`,
      content: `${c.summary}\n\n${c.lesson}\n\nObjectives: ${c.objectives.join('; ')}.\nCommon misconceptions: ${c.misconceptions
        .map((m) => m.description)
        .join('; ')}.`,
    })),
  );

  console.log(`Seeded "${DSA_COURSE.title}": ${conceptRows.length} concepts, ${edges.length} prerequisite edges, ${itemCount} items.`);
});

process.exit(0);
