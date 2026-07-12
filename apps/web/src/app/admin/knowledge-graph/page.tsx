'use client';

import { useEffect, useState, useCallback } from 'react';
import { graphAdminApi } from '@/lib/api-client';

interface GraphNode {
  id: string;
  name: string;
  domain: string;
  difficulty?: string;
  topicId?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function AdminKnowledgeGraphPage() {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Add edge form
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [edgeType, setEdgeType] = useState<'REQUIRES' | 'LEADS_TO'>('REQUIRES');
  const [addingEdge, setAddingEdge] = useState(false);

  // Remove edge
  const [removingEdge, setRemovingEdge] = useState<string | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    try {
      const res = await graphAdminApi.getGraph(domain || undefined);
      setGraph(res.data as GraphData);
    } catch {
      showToast('Failed to load graph', false);
    } finally {
      setLoading(false);
    }
  }, [domain]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  const handleAddEdge = async () => {
    if (!fromId || !toId) return showToast('Select both concepts', false);
    if (fromId === toId) return showToast('Cannot connect a concept to itself', false);
    setAddingEdge(true);
    try {
      await graphAdminApi.addEdge(fromId, toId, edgeType);
      showToast(`Edge added: ${getNodeName(fromId)} → ${getNodeName(toId)}`);
      setFromId('');
      setToId('');
      fetchGraph();
    } catch { showToast('Failed to add edge', false); }
    finally { setAddingEdge(false); }
  };

  const handleRemoveEdge = async (from: string, to: string) => {
    const key = `${from}:${to}`;
    setRemovingEdge(key);
    try {
      await graphAdminApi.removeEdge(from, to);
      showToast('Edge removed');
      fetchGraph();
    } catch { showToast('Failed to remove edge', false); }
    finally { setRemovingEdge(null); }
  };

  const getNodeName = (id: string) => graph?.nodes.find(n => n.id === id)?.name ?? id;

