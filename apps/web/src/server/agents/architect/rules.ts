// ─────────────────────────────────────────────────────────────────────────────
// Curriculum schema + deterministic validation for the Curriculum Architect.
// Pure (no I/O), unit-tested. The engine's graph validator guarantees a DAG.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';
import { validateGraph } from '@alp/engine';

export const CurriculumConcept = z.object({
  slug: z.string().describe('kebab-case id, unique in the course, e.g. "sliding-window"'),
  name: z.string().min(2).max(60),
  summary: z.string().min(20).max(300).describe('One sentence: what this concept is'),
  objectives: z.array(z.string().min(5).max(160)).min(2).max(4).describe('What the learner should be able to do'),
  misconceptions: z
    .array(z.object({ id: z.string().describe('kebab-case, unique across the course'), description: z.string().min(10).max(200) }))
    .min(2)
    .max(4)
    .describe('Specific, common wrong beliefs (used to write diagnostic distractors)'),
  lesson: z.string().min(150).max(1500).describe('A short first-exposure lesson (markdown **bold** and `code` allowed)'),
  prerequisites: z.array(z.string()).describe('Slugs of concepts that must be learned first'),
  citations: z.array(z.string()).describe('Ids of material chunks this concept draws on'),
});

export const Curriculum = z.object({
  title: z.string().min(3).max(80),
  description: z.string().min(20).max(400),
  concepts: z.array(CurriculumConcept).min(4).max(30),
});
export type Curriculum = z.infer<typeof Curriculum>;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CurriculumLimits {
  minConcepts: number;
  maxConcepts: number;
  retrievedChunkIds: Set<string>;
}

export function validateCurriculum(c: Curriculum, limits: CurriculumLimits): string[] {
  const errs: string[] = [];
  const n = c.concepts.length;
  if (n < limits.minConcepts || n > limits.maxConcepts) {
    errs.push(`Use between ${limits.minConcepts} and ${limits.maxConcepts} concepts (got ${n}).`);
  }

  const slugs = c.concepts.map((x) => x.slug);
  const bad = slugs.filter((s) => !KEBAB.test(s));
  if (bad.length) errs.push(`Slugs must be kebab-case: ${bad.join(', ')}.`);
  const dupSlugs = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupSlugs.length) errs.push(`Duplicate slugs: ${[...new Set(dupSlugs)].join(', ')}.`);

  const misIds = c.concepts.flatMap((x) => x.misconceptions.map((m) => m.id));
  const badMis = misIds.filter((s) => !KEBAB.test(s));
  if (badMis.length) errs.push(`Misconception ids must be kebab-case: ${badMis.slice(0, 5).join(', ')}.`);
  const dupMis = misIds.filter((s, i) => misIds.indexOf(s) !== i);
  if (dupMis.length) errs.push(`Misconception ids must be unique across the course: ${[...new Set(dupMis)].join(', ')}.`);

  const known = new Set(slugs);
  for (const x of c.concepts) {
    const unknown = x.prerequisites.filter((p) => !known.has(p));
    if (unknown.length) errs.push(`"${x.slug}" lists unknown prerequisites: ${unknown.join(', ')}.`);
    if (x.prerequisites.includes(x.slug)) errs.push(`"${x.slug}" cannot be its own prerequisite.`);
    const fake = x.citations.filter((id) => !limits.retrievedChunkIds.has(id));
    if (fake.length) errs.push(`"${x.slug}" cites chunks that search_material never returned: ${fake.slice(0, 3).join(', ')}.`);
  }

  if (!c.concepts.some((x) => x.prerequisites.length === 0)) errs.push('At least one concept must have no prerequisites (a starting point).');

  if (errs.length === 0) {
    const g = validateGraph(
      c.concepts.map((x, i) => ({ id: x.slug, name: x.name, prerequisites: x.prerequisites, order: i })),
    );
    if (!g.ok) errs.push(`Prerequisite graph problem: ${g.error}. Prerequisites must form a DAG.`);
  }
  return errs;
}

export function courseSlug(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'course';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
