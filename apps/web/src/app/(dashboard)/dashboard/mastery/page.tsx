'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { MasteryOverviewItem } from '@/lib/api-client';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_LABELS = ['Not Started', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const LEVEL_COLORS = ['#334155', '#6366f1', '#f59e0b', '#10b981', '#f97316'];
const LEVEL_ICONS  = ['○', '◔', '◑', '◕', '●'];

function retentionColor(r: number): string {
  if (r >= 0.8) return '#10b981'; // green — fresh
  if (r >= 0.5) return '#f59e0b'; // yellow — fading
  return '#ef4444';               // red — due
}

function retentionLabel(r: number): string {
  if (r >= 0.8) return 'Fresh';
  if (r >= 0.5) return 'Fading';
  return 'Due';
}

function memoryStrengthLabel(s: number): string {
  if (s >= 30) return `${Math.round(s)}d`;
  if (s >= 1)  return `${s.toFixed(1)}d`;
  return `${Math.round(s * 24)}h`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'recently';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MasteryPage() {
  const [masteries, setMasteries] = useState<MasteryOverviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN' | 'ALL'>('DSA');
  const [sort, setSort]     = useState<'due' | 'level' | 'name' | 'retention'>('due');

  useEffect(() => {
    setLoading(true);
    setError(null);
    trackerApi.getMasteryOverview(domain === 'ALL' ? undefined : domain)
      .then(r => setMasteries(r.data))
      .catch(err => {
        setError(err?.response?.status === 401 ? 'Please log in to view your mastery data.' : 'Failed to load mastery data.');
      })
      .finally(() => setLoading(false));
  }, [domain]);

  const sorted = [...masteries].sort((a, b) => {
    if (sort === 'due') {
      // Due first, then by nextRevisionDue ascending
      if (a.isDue && !b.isDue) return -1;
      if (!a.isDue && b.isDue) return 1;
      if (a.nextRevisionDue && b.nextRevisionDue)
        return new Date(a.nextRevisionDue).getTime() - new Date(b.nextRevisionDue).getTime();
      return 0;
    }
    if (sort === 'level')     return b.masteryLevel - a.masteryLevel;
    if (sort === 'retention') return a.retentionScore - b.retentionScore;
    return a.conceptName.localeCompare(b.conceptName);
  });

  const dueCount      = masteries.filter(m => m.isDue).length;
  const masteredCount = masteries.filter(m => m.masteryLevel >= 3).length;
  const avgRetention  = masteries.length > 0
    ? Math.round((masteries.reduce((s, m) => s + m.retentionScore, 0) / masteries.length) * 100)
    : null;

  // Domain radar chart — aggregate mastery by category from conceptName prefixes
  const categoryMap: Record<string, { total: number; sumScore: number }> = {};
  masteries.forEach(m => {
    const cat = m.conceptName.split(' ')[0]; // rough grouping by first word
    if (!categoryMap[cat]) categoryMap[cat] = { total: 0, sumScore: 0 };
    categoryMap[cat].total++;
    categoryMap[cat].sumScore += m.masteryScore;
  });

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <Link href="/dashboard" style={{
          padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.04)', color: '#64748b', fontSize: 13,
          textDecoration: 'none', fontWeight: 500,
        }}>← Dashboard</Link>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
            🧠 Mastery Map
          </h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>
            Track your retention & forgetting curves across all concepts
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && !error && masteries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Concepts Tracked', value: masteries.length, color: '#a5b4fc', icon: '📚' },
            { label: 'Mastered (Adv+)', value: masteredCount, color: '#10b981', icon: '🏆' },
            { label: 'Due for Revision', value: dueCount, color: dueCount > 0 ? '#ef4444' : '#10b981', icon: '🔁' },
            { label: 'Avg Retention', value: avgRetention !== null ? `${avgRetention}%` : '—', color: retentionColor((avgRetention ?? 100) / 100), icon: '🧬' },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '16px 18px', borderRadius: 14,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>{s.icon} {s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['DSA', 'SYSTEM_DESIGN', 'ALL'] as const).map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12,
              background: domain === d ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
              color: domain === d ? '#a5b4fc' : '#64748b',
            }}>
              {d === 'SYSTEM_DESIGN' ? 'Sys Design' : d}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#475569' }}>Sort:</span>
          {[['due', '🔁 Due first'], ['level', '🏆 Level'], ['retention', '🧬 Retention'], ['name', 'A–Z']] .map(([v, l]) => (
            <button key={v} onClick={() => setSort(v as any)} style={{
              padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600,
              background: sort === v ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              color: sort === v ? '#a5b4fc' : '#475569',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Due banner */}
      {!loading && !error && dueCount > 0 && sort === 'due' && (
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 16,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>🔁</span>
          <div>
            <div style={{ fontWeight: 700, color: '#fca5a5', fontSize: 13 }}>{dueCount} concept{dueCount > 1 ? 's' : ''} due for revision</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Review these to keep your memory fresh</div>
          </div>
          <Link href="/dashboard/practice" style={{
            marginLeft: 'auto', padding: '7px 16px', borderRadius: 8, fontSize: 13,
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', fontWeight: 700, textDecoration: 'none',
          }}>Revise Now →</Link>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 80, borderRadius: 14, background: 'rgba(255,255,255,0.04)', animation: 'shimmer 1.5s infinite' }} />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ padding: '32px', textAlign: 'center', background: 'rgba(239,68,68,0.07)', borderRadius: 16, border: '1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontWeight: 600 }}>{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && masteries.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '56px 24px', textAlign: 'center',
          background: 'rgba(255,255,255,0.02)', borderRadius: 20,
          border: '1px dashed rgba(255,255,255,0.07)',
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🌱</div>
          <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 18, marginBottom: 8 }}>No mastery data yet</div>
          <div style={{ color: '#64748b', fontSize: 14, maxWidth: 280, marginBottom: 24 }}>
            Complete practice sessions to start tracking your retention & forgetting curves.
          </div>
          <Link href="/dashboard/practice" style={{
            padding: '10px 24px', borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 15,
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>⚡ Start Practicing</Link>
        </div>
      )}

      {/* Mastery list */}
      {!loading && !error && sorted.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((m, i) => (
            <MasteryCard key={m.conceptId} item={m} index={i} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

// ─── Mastery Card ─────────────────────────────────────────────────────────────

function MasteryCard({ item, index }: { item: MasteryOverviewItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const lc = LEVEL_COLORS[item.masteryLevel] ?? '#334155';
  const rc = retentionColor(item.retentionScore);

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 14, padding: '14px 18px', cursor: 'pointer',
        background: item.isDue ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${item.isDue ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.07)'}`,
        transition: 'all 0.2s', animation: `fadeIn 0.3s ease ${index * 0.02}s both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Level icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, background: `${lc}22`, color: lc, border: `1px solid ${lc}44`,
        }}>
          {LEVEL_ICONS[item.masteryLevel] ?? '○'}
        </div>

        {/* Name + level */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.conceptName}
            </span>
            {item.isDue && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', flexShrink: 0 }}>
                DUE
              </span>
            )}
          </div>
          {/* Mastery progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, transition: 'width 0.6s ease',
                width: `${item.masteryScore * 100}%`,
                background: `linear-gradient(90deg, ${lc}, ${lc}88)`,
              }} />
            </div>
            <span style={{ fontSize: 11, color: lc, fontWeight: 600, flexShrink: 0 }}>
              {LEVEL_LABELS[item.masteryLevel]}
            </span>
          </div>
        </div>

        {/* Retention badge */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: rc }}>
            {Math.round(item.retentionScore * 100)}%
          </div>
          <div style={{ fontSize: 10, color: rc, opacity: 0.7 }}>{retentionLabel(item.retentionScore)}</div>
        </div>

        {/* Chevron */}
        <div style={{ fontSize: 14, color: '#475569', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</div>
      </div>

      {/* Retention bar */}
      <div style={{ marginTop: 10, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, transition: 'width 0.6s ease',
          width: `${item.retentionScore * 100}%`,
          background: `linear-gradient(90deg, ${rc}, ${rc}88)`,
        }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)',
          animation: 'fadeIn 0.2s ease',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {[
            { label: 'Total Attempts', value: item.totalAttempts },
            { label: 'Correct', value: `${item.correctAttempts} (${item.totalAttempts > 0 ? Math.round((item.correctAttempts / item.totalAttempts) * 100) : 0}%)` },
            { label: 'Revisions', value: item.revisionCount },
            { label: 'Memory Strength', value: memoryStrengthLabel(item.memoryStrength) },
            { label: 'Next Due', value: item.nextRevisionDue ? new Date(item.nextRevisionDue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
            { label: 'Last Practiced', value: timeAgo(item.lastAttemptAt) },
          ].map((d, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, color: '#475569', marginBottom: 3 }}>{d.label}</div>
              <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>{d.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
