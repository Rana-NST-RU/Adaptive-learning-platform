'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api-client';

interface AuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, { color: string; bg: string; icon: string }> = {
  ROLE_CHANGE:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: '👤' },
  MASTERY_OVERRIDE:  { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: '🎯' },
  QUESTION_EDIT:     { color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: '✏️' },
  QUESTION_FLAG:     { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: '🚩' },
  USER_DEACTIVATE:   { color: '#64748b', bg: 'rgba(100,116,139,0.12)', icon: '⊖' },
};

const DEFAULT_ACTION = { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: '📋' };

export default function AdminAuditLogPage() {
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getAuditLogs(page, 30);
      setData(res.data as AuditLogsResponse);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const formatRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>🗓️ Admin Audit Log</h1>
        <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>
          All admin actions — role changes, mastery overrides, question edits — recorded here.
        </p>
      </div>

      {loading ? (
        <div style={{ color: '#475569', textAlign: 'center', padding: 60 }}>Loading audit log…</div>
      ) : !data?.logs.length ? (
        <div style={{ color: '#475569', textAlign: 'center', padding: 60, border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 16 }}>
          No admin actions recorded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(data?.logs ?? []).map(log => {
            const style = ACTION_COLORS[log.action] ?? DEFAULT_ACTION;
            return (
              <div key={log.id} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '16px 20px',
                display: 'flex', alignItems: 'flex-start', gap: 14,
              }}>
                {/* Icon */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: style.bg, border: `1px solid ${style.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17,
                }}>
                  {style.icon}
                </div>

                {/* Body */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{log.actorName}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: style.bg, color: style.color,
                    }}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    {log.targetName && (
                      <span style={{ color: '#64748b', fontSize: 13 }}>→ <strong style={{ color: '#94a3b8' }}>{log.targetName}</strong></span>
                    )}
                  </div>

                  {/* Before / After */}
                  {(log.before || log.after) && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      {log.before && (
                        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                          <span style={{ color: '#64748b' }}>Before: </span>
                          <span style={{ color: '#fca5a5', fontFamily: 'monospace' }}>
                            {Object.entries(log.before).map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </span>
                        </div>
                      )}
                      {log.after && (
                        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                          <span style={{ color: '#64748b' }}>After: </span>
                          <span style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>
                            {Object.entries(log.after).map(([k, v]) => `${k}: ${v}`).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Time */}
                <div style={{ color: '#475569', fontSize: 12, flexShrink: 0, textAlign: 'right' }}>
                  <div>{formatRelative(log.createdAt)}</div>
                  <div style={{ marginTop: 2 }}>{new Date(log.createdAt).toLocaleTimeString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
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
    </div>
  );
}
