'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api-client';

const DOMAIN_COLOR: Record<string, string> = {
  DSA: '#6366f1',
  SYSTEM_DESIGN: '#f59e0b',
};

const MASTERY_LABEL = ['Novice', 'Beginner', 'Competent', 'Proficient', 'Expert'];
const MASTERY_COLOR = ['#475569', '#f59e0b', '#6366f1', '#10b981', '#f59e0b'];

export default function UserAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    adminApi.getUserAnalytics(userId)
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load analytics for this student.'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#6366f1', fontSize: 32 }}>⏳</div>
    </div>
  );

  if (error || !data) return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 18 }}>
      {error ?? 'User not found'}
    </div>
  );

  const { user, profile, streak, stats, masteries, recentAttempts, activityTrend } = data;
  const maxActivity = Math.max(...activityTrend.map((d: any) => d.count), 1);

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a14', padding: '32px 24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        <button
          onClick={() => router.push('/admin/users')}
          style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 14, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ← Back to Users
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, color: '#fff',
          }}>
            {user.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f1f5f9' }}>{user.name}</div>
            <div style={{ color: '#64748b', fontSize: 14 }}>{user.email}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 11, fontWeight: 700 }}>{user.role}</span>
              <span style={{ padding: '2px 10px', borderRadius: 20, background: user.isActive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: user.isActive ? '#6ee7b7' : '#fca5a5', fontSize: 11, fontWeight: 700 }}>
                {user.isActive ? 'Active' : 'Inactive'}
              </span>
              {profile?.preferredDomain && (
                <span style={{ padding: '2px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#fcd34d', fontSize: 11, fontWeight: 700 }}>
                  {profile.preferredDomain}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total XP', value: profile?.totalXP?.toLocaleString() ?? '—', icon: '⚡', color: '#6366f1' },
            { label: 'Level', value: profile?.currentLevel ?? '—', icon: '🏆', color: '#f59e0b' },
            { label: 'Streak', value: `${streak?.currentStreak ?? 0}d`, icon: '🔥', color: '#ef4444' },
            { label: 'Total Attempts', value: stats.totalAttempts?.toLocaleString() ?? '0', icon: '📝', color: '#10b981' },
            { label: 'Accuracy', value: stats.overallAccuracy != null ? `${stats.overallAccuracy}%` : '—', icon: '🎯', color: '#6366f1' },
            { label: 'Avg Time', value: stats.avgTimeSec ? `${stats.avgTimeSec}s` : '—', icon: '⏱', color: '#8b5cf6' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '16px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>

          {/* Activity Trend */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 16, fontSize: 14 }}>📅 14-Day Activity</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
              {activityTrend.map((d: any) => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    title={`${d.date}: ${d.count} attempts`}
                    style={{
                      width: '100%', borderRadius: 4,
                      height: `${Math.max(4, (d.count / maxActivity) * 64)}px`,
                      background: d.count > 0 ? 'linear-gradient(180deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.06)',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 10, color: '#475569' }}>{activityTrend[0]?.date?.slice(5)}</span>
              <span style={{ fontSize: 10, color: '#475569' }}>{activityTrend[13]?.date?.slice(5)}</span>
            </div>
          </div>

          {/* Domain Accuracy + Streak */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 16, fontSize: 14 }}>🎯 Accuracy by Domain</div>
            {[
              { label: 'DSA', value: stats.dsaAccuracy, color: '#6366f1' },
              { label: 'System Design', value: stats.sdAccuracy, color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color }}>{value != null ? `${value}%` : 'No data'}</span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${value ?? 0}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>{streak?.currentStreak ?? 0}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Current Streak</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b' }}>{streak?.longestStreak ?? 0}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Longest</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>{streak?.totalActiveDays ?? 0}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Active Days</div>
              </div>
            </div>
          </div>
        </div>

        {/* Concept Mastery Table */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginBottom: 28 }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 16, fontSize: 14 }}>🧠 Concept Mastery (Top 10)</div>
          {masteries.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '24px 0' }}>No mastery data yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Concept', 'Domain', 'Mastery', 'Attempts', 'Accuracy', 'Next Due'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {masteries.map((m: any) => {
                    const accuracy = m.totalAttempts > 0 ? Math.round((m.correctAttempts / m.totalAttempts) * 100) : null;
                    const due = m.nextRevisionDue ? new Date(m.nextRevisionDue) : null;
                    const overdue = due && due < new Date();
                    return (
                      <tr key={m.conceptId} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 600 }}>{m.conceptName}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 20, background: `${DOMAIN_COLOR[m.domain] ?? '#6366f1'}22`, color: DOMAIN_COLOR[m.domain] ?? '#6366f1', fontSize: 11, fontWeight: 700 }}>
                            {m.domain}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${m.masteryScore * 100}%`, background: MASTERY_COLOR[m.masteryLevel] ?? '#6366f1', borderRadius: 3 }} />
                            </div>
                            <span style={{ color: MASTERY_COLOR[m.masteryLevel] ?? '#94a3b8', fontSize: 11 }}>
                              {MASTERY_LABEL[m.masteryLevel] ?? 'Expert'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{m.totalAttempts}</td>
                        <td style={{ padding: '10px 12px', color: accuracy != null ? (accuracy >= 70 ? '#10b981' : '#f59e0b') : '#475569' }}>
                          {accuracy != null ? `${accuracy}%` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: overdue ? '#ef4444' : '#94a3b8', fontSize: 12 }}>
                          {due ? `${overdue ? '⚠️ ' : ''}${due.toLocaleDateString()}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Attempts */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 16, fontSize: 14 }}>📋 Recent 30 Attempts</div>
          {recentAttempts.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: '24px 0' }}>No attempts yet</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Concept', 'Type', 'Difficulty', 'Result', 'Score', 'Time', 'Hints', 'When'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentAttempts.map((a: any) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{a.question?.conceptName ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 11 }}>{a.question?.questionType?.replace('_', ' ') ?? '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11 }}>
                        <span style={{ color: ({ EASY: '#10b981', MEDIUM: '#f59e0b', HARD: '#ef4444' } as any)[a.question?.difficulty] ?? '#94a3b8', fontWeight: 600 }}>
                          {a.question?.difficulty ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: a.isCorrect ? '#10b981' : '#ef4444' }}>{a.isCorrect ? '✓' : '✗'}</td>
                      <td style={{ padding: '8px 12px', color: a.score >= 0.7 ? '#10b981' : '#f59e0b' }}>{Math.round(a.score * 100)}%</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{(a.timeTakenMs / 1000).toFixed(1)}s</td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{a.hintsUsed}</td>
                      <td style={{ padding: '8px 12px', color: '#475569', fontSize: 11 }}>{new Date(a.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
