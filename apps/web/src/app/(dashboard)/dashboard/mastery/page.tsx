'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { MasteryOverviewItem } from '@/lib/api-client';

// ─── Radar Chart (pure SVG, no dependencies) ─────────────────────────────────

interface RadarDatum {
  label: string;
  value: number; // 0-1
  color: string;
}

function RadarChart({ data, size = 260 }: { data: RadarDatum[]; size?: number }) {
  if (!data.length) return null;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = (size / 2) * 0.78;
  const levels = 4;
  const n = data.length;

  const getXY = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle - Math.PI / 2),
    y: cy + r * Math.sin(angle - Math.PI / 2),
  });

  const angles = data.map((_, i) => (2 * Math.PI * i) / n);

  // Grid rings
  const gridRings = Array.from({ length: levels }, (_, i) => {
    const r = (maxR * (i + 1)) / levels;
    const pts = angles.map(a => {
      const p = getXY(a, r);
      return `${p.x},${p.y}`;
    }).join(' ');
    return <polygon key={i} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />;
  });

  // Axes
  const axes = angles.map((a, i) => {
    const p = getXY(a, maxR);
    return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />;
  });

  // Data polygon
  const dataPoints = data.map((d, i) => {
    const r = d.value * maxR;
    return getXY(angles[i], r);
  });
  const polyPts = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

  // Labels (slightly outside)
  const labelRadius = maxR + 22;
  const labels = data.map((d, i) => {
    const p = getXY(angles[i], labelRadius);
    const anchor = p.x < cx - 2 ? 'end' : p.x > cx + 2 ? 'start' : 'middle';
    return (
      <text key={i} x={p.x} y={p.y + 4} textAnchor={anchor as any} fontSize={10} fill="#64748b" fontWeight={600}>
        {d.label.length > 12 ? d.label.slice(0, 10) + '…' : d.label}
      </text>
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gridRings}
      {axes}
      {/* 90% target ring */}
      <polygon
        points={angles.map(a => { const p = getXY(a, maxR * 0.9); return `${p.x},${p.y}`; }).join(' ')}
        fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth={1} strokeDasharray="4 3"
      />
      {/* Data shape */}
      <polygon
        points={polyPts}
        fill="rgba(99,102,241,0.2)"
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill={data[i].color} stroke="#0f172a" strokeWidth={2} />
      ))}
      {labels}
    </svg>
  );
}

// ─── Retention Sparkline (pure SVG) ───────────────────────────────────────────

