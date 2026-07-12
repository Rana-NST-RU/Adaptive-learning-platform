'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api-client';

interface AdminUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  profile: { totalXP: number; currentLevel: number } | null;
  _count: { questionAttempts: number };
}

interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  totalPages: number;
}

interface MasteryItem {
  conceptId: string;
  conceptName: string;
  domain: string;
  masteryScore: number;
  masteryLevel: number;
  totalAttempts: number;
}

const ROLE_COLORS: Record<string, string> = {
  STUDENT: '#6366f1',
  TEACHER: '#f59e0b',
  ADMIN: '#ef4444',
};

const ROLE_BG: Record<string, string> = {
  STUDENT: 'rgba(99,102,241,0.12)',
  TEACHER: 'rgba(245,158,11,0.12)',
  ADMIN: 'rgba(239,68,68,0.12)',
};

export default function AdminUsersPage() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // User Detail Drawer
  const [drawer, setDrawer] = useState<AdminUser | null>(null);
  const [masteryList, setMasteryList] = useState<MasteryItem[]>([]);
  const [masteryLoading, setMasteryLoading] = useState(false);

  // Mastery Override
  const [overrideTarget, setOverrideTarget] = useState<{ userId: string; conceptId: string; conceptName: string; current: number } | null>(null);
  const [overrideValue, setOverrideValue] = useState(0);
  const [overrideSaving, setOverrideSaving] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(page, 15, search || undefined);
      setData(res.data as UserListResponse);
      setSelected(new Set());
    } catch {
      showToast('Failed to load users', false);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(), 300);
  };

  const handleRoleChange = async (id: string, role: string) => {
    setUpdating(id);
    try {
      await adminApi.updateUserRole(id, role);
      showToast('Role updated');
      fetchUsers();
    } catch { showToast('Failed to update role', false); }
    finally { setUpdating(null); }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    setUpdating(id);
    try {
      await adminApi.toggleUserActive(id, !current);
      showToast(!current ? 'User activated' : 'User deactivated');
      fetchUsers();
    } catch { showToast('Failed to update', false); }
    finally { setUpdating(null); }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (!data) return;
    if (selected.size === data.users.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.users.map(u => u.id)));
    }
  };

  const bulkDeactivate = async () => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selected).map(id => adminApi.toggleUserActive(id, false)));
      showToast(`Deactivated ${selected.size} users`);
      fetchUsers();
    } catch { showToast('Bulk action failed', false); }
    finally { setBulkLoading(false); }
  };

  const bulkSetRole = async (role: string) => {
    if (!selected.size) return;
    setBulkLoading(true);
    try {
      await Promise.all(Array.from(selected).map(id => adminApi.updateUserRole(id, role)));
      showToast(`Updated ${selected.size} users to ${role}`);
      fetchUsers();
    } catch { showToast('Bulk action failed', false); }
    finally { setBulkLoading(false); }
  };

  const openDrawer = async (user: AdminUser) => {
    setDrawer(user);
    setMasteryList([]);
    setMasteryLoading(true);
    try {
      const res = await adminApi.getUserMastery(user.id);
      const payload = res.data as any;
      setMasteryList(Array.isArray(payload) ? payload : (payload?.items ?? []));
    } catch { setMasteryList([]); }
    finally { setMasteryLoading(false); }
  };

  const openOverride = (userId: string, conceptId: string, conceptName: string, current: number) => {
    setOverrideTarget({ userId, conceptId, conceptName, current });
    setOverrideValue(Math.round(current * 100));
  };

  const saveOverride = async () => {
    if (!overrideTarget) return;
    setOverrideSaving(true);
    try {
      await adminApi.overrideMastery(overrideTarget.userId, overrideTarget.conceptId, overrideValue / 100);
      showToast(`Mastery overridden to ${overrideValue}%`);
      if (drawer) {
        const res = await adminApi.getUserMastery(drawer.id);
        const payload = res.data as any;
        setMasteryList(Array.isArray(payload) ? payload : (payload?.items ?? []));
      }
      setOverrideTarget(null);
    } catch { showToast('Override failed', false); }
    finally { setOverrideSaving(false); }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`,
          borderRadius: 12, padding: '12px 20px', color: toast.ok ? '#10b981' : '#ef4444',
          fontWeight: 600, fontSize: 14, backdropFilter: 'blur(12px)',
          animation: 'fadeUp 0.2s ease',
        }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>👥 User Management</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>{data?.total ?? 0} total users · Click a user to view details</p>
        </div>
        <input
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search by name, email, phone…"
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 14,
            outline: 'none', width: 280,
          }}
        />
      </div>

      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 12, padding: '10px 18px', animation: 'fadeUp 0.2s ease',
        }}>
          <span style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 14 }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          {[
            { label: '→ Make Teacher', role: 'TEACHER', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)' },
            { label: '→ Make Student', role: 'STUDENT', color: '#a5b4fc', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.4)' },
          ].map(b => (
            <button key={b.role} onClick={() => bulkSetRole(b.role)} disabled={bulkLoading}
              style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${b.border}`, background: b.bg, color: b.color, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {b.label}
            </button>
          ))}
          <button onClick={bulkDeactivate} disabled={bulkLoading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ⊖ Deactivate All
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
            Clear
          </button>
        </div>
      )}

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th style={{ padding: '14px 16px', width: 40 }}>
                <input type="checkbox"
                  checked={data ? selected.size === data.users.length && data.users.length > 0 : false}
                  onChange={selectAll}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
              </th>
              {['User', 'Role', 'Level / XP', 'Attempts', 'Joined', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#475569' }}>Loading…</td></tr>
            ) : (data?.users ?? []).map(user => (
              <tr key={user.id}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(user.id)} onChange={() => toggleSelect(user.id)}
                    style={{ width: 15, height: 15, cursor: 'pointer' }} />
                </td>
                <td style={{ padding: '12px 16px' }} onClick={() => openDrawer(user)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: `linear-gradient(135deg, ${ROLE_COLORS[user.role]}, #8b5cf6)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: '#fff',
                    }}>
                      {(user.name || user.email || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{user.name || '(no name)'}</div>
                      <div style={{ color: '#475569', fontSize: 12 }}>{user.email || user.phone || '—'}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                  <select
                    value={user.role}
                    onChange={e => handleRoleChange(user.id, e.target.value)}
                    disabled={updating === user.id}
                    style={{
                      background: ROLE_BG[user.role], border: `1px solid ${ROLE_COLORS[user.role]}40`,
                      color: ROLE_COLORS[user.role], borderRadius: 8, padding: '5px 10px',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', outline: 'none',
                    }}
                  >
                    <option value="STUDENT">STUDENT</option>
                    <option value="TEACHER">TEACHER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 14 }}>
                  Lv.{user.profile?.currentLevel ?? 0} · {user.profile?.totalXP ?? 0} XP
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>
                  {user._count.questionAttempts}
                </td>
                <td style={{ padding: '12px 16px', color: '#475569', fontSize: 12 }}>
                  {new Date(user.createdAt).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: user.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    color: user.isActive ? '#10b981' : '#ef4444',
                  }}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleToggleActive(user.id, user.isActive)} disabled={updating === user.id}
                    style={{
                      background: user.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                      border: `1px solid ${user.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                      color: user.isActive ? '#ef4444' : '#10b981',
                      borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12,
                    }}>
                    {updating === user.id ? '…' : user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid',
                borderColor: p === page ? '#6366f1' : 'rgba(255,255,255,0.1)',
                background: p === page ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: p === page ? '#a5b4fc' : '#64748b', cursor: 'pointer', fontSize: 13,
              }}>
              {p}
            </button>
          ))}
        </div>
      )}

      {/* User Detail Drawer */}
      {drawer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}>
          <div onClick={() => { setDrawer(null); setOverrideTarget(null); }}
            style={{ flex: 1, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
          <div style={{
            width: 480, background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,0.08)',
            overflowY: 'auto', padding: 32, animation: 'slideIn 0.25s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, margin: 0 }}>User Detail</h2>
              <button onClick={() => { setDrawer(null); setOverrideTarget(null); }}
                style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: `linear-gradient(135deg, ${ROLE_COLORS[drawer.role]}, #8b5cf6)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {(drawer.name || drawer.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 17 }}>{drawer.name || '(no name)'}</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>{drawer.email || drawer.phone || '—'}</div>
                <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: ROLE_BG[drawer.role], color: ROLE_COLORS[drawer.role] }}>
                  {drawer.role}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 28 }}>
              {[
                { label: 'Level', value: `Lv.${drawer.profile?.currentLevel ?? 0}` },
                { label: 'Total XP', value: (drawer.profile?.totalXP ?? 0).toLocaleString() },
                { label: 'Attempts', value: drawer._count.questionAttempts },
              ].map(s => (
                <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                  <div style={{ color: '#a5b4fc', fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Concept Mastery</h3>
              <span style={{ color: '#475569', fontSize: 12 }}>{masteryList.length} concepts</span>
            </div>

            {masteryLoading ? (
              <div style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: 32 }}>Loading mastery data…</div>
            ) : masteryList.length === 0 ? (
              <div style={{ color: '#475569', fontSize: 14, textAlign: 'center', padding: 32, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12 }}>
                No concept mastery records yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {masteryList.map((m: MasteryItem) => (
                  <div key={m.conceptId} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{m.conceptName}</div>
                        <div style={{ color: '#475569', fontSize: 11 }}>{m.domain} · {m.totalAttempts} attempts</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#a5b4fc', fontWeight: 700, fontSize: 14 }}>{Math.round(m.masteryScore * 100)}%</span>
                        <button
                          onClick={() => openOverride(drawer.id, m.conceptId, m.conceptName, m.masteryScore)}
                          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                        >
                          Override
                        </button>
                      </div>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round(m.masteryScore * 100)}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mastery Override Modal */}
      {overrideTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
          <div style={{ background: '#0d1117', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 18, padding: 32, width: 400, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', animation: 'fadeUp 0.2s ease' }}>
            <h3 style={{ color: '#f59e0b', fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>🎯 Override Mastery</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              Concept: <strong style={{ color: '#e2e8f0' }}>{overrideTarget.conceptName}</strong><br />
              Current score: <strong style={{ color: '#a5b4fc' }}>{Math.round(overrideTarget.current * 100)}%</strong>
            </p>
            <label style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 10 }}>
              New Score: <span style={{ color: '#f59e0b', fontSize: 22, fontWeight: 800 }}>{overrideValue}%</span>
            </label>
            <input type="range" min={0} max={100} value={overrideValue} onChange={e => setOverrideValue(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer', marginBottom: 6 }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: 11, marginBottom: 24 }}>
              <span>0% · Not started</span><span>100% · Expert</span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setOverrideTarget(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={saveOverride} disabled={overrideSaving}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', cursor: overrideSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, opacity: overrideSaving ? 0.7 : 1 }}>
                {overrideSaving ? 'Saving…' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
