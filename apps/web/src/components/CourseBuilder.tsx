'use client';
// Goal (+ optional PDFs/notes/URL) → Curriculum Architect builds a course.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function CourseBuilder({ onBeforeSubmit }: { onBeforeSubmit?: () => Promise<void> }) {
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onBeforeSubmit?.();
      const fd = new FormData();
      fd.set('goal', goal);
      if (url) fd.set('url', url);
      files.forEach((f) => fd.append('files', f));
      const res = await fetch('/api/courses/build', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start building the course');
      router.push(`/courses/${data.courseId}/building`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        className="input min-h-24"
        placeholder="What do you want to learn? e.g. “Probability for data-science interviews” or “Kubernetes basics for a backend developer”"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="muted">Your material (optional: PDF, Markdown, text, up to 3)</span>
          <input
            type="file"
            multiple
            accept=".pdf,.md,.markdown,.txt,application/pdf,text/plain,text/markdown"
            className="input"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="muted">Or a web page to base it on (optional)</span>
          <input className="input" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--bad)' }}>{error}</p>}
      <button type="button" className="btn btn-primary" disabled={busy || goal.trim().length < 5} onClick={submit}>
        {busy ? 'Starting…' : 'Build my course'}
      </button>
      <p className="muted text-xs">
        The Curriculum Architect designs a concept map with lessons and common pitfalls. The Item Author then writes your first
        questions, and the Verifier checks each one. Takes a minute or two.
      </p>
    </div>
  );
}
