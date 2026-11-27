'use client';
// Streaming Socratic tutor for the current question (server-sent events).
import { useEffect, useRef, useState } from 'react';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export function TutorPanel({
  sessionId,
  itemId,
  answered,
  nudge,
  onHelpUsed,
  onClose,
}: {
  sessionId: string;
  itemId: string;
  answered: boolean;
  nudge: string | null;
  /** Called once per tutor turn before answering (+1 more if a hint was revealed). */
  onHelpUsed: (units: number) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setError(null);
    fetch(`/api/sessions/${sessionId}/tutor?itemId=${itemId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((h: Msg[]) => {
        if (cancelled) return;
        setMessages(h.length ? h : nudge ? [{ role: 'assistant', content: nudge }] : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId, itemId, nudge]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    const setLast = (fn: (s: string) => string) =>
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: fn(m.at(-1)?.content ?? '') }]);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/tutor`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId, message: text }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Tutor unavailable');
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const event = raw.match(/^event: (.*)$/m)?.[1];
          const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] ?? '{}');
          if (event === 'delta') setLast((s) => s + data.text);
          if (event === 'done') {
            setLast(() => data.reply); // authoritative (replaces a guarded/aborted stream)
            if (!answered) onHelpUsed(1 + (data.hintRevealed ? 1 : 0));
          }
          if (event === 'error') throw new Error(data.error);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => (m.at(-1)?.role === 'assistant' && !m.at(-1)?.content ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
    }
  }

  const starters = answered
    ? ['Why is that the right answer?', 'Explain my mistake', 'Give me a similar example']
    : ["I'm stuck. Where do I start?", 'Can you explain the idea?', 'Is my thinking on the right track?'];

  return (
    <aside className="card flex flex-col gap-3 p-4" aria-label="AI tutor">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">💬 Tutor</h3>
        <button className="btn btn-ghost text-sm" onClick={onClose} aria-label="Close tutor">✕</button>
      </div>
      {!answered && <p className="muted text-xs">I’ll guide you to the answer, not give it away. Using the tutor counts as a hint.</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}
            style={{ background: m.role === 'user' ? 'var(--accent-soft)' : 'var(--bg)' }}
          >
            {m.content || <span className="muted">thinking…</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2">
          {starters.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--bad)' }}>{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this question…" disabled={busy} />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}
