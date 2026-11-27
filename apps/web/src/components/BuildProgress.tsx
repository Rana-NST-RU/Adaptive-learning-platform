'use client';
// Live view of the agents building a course (polls the course status).
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Status {
  title: string;
  description: string;
  status: 'building' | 'ready' | 'failed';
  concepts: number;
  activity: Array<{ agent: string; status: string; summary: string | null }>;
}

const LABEL: Record<string, string> = {
  librarian: '📚 Librarian',
  architect: '🏗️ Curriculum Architect',
  author: '✍️ Item Author',
  verifier: '🔍 Item Verifier',
};

export function BuildProgress({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!stop) setS(data);
        if (data.status === 'building' && !stop) setTimeout(tick, 2500);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [courseId]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <h1 className="text-2xl font-bold">{s?.status === 'ready' ? s.title : 'Your AI team is building your course'}</h1>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {s?.status === 'building' && <p className="muted">Reading your material, mapping concepts and prerequisites, and writing lessons. This page updates live.</p>}
      {s?.status === 'ready' && (
        <div className="card space-y-3 p-5">
          <p>{s.description}</p>
          <p className="muted text-sm">{s.concepts} concepts. Your first questions are being written and verified now.</p>
          <button className="btn btn-primary" onClick={() => { router.push('/learn'); router.refresh(); }}>Open my course</button>
        </div>
      )}
      {s?.status === 'failed' && (
        <div className="card space-y-3 p-5">
          <p style={{ color: 'var(--bad)' }}>The course couldn’t be built this time.</p>
          <Link href="/courses/new" className="btn btn-primary inline-block">Try again</Link>
        </div>
      )}
      <section className="card space-y-2 p-5">
        <h2 className="font-semibold">Agent activity</h2>
        {!s?.activity.length && <p className="muted text-sm">Starting up…</p>}
        <ul className="space-y-1 text-sm">
          {s?.activity.map((a, i) => (
            <li key={i}>
              <span className="font-medium">{LABEL[a.agent] ?? a.agent}</span>{' '}
              <span className="muted">{a.status === 'running' ? 'working…' : a.status === 'failed' ? 'hit a problem' : ''}</span> {a.summary}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