function RetentionSparkline({ retention, stability, width = 80, height = 24 }: {
  retention: number; stability: number; width?: number; height?: number;
}) {
  // Plot FSRS decay curve: R(t,S) = (1 + t/(9S))^(-1), from today to today+2S
  const points = useMemo(() => {
    const pts: string[] = [];
    const totalDays = Math.max(stability * 2, 14);
    const steps = 30;
    for (let i = 0; i <= steps; i++) {
      const t = (totalDays * i) / steps;
      const R = Math.pow(1 + t / (9 * Math.max(stability, 0.1)), -1);
      const x = (width * i) / steps;
      const y = height - R * height;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [stability, width, height]);

  const retColor = retention >= 0.8 ? '#10b981' : retention >= 0.5 ? '#f59e0b' : '#ef4444';
  const fillPts = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polygon points={fillPts} fill={`${retColor}22`} />
      <polyline points={points} fill="none" stroke={retColor} strokeWidth={1.5} strokeLinecap="round" />
      {/* Current position dot at t=0 */}
      <circle
        cx={0}
        cy={(height - retention * height).toFixed(1)}
        r={3}
        fill={retColor}
      />
    </svg>
  );
}

// ─── Mastery Page ─────────────────────────────────────────────────────────────

const LEVEL_LABELS = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_COLORS = ['#475569', '#6366f1', '#8b5cf6', '#f59e0b', '#10b981'];
const LEVEL_ICONS = ['⚪', '🔵', '🟣', '🟡', '🌟'];

export default function MasteryPage() {
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [masteries, setMasteries] = useState<MasteryOverviewItem[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'level' | 'retention' | 'due'>('level');
  const [activeTab, setActiveTab] = useState<'map' | 'radar' | 'insights'>('map');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      trackerApi.getMasteryOverview(domain),
      trackerApi.getDueConcepts(domain),
    ])
      .then(([mastRes, dueRes]) => {
        setMasteries(mastRes.data);
        setDueCount(dueRes.data.length);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [domain]);

  const sorted = useMemo(() => {
    const arr = [...masteries];
    if (sortBy === 'level') return arr.sort((a, b) => b.masteryLevel - a.masteryLevel);
    if (sortBy === 'retention') return arr.sort((a, b) => (a.retentionScore ?? 1) - (b.retentionScore ?? 1));
    if (sortBy === 'due') return arr.sort((a, b) => {
      const da = a.isDue ? 0 : 1;
      const db = b.isDue ? 0 : 1;
      return da - db;
    });
    return arr;
  }, [masteries, sortBy]);

  // Radar chart data — top 6 concepts by attempt count
  const radarData = useMemo((): RadarDatum[] => {
    return masteries
      .filter(m => m.totalAttempts > 0)
      .sort((a, b) => b.totalAttempts - a.totalAttempts)
      .slice(0, 6)
      .map(m => ({
        label: m.conceptName,
        value: m.masteryScore,
        color: LEVEL_COLORS[m.masteryLevel] ?? '#6366f1',
      }));
  }, [masteries]);

  // Stats
  const stats = useMemo(() => ({
    total: masteries.length,
    mastered: masteries.filter(m => m.masteryLevel >= 3).length,
    due: masteries.filter(m => m.isDue).length,
    avgRetention: masteries.length > 0
      ? Math.round(masteries.reduce((s, m) => s + (m.retentionScore ?? 0), 0) / masteries.length * 100)
      : 0,
  }), [masteries]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading mastery data…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Dashboard
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: '#e2e8f0', marginBottom: 6 }}>
              Mastery Map
            </h1>
            <p style={{ color: '#64748b', fontSize: 15 }}>Your personalised knowledge radar — powered by FSRS spaced repetition</p>
          </div>
          {/* Smart Review CTA */}
          {dueCount > 0 && (
            <Link href="/dashboard/practice?mode=review" style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(245,158,11,0.1))',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, cursor: 'pointer',
                animation: 'pulseGlow 2s infinite',
              }}>
                <span style={{ fontSize: 20 }}>🔔</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fca5a5' }}>Review Now</div>
                  <div style={{ fontSize: 11, color: '#ef4444' }}>{dueCount} concept{dueCount > 1 ? 's' : ''} due</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* Domain Toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
        {(['DSA', 'SYSTEM_DESIGN'] as const).map(d => (
          <button key={d} onClick={() => setDomain(d)} style={{
            padding: '8px 20px', borderRadius: 30, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            background: domain === d ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
            color: domain === d ? '#fff' : '#64748b', transition: 'all 0.2s',
            boxShadow: domain === d ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
          }}>{d.replace('_', ' ')}</button>
        ))}
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Total Concepts', value: stats.total, icon: '📚' },
          { label: 'Mastered', value: stats.mastered, icon: '🏆' },
          { label: 'Due for Review', value: stats.due, icon: '🔔', alert: stats.due > 0 },
          { label: 'Avg Retention', value: `${stats.avgRetention}%`, icon: '🧠' },
        ].map(({ label, value, icon, alert }) => (
          <div key={label} style={{
            padding: '18px 20px', borderRadius: 16,
            background: alert ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${alert ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
          }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: alert ? '#fca5a5' : '#e2e8f0' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        {([
          { key: 'map', label: '📋 Concept Map' },
          { key: 'radar', label: '🕸️ Radar Chart' },
          { key: 'insights', label: '📊 Retention Decay' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
            background: activeTab === tab.key ? 'rgba(99,102,241,0.2)' : 'transparent',
            color: activeTab === tab.key ? '#a5b4fc' : '#64748b', transition: 'all 0.2s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* Sort bar */}
      {activeTab === 'map' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
          <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>Sort by:</span>
          {[
            { key: 'level', label: 'Mastery Level' },
            { key: 'retention', label: 'Lowest Retention' },
            { key: 'due', label: 'Due First' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setSortBy(key as any)} style={{
              padding: '4px 12px', borderRadius: 20, border: `1px solid ${sortBy === key ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`,
              background: sortBy === key ? 'rgba(99,102,241,0.1)' : 'transparent',
              color: sortBy === key ? '#a5b4fc' : '#64748b', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      )}

      {/* ── Concept Map Tab ── */}
      {activeTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌱</div>
              <p style={{ fontSize: 16, fontWeight: 600 }}>No mastery data yet</p>
              <p style={{ fontSize: 14, marginTop: 8 }}>
                <Link href="/dashboard/practice" style={{ color: '#6366f1' }}>Start practising</Link> to build your mastery map
              </p>
            </div>
          ) : sorted.map(m => {
            const ret = Math.round((m.retentionScore ?? 0) * 100);
            const retColor = ret >= 80 ? '#10b981' : ret >= 50 ? '#f59e0b' : '#ef4444';
            const acc = m.totalAttempts > 0 ? Math.round((m.correctAttempts / m.totalAttempts) * 100) : 0;
            const nextDue = m.nextRevisionDue ? new Date(m.nextRevisionDue) : null;
            const hoursUntilDue = nextDue ? Math.round((nextDue.getTime() - Date.now()) / (1000 * 60 * 60)) : null;

            return (
              <div key={m.conceptId} style={{
                padding: '16px 20px', borderRadius: 14,
                background: m.isDue ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${m.isDue ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto auto',
                gap: 20, alignItems: 'center',
                transition: 'all 0.2s',
              }}>
                {/* Concept name + level */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{LEVEL_ICONS[m.masteryLevel] ?? '⚪'}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{m.conceptName}</span>
                    {m.isDue && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#ef4444',
                        background: 'rgba(239,68,68,0.15)', padding: '1px 8px', borderRadius: 20,
                      }}>DUE</span>
                    )}
                  </div>
                  {/* Mastery progress bar */}
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', width: 160 }}>
                    <div style={{
                      height: '100%',
                      width: `${m.masteryScore * 100}%`,
                      background: `linear-gradient(90deg, ${LEVEL_COLORS[m.masteryLevel] ?? '#6366f1'}, ${LEVEL_COLORS[Math.min(m.masteryLevel + 1, 4)] ?? '#10b981'})`,
                      borderRadius: 4, transition: 'width 0.6s',
                    }} />
                  </div>
                </div>

                {/* Retention sparkline + value */}
                <div style={{ textAlign: 'center' }}>
                  <RetentionSparkline
                    retention={m.retentionScore ?? 0}
                    stability={m.memoryStrength ?? 1}
                  />
                  <div style={{ fontSize: 12, fontWeight: 700, color: retColor, marginTop: 2 }}>{ret}%</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>retention</div>
                </div>

                {/* Accuracy */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{acc}%</div>
                  <div style={{ fontSize: 10, color: '#475569' }}>{m.correctAttempts}/{m.totalAttempts} correct</div>
                </div>

                {/* FSRS Difficulty */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>
                    D: {(m.fsrsDifficulty ?? 5).toFixed(1)}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569' }}>difficulty</div>
                </div>

                {/* Next due */}
                <div style={{ textAlign: 'right', minWidth: 80 }}>
                  {hoursUntilDue !== null ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: m.isDue ? '#ef4444' : '#64748b' }}>
                        {m.isDue ? 'Overdue' : hoursUntilDue < 24 ? `${hoursUntilDue}h` : `${Math.round(hoursUntilDue / 24)}d`}
                      </div>
                      <div style={{ fontSize: 10, color: '#475569' }}>until review</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: '#475569' }}>Not reviewed</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Radar Chart Tab ── */}
      {activeTab === 'radar' && (
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{
            padding: 32, borderRadius: 20,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Mastery Radar</h3>
            <p style={{ color: '#64748b', fontSize: 12, marginBottom: 20 }}>Top {radarData.length} most-practised concepts</p>
            {radarData.length < 3 ? (
              <div style={{ textAlign: 'center', color: '#475569', padding: '40px 60px' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🕸️</div>
                Practice at least 3 concepts to see the radar
              </div>
            ) : (
              <RadarChart data={radarData} size={300} />
            )}
            {/* Legend */}
            <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {radarData.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                  <span style={{ color: '#64748b' }}>{d.label}</span>
                  <span style={{ color: '#475569' }}>{Math.round(d.value * 100)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Mastery breakdown bar chart */}
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Mastery Distribution</h3>
            {[4, 3, 2, 1, 0].map(level => {
              const count = masteries.filter(m => m.masteryLevel === level).length;
              const pct = masteries.length > 0 ? (count / masteries.length) * 100 : 0;
              return (
                <div key={level} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: LEVEL_COLORS[level], fontWeight: 600 }}>
                      {LEVEL_ICONS[level]} {LEVEL_LABELS[level]}
                    </span>
                    <span style={{ fontSize: 13, color: '#64748b' }}>{count}</span>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: LEVEL_COLORS[level],
                      borderRadius: 4, transition: 'width 0.8s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Retention Decay Tab ── */}
      {activeTab === 'insights' && (
        <div>
          <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Retention Decay Curves</h3>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
            Each sparkline shows how fast a concept's memory fades (FSRS model). Shorter curves = harder concepts. Green = high retention, Red = critical.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {masteries
              .filter(m => m.totalAttempts > 0)
              .sort((a, b) => (a.retentionScore ?? 1) - (b.retentionScore ?? 1))
              .map(m => {
                const ret = Math.round((m.retentionScore ?? 0) * 100);
                const retColor = ret >= 80 ? '#10b981' : ret >= 50 ? '#f59e0b' : '#ef4444';
                return (
                  <div key={m.conceptId} style={{
                    padding: '14px 16px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.03)', border: `1px solid ${m.isDue ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <RetentionSparkline retention={m.retentionScore ?? 0} stability={m.memoryStrength ?? 1} width={90} height={32} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>{m.conceptName}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                        <span style={{ color: retColor, fontWeight: 700 }}>{ret}% retention</span>
                        <span style={{ color: '#475569' }}>S={m.memoryStrength.toFixed(1)}d</span>
                        {m.isDue && <span style={{ color: '#ef4444', fontWeight: 700 }}>DUE ⚠️</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          50% { box-shadow: 0 0 16px 4px rgba(239,68,68,0.25); }
        }
      `}</style>
    </div>
  );
}
