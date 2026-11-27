'use client';
// The adaptive practice loop. Everything visual here is driven by the
// engine's UxPolicy (mode, hints, depth, tone, timer, density, celebration).
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedbackView, StepView } from '@/server/learner/service';
import type { SessionReflection } from '@/server/db/schema';
import { api } from '@/lib/api';
import { Inline } from '@/lib/md';
import { TutorPanel } from './TutorPanel';
import { ReflectionCard } from './ReflectionCard';

type Phase = 'loading' | 'lesson' | 'question' | 'feedback' | 'break' | 'ended' | 'error' | 'waiting';

const MODE_LABEL: Record<string, string> = {
  focus: 'Focus',
  challenge: 'Challenge',
  recovery: 'Recovery',
  review: 'Review',
  explore: 'Explore',
};
const CONFIDENCE = ['Guessing', 'Unsure', 'Fairly sure', 'Certain'];

export function PracticeSession({ sessionId }: { sessionId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState<StepView | null>(null);
  const [feedback, setFeedback] = useState<FeedbackView | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  const [showWhy, setShowWhy] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ answered: number; correct: number; minutes: number } | null>(null);
  const [reflection, setReflection] = useState<{ status: 'pending' | 'ready' | 'none'; reflection: SessionReflection | null } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorHelp, setTutorHelp] = useState(0);
  const shownAt = useRef(Date.now());
  const seenLessons = useRef(new Set<string>());

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const s = await api<StepView>(`/api/sessions/${sessionId}/next`, {});
      setStep(s);
      setFeedback(null);
      setSelected(null);
      setText('');
      setHints([]);
      setTutorHelp(0);
      setShowWhy(false);
      setShowExplanation(false);
      if (s.kind === 'break') return setPhase('break');
      if (s.kind === 'learn_new' && s.concept?.lesson && !seenLessons.current.has(s.concept.id)) {
        seenLessons.current.add(s.concept.id);
        return setPhase('lesson');
      }
      if (!s.item) return setPhase('waiting');
      shownAt.current = Date.now();
      setPhase('question');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Brand-new agent-built courses: questions are still being written. Retry.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setTimeout(() => void load(), 6000);
    return () => clearTimeout(t);
  }, [phase, load]);

  // Visible timer only in challenge mode (UxPolicy.showTimer).
  useEffect(() => {
    if (phase !== 'question' || !step?.ux.showTimer) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - shownAt.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [phase, step?.ux.showTimer]);

  // Proactive hint policy: offer the first hint automatically after a pause.
  useEffect(() => {
    if (phase !== 'question' || step?.ux.hintPolicy !== 'proactive' || !step.item?.hintCount) return;
    const t = setTimeout(() => void takeHint(), 25_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step?.item?.id]);

  async function takeHint() {
    if (!step?.item || hints.length >= step.item.hintCount) return;
    const h = await api<{ hint: string }>(`/api/sessions/${sessionId}/hint`, { itemId: step.item.id, level: hints.length });
    setHints((prev) => (prev.length === hints.length ? [...prev, h.hint] : prev));
  }

  async function submit(confidence: number | null) {
    if (!step?.item) return;
    const response = step.item.format === 'short_answer' ? text.trim() : selected;
    if (!response) return;
    setPhase('loading');
    try {
      const fb = await api<FeedbackView>(`/api/sessions/${sessionId}/answer`, {
        itemId: step.item.id,
        response,
        confidence,
        latencyMs: Date.now() - shownAt.current,
        hintsUsed: Math.min(10, hints.length + tutorHelp),
      });
      setFeedback(fb);
      setShowExplanation(step.ux.explanationDepth !== 'brief' || !fb.correct);
      setPhase('feedback');
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  }

  async function end() {
    setPhase('loading');
    const s = await api<{ answered: number; correct: number; minutes: number }>(`/api/sessions/${sessionId}/end`, {});
    setSummary(s);
    setPhase('ended');
  }

  // After the session ends, the Coach writes a reflection in the background.
  useEffect(() => {
    if (phase !== 'ended') return;
    let stop = false;
    let tries = 0;
    const poll = async () => {
      try {
        const r = await api<{ status: 'pending' | 'ready' | 'none'; reflection: SessionReflection | null }>(`/api/sessions/${sessionId}/reflection`);
        if (stop) return;
        setReflection(r);
        if (r.status === 'pending' && ++tries < 30) setTimeout(poll, 2_000);
      } catch {
        if (!stop) setReflection({ status: 'none', reflection: null });
      }
    };
    void poll();
    return () => {
      stop = true;
    };
  }, [phase, sessionId]);

  const ux = step?.ux;
  const minimal = ux?.density === 'minimal';

  return (
    <div data-mode={ux?.mode ?? 'focus'} className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <main className="mx-auto max-w-2xl space-y-5 px-5 py-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/learn" className="btn btn-ghost text-sm">← Dashboard</Link>
          <div className="flex items-center gap-2 text-sm">
            {ux && (
              <button
                className="chip"
                data-on="true"
                title={ux.reasons.join(' ')}
                onClick={() => setShowWhy((v) => !v)}
                aria-expanded={showWhy}
              >
                {MODE_LABEL[ux.mode]} mode
              </button>
            )}
            {step && !minimal && (
              <span className="muted">
                {step.progress.correct}/{step.progress.answered} · {step.progress.minutes} min
              </span>
            )}
            {ux?.showTimer && phase === 'question' && <span className="font-mono">{elapsed}s</span>}
            {phase !== 'ended' && (
              <button className="btn btn-ghost" onClick={end}>End</button>
            )}
          </div>
        </header>

        {step?.plan && (step.plan.by === 'director' || !minimal) && phase !== 'ended' && (
          <div className="card space-y-1 p-3 text-sm" style={{ borderColor: 'var(--accent)' }}>
            <p>
              <span className="font-semibold">{step.plan.by === 'director' ? '🧭 Your plan:' : 'Plan:'}</span> {step.plan.headline}
            </p>
            {!minimal && step.plan.reasons?.length ? <p className="muted text-xs">{step.plan.reasons.join(' ')}</p> : null}
            {!minimal && step.plan.steps.length > 1 && (
              <ol className="muted list-decimal pl-5 text-xs">
                {step.plan.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {step?.agents && ux?.tutorNudge && phase === 'question' && !tutorOpen && (
          <button className="block w-full rounded-xl p-3 text-left text-sm" style={{ background: 'var(--accent-soft)' }} onClick={() => setTutorOpen(true)}>
            💬 {ux.tutorNudge} <span className="font-semibold" style={{ color: 'var(--accent)' }}>Talk it through →</span>
          </button>
        )}

        {showWhy && step && (
          <section className="card space-y-2 p-4 text-sm">
            <h3 className="font-semibold">Why you’re seeing this</h3>
            <ul className="list-disc space-y-1 pl-5">
              {step.why.map((w, i) => <li key={i}>{w}</li>)}
              {ux?.reasons.map((w, i) => <li key={`u${i}`} className="muted">{w}</li>)}
            </ul>
          </section>
        )}

        {phase === 'loading' && <div className="card muted p-8 text-center">Thinking about what’s best for you next…</div>}

        {phase === 'waiting' && (
          <div className="card space-y-2 p-8 text-center">
            <p className="text-3xl">✍️</p>
            <p className="font-semibold">Your questions for {step?.concept?.name ?? 'this concept'} are being written and checked</p>
            <p className="muted text-sm">The Item Author drafts them and the Verifier solves each one blind before you see it. This usually takes under a minute.</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="card space-y-3 p-6">
            <p style={{ color: 'var(--bad)' }}>{error}</p>
            <button className="btn btn-primary" onClick={load}>Try again</button>
          </div>
        )}

        {phase === 'lesson' && step?.concept && (
          <section className="card space-y-4 p-6">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--accent)' }}>New concept</p>
            <h2 className="text-xl font-bold">{step.concept.name}</h2>
            <p className="leading-relaxed"><Inline text={step.concept.lesson ?? step.concept.summary} /></p>
            <button className="btn btn-primary" onClick={() => { shownAt.current = Date.now(); setPhase(step.item ? 'question' : 'waiting'); }}>
              Try a question
            </button>
          </section>
        )}

        {phase === 'break' && step && (
          <section className="card space-y-4 p-6 text-center">
            <p className="text-4xl">🌿</p>
            <h2 className="text-xl font-bold">Time for a short break</h2>
            <p className="muted">{step.why[0]}</p>
            <div className="flex justify-center gap-3">
              <button className="btn btn-primary" onClick={end}>End session</button>
              <button className="btn btn-ghost" onClick={load}>Keep going</button>
            </div>
          </section>
        )}

        {(phase === 'question' || phase === 'feedback') && step?.item && (
          <section className="card space-y-4 p-6">
            <p className="muted text-sm">{step.concept?.name}</p>
            <h2 className="text-lg font-semibold leading-snug">{step.item.stem}</h2>
            {step.item.code && (
              <pre className="overflow-x-auto rounded-lg p-4 font-mono text-sm" style={{ background: 'var(--accent-soft)' }}>
                <code>{step.item.code}</code>
              </pre>
            )}

            {step.item.format === 'short_answer' ? (
              <input
                className="input"
                value={text}
                disabled={phase === 'feedback'}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your answer"
              />
            ) : (
              <div className="space-y-2">
                {step.item.options.map((o) => {
                  const isCorrect = feedback?.correctOptionId === o.id;
                  const isChosenWrong = phase === 'feedback' && selected === o.id && !feedback?.correct;
                  return (
                    <button
                      key={o.id}
                      disabled={phase === 'feedback'}
                      onClick={() => setSelected(o.id)}
                      className="block w-full rounded-xl border p-3 text-left transition"
                      style={{
                        borderColor: isCorrect ? 'var(--good)' : isChosenWrong ? 'var(--bad)' : selected === o.id ? 'var(--accent)' : 'var(--line)',
                        background: isCorrect ? 'var(--good-soft)' : isChosenWrong ? 'var(--bad-soft)' : selected === o.id ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <span className="mr-2 font-mono text-sm uppercase muted">{o.id}</span>
                      {o.text}
                    </button>
                  );
                })}
              </div>
            )}

            {hints.length > 0 && (
              <div className="space-y-1 rounded-lg p-3 text-sm" style={{ background: 'var(--accent-soft)' }}>
                {hints.map((h, i) => <p key={i}>💡 {h}</p>)}
              </div>
            )}

            {phase === 'question' && (
              <div className="space-y-3">
                {ux?.askConfidence ? (
                  <div className="space-y-2">
                    <p className="muted text-sm">How sure are you? (submits your answer)</p>
                    <div className="flex flex-wrap gap-2">
                      {CONFIDENCE.map((c, i) => (
                        <button
                          key={c}
                          className="btn btn-primary text-sm"
                          disabled={step.item!.format === 'short_answer' ? !text.trim() : !selected}
                          onClick={() => submit(i + 1)}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-primary"
                    disabled={step.item.format === 'short_answer' ? !text.trim() : !selected}
                    onClick={() => submit(null)}
                  >
                    Check answer
                  </button>
                )}
                {ux?.hintPolicy !== 'after_attempt' && hints.length < step.item.hintCount && (
                  <button
                    className={ux?.hintPolicy === 'proactive' ? 'chip' : 'btn btn-ghost text-sm'}
                    data-on={ux?.hintPolicy === 'proactive'}
                    onClick={takeHint}
                  >
                    {hints.length ? 'Another hint' : 'Need a nudge?'}
                  </button>
                )}
              </div>
            )}

            {phase === 'feedback' && feedback && (
              <div className="space-y-3">
                <div className="rounded-xl p-4" style={{ background: feedback.correct ? 'var(--good-soft)' : 'var(--bad-soft)' }}>
                  <p className="font-semibold" style={{ color: feedback.correct ? 'var(--good)' : 'var(--bad)' }}>
                    {feedback.correct
                      ? ux?.celebration === 2 ? '🎉 Yes! Nicely done.' : ux?.celebration === 0 ? 'Correct.' : '✓ Correct'
                      : ux?.tone === 'encouraging' ? 'Not quite, and that’s how learning works.' : 'Not quite.'}
                  </p>
                  {!feedback.correct && feedback.optionFeedback && <p className="mt-1 text-sm">{feedback.optionFeedback}</p>}
                  {feedback.misconception && (
                    <p className="mt-1 text-sm muted">Common mix-up: {feedback.misconception[0]!.toLowerCase() + feedback.misconception.slice(1)}.</p>
                  )}
                </div>
                {showExplanation ? (
                  <p className="text-sm leading-relaxed">{feedback.explanation}</p>
                ) : (
                  <button className="btn btn-ghost text-sm" onClick={() => setShowExplanation(true)}>Why?</button>
                )}
                <MasteryBar {...feedback.mastery} />
                {feedback.events.map((e, i) => <p key={i} className="text-sm font-medium">{e}</p>)}
                <button className="btn btn-primary" onClick={load} autoFocus>Next</button>
              </div>
            )}
          </section>
        )}

        {step?.agents && step.item && (phase === 'question' || phase === 'feedback') && (
          tutorOpen ? (
            <TutorPanel
              sessionId={sessionId}
              itemId={step.item.id}
              answered={phase === 'feedback'}
              nudge={ux?.tutorNudge ?? null}
              onHelpUsed={(n) => setTutorHelp((h) => h + n)}
              onClose={() => setTutorOpen(false)}
            />
          ) : (
            <button className="btn btn-ghost text-sm" onClick={() => setTutorOpen(true)}>
              💬 {phase === 'feedback' ? 'Discuss this answer with the tutor' : 'Ask the tutor'}
            </button>
          )
        )}

        {phase === 'ended' && summary && (
          <section className="card space-y-4 p-6 text-center">
            <h2 className="text-xl font-bold">Session complete</h2>
            <p className="muted">
              {summary.answered} questions · {summary.correct} correct · {summary.minutes} min
            </p>
            {reflection?.status === 'ready' && reflection.reflection ? (
              <ReflectionCard r={reflection.reflection} />
            ) : reflection?.status === 'pending' || !reflection ? (
              <p className="muted text-sm">Your coach is reflecting on this session…</p>
            ) : (
              <p className="muted text-sm">Nice work. Keep sessions going to build up your knowledge map.</p>
            )}
            <Link className="btn btn-primary inline-block" href="/learn">Back to dashboard</Link>
          </section>
        )}
      </main>
    </div>
  );
}

function MasteryBar({ name, before, after }: { name: string; before: number; after: number }) {
  const up = after >= before;
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="muted">{name} mastery</span>
        <span>
          {Math.round(before * 100)}% → <strong style={{ color: up ? 'var(--good)' : 'var(--bad)' }}>{Math.round(after * 100)}%</strong>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--line)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(after * 100)}%`, background: 'var(--accent)' }} />
      </div>
    </div>
  );
}
