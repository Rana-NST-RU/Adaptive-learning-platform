import { describe, expect, it } from 'vitest';
import { courseSlug, validateCurriculum, type Curriculum } from './rules';

const concept = (slug: string, prerequisites: string[] = [], mis = [`${slug}-m1`, `${slug}-m2`]) => ({
  slug,
  name: slug.replace(/-/g, ' '),
  summary: `A summary of ${slug} that is long enough.`,
  objectives: ['Explain the idea', 'Apply it to a problem'],
  misconceptions: mis.map((id) => ({ id, description: `A common wrong belief about ${slug}` })),
  lesson: 'x'.repeat(200),
  prerequisites,
  citations: [] as string[],
});

const base: Curriculum = {
  title: 'Intro to Graphs',
  description: 'Graphs from the ground up for interview prep.',
  concepts: [concept('graphs'), concept('bfs', ['graphs']), concept('dfs', ['graphs']), concept('topo-sort', ['dfs'])],
};
const limits = { minConcepts: 4, maxConcepts: 30, retrievedChunkIds: new Set(['c1']) };

describe('validateCurriculum', () => {
  it('accepts a valid DAG', () => {
    expect(validateCurriculum(base, limits)).toEqual([]);
  });

  it('rejects cycles', () => {
    const cyc = { ...base, concepts: base.concepts.map((c) => (c.slug === 'graphs' ? { ...c, prerequisites: ['topo-sort'] } : c)) };
    const errs = validateCurriculum(cyc, limits).join(' ');
    expect(errs).toMatch(/no prerequisites|cycle/);
  });

  it('rejects unknown prerequisites, bad slugs, duplicate ids and invented citations', () => {
    const bad = {
      ...base,
      concepts: [
        ...base.concepts.slice(0, 3),
        { ...concept('Topo Sort', ['nope']), citations: ['made-up'] },
        concept('extra', [], ['graphs-m1', 'extra-m2']),
      ],
    };
    const errs = validateCurriculum(bad, limits).join('\n');
    expect(errs).toMatch(/kebab-case/);
    expect(errs).toMatch(/unknown prerequisites: nope/);
    expect(errs).toMatch(/unique across the course: graphs-m1/);
    expect(errs).toMatch(/never returned/);
  });

  it('enforces size limits', () => {
    expect(validateCurriculum(base, { ...limits, minConcepts: 6 }).join()).toMatch(/between 6 and 30/);
  });

  it('makes unique, readable course slugs', () => {
    const a = courseSlug('Intro to Graphs!');
    expect(a).toMatch(/^intro-to-graphs-[a-z0-9]{6}$/);
    expect(courseSlug('Intro to Graphs!')).not.toBe(a);
  });
});
