'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { DashboardStats, Recommendation, HeatmapDay, FadingSoonItem, LearningInsights } from '@/lib/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const REC_COLORS = {
  REVISE: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', badge: 'rgba(239,68,68,0.15)', text: '#fca5a5', icon: '🔁' },
  LEARN_NEW: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', badge: 'rgba(99,102,241,0.15)', text: '#a5b4fc', icon: '⚡' },
  PRACTICE: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', badge: 'rgba(245,158,11,0.15)', text: '#fcd34d', icon: '🎯' },
};

const REC_LABELS = { REVISE: 'Revise', LEARN_NEW: 'Learn New', PRACTICE: 'Practice' };

const quickActions = [
  { label: 'Today\'s Plan', desc: "Your personalised daily study session", icon: '📅', href: '/dashboard/today', color: 'from-violet-600/20 to-indigo-600/20', border: 'border-violet-500/20' },
  { label: 'Practice Now', desc: 'Sharpen your skills with adaptive quizzes', icon: '⚡', href: '/dashboard/practice', color: 'from-yellow-600/20 to-orange-600/20', border: 'border-yellow-500/20' },
  { label: 'Mastery Map', desc: 'Radar chart · FSRS retention curves', icon: '🧠', href: '/dashboard/mastery', color: 'from-emerald-600/20 to-teal-600/20', border: 'border-emerald-500/20' },
  { label: 'Knowledge Graph', desc: 'Explore prerequisites and learning paths', icon: '🗺️', href: '/dashboard/knowledge-graph', color: 'from-blue-600/20 to-cyan-600/20', border: 'border-blue-500/20' },
  { label: 'Achievements', desc: 'Badges, milestones and XP rewards', icon: '🏆', href: '/dashboard/achievements', color: 'from-amber-600/20 to-yellow-600/20', border: 'border-amber-500/20' },
  { label: 'Weekly Review', desc: 'Your 7-day progress digest', icon: '📊', href: '/dashboard/weekly', color: 'from-pink-600/20 to-rose-600/20', border: 'border-pink-500/20' },
  { label: 'Leaderboard', desc: 'Global XP rankings and podium', icon: '🥇', href: '/dashboard/leaderboard', color: 'from-orange-600/20 to-red-600/20', border: 'border-orange-500/20' },
  { label: 'My Profile', desc: 'Settings, streak freezes & preferences', icon: '⚙️', href: '/dashboard/profile', color: 'from-slate-600/20 to-gray-600/20', border: 'border-slate-500/20' },
];

// ─── Activity Heatmap Component ──────────────────────────────────────────────

