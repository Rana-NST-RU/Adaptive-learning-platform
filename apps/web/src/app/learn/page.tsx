import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getUser } from '@/server/auth';
import { db, schema } from '@/server/db';
import { learnerOverview } from '@/server/learner/service';
import { KnowledgeMap } from '@/components/KnowledgeMap';
import { StartSessionButton, SignOutButton } from '@/components/DashboardActions';

export default async function LearnPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const enrolment = await db.query.enrollments.findFirst({
    where: eq(schema.enrollments.userId, user.id),
    orderBy: desc(schema.enrollments.createdAt),
  });
  if (!enrolment) redirect('/onboarding');
  const course = (await db.query.courses.findFirst({ where: eq(schema.courses.id, enrolment.courseId) }))!;
  const o = await learnerOverview(user.id, course.id);

  const cal = o.calibration;
  const calText =
    cal.label === 'insufficient_data'
      ? 'Rate your confidence on a few more answers to see this.'
      : cal.label === 'overconfident'
        ? 'You tend to feel surer than your results. Slowing down on “certain” answers helps.'
        : cal.label === 'underconfident'
          ? 'You know more than you think. Trust your first instinct a bit more.'
          : 'Your confidence matches your results well.';

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="muted text-sm">{course.title}</p>
          <h1 className="text-2xl font-bold">Welcome back, {user.name.split(' ')[0]}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/learn/insights" className="btn btn-ghost">Insights</Link>
          <SignOutButton />
        </div>
      </header>

      <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">
            {o.totals.due > 0 ? `${o.totals.due} concept${o.totals.due > 1 ? 's' : ''} ready for review` : o.totals.answered === 0 ? 'Ready when you are' : 'Keep the momentum going'}
          </h2>
          <p className="muted text-sm">The session adapts to you question by question: difficulty, pace, hints and tone.</p>
        </div>
        <StartSessionButton courseId={course.id} />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Mastered" value={`${o.totals.mastered}/${o.totals.concepts}`} />
        <Stat label="Questions answered" value={String(o.totals.answered)} />
        <Stat label="Due for review" value={String(o.totals.due)} />
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Your knowledge map</h2>
          <p className="muted text-xs">Colour = mastery · faded = fading from memory · arrows = prerequisites</p>
        </div>
        <KnowledgeMap concepts={o.concepts} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">Confidence check</h2>
          <p className="muted text-sm">{calText}</p>
        </div>
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">What your AI team did</h2>
          {o.activity.length === 0 ? (
            <p className="muted text-sm">Nothing yet. Agents step in when they can help: writing fresh questions, re-planning, reflecting.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {o.activity.map((a, i) => (
                <li key={i}>
                  <span className="font-medium capitalize">{a.agent.replace('_', ' ')}</span>: {a.summary ?? a.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="muted text-sm">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
