'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function StartSessionButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const step = await api<{ sessionId: string }>('/api/sessions', { courseId });
        router.push(`/learn/session/${step.sessionId}`);
      }}
    >
      {busy ? 'Preparing…' : 'Start session'}
    </button>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-ghost"
      onClick={async () => {
        await api('/api/auth/logout', {});
        router.push('/');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