function ActivityHeatmap({ data }: { data: HeatmapDay[] }) {
  // Build a map for O(1) lookup
  const countMap = useMemo(() => {
    const m: Record<string, number> = {};
    data.forEach(d => { m[d.date] = d.count; });
    return m;
  }, [data]);

  const totalActivities = data.reduce((s, d) => s + d.count, 0);

  // Build 52 complete weeks ending today (Sun-start)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // Start of the 52-week window (Monday of week 52 weeks ago)
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364); // exactly 52 weeks

  // Build grid: weeks[col][row] = date string
  const weeks: (string | null)[][] = [];
  let cur = new Date(startDate);
  // Advance to Monday
  const dow = cur.getDay();
  if (dow !== 1) cur.setDate(cur.getDate() + ((1 - dow + 7) % 7));

  for (let w = 0; w < 53; w++) {
    const week: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = cur.toISOString().split('T')[0];
      week.push(dateStr <= todayStr ? dateStr : null);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  // Month labels (position of first cell of each month)
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, col) => {
    const firstValid = week.find(d => d !== null);
    if (firstValid) {
      const date = new Date(firstValid + 'T12:00:00');
      if (date.getDate() <= 7) {
        const label = date.toLocaleDateString('en-US', { month: 'short' });
        if (!monthLabels.length || monthLabels[monthLabels.length - 1].label !== label) {
          monthLabels.push({ label, col });
        }
      }
    }
  });

  const cellSize = 12;
  const gap = 2;
  const cols = 53;
  const rows = 7;
  const svgW = cols * (cellSize + gap);
  const svgH = rows * (cellSize + gap) + 24; // +24 for month labels

  const getColor = (count: number) => {
    if (!count) return 'rgba(255,255,255,0.04)';
    if (count <= 2) return 'rgba(99,102,241,0.25)';
    if (count <= 5) return 'rgba(99,102,241,0.5)';
    if (count <= 10) return 'rgba(99,102,241,0.75)';
    return '#6366f1';
  };

  return (
    <div style={{ padding: '22px 24px', borderRadius: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, margin: 0 }}>📆 Learning Activity</h3>
        <span style={{ fontSize: 12, color: '#64748b' }}>{totalActivities.toLocaleString()} answers in the past year</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          {/* Month labels */}
          {monthLabels.map(({ label, col }) => (
            <text key={label + col} x={col * (cellSize + gap)} y={11} fontSize={10} fill="#475569" fontFamily="inherit">{label}</text>
          ))}
          {/* Cells */}
          {weeks.map((week, col) =>
            week.map((dateStr, row) => {
              const x = col * (cellSize + gap);
              const y = row * (cellSize + gap) + 18;
              const count = dateStr ? (countMap[dateStr] ?? 0) : 0;
              const isToday = dateStr === todayStr;
              return (
                <rect
                  key={`${col}-${row}`}
                  x={x} y={y}
                  width={cellSize} height={cellSize}
                  rx={2} ry={2}
                  fill={dateStr ? getColor(count) : 'transparent'}
                  stroke={isToday ? '#6366f1' : 'none'}
                  strokeWidth={isToday ? 1 : 0}
                >
                  {dateStr && count > 0 && (
                    <title>{dateStr}: {count} question{count !== 1 ? 's' : ''}</title>
                  )}
                </rect>
              );
            })
          )}
        </svg>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
        <span style={{ fontSize: 11, color: '#475569' }}>Less</span>
        {[0, 2, 5, 10, 15].map(c => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: 2, background: getColor(c) }} />
        ))}
        <span style={{ fontSize: 11, color: '#475569' }}>More</span>
      </div>
    </div>
  );
}

// ─── Fading Soon Banner ───────────────────────────────────────────────────────

