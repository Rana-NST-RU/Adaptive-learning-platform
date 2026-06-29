'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { questionsApi } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AttemptRecord {
  id: string;
  isCorrect: boolean;
  score: number;
  timeTakenMs: number;
  hintsUsed: number;
  timestamp: string;
  question: {
    content: string;
    questionType: string;
    difficulty: string;
    conceptName: string;
    domain: string;
  };
}

const DIFF_COLORS: Record<string, string> = {
  EASY: '#10b981',
  MEDIUM: '#f59e0b',
  HARD: '#ef4444',
};

const TYPE_ICONS: Record<string, string> = {
  MCQ: '🔘',
  TRUE_FALSE: '⚖️',
  SHORT_ANSWER: '✍️',
  CODE_SNIPPET: '</>'
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PracticeHistoryPage() {
  const [attempts, setAttempts] = useState<AttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all');

  useEffect(() => {
    setLoading(true);
    setError(null);
    questionsApi.getMyAttempts(limit)
      .then(res => setAttempts(res.data as any))
      .catch(err => {
        const status = err?.response?.status;
        if (status === 401) {
          setError('Please log in to view your attempt history.');
        } else {
          setError('Failed to load history. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [limit]);

  const filtered = attempts.filter(a => {
    if (filter === 'correct') return a.isCorrect;
    if (filter === 'wrong') return !a.isCorrect;
    return true;
  });

  const totalCorrect = attempts.filter(a => a.isCorrect).length;
  const avgScore = attempts.length > 0
    ? Math.round((attempts.reduce((s, a) => s + a.score, 0) / attempts.length) * 100)
    : 0;
  const avgTime = attempts.length > 0
    ? (attempts.reduce((s, a) => s + a.timeTakenMs, 0) / attempts.length / 1000).toFixed(1)
    : '0';

  return (
    <div style={{ minHeight: '100vh', padding: '24px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Link href="/dashboard/practice" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          color: '#64748b', fontSize: 14, textDecoration: 'none',
          padding: '6px 12px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          transition: 'all 0.2s',
        }}>
          ← Practice
        </Link>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            📋 Attempt History
          </h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
            Your last {limit} question attempts
          </p>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && !error && attempts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total Attempts', value: attempts.length, color: '#f1f5f9' },
            { label: 'Correct', value: totalCorrect, color: '#10b981' },
            { label: 'Avg Score', value: `${avgScore}%`, color: '#f59e0b' },
            { label: 'Avg Time', value: `${avgTime}s`, color: '#a5b4fc' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '16px 18px',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter controls */}
      {!loading && !error && attempts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', 'correct', 'wrong'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
              background: filter === f
                ? (f === 'correct' ? 'rgba(16,185,129,0.2)' : f === 'wrong' ? 'rgba(239,68,68,0.2)' : 'rgba(99,102,241,0.2)')
                : 'rgba(255,255,255,0.05)',
              color: filter === f
                ? (f === 'correct' ? '#10b981' : f === 'wrong' ? '#ef4444' : '#a5b4fc')
                : '#64748b',
              boxShadow: filter === f
                ? `0 0 0 1px ${f === 'correct' ? '#10b98155' : f === 'wrong' ? '#ef444455' : '#6366f155'}`
                : 'none',
            }}>
              {f === 'all' ? '📋 All' : f === 'correct' ? '✅ Correct' : '❌ Wrong'}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.7 }}>
                ({f === 'all' ? attempts.length : f === 'correct' ? totalCorrect : attempts.length - totalCorrect})
              </span>
            </button>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#64748b', fontSize: 13 }}>Show:</span>
            {[20, 50, 100].map(n => (
              <button key={n} onClick={() => setLimit(n)} style={{
                padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13,
                background: limit === n ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                color: limit === n ? '#a5b4fc' : '#64748b',
              }}>{n}</button>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              height: 76, borderRadius: 14, background: 'rgba(255,255,255,0.04)',
              animation: 'shimmer 1.5s infinite',
            }} />
          ))}
          <style>{`@keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.5} }`}</style>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 14, padding: '24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontWeight: 600, marginBottom: 8 }}>{error}</div>
          {error.includes('log in') && (
            <Link href="/login" style={{
              display: 'inline-block', marginTop: 8, padding: '8px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 14,
            }}>Go to Login</Link>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && attempts.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '64px 24px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)', borderRadius: 20,
          border: '1px dashed rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎯</div>
          <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 18, marginBottom: 8 }}>
            No attempts yet
          </div>
          <div style={{ color: '#64748b', fontSize: 14, maxWidth: 280, marginBottom: 24 }}>
            Start a practice session to see your attempt history here.
          </div>
          <Link href="/dashboard/practice" style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 15,
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>⚡ Start Practicing</Link>
        </div>
      )}

      {/* Attempt list */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((attempt, i) => (
            <AttemptCard key={attempt.id} attempt={attempt} index={i} />
          ))}
        </div>
      )}

      {/* No results after filter */}
      {!loading && !error && attempts.length > 0 && filtered.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px 24px', color: '#64748b', fontSize: 14,
          background: 'rgba(255,255,255,0.02)', borderRadius: 14,
          border: '1px dashed rgba(255,255,255,0.06)',
        }}>
          No {filter === 'correct' ? 'correct' : 'wrong'} attempts in the last {limit} questions.
        </div>
      )}
    </div>
  );
}

// ─── Attempt Card ─────────────────────────────────────────────────────────────

function AttemptCard({ attempt, index }: { attempt: AttemptRecord; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const q = attempt.question;
  const timeAgo = getTimeAgo(attempt.timestamp);
  const typeIcon = TYPE_ICONS[q.questionType] ?? '❓';
  const diffColor = DIFF_COLORS[q.difficulty] ?? '#94a3b8';

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: attempt.isCorrect ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
        border: `1px solid ${attempt.isCorrect ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}`,
        borderRadius: 14, padding: '16px 20px', cursor: 'pointer',
        transition: 'all 0.2s', animation: `fadeIn 0.3s ease ${index * 0.03}s both`,
      }}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Correct/wrong indicator */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: attempt.isCorrect ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          {attempt.isCorrect ? '✅' : '❌'}
        </div>

        {/* Question text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: '#e2e8f0', fontSize: 14, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {q.content}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>{typeIcon} {q.questionType.replace('_', ' ')}</span>
            <span style={{ fontSize: 11, color: diffColor, fontWeight: 600 }}>● {q.difficulty}</span>
            <span style={{ fontSize: 11, color: '#475569' }}>📚 {q.conceptName}</span>
            <span style={{ fontSize: 11, color: '#334155', marginLeft: 'auto' }}>{timeAgo}</span>
          </div>
        </div>

        {/* Score badges */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: attempt.isCorrect ? '#10b981' : '#ef4444',
          }}>
            {Math.round(attempt.score * 100)}%
          </div>
          <div style={{ fontSize: 12, color: '#475569' }}>
            {(attempt.timeTakenMs / 1000).toFixed(1)}s
          </div>
          <div style={{
            fontSize: 13, color: '#64748b',
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}>▾</div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Domain</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>{q.domain}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Time Taken</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>{(attempt.timeTakenMs / 1000).toFixed(2)}s</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Hints Used</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>{attempt.hintsUsed ?? 0}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'just now';
}
