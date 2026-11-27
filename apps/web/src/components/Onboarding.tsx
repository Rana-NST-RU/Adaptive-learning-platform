'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

const LEVELS = ['Brand new', 'Seen it before', 'Comfortable', 'Strong', 'Expert'];

export function Onboarding({ name, courses }: { name: string; courses: Array<{ id: string; title: string; description: string }> }) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [interests, setInterests] = useState('');
  const [level, setLevel] = useState(2);
  const [minutes, setMinutes] = useState(20);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(
        '/api/profile',
        {
          goal: goal || undefined,
          interests: interests.split(',').map((s) => s.trim()).filter(Boolean),
          selfRatedLevel: level,
          dailyGoalMinutes: minutes,
        },
        'PUT',
      );
      await api(`/api/courses/${courseId}/enroll`, {});
      router.push('/learn');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <form onSubmit={submit} className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Hi {name.split(' ')[0]} 👋 Let’s tune this to you.</h1>
          <p className="muted mt-1">Your answers set the starting point. Everything adapts from your first question onwards.</p>
        </div>

        <section className="space-y-2">
          <h2 className="font-semibold">What are you working towards?</h2>
          <input className="input" placeholder="e.g. pass coding interviews in 6 weeks" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">What do you enjoy? <span className="muted font-normal">(used to personalise examples)</span></h2>
          <input className="input" placeholder="e.g. cricket, music, startups" value={interests} onChange={(e) => setInterests(e.target.value)} />
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">How familiar are you with the subject?</h2>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l, i) => (
              <button type="button" key={l} className="chip" data-on={level === i + 1} onClick={() => setLevel(i + 1)}>
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Daily goal</h2>
          <div className="flex flex-wrap gap-2">
            {[10, 20, 30, 45].map((m) => (
              <button type="button" key={m} className="chip" data-on={minutes === m} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold">Pick a course</h2>
          <div className="space-y-2">
            {courses.map((c) => (
              <label key={c.id} className="card flex cursor-pointer gap-3 p-4" style={courseId === c.id ? { borderColor: 'var(--accent)' } : undefined}>
                <input type="radio" name="course" checked={courseId === c.id} onChange={() => setCourseId(c.id)} />
                <span>
                  <span className="block font-semibold">{c.title}</span>
                  <span className="muted block text-sm">{c.description}</span>
                </span>
              </label>
            ))}
            <p className="muted text-sm">Soon: describe any goal and the Curriculum Architect agent will build a course for you.</p>
          </div>
        </section>

        {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="btn btn-primary" disabled={busy || !courseId}>{busy ? 'Setting up…' : 'Start learning'}</button>
      </form>
    </main>
  );
}
