'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { DailyPlan, LearningInsights } from '@/lib/api-client';

// ─── Optimal Window Badge ─────────────────────────────────────────────────────

function OptimalWindowBadge({ insights }: { insights: LearningInsights | null }) {
  if (!insights || !insights.optimalHours) return null;
  const now = new Date().getHours();
  const [start] = (insights.optimalHours.match(/\d+/) ?? ['0']).map(Number);
  const isNow = Math.abs(now - start) <= 1;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      borderRadius: 30, fontSize: 13, fontWeight: 700,
      background: isNow ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.1)',
      border: `1px solid ${isNow ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.2)'}`,
      color: isNow ? '#34d399' : '#a5b4fc',
      animation: isNow ? 'pulseGlow 2s infinite' : 'none',
    }}>
      {isNow ? '🟢' : '🕐'}{' '}
      {isNow
        ? `Optimal learning time! Best accuracy at ${insights.optimalHours}`
        : `Your best study window: ${insights.optimalHours}`}
      {insights.optimalHourAccuracy && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>({insights.optimalHourAccuracy}% accuracy)</span>
      )}
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({
  icon, title, subtitle, color, estimatedMins, conceptId,
  onClick, done,
}: {
  icon: string; title: string; subtitle: string; color: string;
  estimatedMins: number; conceptId: string; onClick?: () => void; done?: boolean;
}) {
  return (
    <div style={{
      padding: '20px 24px', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 18,
      background: done ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${done ? 'rgba(16,185,129,0.2)' : `${color}22`}`,
      transition: 'all 0.2s', opacity: done ? 0.6 : 1,
    }}>
      {/* Icon */}
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, flexShrink: 0, border: `1px solid ${color}30`,
      }}>
        {done ? '✅' : icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: done ? '#64748b' : '#e2e8f0', marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: '#64748b' }}>{subtitle}</div>
      </div>

      {/* Time estimate */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>~{estimatedMins} min</div>
        {!done && (
          <Link href={`/dashboard/practice?conceptId=${conceptId}`} style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: `${color}20`, color, fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
            }}>
              Start →
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Streak XP Multiplier Badge ───────────────────────────────────────────────

function MultiplierBadge({ multiplier, streak }: { multiplier: number; streak: number }) {
  if (multiplier <= 1.0) return null;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
      borderRadius: 30, background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)',
      color: '#fb923c', fontSize: 13, fontWeight: 700,
    }}>
      🔥 {streak}-day streak · ×{multiplier.toFixed(1)} XP on all answers
    </div>
  );
}

// ─── Today's Plan Page ────────────────────────────────────────────────────────

export default function TodayPage() {
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    Promise.all([
      trackerApi.getDailyPlan(domain),
      trackerApi.getInsights(),
    ])
      .then(([planRes, insRes]) => {
        setPlan(planRes.data);
        setInsights(insRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [domain]);

  const markDone = (id: string) => setCompletedItems(prev => new Set(Array.from(prev).concat(id)));

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Building today&apos;s plan…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
        <h2 style={{ color: '#e2e8f0', marginBottom: 8 }}>No plan yet</h2>
        <p>Start practising to get personalised daily plans.</p>
        <Link href="/dashboard/practice" style={{ color: '#6366f1', display: 'block', marginTop: 16 }}>Start Practice →</Link>
      </div>
    );
  }

  const totalItems = plan.revisions.length + (plan.learnNew ? 1 : 0) + (plan.practice ? 1 : 0);
  const doneItems = completedItems.size;
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const isAllDone = doneItems >= totalItems && totalItems > 0;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>← Dashboard</Link>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#e2e8f0', marginBottom: 6 }}>Today&apos;s Plan</h1>
        <p style={{ color: '#64748b', fontSize: 15, marginBottom: 16 }}>
          Your personalised study session · ~{plan.totalEstimatedMins} min
        </p>

        {/* Optimal window badge + streak multiplier */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          <OptimalWindowBadge insights={insights} />
          <MultiplierBadge multiplier={plan.multiplier} streak={plan.streak} />
        </div>

        {/* Domain toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {(['DSA', 'SYSTEM_DESIGN'] as const).map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              padding: '7px 18px', borderRadius: 30, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12,
              background: domain === d ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
              color: domain === d ? '#fff' : '#64748b', transition: 'all 0.2s',
            }}>{d.replace('_', ' ')}</button>
          ))}
        </div>

        {/* Daily goal progress */}
        <div style={{
          padding: '16px 20px', borderRadius: 14,
          background: isAllDone ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${isAllDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
          marginBottom: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
              {isAllDone ? '🎉 All done!' : `${doneItems}/${totalItems} completed`}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: isAllDone ? '#34d399' : '#6366f1' }}>
              {progressPct}%
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: isAllDone ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: 4, transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      </div>

      {/* ── Review Section ── */}
      {plan.revisions.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: '#ef4444', borderRadius: 4 }} />
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>
              🔔 Revisions Due ({plan.revisions.length})
            </h2>
            <span style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>Most urgent</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.revisions.map(r => (
              <div key={r.conceptId} onClick={() => markDone(r.conceptId)} style={{ cursor: 'pointer' }}>
                <PlanCard
                  icon="📖"
                  title={r.conceptName}
                  subtitle={`Retention: ${Math.round(r.retentionScore * 100)}% — needs review before it fades further`}
                  color="#ef4444"
                  estimatedMins={r.estimatedMins}
                  conceptId={r.conceptId}
                  done={completedItems.has(r.conceptId)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Learn New ── */}
      {plan.learnNew && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: '#6366f1', borderRadius: 4 }} />
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>✨ New Concept</h2>
          </div>
          <div onClick={() => markDone(plan.learnNew!.conceptId)} style={{ cursor: 'pointer' }}>
            <PlanCard
              icon="🌱"
              title={plan.learnNew.conceptName}
              subtitle="Prerequisites mastered — perfect time to tackle this next step"
              color="#6366f1"
              estimatedMins={plan.learnNew.estimatedMins}
              conceptId={plan.learnNew.conceptId}
              done={completedItems.has(plan.learnNew.conceptId)}
            />
          </div>
        </section>
      )}

      {/* ── Practice Weak ── */}
      {plan.practice && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: '#f59e0b', borderRadius: 4 }} />
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>💪 Strengthen Weak Spot</h2>
          </div>
          <div onClick={() => markDone(plan.practice!.conceptId)} style={{ cursor: 'pointer' }}>
            <PlanCard
              icon="🎯"
              title={plan.practice.conceptName}
              subtitle={`Accuracy: ${Math.round(plan.practice.masteryScore * 100)}% — more practice will lock it in`}
              color="#f59e0b"
              estimatedMins={plan.practice.estimatedMins}
              conceptId={plan.practice.conceptId}
              done={completedItems.has(plan.practice.conceptId)}
            />
          </div>
        </section>
      )}

      {/* No tasks today */}
      {totalItems === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h2 style={{ color: '#e2e8f0', marginBottom: 8 }}>You&apos;re all caught up!</h2>
          <p style={{ marginBottom: 20 }}>No reviews due and prerequisites are building nicely. Want to explore something new?</p>
          <Link href="/dashboard/practice" style={{ color: '#6366f1', fontWeight: 700 }}>Practice freely →</Link>
        </div>
      )}

      {/* Learning insights strip */}
      {insights && insights.optimalHours && (
        <div style={{
          marginTop: 40, padding: '20px 24px', borderRadius: 16,
          background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)',
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#a5b4fc', marginBottom: 12 }}>📊 Your Learning Patterns</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {insights.hourlyBreakdown.slice(0, 4).map(h => (
              <div key={h.hour} style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.1)',
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#a5b4fc' }}>{h.accuracy}%</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{h.label} accuracy</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{h.count} sessions</div>
              </div>
            ))}
          </div>
          {insights.bestDay && (
            <p style={{ color: '#64748b', fontSize: 13, marginTop: 12 }}>
              📅 You perform best on <strong style={{ color: '#a5b4fc' }}>{insights.bestDay}</strong>
            </p>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          50% { box-shadow: 0 0 16px 4px rgba(16,185,129,0.2); }
        }
      `}</style>
    </div>
  );
}
