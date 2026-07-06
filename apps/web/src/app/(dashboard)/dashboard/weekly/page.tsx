'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { WeeklyDigest } from '@/lib/api-client';

const LEVEL_LABELS = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_COLORS = ['#475569', '#6366f1', '#8b5cf6', '#f59e0b', '#10b981'];
const LEVEL_ICONS  = ['⚪', '🔵', '🟣', '🟡', '🌟'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeeklyPage() {
  const [digest, setDigest] = useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trackerApi.getWeeklyDigest()
      .then(r => setDigest(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading your week…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!digest || digest.totalAttempts === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, display: 'block', marginBottom: 40 }}>← Dashboard</Link>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📅</div>
        <h2 style={{ color: '#e2e8f0', fontSize: 24, fontWeight: 800, marginBottom: 10 }}>No activity this week</h2>
        <p style={{ color: '#64748b', marginBottom: 28 }}>Start practising to see your weekly progress here.</p>
        <Link href="/dashboard/practice" style={{
          display: 'inline-block', padding: '12px 28px', borderRadius: 14,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontWeight: 700, textDecoration: 'none',
        }}>Start Practising →</Link>
      </div>
    );
  }

  const accuracy = digest.accuracy ?? 0;
  const grade = accuracy >= 90 ? 'S' : accuracy >= 75 ? 'A' : accuracy >= 60 ? 'B' : accuracy >= 40 ? 'C' : 'D';
  const gradeColor = ({ S: '#f59e0b', A: '#10b981', B: '#6366f1', C: '#f97316', D: '#ef4444' } as any)[grade];
  const maxDayCount = Math.max(...digest.dailyBreakdown.map(d => d.count), 1);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const dateLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>← Dashboard</Link>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: '#e2e8f0', marginBottom: 4 }}>Weekly Review</h1>
            <p style={{ color: '#64748b', fontSize: 14 }}>{dateLabel}</p>
          </div>
          {/* Session quality grade */}
          <div style={{
            width: 70, height: 70, borderRadius: 16, flexShrink: 0,
            background: `radial-gradient(circle, ${gradeColor}25, transparent 80%)`,
            border: `2px solid ${gradeColor}55`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 24px ${gradeColor}40`,
            animation: 'bounceIn 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: gradeColor }}>{grade}</div>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600 }}>GRADE</div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 32 }}>
        {[
          { icon: '📝', label: 'Questions', value: digest.totalAttempts, sub: `${digest.correctAttempts} correct` },
          { icon: '🎯', label: 'Accuracy', value: `${accuracy}%`, sub: 'this week' },
          { icon: '📅', label: 'Study Days', value: `${digest.studyDays}/7`, sub: 'days active' },
          { icon: '🔥', label: 'Streak', value: `${digest.currentStreak}d`, sub: 'current streak' },
          { icon: '⏱️', label: 'Avg. Speed', value: digest.avgTimeSec ? `${digest.avgTimeSec}s` : '—', sub: 'per question' },
          { icon: '📈', label: 'Improved', value: digest.improvedConceptsCount, sub: 'concepts leveled up' },
        ].map(({ icon, label, value, sub }) => (
          <div key={label} style={{
            padding: '16px 18px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Daily activity bar chart */}
      <div style={{ padding: '22px 24px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, marginBottom: 20 }}>📊 Daily Activity</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'flex-end', height: 100 }}>
          {digest.dailyBreakdown.map((day, i) => {
            const pct = maxDayCount > 0 ? day.count / maxDayCount : 0;
            const isToday = i === 6;
            return (
              <div key={day.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                {day.count > 0 && (
                  <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{day.count}</div>
                )}
                <div style={{
                  width: '100%', borderRadius: '4px 4px 0 0',
                  height: `${Math.max(pct * 80, day.count > 0 ? 6 : 2)}px`,
                  background: isToday
                    ? 'linear-gradient(to top, #6366f1, #8b5cf6)'
                    : day.count > 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.05)',
                  transition: 'height 0.8s ease',
                  boxShadow: isToday && day.count > 0 ? '0 0 10px rgba(99,102,241,0.4)' : 'none',
                }} />
                <div style={{ fontSize: 11, color: isToday ? '#a5b4fc' : '#475569', fontWeight: isToday ? 700 : 400 }}>
                  {DAY_LABELS[new Date(day.date + 'T12:00:00').getDay() === 0 ? 6 : new Date(day.date + 'T12:00:00').getDay() - 1]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Improved concepts */}
      {digest.improvedConcepts.length > 0 && (
        <div style={{ padding: '22px 24px', borderRadius: 18, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 24 }}>
          <h3 style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 700, marginBottom: 18 }}>🎓 Concepts Leveled Up This Week</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {digest.improvedConcepts.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: 12,
                background: `${LEVEL_COLORS[c.level]}10`, border: `1px solid ${LEVEL_COLORS[c.level]}22`,
                animation: `fadeInLeft 0.4s ease ${i * 60}ms both`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{LEVEL_ICONS[c.level]}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{c.name}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: LEVEL_COLORS[c.level], background: `${LEVEL_COLORS[c.level]}15`, padding: '3px 10px', borderRadius: 20 }}>
                  {LEVEL_LABELS[c.level]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Motivational message */}
      <div style={{
        padding: '20px 24px', borderRadius: 16,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.06))',
        border: '1px solid rgba(99,102,241,0.15)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>
          {accuracy >= 80 ? '🌟' : accuracy >= 60 ? '💪' : '📚'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
          {accuracy >= 90 ? 'Exceptional week! You\'re in the top tier.'
            : accuracy >= 75 ? 'Solid week! Consistency is your superpower.'
            : accuracy >= 60 ? 'Good progress. Every session compounds.'
            : 'Keep going — the learning curve is real.'}
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          {digest.studyDays >= 5 ? '5+ study days this week — incredible consistency.' : `${7 - digest.studyDays} more days would unlock maximum streak bonus.`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/dashboard/practice" style={{
          padding: '11px 24px', borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 14,
        }}>Keep Practising →</Link>
        <Link href="/dashboard/achievements" style={{
          padding: '11px 24px', borderRadius: 12, border: '1px solid rgba(99,102,241,0.3)',
          background: 'transparent', color: '#a5b4fc', fontWeight: 700, textDecoration: 'none', fontSize: 14,
        }}>View Achievements</Link>
      </div>

      <style>{`
        @keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </div>
  );
}
