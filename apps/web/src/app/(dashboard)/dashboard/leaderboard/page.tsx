'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usersApi } from '@/lib/api-client';
import type { LeaderboardUser, LeaderboardResponse } from '@/lib/api-client';

// ─── Rank Medal ───────────────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 24 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 24 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 24 }}>🥉</span>;
  return (
    <span style={{
      fontSize: 13, fontWeight: 800, color: '#64748b',
      width: 28, textAlign: 'center', display: 'inline-block',
    }}>#{rank}</span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, avatar, size = 40 }: { name: string; avatar: string | null; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  if (avatar) {
    return (
      <img src={avatar} alt={name} style={{
        width: size, height: size, borderRadius: '50%', objectFit: 'cover',
        border: '2px solid rgba(255,255,255,0.1)',
      }} />
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${hue},70%,45%), hsl(${(hue + 60) % 360},70%,35%))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, color: '#fff',
      border: '2px solid rgba(255,255,255,0.1)',
    }}>
      {initials}
    </div>
  );
}

// ─── Level Badge ──────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: number }) {
  const color = level >= 20 ? '#f59e0b' : level >= 10 ? '#a855f7' : level >= 5 ? '#6366f1' : '#64748b';
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>
      Lv {level}
    </span>
  );
}

// ─── XP Progress Bar ──────────────────────────────────────────────────────────
function XpBar({ xp, maxXp }: { xp: number; maxXp: number }) {
  const pct = Math.min((xp / maxXp) * 100, 100);
  return (
    <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 4,
        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
        transition: 'width 0.6s ease',
      }} />
    </div>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────
