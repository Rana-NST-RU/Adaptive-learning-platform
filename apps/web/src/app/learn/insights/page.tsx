import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getUser } from '@/server/auth';
import { db, schema } from '@/server/db';
import { learnerOverview } from '@/server/learner/service';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

export default async function InsightsPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const enrolment = await db.query.enrollments.findFirst({
    where: eq(schema.enrollments.userId, user.id),
    orderBy: desc(schema.enrollments.createdAt),
  });
  if (!enrolment) redirect('/onboarding');
  const o = await learnerOverview(user.id, enrolment.courseId);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">What the learner model believes about you</h1>
        <Link href="/learn" className="btn btn-ghost">← Dashboard</Link>
      </header>
      <p className="muted max-w-3xl text-sm">
        This is the same model the platform uses to choose your next question. <strong>Knowledge</strong> is the
        probability you’ve learned a concept. <strong>Recall</strong> is how likely you are to remember it right now.
        <strong> Mastery</strong> needs both, plus consistent performance on average-difficulty questions.
      </p>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="muted">
            <tr>
              <th className="p-3">Concept</th>
              <th className="p-3">Status</th>
              <th className="p-3">Mastery</th>
              <th className="p-3">Knowledge</th>
              <th className="p-3">Recall now</th>
              <th className="p-3">Accuracy</th>
              <th className="p-3">Watch out for</th>
            </tr>
          </thead>
          <tbody>
            {o.concepts.map((c) => (
              <tr key={c.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3 capitalize">{c.status}{c.due ? ' · due' : ''}</td>
                <td className="p-3">{pct(c.mastery)}</td>
                <td className="p-3">{pct(c.pKnown)}</td>
                <td className="p-3">{c.attempts ? pct(c.recall) : '—'}</td>
                <td className="p-3">{c.attempts ? `${pct(c.accuracy)} of ${c.attempts}` : '—'}</td>
                <td className="p-3 muted">{c.misconceptions.join('; ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
