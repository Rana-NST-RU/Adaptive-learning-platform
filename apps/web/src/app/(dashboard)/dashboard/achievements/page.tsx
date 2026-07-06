'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { trackerApi } from '@/lib/api-client';
import type { Achievement } from '@/lib/api-client';

const RARITY_CONFIG = {
  COMMON:    { color: '#94a3b8', glow: 'rgba(148,163,184,0.3)', bg: 'rgba(148,163,184,0.07)', label: 'Common',    star: '★' },
  RARE:      { color: '#6366f1', glow: 'rgba(99,102,241,0.4)',  bg: 'rgba(99,102,241,0.1)',   label: 'Rare',      star: '★★' },
  EPIC:      { color: '#a855f7', glow: 'rgba(168,85,247,0.5)',  bg: 'rgba(168,85,247,0.12)',  label: 'Epic',      star: '★★★' },
  LEGENDARY: { color: '#f59e0b', glow: 'rgba(245,158,11,0.6)',  bg: 'rgba(245,158,11,0.15)',  label: 'Legendary', star: '★★★★' },
};

function AchievementCard({ a }: { a: Achievement & { animDelay: number } }) {
  const r = RARITY_CONFIG[a.rarity];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '20px',
        borderRadius: 16,
        background: a.unlocked ? r.bg : 'rgba(255,255,255,0.03)',
        border: `1px solid ${a.unlocked ? r.color + '44' : 'rgba(255,255,255,0.06)'}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        position: 'relative', overflow: 'hidden',
        transition: 'all 0.25s ease',
        boxShadow: a.unlocked && hovered ? `0 0 24px ${r.glow}` : 'none',
        transform: hovered ? 'translateY(-3px) scale(1.02)' : 'none',
        animation: a.unlocked ? `fadeIn 0.4s ease ${a.animDelay}ms both` : 'none',
        opacity: a.unlocked ? 1 : 0.45,
        filter: a.unlocked ? 'none' : 'grayscale(1)',
        cursor: 'default',
      }}
    >
      {/* Rarity badge */}
      <div style={{
        position: 'absolute', top: 10, right: 10,
        fontSize: 9, fontWeight: 700, color: r.color, letterSpacing: '0.06em',
        background: a.unlocked ? r.bg : 'transparent',
        padding: '2px 6px', borderRadius: 6,
      }}>{r.star}</div>

      {/* Icon */}
      <div style={{
        width: 64, height: 64, borderRadius: '50%', fontSize: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: a.unlocked
          ? `radial-gradient(circle, ${r.color}25, transparent 70%)`
          : 'rgba(255,255,255,0.05)',
        boxShadow: a.unlocked ? `0 0 20px ${r.glow}` : 'none',
      }}>
        {a.unlocked ? a.icon : '🔒'}
      </div>

      {/* Label */}
      <div style={{ fontSize: 13, fontWeight: 700, color: a.unlocked ? '#e2e8f0' : '#475569', textAlign: 'center' }}>
        {a.label}
      </div>

      {/* Description */}
      <div style={{ fontSize: 11, color: '#475569', textAlign: 'center', lineHeight: 1.4 }}>
        {a.unlocked ? a.desc : '???'}
      </div>

      {/* Rarity label */}
      <div style={{ fontSize: 10, fontWeight: 700, color: r.color, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {r.label}
      </div>

      {/* Unlock date */}
      {a.unlocked && a.unlockedAt && (
        <div style={{ fontSize: 10, color: '#475569' }}>
          Unlocked {new Date(a.unlockedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </div>
      )}

      {/* Shimmer effect for unlocked legendary */}
      {a.unlocked && a.rarity === 'LEGENDARY' && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(105deg, transparent 40%, rgba(245,158,11,0.1) 50%, transparent 60%)',
          animation: 'shimmer 2.5s infinite',
        }} />
      )}
    </div>
  );
}

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [rarityFilter, setRarityFilter] = useState<string>('all');

  useEffect(() => {
    trackerApi.getAchievements()
      .then(r => setAchievements(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return achievements
      .filter(a => filter === 'all' ? true : filter === 'unlocked' ? a.unlocked : !a.unlocked)
      .filter(a => rarityFilter === 'all' ? true : a.rarity === rarityFilter);
  }, [achievements, filter, rarityFilter]);

  const stats = useMemo(() => ({
    total: achievements.length,
    unlocked: achievements.filter(a => a.unlocked).length,
    legendary: achievements.filter(a => a.unlocked && a.rarity === 'LEGENDARY').length,
    epic: achievements.filter(a => a.unlocked && a.rarity === 'EPIC').length,
  }), [achievements]);

  const completionPct = stats.total > 0 ? Math.round((stats.unlocked / stats.total) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading achievements…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#e2e8f0', marginBottom: 6 }}>Achievements</h1>
        <p style={{ color: '#64748b', fontSize: 15 }}>Your ALOS milestones and badges</p>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        {[
          { label: 'Unlocked', value: `${stats.unlocked}/${stats.total}`, icon: '🏆' },
          { label: 'Completion', value: `${completionPct}%`, icon: '📊' },
          { label: 'Epic Badges', value: stats.epic, icon: '💜' },
          { label: 'Legendary', value: stats.legendary, icon: '⭐' },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{
            padding: '16px 18px', borderRadius: 14,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#e2e8f0' }}>{value}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>Overall Progress</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>{completionPct}%</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${completionPct}%`,
            background: 'linear-gradient(90deg, #6366f1, #a855f7, #f59e0b)',
            borderRadius: 4, transition: 'width 1s ease',
            boxShadow: completionPct > 0 ? '0 0 12px rgba(99,102,241,0.5)' : 'none',
          }} />
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 10 }}>
          {(['all', 'unlocked', 'locked'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 12, textTransform: 'capitalize',
              background: filter === f ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: filter === f ? '#a5b4fc' : '#64748b',
            }}>{f === 'all' ? `All (${stats.total})` : f === 'unlocked' ? `Unlocked (${stats.unlocked})` : `Locked (${stats.total - stats.unlocked})`}</button>
          ))}
        </div>

        {/* Rarity filter */}
        {(['all', 'COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const).map(r => {
          const cfg = r === 'all' ? null : RARITY_CONFIG[r];
          return (
            <button key={r} onClick={() => setRarityFilter(r)} style={{
              padding: '5px 14px', borderRadius: 7, border: `1px solid ${cfg ? cfg.color + '44' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer', fontWeight: 600, fontSize: 12,
              background: rarityFilter === r ? (cfg?.bg ?? 'rgba(99,102,241,0.1)') : 'transparent',
              color: rarityFilter === r ? (cfg?.color ?? '#a5b4fc') : '#64748b',
            }}>{r === 'all' ? 'All Rarities' : RARITY_CONFIG[r].label}</button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <p>No achievements match your filter</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
          {/* Sort: unlocked first, then by rarity */}
          {[...filtered]
            .sort((a, b) => {
              if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
              const rarityOrder = { LEGENDARY: 0, EPIC: 1, RARE: 2, COMMON: 3 };
              return rarityOrder[a.rarity] - rarityOrder[b.rarity];
            })
            .map((a, i) => (
              <AchievementCard key={a.type} a={{ ...a, animDelay: i * 40 } as any} />
            ))}
        </div>
      )}

      {/* CTA if nothing unlocked */}
      {stats.unlocked === 0 && (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Link href="/dashboard/practice" style={{
            display: 'inline-block', padding: '12px 28px', borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 15,
            boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          }}>
            Start Practising to Earn Badges →
          </Link>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
      `}</style>
    </div>
  );
}
