import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/server/auth';

export default async function Home() {
  if (await getUser()) redirect('/learn');
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6">
      <div className="space-y-4">
        <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>
          Adaptive Learning Platform
        </p>
        <h1 className="text-4xl font-bold leading-tight">Practice that adapts to what you know, what you’re forgetting, and how it’s going.</h1>
        <p className="muted text-lg">
          A learner model tracks your mastery, memory and momentum. AI agents write and verify questions for you,
          coach you Socratically, and re-plan when you get stuck. Every decision comes with a plain-language reason.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/register" className="btn btn-primary">Get started</Link>
        <Link href="/login" className="btn btn-ghost">Sign in</Link>
      </div>
    </main>
  );
}
