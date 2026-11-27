// Coach's end-of-session reflection (session end screen + dashboard).
import type { SessionReflection } from '@/server/db/schema';

export function ReflectionCard({ r }: { r: SessionReflection }) {
  return (
    <div className="space-y-2 rounded-xl p-4 text-left text-sm" style={{ background: 'var(--accent-soft)' }}>
      <p className="font-semibold">🪞 {r.headline}</p>
      <p><span className="font-medium">Went well:</span> {r.wentWell}</p>
      <p><span className="font-medium">Work on:</span> {r.toWorkOn}</p>
      {r.calibrationNote && <p><span className="font-medium">Confidence:</span> {r.calibrationNote}</p>}
      <p><span className="font-medium">Next time:</span> {r.nextStep}</p>
    </div>
  );
}