function FadingSoonBanner({ items }: { items: FadingSoonItem[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div style={{
      padding: '16px 20px', borderRadius: 14, marginBottom: 24,
      background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
      animation: 'pulseWarn 3s infinite',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5' }}>
            {items.length} concept{items.length > 1 ? 's' : ''} fading — predicted &lt;70% retention within 72h
          </span>
        </div>
        <button onClick={() => setDismissed(true)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.slice(0, 5).map((item) => (
          <Link key={item.conceptId} href={`/dashboard/practice?concept=${item.conceptId}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
              borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              textDecoration: 'none',
            }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5' }}>{item.conceptName}</span>
            <span style={{ fontSize: 11, color: '#ef4444' }}>
              {Math.round(item.currentRetention * 100)}% · fades in {item.hoursUntilFade}h
            </span>
          </Link>
        ))}
      </div>
      <Link href="/dashboard/practice" style={{
        display: 'inline-block', marginTop: 12, fontSize: 12, color: '#fca5a5',
        textDecoration: 'underline', textDecorationStyle: 'dashed',
      }}>Review now to save your progress →</Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [user, setUser] = useState<{ name?: string } | null>(null);
  const [time, setTime] = useState(new Date());
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [plan, setPlan] = useState<{ totalEstimatedMins: number; multiplier: number; streak: number; revisions: any[]; learnNew: any; practice: any } | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [fadingSoon, setFadingSoon] = useState<FadingSoonItem[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [recsLoading, setRecsLoading] = useState(true);
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [insights, setInsights] = useState<LearningInsights | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) { try { setUser(JSON.parse(stored)); } catch {} }
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // ── Stats fetcher (called on mount + whenever tab regains focus) ────────────
  const fetchStats = useCallback(() => {
    setStatsLoading(true);
    trackerApi.getStats()
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
    trackerApi.getDailyPlan('DSA')
      .then(r => setPlan(r.data))
      .catch(() => {});
    trackerApi.getHeatmap()
      .then(r => setHeatmap(r.data))
      .catch(() => {});
    trackerApi.getFadingSoon(domain)
      .then(r => setFadingSoon(r.data))
      .catch(() => {});
    trackerApi.getInsights()
      .then(r => setInsights(r.data))
      .catch(() => {});
  }, [domain]);

  useEffect(() => {
    fetchStats();
    // Re-fetch XP/stats when the user returns from practice (tab becomes visible)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStats();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchStats]);

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

      {/* Optimal Learning Window Badge */}
      {insights?.optimalHours && (
        <div style={{
          marginBottom: 24, padding: '14px 20px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(99,102,241,0.06))',
          border: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #10b981, #6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🌅</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>
              You learn best at {insights.optimalHours}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {insights.optimalHourAccuracy !== null
                ? `${Math.round(insights.optimalHourAccuracy * 100)}% accuracy during this window · based on ${insights.totalAttempts} attempts`
                : 'Based on your historical accuracy patterns'}
            </div>
          </div>
          <div style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#10b981',
            background: 'rgba(16,185,129,0.12)', padding: '3px 9px', borderRadius: 20,
            flexShrink: 0,
          }}>PEAK WINDOW</div>
        </div>
      )}

      {/* Sprint 4: Today's Plan mini-widget */}
      {plan && (plan.revisions.length > 0 || plan.learnNew || plan.practice) && (
        <div style={{
          marginBottom: 28, padding: '18px 22px', borderRadius: 18,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
          border: '1px solid rgba(99,102,241,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 32 }}>📅</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Today&apos;s Study Plan is ready</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {plan.revisions.length > 0 && (
                  <span style={{ fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.1)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                    🔔 {plan.revisions.length} review{plan.revisions.length > 1 ? 's' : ''} due
                  </span>
                )}
                {plan.learnNew && (
                  <span style={{ fontSize: 12, color: '#a5b4fc', background: 'rgba(99,102,241,0.1)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                    ✨ 1 new concept
                  </span>
                )}
                {plan.practice && (
                  <span style={{ fontSize: 12, color: '#fcd34d', background: 'rgba(245,158,11,0.1)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                    🎯 1 practice task
                  </span>
                )}
                {plan.multiplier > 1.0 && (
                  <span style={{ fontSize: 12, color: '#fb923c', background: 'rgba(249,115,22,0.1)', padding: '2px 10px', borderRadius: 20, fontWeight: 600 }}>
                    🔥 ×{plan.multiplier.toFixed(1)} XP bonus
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link href="/dashboard/today" style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '10px 22px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 14,
              boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              whiteSpace: 'nowrap',
            }}>View Plan ~{plan.totalEstimatedMins}min →</button>
          </Link>
        </div>
      )}

      {/* Due Concepts Review Banner */}
      {(stats?.dueConceptCount ?? 0) > 0 && (
        <div style={{
          marginBottom: 24, padding: '14px 20px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(239,68,68,0.06))',
          border: '1px solid rgba(245,158,11,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🔔</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fcd34d' }}>
                {stats!.dueConceptCount} concept{stats!.dueConceptCount !== 1 ? 's' : ''} due for review
              </div>
              <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                Your FSRS schedule says now is the perfect time — don&apos;t let them slip!
              </div>
            </div>
          </div>
          <Link href="/dashboard/practice?mode=review" style={{
            padding: '9px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none',
            boxShadow: '0 4px 16px rgba(245,158,11,0.3)', whiteSpace: 'nowrap',
          }}>⚡ Start Review Session →</Link>
        </div>
      )}

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

      {/* ── Activity Heatmap ── */}
      {heatmap.length > 0 && (
        <ActivityHeatmap data={heatmap} />
      )}

      {/* ── Fading Soon Alert ── */}
      {fadingSoon.length > 0 && (
        <FadingSoonBanner items={fadingSoon} />
      )}

      <style>{`@keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.4} } @keyframes pulseWarn { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.3)} 50%{box-shadow:0 0 0 8px rgba(239,68,68,0)} }`}</style>
    </div>
  );
}