function Podium({ top3 }: { top3: LeaderboardUser[] }) {
  if (top3.length < 3) return null;

  const order = [top3[1], top3[0], top3[2]]; // Silver, Gold, Bronze order
  const heights = [120, 160, 100];
  const colors = ['#94a3b8', '#f59e0b', '#cd7c54'];
  const labels = ['2nd', '1st', '3rd'];
  const glows = ['rgba(148,163,184,0.3)', 'rgba(245,158,11,0.4)', 'rgba(205,124,84,0.3)'];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8,
      padding: '32px 20px 0', marginBottom: 40,
    }}>
      {order.map((user, i) => (
        <div key={user.userId} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          animation: `riseUp 0.6s ease ${i * 0.15}s both`,
        }}>
          {/* Crown for 1st */}
          {i === 1 && (
            <div style={{ fontSize: 28, animation: 'bounce 2s ease infinite', marginBottom: -4 }}>👑</div>
          )}

          {/* Avatar */}
          <div style={{ position: 'relative' }}>
            <Avatar name={user.name} avatar={user.avatar} size={i === 1 ? 64 : 52} />
            <div style={{
              position: 'absolute', bottom: -6, right: -6,
              width: 22, height: 22, borderRadius: '50%',
              background: colors[i], border: '2px solid #0f172a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: '#fff',
            }}>{order[i].rank}</div>
          </div>

          {/* Name */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name.split(' ')[0]}
          </div>

          {/* XP */}
          <div style={{ fontSize: 11, color: colors[i], fontWeight: 700 }}>
            {user.totalXP.toLocaleString()} XP
          </div>

          {/* Podium block */}
          <div style={{
            width: i === 1 ? 110 : 90, height: heights[i],
            borderRadius: '8px 8px 0 0',
            background: `linear-gradient(180deg, ${colors[i]}22, ${colors[i]}11)`,
            border: `1px solid ${colors[i]}44`,
            borderBottom: 'none',
            boxShadow: `0 -4px 20px ${glows[i]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: i === 1 ? 32 : 24, opacity: 0.6 }}>{labels[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Leaderboard Row ──────────────────────────────────────────────────────────
function LeaderboardRow({ user, index }: { user: LeaderboardUser; index: number }) {
  const isTop3 = user.rank <= 3;
  const xpForNextLevel = (user.currentLevel + 1) * 500;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 20px', borderRadius: 14,
      background: user.isCurrentUser
        ? 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))'
        : isTop3
          ? 'rgba(255,255,255,0.05)'
          : 'rgba(255,255,255,0.03)',
      border: user.isCurrentUser
        ? '1px solid rgba(99,102,241,0.35)'
        : isTop3
          ? '1px solid rgba(255,255,255,0.1)'
          : '1px solid rgba(255,255,255,0.05)',
      transition: 'transform 0.15s, box-shadow 0.15s',
      animation: `slideInRight 0.3s ease ${Math.min(index, 20) * 0.03}s both`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* "You" glow */}
      {user.isCurrentUser && (
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 120, height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.08))',
          pointerEvents: 'none',
        }} />
      )}

      {/* Rank */}
      <div style={{ width: 32, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
        <RankBadge rank={user.rank} />
      </div>

      {/* Avatar */}
      <Avatar name={user.name} avatar={user.avatar} size={38} />

      {/* Name + level */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 14, fontWeight: user.isCurrentUser ? 800 : 600,
            color: user.isCurrentUser ? '#a5b4fc' : '#e2e8f0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{user.name}</span>
          {user.isCurrentUser && (
            <span style={{
              fontSize: 10, fontWeight: 700, color: '#6366f1',
              background: 'rgba(99,102,241,0.15)', padding: '1px 7px', borderRadius: 20,
              flexShrink: 0,
            }}>You</span>
          )}
          <LevelBadge level={user.currentLevel} />
        </div>
        <XpBar xp={user.totalXP % xpForNextLevel} maxXp={xpForNextLevel} />
      </div>

      {/* XP */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>
          {user.totalXP.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, color: '#475569' }}>XP</div>
      </div>
    </div>
  );
}

// ─── Leaderboard Page ─────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: 'DSA' | 'SYSTEM_DESIGN') => {
    setLoading(true);
    setError(null);
    try {
      const res = await usersApi.getLeaderboard(d);
      setData(res.data);
    } catch {
      setError('Failed to load leaderboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(domain); }, [domain, load]);

  const top3 = data?.leaderboard.slice(0, 3) ?? [];
  const rest = data?.leaderboard.slice(3) ?? [];

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>
            ← Dashboard
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 34, fontWeight: 900, color: '#f1f5f9', margin: 0, marginBottom: 6 }}>
              🏆 Leaderboard
            </h1>
            <p style={{ color: '#64748b', fontSize: 15, margin: 0 }}>
              Top learners ranked by total XP earned — updated in real-time
            </p>
          </div>

          {/* Domain toggle */}
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12 }}>
            {(['DSA', 'SYSTEM_DESIGN'] as const).map(d => (
              <button key={d} onClick={() => setDomain(d)} style={{
                padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 12,
                background: domain === d ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: domain === d ? '#a5b4fc' : '#64748b',
                transition: 'all 0.2s',
              }}>{d === 'DSA' ? 'DSA' : 'System Design'}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Current user rank badge */}
      {data?.currentUserRank && (
        <div style={{
          marginBottom: 24, padding: '12px 20px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.07))',
          border: '1px solid rgba(99,102,241,0.2)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>📍</span>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#a5b4fc' }}>
              Your rank: #{data.currentUserRank}
            </span>
            {data.currentUserRank > 50 && (
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                — Keep earning XP to reach the top 50!
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div>
          {/* Podium skeleton */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, marginBottom: 40, padding: '32px 20px 0' }}>
            {[120, 160, 100].map((h, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ width: 80, height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'shimmer 1.5s infinite' }} />
                <div style={{ width: i === 1 ? 110 : 90, height: h, borderRadius: '8px 8px 0 0', background: 'rgba(255,255,255,0.04)', animation: 'shimmer 1.5s infinite' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 66, borderRadius: 14, background: 'rgba(255,255,255,0.03)', animation: 'shimmer 1.5s infinite' }} />
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '20px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5', textAlign: 'center' }}>
          {error}
          <button onClick={() => load(domain)} style={{ marginLeft: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Podium (top 3) */}
      {!loading && !error && top3.length >= 3 && (
        <Podium top3={top3} />
      )}

      {/* Full list */}
      {!loading && !error && data && (
        <div>
          {data.leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🏆</div>
              <p style={{ fontSize: 16, fontWeight: 600 }}>No learners yet</p>
              <p style={{ fontSize: 14 }}>Be the first to earn XP and claim the #1 spot!</p>
              <Link href="/dashboard/practice" style={{
                display: 'inline-block', marginTop: 16, padding: '10px 22px',
                borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 14,
              }}>⚡ Start Practicing</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.leaderboard.map((user, i) => (
                <LeaderboardRow key={user.userId} user={user} index={i} />
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes riseUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes bounce { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-6px); } }
        @keyframes shimmer { 0%,100%{opacity:1}50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
