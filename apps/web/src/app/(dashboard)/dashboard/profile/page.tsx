'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usersApi, trackerApi } from '@/lib/api-client';
import type { UserProfileData } from '@/lib/api-client';

// ─── Level XP thresholds ──────────────────────────────────────────────────────
const xpForLevel = (level: number) => level * 500;
const LEVEL_COLORS = ['#475569', '#6366f1', '#8b5cf6', '#a855f7', '#f59e0b', '#ef4444'];
const levelColor = (level: number) => LEVEL_COLORS[Math.min(Math.floor(level / 5), LEVEL_COLORS.length - 1)];

// ─── XP Progress Ring ─────────────────────────────────────────────────────────
function XpRing({ xp, level }: { xp: number; level: number }) {
  const needed = xpForLevel(level + 1);
  const current = xp % needed;
  const pct = Math.min(current / needed, 1);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const color = levelColor(level);

  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Track */}
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
        {/* Progress */}
        <circle
          cx="70" cy="70" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 6px ${color}99)` }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9' }}>Lv {level}</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{current.toLocaleString()} / {needed.toLocaleString()}</div>
      </div>
    </div>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '24px 28px', borderRadius: 20,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      marginBottom: 20,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Form Row ─────────────────────────────────────────────────────────────────
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)', color: '#f1f5f9', fontSize: 14, outline: 'none',
  boxSizing: 'border-box' as const, transition: 'border-color 0.2s',
  fontFamily: 'inherit',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer', appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center',
  paddingRight: 36,
};

// ─── Streak Freeze Widget ─────────────────────────────────────────────────────
function StreakFreezeWidget({ freezes: initialFreezes }: { freezes: number }) {
  const [freezes, setFreezes] = useState(initialFreezes);
  const [using, setUsing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUse = async () => {
    if (freezes <= 0 || using) return;
    setUsing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await usersApi.useStreakFreeze();
      setFreezes(res.data.freezesLeft);
      setMessage(res.data.message);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to use streak freeze.');
    } finally {
      setUsing(false);
    }
  };

  return (
    <div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
        Streak freezes protect your streak when you miss a day. Each freeze keeps your streak alive for 24 hours.
      </p>

      {/* Freeze icons */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            width: 48, height: 48, borderRadius: 14,
            background: i < freezes ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${i < freezes ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.07)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
            filter: i < freezes ? 'none' : 'grayscale(1) opacity(0.3)',
            transition: 'all 0.3s',
          }}>
            🧊
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 28, fontWeight: 900, color: freezes > 0 ? '#6366f1' : '#475569' }}>{freezes}</span>
          <span style={{ fontSize: 14, color: '#64748b', marginLeft: 6 }}>freeze{freezes !== 1 ? 's' : ''} remaining</span>
        </div>
        <button
          onClick={handleUse}
          disabled={freezes <= 0 || using}
          style={{
            padding: '10px 20px', borderRadius: 12, border: 'none', cursor: freezes <= 0 ? 'not-allowed' : 'pointer',
            background: freezes <= 0 ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: freezes <= 0 ? '#475569' : '#fff', fontWeight: 700, fontSize: 14,
            opacity: using ? 0.7 : 1, transition: 'all 0.2s',
            boxShadow: freezes > 0 ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
          }}
        >
          {using ? 'Using…' : '🧊 Use Freeze'}
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#6ee7b7', fontSize: 13 }}>
          ✓ {message}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [streakFreezes, setStreakFreezes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [institution, setInstitution] = useState('');
  const [targetExam, setTargetExam] = useState('');
  const [dailyGoalMins, setDailyGoalMins] = useState(30);
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [preferredDomain, setPreferredDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      usersApi.getMe(),
      trackerApi.getStats(),
    ]).then(([profileRes, statsRes]) => {
      const p = profileRes.data;
      setProfile(p);
      setName(p.name || '');
      setBio(p.profile?.bio || '');
      setInstitution(p.profile?.institution || '');
      setTargetExam(p.profile?.targetExam || '');
      setDailyGoalMins(p.profile?.dailyGoalMins ?? 30);
      setTimezone(p.profile?.timezone || 'Asia/Kolkata');
      setPreferredDomain(p.profile?.preferredDomain || 'DSA');
      // Get streak freezes from stats
      setStreakFreezes((statsRes.data as any)?.streak?.freezes ?? 2);
    }).catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await usersApi.updateMe({
        name, bio, institution, targetExam, dailyGoalMins, timezone, preferredDomain,
      });
      setProfile(res.data);
      // Update localStorage user name
      try {
        const stored = JSON.parse(localStorage.getItem('user') ?? '{}');
        localStorage.setItem('user', JSON.stringify({ ...stored, name: res.data.name }));
      } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748b', fontSize: 15 }}>Loading profile…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const xp = profile?.profile?.totalXP ?? 0;
  const level = profile?.profile?.currentLevel ?? 1;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 60px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <Link href="/dashboard" style={{ color: '#64748b', textDecoration: 'none', fontSize: 14 }}>← Dashboard</Link>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: '#f1f5f9', margin: 0, marginBottom: 6 }}>My Profile</h1>
        <p style={{ color: '#64748b', fontSize: 15, margin: 0 }}>Manage your learning preferences and account settings</p>
      </div>

      {/* Top stat banner */}
      <div style={{
        marginBottom: 28, padding: '24px 28px', borderRadius: 20,
        background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.07))',
        border: '1px solid rgba(99,102,241,0.2)',
        display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
      }}>
        <XpRing xp={xp} level={level} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#f1f5f9', marginBottom: 4 }}>{profile?.name}</div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 16 }}>{profile?.email ?? 'No email linked'}</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { label: 'Total XP', value: xp.toLocaleString(), icon: '⚡' },
              { label: 'Level', value: String(level), icon: '🏅' },
              { label: 'Daily Goal', value: `${dailyGoalMins}min`, icon: '🎯' },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#e2e8f0' }}>{s.icon} {s.value}</div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <Link href="/dashboard/leaderboard" style={{
          padding: '10px 20px', borderRadius: 12,
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          color: '#a5b4fc', fontWeight: 700, fontSize: 13, textDecoration: 'none',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>🏆 View Leaderboard →</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div>
          {/* Personal Info */}
          <SectionCard title="Personal Info" icon="👤">
            <FormRow label="Display Name">
              <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Your name" />
            </FormRow>
            <FormRow label="Bio">
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' as const }}
                placeholder="Tell others about yourself…"
              />
            </FormRow>
            <FormRow label="Institution">
              <input value={institution} onChange={e => setInstitution(e.target.value)} style={inputStyle} placeholder="e.g. IIT Delhi, Coding Bootcamp" />
            </FormRow>
            <FormRow label="Target Exam / Goal">
              <input value={targetExam} onChange={e => setTargetExam(e.target.value)} style={inputStyle} placeholder="e.g. FAANG SDE, Google, GATE" />
            </FormRow>
          </SectionCard>
        </div>

        {/* Right column */}
        <div>
          {/* Learning Preferences */}
          <SectionCard title="Learning Preferences" icon="⚙️">
            <FormRow label="Preferred Domain">
              <select value={preferredDomain} onChange={e => setPreferredDomain(e.target.value as any)} style={selectStyle}>
                <option value="DSA">DSA</option>
                <option value="SYSTEM_DESIGN">System Design</option>
              </select>
            </FormRow>
            <FormRow label="Daily Study Goal">
              <select value={dailyGoalMins} onChange={e => setDailyGoalMins(Number(e.target.value))} style={selectStyle}>
                {[10, 15, 20, 30, 45, 60, 90, 120].map(m => (
                  <option key={m} value={m}>{m} minutes / day</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Timezone">
              <select value={timezone} onChange={e => setTimezone(e.target.value)} style={selectStyle}>
                {[
                  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo',
                  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
                  'America/Los_Angeles', 'America/Toronto', 'Australia/Sydney', 'UTC',
                ].map(tz => (
                  <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                ))}
              </select>
            </FormRow>

            {/* Save button */}
            {error && (
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: 13 }}>
                {error}
              </div>
            )}
            <button onClick={handleSave} disabled={saving} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
              background: saved ? '#10b981' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: 15,
              opacity: saving ? 0.7 : 1, transition: 'all 0.3s',
              boxShadow: saved ? '0 4px 16px rgba(16,185,129,0.3)' : '0 4px 16px rgba(99,102,241,0.3)',
            }}>
              {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Changes'}
            </button>
          </SectionCard>
        </div>
      </div>

      {/* Streak Freeze — full width */}
      <SectionCard title="Streak Freezes" icon="🧊">
        <StreakFreezeWidget freezes={streakFreezes} />
      </SectionCard>

      {/* Danger Zone */}
      <div style={{
        padding: '20px 24px', borderRadius: 16,
        background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.12)',
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fca5a5', marginBottom: 8 }}>Danger Zone</h3>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
          These actions are permanent. Please proceed with caution.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{
            padding: '9px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
            background: 'transparent', color: '#fca5a5', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>Reset Mastery Data</button>
        </div>
      </div>
    </div>
  );
}
