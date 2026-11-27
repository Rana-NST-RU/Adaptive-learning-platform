'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/auth/${mode}`, mode === 'login' ? { email: form.email, password: form.password } : form);
      router.push(mode === 'register' ? '/onboarding' : '/learn');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <form onSubmit={submit} className="card space-y-4 p-6">
        <h1 className="text-xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        {mode === 'register' && (
          <label className="block space-y-1 text-sm">
            <span>Name</span>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            className="input"
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="text-sm" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <p className="muted text-center text-sm">
          {mode === 'login' ? (
            <>New here? <Link className="underline" href="/register">Create an account</Link></>
          ) : (
            <>Already have an account? <Link className="underline" href="/login">Sign in</Link></>
          )}
        </p>
      </form>
    </main>
  );
}
