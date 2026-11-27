// Server-rendered SVG of the concept DAG. Columns = prerequisite depth.
// Fill = mastery; opacity = current recall (memory fading is visible).

interface Node {
  id: string;
  name: string;
  prerequisites: string[];
  order: number;
  status: 'locked' | 'available' | 'learning' | 'mastered';
  mastery: number;
  recall: number;
  due: boolean;
}

const W = 168;
const H = 46;
const GX = 56;
const GY = 18;

export function KnowledgeMap({ concepts }: { concepts: Node[] }) {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const depth = new Map<string, number>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const n = byId.get(id)!;
    const v = n.prerequisites.length ? 1 + Math.max(...n.prerequisites.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  concepts.forEach((c) => d(c.id));
  const cols: Node[][] = [];
  [...concepts].sort((a, b) => a.order - b.order).forEach((c) => (cols[depth.get(c.id)!] ??= []).push(c));
  const pos = new Map<string, { x: number; y: number }>();
  cols.forEach((col, i) => col.forEach((c, j) => pos.set(c.id, { x: i * (W + GX), y: j * (H + GY) })));
  const width = cols.length * (W + GX) - GX;
  const height = Math.max(...cols.map((c) => c.length)) * (H + GY) - GY;

  const fill = (c: Node) =>
    c.status === 'locked' ? 'var(--line)' : `color-mix(in srgb, var(--good) ${Math.round(15 + c.mastery * 75)}%, var(--surface))`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} width={width + 8} role="img" aria-label="Concept map with mastery">
        <defs>
          <marker id="arrow" viewBox="0 0 8 8" refX="8" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" />
          </marker>
        </defs>
        {concepts.flatMap((c) =>
          c.prerequisites.map((p) => {
            const a = pos.get(p)!;
            const b = pos.get(c.id)!;
            return (
              <path
                key={`${p}-${c.id}`}
                d={`M${a.x + W},${a.y + H / 2} C${a.x + W + GX / 2},${a.y + H / 2} ${b.x - GX / 2},${b.y + H / 2} ${b.x},${b.y + H / 2}`}
                fill="none"
                stroke="var(--muted)"
                strokeOpacity={0.45}
                markerEnd="url(#arrow)"
              />
            );
          }),
        )}
        {concepts.map((c) => {
          const p = pos.get(c.id)!;
          return (
            <g key={c.id} transform={`translate(${p.x},${p.y})`} opacity={c.status === 'locked' ? 0.55 : 0.45 + 0.55 * c.recall}>
              <title>{`${c.name}: ${c.status}, mastery ${Math.round(c.mastery * 100)}%${c.due ? ', due for review' : ''}`}</title>
              <rect width={W} height={H} rx={10} fill={fill(c)} stroke={c.due ? 'var(--accent)' : 'var(--line)'} strokeWidth={c.due ? 2 : 1} />
              <text x={10} y={19} fontSize={12.5} fontWeight={600} fill="var(--ink)">
                {c.status === 'locked' ? '🔒 ' : c.status === 'mastered' ? '✓ ' : ''}
                {c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name}
              </text>
              <text x={10} y={36} fontSize={11} fill="var(--muted)">
                {c.status === 'locked' ? 'locked' : `${Math.round(c.mastery * 100)}% mastery${c.due ? ' · review' : ''}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
