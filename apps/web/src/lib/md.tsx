// Minimal inline formatting for lesson text: **bold** and `code`.
import { Fragment } from 'react';

export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <strong key={i}>{p.slice(2, -2)}</strong>
        ) : p.startsWith('`') ? (
          <code key={i} className="rounded px-1 font-mono text-[0.9em]" style={{ background: 'var(--accent-soft)' }}>
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
