import { describe, expect, it } from 'vitest';
import { chunkText, normaliseText } from './chunk';

const para = (n: number, word = 'lorem') => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ') + '.';

describe('chunkText', () => {
  it('returns one chunk for short text and nothing for empty text', () => {
    expect(chunkText('Hello world.')).toEqual([{ ordinal: 0, headingPath: [], content: 'Hello world.' }]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('keeps chunks under the max size and covers all the text', () => {
    const doc = Array.from({ length: 30 }, (_, i) => para(60, `w${i}x`)).join('\n\n');
    const chunks = chunkText(doc, { targetChars: 1500, maxChars: 2000, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(2000 + 200);
    expect(chunks.at(-1)!.content).toContain('w29x59');
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it('tracks the heading path and starts new chunks at headings', () => {
    const doc = `# Graphs\n\nIntro text.\n\n## BFS\n\nBreadth first uses a queue.\n\n## DFS\n\nDepth first uses a stack.`;
    const chunks = chunkText(doc, { targetChars: 40, maxChars: 200, overlapChars: 0 });
    const bfs = chunks.find((c) => c.content.includes('queue'))!;
    const dfs = chunks.find((c) => c.content.includes('stack'))!;
    expect(bfs.headingPath).toEqual(['Graphs', 'BFS']);
    expect(dfs.headingPath).toEqual(['Graphs', 'DFS']);
    expect(bfs.content).not.toContain('stack');
  });

  it('splits a single giant paragraph at sentence boundaries', () => {
    const giant = Array.from({ length: 200 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const chunks = chunkText(giant, { targetChars: 800, maxChars: 1000, overlapChars: 50 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.content.length <= 1100)).toBe(true);
  });

  it('normalises whitespace', () => {
    expect(normaliseText('a\r\n\r\n\r\n\r\nb  \nc d')).toBe('a\n\nb\nc d');
  });
});
