'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ReplayEntry {
  question: {
    id: string;
    conceptName: string;
    content: string;
    questionType: string;
    difficulty: string;
    options?: string[];
    correctAnswer: string;
    explanation: string;
  };
  userAnswer: string;
  result: {
    isCorrect: boolean;
    score: number;
    xpEarned: number;
  };
  timeTakenMs: number;
  hintsUsed: number;
}

const DIFF_COLOR: Record<string, string> = { EASY: '#10b981', MEDIUM: '#f59e0b', HARD: '#ef4444' };

export default function ReplayPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ReplayEntry[]>([]);
  const [current, setCurrent] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('alos_replay');
      if (raw) setEntries(JSON.parse(raw));
    } catch { setEntries([]); }
  }, []);

  if (entries.length === 0) return (
    <div style={{
      minHeight: '100vh', background: '#0a0a14', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', gap: 20,
    }}>
      <div style={{ fontSize: 48 }}>📭</div>
      <div style={{ color: '#64748b', fontSize: 18 }}>No session replay found.</div>
      <div style={{ color: '#475569', fontSize: 14 }}>Complete a practice session first, then click ▶ Replay.</div>
      <button onClick={() => router.push('/dashboard/practice')} style={{
        marginTop: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        border: 'none', color: '#fff', borderRadius: 12, padding: '12px 24px',
        fontWeight: 700, fontSize: 15, cursor: 'pointer',
      }}>Start Practice →</button>
    </div>
  );

  const entry = entries[current];
  const { question, userAnswer, result, timeTakenMs, hintsUsed } = entry;
  const correctTotal = entries.filter(e => e.result.isCorrect).length;
  const accuracy = Math.round((correctTotal / entries.length) * 100);

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a14', padding: '32px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button onClick={() => router.push('/dashboard/practice')} style={{
            background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14,
          }}>← Back</button>
          <div style={{ color: '#64748b', fontSize: 14 }}>
            Session Replay — {correctTotal}/{entries.length} correct ({accuracy}% accuracy)
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
          {entries.map((e, i) => (
            <button key={i} onClick={() => { setCurrent(i); setShowExplanation(false); }} style={{
              flex: 1, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: i === current
                ? (e.result.isCorrect ? '#10b981' : '#ef4444')
                : (e.result.isCorrect ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'),
              transition: 'background 0.2s',
            }} title={`Q${i + 1}: ${e.result.isCorrect ? '✓ Correct' : '✗ Wrong'}`} />
          ))}
        </div>

        {/* Question card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${result.isCorrect ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          borderRadius: 20, padding: '28px 28px 22px',
        }}>
          {/* Meta */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 11, fontWeight: 700 }}>
              {question.conceptName}
            </span>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: `${DIFF_COLOR[question.difficulty] ?? '#6366f1'}22`, color: DIFF_COLOR[question.difficulty] ?? '#6366f1', fontSize: 11, fontWeight: 700 }}>
              {question.difficulty}
            </span>
            <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#64748b', fontSize: 11, fontWeight: 600 }}>
              {question.questionType?.replace('_', ' ')}
            </span>
            <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: '#64748b', fontSize: 11 }}>
              ⏱ {(timeTakenMs / 1000).toFixed(1)}s · 💡 {hintsUsed} hints
            </span>
          </div>

          {/* Question */}
          <div style={{ color: '#e2e8f0', fontSize: 17, lineHeight: 1.7, fontWeight: 600, marginBottom: 22 }}>
            Q{current + 1}. {question.content}
          </div>

          {/* MCQ Options */}
          {question.questionType === 'MCQ' && question.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {question.options.map((opt: string, i: number) => {
                const isCorrectOpt = opt === question.correctAnswer || opt.startsWith(question.correctAnswer + ')') || question.correctAnswer.startsWith(opt[0]);
                const isUserOpt = userAnswer && (opt === userAnswer || opt.startsWith(userAnswer) || userAnswer === opt[0]);
                let bg = 'rgba(255,255,255,0.04)', border = '1px solid rgba(255,255,255,0.08)', color = '#94a3b8';
                if (isCorrectOpt) { bg = 'rgba(16,185,129,0.12)'; border = '1px solid rgba(16,185,129,0.35)'; color = '#6ee7b7'; }
                if (isUserOpt && !result.isCorrect) { bg = 'rgba(239,68,68,0.12)'; border = '1px solid rgba(239,68,68,0.35)'; color = '#fca5a5'; }
                return (
                  <div key={i} style={{ padding: '12px 16px', borderRadius: 10, background: bg, border, color, fontSize: 14 }}>
                    {opt}
                  </div>
                );
              })}
            </div>
          )}

          {/* Short answer / True-False */}
          {(question.questionType === 'SHORT_ANSWER' || question.questionType === 'TRUE_FALSE') && (
            <div style={{ marginBottom: 22 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Your answer: </span>
                <span style={{ color: result.isCorrect ? '#6ee7b7' : '#fca5a5', fontWeight: 700 }}>{userAnswer || '(blank)'}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Correct: </span>
                <span style={{ color: '#6ee7b7', fontWeight: 700 }}>{question.correctAnswer}</span>
              </div>
            </div>
          )}

          {/* Result badge */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18 }}>
            <div style={{
              padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 15,
              background: result.isCorrect ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              color: result.isCorrect ? '#34d399' : '#f87171',
            }}>
              {result.isCorrect ? '✓ Correct' : '✗ Incorrect'}
            </div>
            <div style={{ color: '#6366f1', fontWeight: 700, fontSize: 14 }}>+{result.xpEarned} XP</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>{Math.round(result.score * 100)}% score</div>
          </div>

          {/* Explanation toggle */}
          <button onClick={() => setShowExplanation(v => !v)} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#94a3b8', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            {showExplanation ? '▲ Hide' : '▼ Show'} Explanation
          </button>

          {showExplanation && (
            <div style={{
              marginTop: 14, padding: '14px 18px', borderRadius: 12,
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
              color: '#c7d2fe', fontSize: 14, lineHeight: 1.7,
            }}>
              {question.explanation}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button onClick={() => { setCurrent(c => Math.max(0, c - 1)); setShowExplanation(false); }}
            disabled={current === 0}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: current === 0 ? '#334155' : '#94a3b8',
              fontWeight: 700, cursor: current === 0 ? 'default' : 'pointer', fontSize: 14,
            }}>← Previous</button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 14 }}>
            {current + 1} / {entries.length}
          </div>
          <button onClick={() => { setCurrent(c => Math.min(entries.length - 1, c + 1)); setShowExplanation(false); }}
            disabled={current === entries.length - 1}
            style={{
              flex: 1, padding: '14px', borderRadius: 12, border: 'none',
              background: current === entries.length - 1 ? 'rgba(99,102,241,0.15)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, cursor: current === entries.length - 1 ? 'default' : 'pointer', fontSize: 14,
            }}>Next →</button>
        </div>

      </div>
    </div>
  );
}
