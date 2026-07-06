'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/api-client';

interface AdminQuestion {
  id: string;
  conceptName: string;
  domain: string;
  content: string;
  questionType: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isActive: boolean;
  createdAt: string;
  _count: { attempts: number };
}

interface QuestionsResponse {
  questions: AdminQuestion[];
  total: number;
  page: number;
  totalPages: number;
}

const DIFF_COLORS = { EASY: '#10b981', MEDIUM: '#f59e0b', HARD: '#ef4444' };

export default function AdminQuestionsPage() {
  const [data, setData] = useState<QuestionsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AdminQuestion>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listQuestions(page, 15, domain || undefined, difficulty || undefined);
      setData(res.data as QuestionsResponse);
    } catch {
      showToast('Failed to load questions', false);
    } finally {
      setLoading(false);
    }
  }, [page, domain, difficulty]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminApi.updateQuestion(editing.id, editDraft);
      showToast('Question updated');
      setEditing(null);
      fetchQuestions();
    } catch {
      showToast('Update failed', false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (q: AdminQuestion) => {
    if (!confirm(`Deactivate question from "${q.conceptName}"?`)) return;
    try {
      await adminApi.deleteQuestion(q.id);
      showToast('Question deactivated');
      fetchQuestions();
    } catch {
      showToast('Deactivation failed', false);
    }
  };

  const handleReactivate = async (q: AdminQuestion) => {
    try {
      await adminApi.updateQuestion(q.id, { isActive: true });
      showToast('Question reactivated');
      fetchQuestions();
    } catch {
      showToast('Update failed', false);
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
          color: toast.ok ? '#6ee7b7' : '#fca5a5', fontWeight: 600, fontSize: 13,
        }}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: '90%', maxWidth: 640, borderRadius: 20,
            background: '#0e0e24', border: '1px solid rgba(255,255,255,0.12)',
            padding: '28px 32px',
          }}>
            <h2 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 18, margin: '0 0 20px' }}>
              ✏️ Edit Question — <span style={{ color: '#94a3b8', fontWeight: 400 }}>{editing.conceptName}</span>
            </h2>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>QUESTION CONTENT</label>
              <textarea
                value={editDraft.content ?? editing.content}
                onChange={e => setEditDraft({ ...editDraft, content: e.target.value })}
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>DIFFICULTY</label>
              <select
                value={editDraft.difficulty ?? editing.difficulty}
                onChange={e => setEditDraft({ ...editDraft, difficulty: e.target.value as any })}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0', fontSize: 13,
                }}
              >
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setEditing(null)} style={{
                padding: '10px 20px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13,
              }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 13,
              }}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 28, margin: 0 }}>❓ Question Moderation</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginTop: 6 }}>{data?.total ?? '—'} questions · Edit, deactivate, or change difficulty</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select
          id="admin-q-domain"
          value={domain}
          onChange={e => { setDomain(e.target.value); setPage(1); }}
          style={{
            padding: '9px 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13,
          }}
        >
          <option value="">All Domains</option>
          <option value="DSA">DSA</option>
          <option value="SYSTEM_DESIGN">System Design</option>
        </select>
        <select
          id="admin-q-difficulty"
          value={difficulty}
          onChange={e => { setDifficulty(e.target.value); setPage(1); }}
          style={{
            padding: '9px 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 13,
          }}
        >
          <option value="">All Difficulties</option>
          <option value="EASY">EASY</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HARD">HARD</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {loading ? (
          <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #6366f1', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Concept / Question', 'Domain', 'Type', 'Difficulty', 'Attempts', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '14px 16px', color: '#475569', fontWeight: 600, background: 'rgba(255,255,255,0.02)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.questions ?? []).map(q => (
                <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: q.isActive ? 1 : 0.45 }}>
                  <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                    <div style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{q.conceptName}</div>
                    <div style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                      {q.content}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{q.domain === 'SYSTEM_DESIGN' ? 'SD' : q.domain}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 11 }}>{q.questionType}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      color: DIFF_COLORS[q.difficulty], background: `${DIFF_COLORS[q.difficulty]}18`,
                    }}>{q.difficulty}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{q._count.attempts}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: q.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                      color: q.isActive ? '#34d399' : '#f87171',
                    }}>
                      {q.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        id={`edit-q-${q.id}`}
                        onClick={() => { setEditing(q); setEditDraft({}); }}
                        style={{
                          padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', fontSize: 11, fontWeight: 600,
                        }}>Edit</button>
                      {q.isActive ? (
                        <button
                          id={`deactivate-q-${q.id}`}
                          onClick={() => handleDelete(q)}
                          style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'rgba(239,68,68,0.12)', color: '#f87171', fontSize: 11, fontWeight: 600,
                          }}>Deactivate</button>
                      ) : (
                        <button
                          id={`reactivate-q-${q.id}`}
                          onClick={() => handleReactivate(q)}
                          style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: 'rgba(16,185,129,0.12)', color: '#34d399', fontSize: 11, fontWeight: 600,
                          }}>Reactivate</button>
                      )}
                    </div>
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
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: page === 1 ? '#475569' : '#a5b4fc', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: 13 }}>← Prev</button>
          <span style={{ padding: '8px 16px', color: '#64748b', fontSize: 13 }}>Page {page} of {data?.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(data?.totalPages ?? 1, p + 1))} disabled={page === data?.totalPages}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: page === data?.totalPages ? '#475569' : '#a5b4fc', cursor: page === data?.totalPages ? 'not-allowed' : 'pointer', fontSize: 13 }}>Next →</button>
        </div>
      )}
    </div>
  );
}