  const filteredNodes = (graph?.nodes ?? []).filter(n =>
    (!search || n.name.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredEdges = (graph?.edges ?? []).filter(e =>
    !search || getNodeName(e.from).toLowerCase().includes(search.toLowerCase()) ||
    getNodeName(e.to).toLowerCase().includes(search.toLowerCase())
  );

  const EDGE_COLORS: Record<string, string> = {
    REQUIRES: '#6366f1',
    LEADS_TO: '#10b981',
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

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

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>🕸️ Knowledge Graph Editor</h1>
        <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 14 }}>
          {graph?.nodes.length ?? 0} concepts · {graph?.edges.length ?? 0} prerequisite edges
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
        {/* LEFT: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Domain filter */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
            <h3 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Filter</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {['', 'DSA', 'SYSTEM_DESIGN'].map(d => (
                <button key={d} onClick={() => setDomain(d)}
                  style={{
                    padding: '8px 14px', borderRadius: 8, border: '1px solid',
                    borderColor: domain === d ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    background: domain === d ? 'rgba(99,102,241,0.15)' : 'transparent',
                    color: domain === d ? '#a5b4fc' : '#64748b', cursor: 'pointer', fontSize: 13,
                    textAlign: 'left',
                  }}>
                  {d || '📊 All Domains'}{d === 'DSA' && ' 💻'}{d === 'SYSTEM_DESIGN' && ' 🏗️'}
                </button>
              ))}
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search concepts…"
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', fontSize: 13, outline: 'none', marginTop: 4 }}
              />
            </div>
          </div>

          {/* Add Edge */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
            <h3 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 14px' }}>➕ Add Edge</h3>

            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>From Concept (prerequisite)</label>
              <select value={fromId} onChange={e => setFromId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0d1117', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
                <option value="">— Select concept —</option>
                {filteredNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>Relation Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['REQUIRES', 'LEADS_TO'] as const).map(t => (
                  <button key={t} onClick={() => setEdgeType(t)}
                    style={{
                      flex: 1, padding: '7px', borderRadius: 8, border: `1px solid`,
                      borderColor: edgeType === t ? EDGE_COLORS[t] : 'rgba(255,255,255,0.1)',
                      background: edgeType === t ? `${EDGE_COLORS[t]}18` : 'transparent',
                      color: edgeType === t ? EDGE_COLORS[t] : '#475569',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    }}>
                    {t === 'REQUIRES' ? '🔴 REQUIRES' : '🟢 LEADS_TO'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#64748b', fontSize: 12, display: 'block', marginBottom: 5 }}>To Concept (dependent)</label>
              <select value={toId} onChange={e => setToId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#0d1117', color: '#e2e8f0', fontSize: 13, outline: 'none' }}>
                <option value="">— Select concept —</option>
                {filteredNodes.filter(n => n.id !== fromId).map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>

            {fromId && toId && (
              <div style={{ marginBottom: 14, padding: '10px 14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 8, fontSize: 13, color: '#a5b4fc', textAlign: 'center' }}>
                <strong>{getNodeName(fromId)}</strong>
                <span style={{ color: EDGE_COLORS[edgeType], margin: '0 8px' }}>──{edgeType}──▶</span>
                <strong>{getNodeName(toId)}</strong>
              </div>
            )}

            <button onClick={handleAddEdge} disabled={addingEdge || !fromId || !toId}
              style={{
                width: '100%', padding: '11px', borderRadius: 10, border: 'none',
                background: fromId && toId ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                color: fromId && toId ? '#fff' : '#475569',
                cursor: fromId && toId ? 'pointer' : 'not-allowed',
                fontWeight: 700, fontSize: 14, opacity: addingEdge ? 0.7 : 1,
              }}>
              {addingEdge ? 'Adding…' : '➕ Add Edge'}
            </button>
          </div>

          {/* Legend */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 20 }}>
            <h3 style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Legend</h3>
            {[
              { color: '#6366f1', label: 'REQUIRES — A must be learned before B' },
              { color: '#10b981', label: 'LEADS_TO — A naturally leads to B' },
            ].map(l => (
              <div key={l.color} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 28, height: 3, borderRadius: 2, background: l.color }} />
                <span style={{ color: '#64748b', fontSize: 12 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Edge list */}
        <div>
          {loading ? (
            <div style={{ color: '#475569', textAlign: 'center', padding: 60 }}>Loading graph…</div>
          ) : (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Concepts', value: graph?.nodes.length ?? 0, color: '#a5b4fc' },
                  { label: 'Total Edges', value: graph?.edges.length ?? 0, color: '#10b981' },
                  { label: 'REQUIRES edges', value: filteredEdges.filter(e => e.type === 'REQUIRES').length, color: '#6366f1' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px 20px', textAlign: 'center' }}>
                    <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                    <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Edge List */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Prerequisite Edges ({filteredEdges.length})</span>
                </div>
                <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                  {filteredEdges.length === 0 ? (
                    <div style={{ color: '#475569', textAlign: 'center', padding: 40 }}>No edges found</div>
                  ) : filteredEdges.map((edge, i) => {
                    const key = `${edge.from}:${edge.to}`;
                    const edgeColor = EDGE_COLORS[edge.type] ?? '#94a3b8';
                    return (
                      <div key={i} style={{
                        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex', alignItems: 'center', gap: 12,
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{getNodeName(edge.from)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ width: 24, height: 2, background: edgeColor, borderRadius: 2 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: edgeColor, padding: '1px 6px', borderRadius: 4, background: `${edgeColor}18`, letterSpacing: '0.04em' }}>
                              {edge.type}
                            </span>
                            <div style={{ width: 24, height: 2, background: edgeColor, borderRadius: 2 }} />
                            <span style={{ color: edgeColor }}>▶</span>
                          </div>
                          <span style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{getNodeName(edge.to)}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveEdge(edge.from, edge.to)}
                          disabled={removingEdge === key}
                          style={{
                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                            color: '#ef4444', borderRadius: 6, padding: '4px 10px',
                            cursor: 'pointer', fontSize: 12, flexShrink: 0,
                            opacity: removingEdge === key ? 0.5 : 1,
                          }}>
                          {removingEdge === key ? '…' : 'Remove'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
