'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi, questionsApi, graphApi } from '@/lib/api-client';

interface AdminQuestion {
  id: string;
  conceptName: string;
  domain: string;
  content: string;
  questionType: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isActive: boolean;
  isFlagged: boolean;
  flagReason?: string;
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
const DIFF_BG = { EASY: 'rgba(16,185,129,0.1)', MEDIUM: 'rgba(245,158,11,0.1)', HARD: 'rgba(239,68,68,0.1)' };

interface Topic { topicId: string; topicName: string; domain: string; conceptCount: number }

export default function AdminQuestionsPage() {
  const [data, setData] = useState<QuestionsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [tab, setTab] = useState<'all' | 'flagged'>('all');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<AdminQuestion>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Generate modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [genConceptId, setGenConceptId] = useState('');
  const [genDifficulty, setGenDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');
  const [genCount, setGenCount] = useState(5);
  const [genLoading, setGenLoading] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listQuestions(
        page, 15,
        domain || undefined,
        difficulty || undefined,
        tab === 'flagged' ? true : undefined,
      );
      setData(res.data as QuestionsResponse);
      setSelected(new Set());
    } catch {
      showToast('Failed to load questions', false);
    } finally {
      setLoading(false);
    }
  }, [page, domain, difficulty, tab]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);

  // Load topics for generate dropdown
  const openGenerateModal = async () => {
    setShowGenerate(true);
    if (topics.length) return;
    try {
      const [dsa, sd] = await Promise.all([
        graphApi.getTopics('DSA'),
        graphApi.getTopics('SYSTEM_DESIGN'),
      ]);
      const all = [...((dsa.data as { topics: Topic[] }).topics ?? []), ...((sd.data as { topics: Topic[] }).topics ?? [])];
      setTopics(all);
      if (all.length) setGenConceptId(all[0].topicId);
    } catch { /* silent */ }
  };

  const handleGenerate = async () => {
    if (!genConceptId) return showToast('Select a concept', false);
    const topic = topics.find(t => t.topicId === genConceptId);
    if (!topic) return showToast('Selected concept not found', false);
    setGenLoading(true);
    try {
      const res = await questionsApi.generate({
        conceptId: genConceptId,
        conceptName: topic.topicName,
        domain: topic.domain,
        difficulty: genDifficulty,
        count: genCount,
        questionTypes: ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'],
      });
      const generated = (res.data as unknown[]).length;
      showToast(`✨ Generated ${generated} new question${generated !== 1 ? 's' : ''}!`);
      setShowGenerate(false);
      fetchQuestions();
    } catch { showToast('Generation failed — check Groq quota', false); }
    finally { setGenLoading(false); }
  };

  const handleEdit = (q: AdminQuestion) => {
    setEditing(q);
    setEditDraft({ content: q.content, difficulty: q.difficulty });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminApi.updateQuestion(editing.id, editDraft);
      showToast('Question updated');
      setEditing(null);
      fetchQuestions();
    } catch { showToast('Failed to update', false); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (q: AdminQuestion) => {
    try {
      await adminApi.updateQuestion(q.id, { isActive: !q.isActive });
      showToast(q.isActive ? 'Question deactivated' : 'Question reactivated');
      fetchQuestions();
    } catch { showToast('Failed to update', false); }
  };

  const handleUnflag = async (id: string) => {
    try {
      await adminApi.updateQuestion(id, { isFlagged: false, flagReason: null });
      showToast('Question unflagged');
      fetchQuestions();
    } catch { showToast('Failed to unflag', false); }
  };

  // Bulk
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const selectAll = () => {
    if (!data) return;
    if (selected.size === data.questions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.questions.map(q => q.id)));
    }
  };

  const bulkDeactivate = async () => {
    setBulkLoading(true);
    try {
      await adminApi.bulkUpdateQuestions(Array.from(selected), { isActive: false });
      showToast(`Deactivated ${selected.size} questions`);
      fetchQuestions();
    } catch { showToast('Bulk action failed', false); }
    finally { setBulkLoading(false); }
  };

  const bulkUnflag = async () => {
    setBulkLoading(true);
    try {
      await adminApi.bulkUpdateQuestions(Array.from(selected), { isFlagged: false });
      showToast(`Unflagged ${selected.size} questions`);
      fetchQuestions();
    } catch { showToast('Bulk action failed', false); }
    finally { setBulkLoading(false); }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`,
          borderRadius: 12, padding: '12px 20px', color: toast.ok ? '#10b981' : '#ef4444',
          fontWeight: 600, fontSize: 14, backdropFilter: 'blur(12px)', animation: 'fadeUp 0.2s ease',
        }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>📋 Question Moderation</h1>
          <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>{data?.total ?? 0} questions in bank</p>
        </div>
        <button onClick={openGenerateModal}
          style={{
            padding: '11px 22px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 28px rgba(99,102,241,0.45)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(99,102,241,0.35)'; }}
        >
          ⚡ Generate via AI
        </button>
      </div>

      {/* Tabs + Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
          {([['all', '📋 All Questions'], ['flagged', '🚩 Flagged']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setPage(1); }}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: tab === key ? 'rgba(99,102,241,0.3)' : 'transparent',
                color: tab === key ? '#a5b4fc' : '#64748b',
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Filters */}
        {['', 'DSA', 'SYSTEM_DESIGN'].map(d => (
          <button key={d} onClick={() => { setDomain(d); setPage(1); }}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid',
              borderColor: domain === d ? '#6366f1' : 'rgba(255,255,255,0.1)',
              background: domain === d ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: domain === d ? '#a5b4fc' : '#64748b', cursor: 'pointer', fontSize: 13,
            }}>
            {d || 'All Domains'}
          </button>
        ))}
        <select value={difficulty} onChange={e => { setDifficulty(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
          <option value="">All Difficulties</option>
          <option value="EASY">Easy</option>
          <option value="MEDIUM">Medium</option>
          <option value="HARD">Hard</option>
        </select>
      </div>

      {/* Bulk Bar */}
      {selected.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
          background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 12, padding: '10px 18px', animation: 'fadeUp 0.2s ease',
        }}>
          <span style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 14 }}>{selected.size} selected</span>
          <div style={{ flex: 1 }} />
          <button onClick={bulkDeactivate} disabled={bulkLoading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            ⊖ Deactivate Selected
          </button>
          {tab === 'flagged' && (
            <button onClick={bulkUnflag} disabled={bulkLoading}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.4)', background: 'rgba(16,185,129,0.1)', color: '#10b981', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              ✓ Unflag Selected
            </button>
          )}
          <button onClick={() => setSelected(new Set())}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>
            Clear
          </button>
        </div>
      )}

      {/* Flagged notice */}
      {tab === 'flagged' && (data?.total ?? 0) > 0 && (
        <div style={{
          marginBottom: 16, padding: '12px 18px', borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          color: '#fca5a5', fontSize: 13,
        }}>
          🚩 {data?.total} question{data?.total !== 1 ? 's' : ''} flagged by users for review.
          Review each question, then edit or unflag it.
        </div>
      )}

      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <th style={{ padding: '14px 16px', width: 40 }}>
                <input type="checkbox"
                  checked={data ? selected.size === data.questions.length && data.questions.length > 0 : false}
                  onChange={selectAll}
                  style={{ width: 15, height: 15, cursor: 'pointer' }}
                />
              </th>
              {['Concept', 'Domain', 'Question Preview', 'Type', 'Difficulty', 'Attempts', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 48, textAlign: 'center', color: '#475569' }}>Loading…</td></tr>
            ) : (data?.questions ?? []).length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 48, textAlign: 'center', color: '#475569' }}>
                {tab === 'flagged' ? '🎉 No flagged questions!' : 'No questions found'}
              </td></tr>
            ) : (data?.questions ?? []).map(q => (
              <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s', background: q.isFlagged ? 'rgba(239,68,68,0.03)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = q.isFlagged ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.025)')}
                onMouseLeave={e => (e.currentTarget.style.background = q.isFlagged ? 'rgba(239,68,68,0.03)' : 'transparent')}
              >
                <td style={{ padding: '12px 16px' }}>
                  <input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)}
                    style={{ width: 15, height: 15, cursor: 'pointer' }} />
                </td>
                <td style={{ padding: '12px 16px', color: '#e2e8f0', fontSize: 13, fontWeight: 600, maxWidth: 120 }}>
                  {q.conceptName}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(99,102,241,0.12)', color: '#a5b4fc' }}>
                    {q.domain}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 13, maxWidth: 260 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.content}</div>
                  {q.isFlagged && q.flagReason && (
                    <div style={{ color: '#f87171', fontSize: 11, marginTop: 3 }}>🚩 {q.flagReason}</div>
                  )}
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>{q.questionType.replace('_', ' ')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: DIFF_BG[q.difficulty], color: DIFF_COLORS[q.difficulty] }}>
                    {q.difficulty}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', color: '#64748b', fontSize: 13 }}>{q._count.attempts}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {q.isFlagged && <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>🚩 Flagged</span>}
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: q.isActive ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)', color: q.isActive ? '#10b981' : '#64748b' }}>
                      {q.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => handleEdit(q)}
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>
                      Edit
                    </button>
                    {q.isFlagged && (
                      <button onClick={() => handleUnflag(q.id)}
                        style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>
                        Unflag
                      </button>
                    )}
                    <button onClick={() => handleToggleActive(q)}
                      style={{
                        background: q.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        border: `1px solid ${q.isActive ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                        color: q.isActive ? '#ef4444' : '#10b981',
                        borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12,
                      }}>
                      {q.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
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

      {/* Edit Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18, padding: 32, width: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', animation: 'fadeUp 0.2s ease' }}>
            <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 20px' }}>✏️ Edit Question</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Concept: <span style={{ color: '#a5b4fc', textTransform: 'none' }}>{editing.conceptName}</span>
              </label>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question Content</label>
              <textarea
                value={editDraft.content ?? ''}
                onChange={e => setEditDraft(d => ({ ...d, content: e.target.value }))}
                rows={5}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.6 }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['EASY', 'MEDIUM', 'HARD'] as const).map(d => (
                  <button key={d} onClick={() => setEditDraft(dr => ({ ...dr, difficulty: d }))}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10, border: `2px solid`,
                      borderColor: editDraft.difficulty === d ? DIFF_COLORS[d] : 'rgba(255,255,255,0.08)',
                      background: editDraft.difficulty === d ? DIFF_BG[d] : 'transparent',
                      color: editDraft.difficulty === d ? DIFF_COLORS[d] : '#475569',
                      cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setEditing(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Modal */}
      {showGenerate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowGenerate(false); }}
        >
          <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 36, width: 540, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', animation: 'fadeUp 0.2s ease' }}>
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 700, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>⚡</span> AI Question Generator
              </h3>
              <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>Use Groq LLM to generate new practice questions for any concept.</p>
            </div>

            {/* Concept */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Concept / Topic</label>
              <select value={genConceptId} onChange={e => setGenConceptId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: '#0a0e1a', color: '#e2e8f0', fontSize: 14, outline: 'none' }}>
                {topics.length === 0 && <option value="">Loading topics…</option>}
                {topics.map(t => (
                  <option key={t.topicId} value={t.topicId}>{t.topicName} ({t.domain})</option>
                ))}
              </select>
            </div>

            {/* Difficulty */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Difficulty</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['EASY', 'MEDIUM', 'HARD'] as const).map(d => (
                  <button key={d} onClick={() => setGenDifficulty(d)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: 10, border: '2px solid',
                      borderColor: genDifficulty === d ? DIFF_COLORS[d] : 'rgba(255,255,255,0.08)',
                      background: genDifficulty === d ? DIFF_BG[d] : 'transparent',
                      color: genDifficulty === d ? DIFF_COLORS[d] : '#475569',
                      cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.15s',
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Count */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ color: '#64748b', fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Number of Questions: <span style={{ color: '#a5b4fc' }}>{genCount}</span>
              </label>
              <input type="range" min={1} max={10} value={genCount} onChange={e => setGenCount(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569', fontSize: 11, marginTop: 4 }}>
                <span>1</span><span>5</span><span>10</span>
              </div>
            </div>

            {/* Info banner */}
            <div style={{ marginBottom: 24, padding: '10px 16px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, fontSize: 12, color: '#a78bfa' }}>
              ⏱ Generation typically takes 5–15 seconds. Rate-limited to 5 calls / 60s.
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowGenerate(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                Cancel
              </button>
              <button onClick={handleGenerate} disabled={genLoading || !genConceptId}
                style={{
                  flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                  background: genLoading || !genConceptId ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  color: '#fff', cursor: genLoading || !genConceptId ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {genLoading ? (
                  <><span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #fff4', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />Generating {genCount} questions…</>
                ) : (
                  <>⚡ Generate {genCount} Question{genCount !== 1 ? 's' : ''}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
