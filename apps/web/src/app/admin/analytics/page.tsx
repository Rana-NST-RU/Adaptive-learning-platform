'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api-client';

interface Analytics {
  users: { total: number; dau: number; wau: number; mau: number; newThisWeek: number };
  questions: { total: number; totalAttempts: number; correctAttempts: number; globalAccuracy: number | null; domainBreakdown: Record<string, number> };
  sessions: { total: number; avgDurationSeconds: number };
}
interface DauDay { date: string; count: number }
interface TopConcept { conceptId: string; conceptName: string; learners: number; avgMastery: number; avgRetention: number }

function MetricRow({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 16 }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 18, padding: '24px 28px', marginBottom: 24,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
    }}>
      <h2 style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 16, margin: '0 0 4px' }}>{title}</h2>
      {children}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [dauTrend, setDauTrend] = useState<DauDay[]>([]);
  const [topConcepts, setTopConcepts] = useState<TopConcept[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.getAnalytics(),
      adminApi.getDauTrend(),
      adminApi.getTopConcepts(15),
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
  const maxDau = Math.max(...dauTrend.map(d => d.count), 1);

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 28, margin: 0 }}>📈 Platform Analytics</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>Comprehensive view of platform health and learning outcomes</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
        {/* User metrics */}
        <SectionCard title="👥 User Metrics">
          <MetricRow label="Total Registered Users" value={a?.users.total?.toLocaleString() ?? '—'} />
          <MetricRow label="Daily Active Users (DAU)" value={a?.users.dau ?? '—'} sub="Unique users with an attempt today" />
          <MetricRow label="Weekly Active Users (WAU)" value={a?.users.wau ?? '—'} sub="Last 7 days" />
          <MetricRow label="Monthly Active Users (MAU)" value={a?.users.mau ?? '—'} sub="Last 30 days" />
          <MetricRow label="New Users This Week" value={a?.users.newThisWeek ?? '—'} />
          <MetricRow
            label="DAU/MAU Ratio"
            value={a?.users.mau && a.users.dau ? `${Math.round((a.users.dau / a.users.mau) * 100)}%` : '—'}
            sub="Stickiness ratio — industry avg ~20%"
          />
        </SectionCard>

        {/* Question / Attempt metrics */}
        <SectionCard title="❓ Question & Attempt Metrics">
          <MetricRow label="Total Questions Generated" value={a?.questions.total?.toLocaleString() ?? '—'} />
          <MetricRow label="Total Attempts" value={a?.questions.totalAttempts?.toLocaleString() ?? '—'} />
          <MetricRow label="Correct Attempts" value={a?.questions.correctAttempts?.toLocaleString() ?? '—'} />
          <MetricRow label="Global Accuracy" value={a?.questions.globalAccuracy !== null && a?.questions.globalAccuracy !== undefined ? `${a.questions.globalAccuracy}%` : '—'} sub="Platform-wide correct / total" />
          <MetricRow label="DSA Questions" value={a?.questions.domainBreakdown?.DSA?.toLocaleString() ?? '—'} />
          <MetricRow label="System Design Questions" value={a?.questions.domainBreakdown?.SYSTEM_DESIGN?.toLocaleString() ?? '—'} />
        </SectionCard>

        {/* Session metrics */}
        <SectionCard title="⏱ Session Metrics">
          <MetricRow label="Total Sessions" value={a?.sessions.total?.toLocaleString() ?? '—'} />
          <MetricRow
            label="Avg Session Duration"
            value={a?.sessions.avgDurationSeconds ? `${Math.round(a.sessions.avgDurationSeconds / 60)}m ${a.sessions.avgDurationSeconds % 60}s` : '—'}
            sub="Across all completed sessions"
          />
          {a?.users.total && a.sessions.total && (
            <MetricRow
              label="Sessions Per User"
              value={(a.sessions.total / a.users.total).toFixed(1)}
              sub="Average all-time"
            />
          )}
        </SectionCard>
      </div>

      {/* DAU Trend chart */}
      <SectionCard title="📅 14-Day Active Users Trend">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginTop: 16 }}>
          {dauTrend.map((d, i) => {
            const pct = (d.count / maxDau) * 100;
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }} title={`${d.date}: ${d.count}`}>
                <div style={{
                  width: '100%', borderRadius: '5px 5px 0 0',
                  background: i === dauTrend.length - 1
                    ? 'linear-gradient(to top, #6366f1, #a78bfa)'
                    : 'linear-gradient(to top, rgba(99,102,241,0.5), rgba(139,92,246,0.3))',
                  height: `${Math.max(pct, 5)}%`,
                  transition: 'height 0.5s ease',
                  position: 'relative',
                }}>
                  {d.count > 0 && (
                    <span style={{
                      position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
                      fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap',
                    }}>{d.count}</span>
                  )}
                </div>
                <span style={{ fontSize: 9, color: '#475569' }}>{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Top concepts table */}
      {topConcepts.length > 0 && (
        <SectionCard title="🧠 Top Concepts by Engagement">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr>
                {['#', 'Concept', 'Learners', 'Avg Mastery', 'Avg Retention', 'Health'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#475569', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topConcepts.map((c, i) => {
                const health = c.avgRetention >= 70 ? 'Good' : c.avgRetention >= 50 ? 'At Risk' : 'Poor';
                const hColor = c.avgRetention >= 70 ? '#10b981' : c.avgRetention >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <tr key={c.conceptId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{i + 1}</td>
                    <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 500 }}>{c.conceptName}</td>
                    <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{c.learners}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ height: '100%', width: `${c.avgMastery}%`, background: '#6366f1', borderRadius: 3 }} />
                        </div>
                        <span style={{ color: '#a5b4fc', fontSize: 11 }}>{c.avgMastery}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: hColor, fontWeight: 600 }}>{c.avgRetention}%</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                        background: `${hColor}18`, color: hColor,
                      }}>{health}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  );
}
