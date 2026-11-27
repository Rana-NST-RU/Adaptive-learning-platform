import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';
import { agentsEnabled } from '@/server/agents/runtime';
import { CourseBuilder } from '@/components/CourseBuilder';

export default async function NewCoursePage() {
  if (!(await getUser())) redirect('/login');
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Build a new course</h1>
        <Link href="/learn" className="btn btn-ghost">← Dashboard</Link>
      </header>
      {agentsEnabled() ? (
        <CourseBuilder />
      ) : (
        <p className="card muted p-5">Course building uses the AI agents. Add ANTHROPIC_API_KEY to apps/web/.env.local to enable it.</p>
      )}
    </main>
  );
}
