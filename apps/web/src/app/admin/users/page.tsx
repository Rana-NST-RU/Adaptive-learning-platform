'use client';

import { useEffect, useState, useCallback } from 'react';
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

const ROLE_COLORS: Record<string, string> = {
  STUDENT: '#6366f1',
  TEACHER: '#f59e0b',
  ADMIN: '#ef4444',
};

export default function AdminUsersPage() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers(page, 15, search || undefined);
      setData(res.data as UserListResponse);
    } catch {
      showToast('Failed to load users', false);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(), 300);
    return () => clearTimeout(t);
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdating(userId);
    try {
      await adminApi.updateUserRole(userId, role);
      showToast(`Role updated to ${role}`);
      fetchUsers();
    } catch {
      showToast('Role update failed', false);
    } finally {
      setUpdating(null);
    }
  };

  const handleToggleActive = async (user: AdminUser) => {
    setUpdating(user.id);
    try {
      await adminApi.toggleUserActive(user.id, !user.isActive);
      showToast(`User ${user.isActive ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch {
      showToast('Update failed', false);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          padding: '12px 20px', borderRadius: 12,
          background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: toast.ok ? '#6ee7b7' : '#fca5a5',
          fontWeight: 600, fontSize: 13,
        }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 28, margin: 0 }}>👥 User Management</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>
          {data?.total ?? '—'} total users · Manage roles and access
        </p>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 20 }}>
        <input
          id="admin-user-search"
          type="text"
          placeholder="🔍  Search by name or email…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: '100%', maxWidth: 420, padding: '10px 16px',
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: '#f1f5f9',
            fontSize: 14, outline: 'none',
          }}
        />
      </div>

      {/* Table */}
      <div style={{
        borderRadius: 18, overflow: 'hidden',
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      }}>
        {loading ? (
          <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['User', 'Role', 'Status', 'XP / Level', 'Attempts', 'Joined', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '14px 16px', color: '#475569', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((user) => (
                <tr key={user.id} style={{
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  opacity: user.isActive ? 1 : 0.5,
                  transition: 'opacity 0.2s',
                }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: `linear-gradient(135deg, ${ROLE_COLORS[user.role] ?? '#6366f1'}, #8b5cf6)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                      }}>{user.name[0]}</div>
                      <div>
                        <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{user.name}</div>
                        <div style={{ color: '#475569', fontSize: 11 }}>{user.email ?? user.phone ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <select
                      id={`role-select-${user.id}`}
                      value={user.role}
                      disabled={updating === user.id}
                      onChange={e => handleRoleChange(user.id, e.target.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 6,
                        border: `1px solid ${ROLE_COLORS[user.role] ?? '#6366f1'}40`,
                        background: `${ROLE_COLORS[user.role] ?? '#6366f1'}15`,
                        color: ROLE_COLORS[user.role] ?? '#a5b4fc',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <option value="STUDENT">STUDENT</option>
                      <option value="TEACHER">TEACHER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: user.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: user.isActive ? '#34d399' : '#f87171',
                    }}>
                      {user.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                    {user.profile ? `${user.profile.totalXP.toLocaleString()} XP · L${user.profile.currentLevel}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{user._count.questionAttempts}</td>
                  <td style={{ padding: '12px 16px', color: '#475569', fontSize: 11 }}>
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      id={`toggle-active-${user.id}`}
                      onClick={() => handleToggleActive(user)}
                      disabled={updating === user.id}
                      style={{
                        padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: user.isActive ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                        color: user.isActive ? '#f87171' : '#34d399',
                        fontSize: 11, fontWeight: 600,
                      }}
                    >
                      {updating === user.id ? '…' : user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {(data?.totalPages ?? 0) > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: page === 1 ? '#475569' : '#a5b4fc',
              cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13,
            }}>← Prev</button>
          <span style={{ padding: '8px 16px', color: '#64748b', fontSize: 13 }}>
            Page {page} of {data?.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data?.totalPages ?? 1, p + 1))}
            disabled={page === data?.totalPages}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', color: page === data?.totalPages ? '#475569' : '#a5b4fc',
              cursor: page === data?.totalPages ? 'not-allowed' : 'pointer', fontSize: 13,
            }}>Next →</button>
        </div>
      )}
    </div>
  );
}
