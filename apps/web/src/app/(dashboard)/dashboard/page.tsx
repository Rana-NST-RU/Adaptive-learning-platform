'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { DashboardStats, Recommendation } from '@/lib/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const REC_COLORS = {
  REVISE: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', badge: 'rgba(239,68,68,0.15)', text: '#fca5a5', icon: '🔁' },
  LEARN_NEW: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', badge: 'rgba(99,102,241,0.15)', text: '#a5b4fc', icon: '⚡' },
  PRACTICE: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', badge: 'rgba(245,158,11,0.15)', text: '#fcd34d', icon: '🎯' },
};

const REC_LABELS = { REVISE: 'Revise', LEARN_NEW: 'Learn New', PRACTICE: 'Practice' };

const quickActions = [
  { label: 'Start Learning', desc: 'Resume your personalized learning path', icon: '🗺️', href: '/dashboard/knowledge-graph', color: 'from-violet-600/20 to-indigo-600/20', border: 'border-violet-500/20' },
  { label: 'Practice Now', desc: 'Sharpen your skills with adaptive quizzes', icon: '⚡', href: '/dashboard/practice', color: 'from-yellow-600/20 to-orange-600/20', border: 'border-yellow-500/20' },
  { label: 'Mastery Map', desc: 'See your retention & forgetting curves', icon: '🧠', href: '/dashboard/mastery', color: 'from-emerald-600/20 to-teal-600/20', border: 'border-emerald-500/20' },
  { label: 'View History', desc: 'Review all past practice attempts', icon: '📋', href: '/dashboard/practice/history', color: 'from-blue-600/20 to-cyan-600/20', border: 'border-blue-500/20' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [user, setUser] = useState<{ name?: string } | null>(null);
  const [time, setTime] = useState(new Date());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    trackerApi.getStats()
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    setRecsLoading(true);
    trackerApi.getRecommendations(domain)
      .then(r => setRecs(r.data))
      .catch(() => {})
      .finally(() => setRecsLoading(false));
  }, [domain]);

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const accuracy = stats?.accuracy ?? null;
  const streak = stats?.streak?.current ?? 0;
  const xp = stats?.totalXP ?? 0;
  const masteredCount = stats?.mastery?.masteredCount ?? 0;

  const statCards = [
    {
      label: 'Concepts Mastered',
      value: statsLoading ? '…' : String(masteredCount),
      sub: statsLoading ? '' : masteredCount === 0 ? 'Start learning to track' : `${stats?.mastery?.totalConcepts ?? 0} total concepts`,
      positive: true, icon: '🧠', color: 'from-violet-600 to-purple-700',
    },
    {
      label: 'Study Streak',
      value: statsLoading ? '…' : `${streak} ${streak === 1 ? 'day' : 'days'}`,
      sub: statsLoading ? '' : streak === 0 ? 'Begin your streak today!' : `Longest: ${stats?.streak?.longest ?? 0} days 🔥`,
      positive: streak > 0, icon: '🔥', color: 'from-orange-500 to-red-600',
    },
    {
      label: 'XP Points',
      value: statsLoading ? '…' : `${xp.toLocaleString()} XP`,
      sub: statsLoading ? '' : `Level ${stats?.currentLevel ?? 1} · ${stats?.totalAttempts ?? 0} attempts`,
      positive: true, icon: '⚡', color: 'from-yellow-500 to-amber-600',
    },
    {
      label: 'Accuracy Rate',
      value: statsLoading ? '…' : accuracy !== null ? `${accuracy}%` : '—',
      sub: statsLoading ? '' : accuracy === null ? 'Practice to see your accuracy' : accuracy >= 80 ? 'Excellent performance!' : accuracy >= 60 ? 'Good — keep going!' : 'Room to improve',
      positive: accuracy === null || accuracy >= 60, icon: '🎯', color: 'from-emerald-500 to-teal-600',
    },
  ];

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 36, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            {greeting()}, {user?.name || 'Learner'} 👋
          </h1>
          <p style={{ color: '#64748b', marginTop: 6, fontSize: 14 }}>
            {time.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — Ready to learn something new?
          </p>
        </div>
        {streak > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 12,
            background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)',
          }}>
            <span style={{ fontSize: 20 }}>🔥</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#fb923c' }}>{streak}-day streak!</div>
              <div style={{ fontSize: 11, color: '#78716c' }}>{stats?.streak?.freezes ?? 0} freeze{stats?.streak?.freezes !== 1 ? 's' : ''} left</div>
            </div>
          </div>
        )}
      </div>

      {/* Live Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {statCards.map((s, i) => (
          <div key={i} style={{
            borderRadius: 18, padding: '20px', position: 'relative', overflow: 'hidden',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            transition: 'transform 0.2s',
          }}>
            <div style={{
              position: 'absolute', top: 0, right: 0, width: 80, height: 80,
              borderRadius: '50%', opacity: 0.12, filter: 'blur(20px)',
              background: `linear-gradient(135deg, ${s.color.includes('violet') ? '#7c3aed' : s.color.includes('orange') ? '#ea580c' : s.color.includes('yellow') ? '#ca8a04' : '#059669'}, transparent)`,
            }} />
            <div style={{
              width: 38, height: 38, borderRadius: 10, marginBottom: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${s.color.includes('violet') ? '#7c3aed,#9333ea' : s.color.includes('orange') ? '#ea580c,#dc2626' : s.color.includes('yellow') ? '#ca8a04,#b45309' : '#059669,#0d9488'})`,
              fontSize: 18,
            }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9', marginBottom: 2 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: s.positive ? '#10b981' : '#ef4444', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 14 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          {quickActions.map((a, i) => (
            <Link key={i} href={a.href} style={{
              display: 'block', borderRadius: 18, padding: '18px 20px', textDecoration: 'none',
              background: `linear-gradient(135deg, ${a.color.replace('from-', '').replace(' to-', ', ')})`,
              border: `1px solid ${a.border.replace('border-', '')}`,
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              <span style={{ fontSize: 28, display: 'block', marginBottom: 10 }}>{a.icon}</span>
              <h3 style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>{a.label}</h3>
              <p style={{ color: '#64748b', fontSize: 12, margin: 0, lineHeight: 1.4 }}>{a.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Up Next + Getting Started */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* ── Up Next (Recommendations) ── */}
        <div style={{
          borderRadius: 20, padding: '22px 24px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>
              🎯 Up Next
            </h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['DSA', 'SYSTEM_DESIGN'] as const).map(d => (
                <button key={d} onClick={() => setDomain(d)} style={{
                  padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600,
                  background: domain === d ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
                  color: domain === d ? '#a5b4fc' : '#475569',
                }}>
                  {d === 'DSA' ? 'DSA' : 'System Design'}
                </button>
              ))}
            </div>
          </div>

          {recsLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 64, borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'shimmer 1.5s infinite' }} />
              ))}
            </div>
          )}

          {!recsLoading && recs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✨</div>
              <div style={{ color: '#64748b', fontSize: 13 }}>
                No recommendations yet.<br />Complete a practice session to get started!
              </div>
              <Link href="/dashboard/practice" style={{
                display: 'inline-block', marginTop: 14, padding: '8px 18px',
                borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13,
              }}>⚡ Start Practicing</Link>
            </div>
          )}

          {!recsLoading && recs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recs.slice(0, 5).map((rec, i) => {
                const c = REC_COLORS[rec.type];
                return (
                  <Link key={i} href={`/dashboard/practice?concept=${rec.conceptId}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      background: c.bg, border: `1px solid ${c.border}`,
                      transition: 'transform 0.15s',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{c.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rec.conceptName}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{rec.reason}</div>
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                        background: c.badge, color: c.text,
                      }}>
                        {REC_LABELS[rec.type]}
                      </span>
                    </div>
                  </Link>
                );
              })}
              <Link href="/dashboard/mastery" style={{
                display: 'block', textAlign: 'center', fontSize: 12, color: '#475569',
                padding: '6px 0', textDecoration: 'none',
              }}>
                View full mastery map →
              </Link>
            </div>
          )}
        </div>

        {/* ── Getting Started Checklist ── */}
        <div style={{
          borderRadius: 20, padding: '22px 24px',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>🚀 Getting Started</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { done: true, label: 'Create your account', desc: 'Signed in successfully' },
              { done: (stats?.totalAttempts ?? 0) > 0, label: 'Complete your first practice session', desc: 'Answer at least one question' },
              { done: (stats?.mastery?.masteredCount ?? 0) > 0, label: 'Master a concept', desc: 'Reach 75%+ accuracy on any topic' },
              { done: (stats?.streak?.current ?? 0) >= 3, label: 'Build a 3-day streak', desc: 'Practice 3 days in a row 🔥' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: item.done ? '#10b981' : 'transparent',
                  border: `2px solid ${item.done ? '#10b981' : 'rgba(255,255,255,0.15)'}`,
                  transition: 'all 0.3s',
                }}>
                  {item.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: item.done ? '#64748b' : '#e2e8f0', margin: 0, textDecoration: item.done ? 'line-through' : 'none' }}>
                    {item.label}
                  </p>
                  <p style={{ fontSize: 11, color: '#475569', margin: '2px 0 0' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          {(() => {
            const total = 4;
            const done = [
              true,
              (stats?.totalAttempts ?? 0) > 0,
              (stats?.mastery?.masteredCount ?? 0) > 0,
              (stats?.streak?.current ?? 0) >= 3,
            ].filter(Boolean).length;
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 6, transition: 'width 0.6s ease',
                    width: `${(done / total) * 100}%`,
                    background: 'linear-gradient(90deg, #6366f1, #10b981)',
                  }} />
                </div>
                <p style={{ fontSize: 11, color: '#475569', margin: '6px 0 0' }}>{done} of {total} completed</p>
              </div>
            );
          })()}
        </div>
      </div>

      <style>{`@keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>
    </div>
  );
}
