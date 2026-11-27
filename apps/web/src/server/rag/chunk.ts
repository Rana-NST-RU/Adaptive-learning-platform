// ─────────────────────────────────────────────────────────────────────────────
// Heading-aware chunking (docs/ARCHITECTURE.md §5.2). Pure, unit-tested.
// Splits on markdown headings and paragraphs, packs paragraphs up to a target
// size (~500–700 tokens ≈ 2,000–2,800 chars), carries the current heading path
// into each chunk, and overlaps a little so ideas spanning a boundary survive.
// ─────────────────────────────────────────────────────────────────────────────

export interface Chunk {
  ordinal: number;
  headingPath: string[];
  content: string;
}

export interface ChunkOptions {
  targetChars?: number;
  maxChars?: number;
  overlapChars?: number;
}

export function normaliseText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split a long paragraph at sentence boundaries so no piece exceeds max. */
function splitLong(p: string, max: number): string[] {
  if (p.length <= max) return [p];
  const sentences = p.match(/[^.!?\n]+[.!?]+["')\]]*\s*|[^.!?\n]+$/g) ?? [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function chunkText(raw: string, opts: ChunkOptions = {}): Chunk[] {
  const target = opts.targetChars ?? 2200;
  const max = opts.maxChars ?? 3200;
  const overlap = opts.overlapChars ?? 250;
  const text = normaliseText(raw);
  if (!text) return [];

  const chunks: Chunk[] = [];
  const headings: string[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let bufHeadings: string[] = [];

  const flush = () => {
    const content = buf.join('\n\n').trim();
    if (content) chunks.push({ ordinal: chunks.length, headingPath: [...bufHeadings], content });
    // Carry a tail of the previous chunk as overlap.
    const tail = content.length > overlap ? content.slice(-overlap).replace(/^\S*\s/, '') : '';
    buf = tail ? [tail] : [];
    bufLen = tail.length;
    bufHeadings = [...headings];
  };

  for (const block of text.split(/\n\s*\n/)) {
    const h = block.match(/^(#{1,4})\s+(.+)$/m);
    if (h && block.trim().startsWith('#')) {
      // A new section: close the current chunk unless it only holds overlap.
      if (bufLen > overlap) flush();
      else {
        buf = [];
        bufLen = 0;
      }
      const level = h[1]!.length;
      headings.splice(level - 1);
      headings[level - 1] = h[2]!.trim();
      bufHeadings = headings.filter(Boolean);
      const rest = block.replace(/^#{1,4}\s+.+$/m, '').trim();
      if (!rest) continue;
      for (const piece of splitLong(rest, max)) {
        if (bufLen + piece.length > target && bufLen > overlap) flush();
        buf.push(piece);
        bufLen += piece.length;
      }
      continue;
    }
    for (const piece of splitLong(block.trim(), max)) {
      if (bufLen + piece.length > target && bufLen > overlap) flush();
      buf.push(piece);
      bufLen += piece.length;
    }
  }
  if (bufLen > overlap || chunks.length === 0) flush();
  return chunks;
}
