'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api-client';

interface Analytics {
  users: { total: number; dau: number; wau: number; mau: number; newThisWeek: number };
  questions: { total: number; totalAttempts: number; correctAttempts: number; globalAccuracy: number | null; domainBreakdown: Record<string, number> };
  sessions: { total: number; avgDurationSeconds: number };
}

interface DauDay { date: string; count: number }
interface TopConcept { conceptId: string; conceptName: string; learners: number; avgMastery: number; avgRetention: number }

function StatCard({ icon, value, label, sub, color }: { icon: string; value: string | number; label: string; sub?: string; color: string }) {
  return (
    <div style={{
      borderRadius: 18, padding: '22px 24px',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', opacity: 0.1, filter: 'blur(24px)', background: color,
      }} />
      <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DauChart({ data }: { data: DauDay[] }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{
      borderRadius: 18, padding: '22px 24px',
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15, margin: '0 0 20px' }}>📈 14-Day Active Users</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 100 }}>
        {data.map((d, i) => {
          const pct = max > 0 ? (d.count / max) * 100 : 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.date}: ${d.count} users`}>
              <div style={{
                width: '100%', borderRadius: '4px 4px 0 0',
                background: `linear-gradient(to top, #6366f1, #8b5cf6)`,
                height: `${Math.max(pct, 4)}%`,
                transition: 'height 0.5s ease',
                opacity: i === data.length - 1 ? 1 : 0.7,
              }} />
              {i % 3 === 0 && (
                <span style={{ fontSize: 9, color: '#475569', transform: 'rotate(-30deg)', transformOrigin: 'center', whiteSpace: 'nowrap' }}>
                  {d.date.slice(5)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dauTrend, setDauTrend] = useState<DauDay[]>([]);
  const [topConcepts, setTopConcepts] = useState<TopConcept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getAnalytics(),
      adminApi.getDauTrend(),
      adminApi.getTopConcepts(8),
    ]).then(([a, d, t]) => {
      setAnalytics(a.data as Analytics);
      setDauTrend(d.data as DauDay[]);
      setTopConcepts(t.data as TopConcept[]);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '60px 40px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const a = analytics;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 28, margin: 0 }}>
          🛡️ Admin Overview
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
          Real-time platform health across all users and content
        </p>
      </div>

      {/* Stat cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="👥" value={a?.users.total ?? '—'} label="Total Users" sub={`+${a?.users.newThisWeek ?? 0} this week`} color="#6366f1" />
        <StatCard icon="📅" value={a?.users.dau ?? '—'} label="Daily Active (DAU)" sub={`${a?.users.wau ?? 0} WAU · ${a?.users.mau ?? 0} MAU`} color="#8b5cf6" />
        <StatCard icon="❓" value={a?.questions.total ?? '—'} label="Questions Generated" sub={`DSA: ${a?.questions.domainBreakdown?.DSA ?? 0} · SD: ${a?.questions.domainBreakdown?.SYSTEM_DESIGN ?? 0}`} color="#f59e0b" />
        <StatCard icon="🎯" value={a?.questions.globalAccuracy !== null && a?.questions.globalAccuracy !== undefined ? `${a.questions.globalAccuracy}%` : '—'} label="Global Accuracy" sub={`${a?.questions.totalAttempts?.toLocaleString() ?? 0} total attempts`} color="#10b981" />
        <StatCard icon="⏱" value={a?.sessions.avgDurationSeconds ? `${Math.round(a.sessions.avgDurationSeconds / 60)}m` : '—'} label="Avg Session Time" sub={`${a?.sessions.total?.toLocaleString() ?? 0} total sessions`} color="#ef4444" />
      </div>

      {/* DAU Trend + Quick links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, marginBottom: 28 }}>
        <DauChart data={dauTrend} />

        {/* Quick action links */}
        <div style={{ borderRadius: 18, padding: '22px 24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>⚡ Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { href: '/admin/users', label: '👥 Manage Users', desc: 'View, search, assign roles' },
              { href: '/admin/questions', label: '❓ Moderate Questions', desc: 'Edit, approve, remove' },
              { href: '/admin/analytics', label: '📊 Full Analytics', desc: 'Detailed breakdowns' },
            ].map(link => (
              <Link key={link.href} href={link.href} style={{
                display: 'block', padding: '12px 14px', borderRadius: 10, textDecoration: 'none',
                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
                transition: 'background 0.15s',
              }}>
                <div style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 13 }}>{link.label}</div>
                <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{link.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Top Concepts */}
      {topConcepts.length > 0 && (
        <div style={{ borderRadius: 18, padding: '22px 24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <h3 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 15, margin: '0 0 16px' }}>🧠 Most Studied Concepts</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Concept', 'Learners', 'Avg Mastery', 'Avg Retention'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topConcepts.map((c, i) => (
                  <tr key={c.conceptId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 500 }}>
                      <span style={{ color: '#475569', marginRight: 8 }}>#{i + 1}</span>
                      {c.conceptName}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.learners}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${c.avgMastery}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 3 }} />
                        </div>
                        <span style={{ color: '#a5b4fc', fontSize: 11, width: 30 }}>{c.avgMastery}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ color: c.avgRetention >= 70 ? '#10b981' : c.avgRetention >= 50 ? '#f59e0b' : '#ef4444', fontWeight: 600 }}>
                        {c.avgRetention}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
