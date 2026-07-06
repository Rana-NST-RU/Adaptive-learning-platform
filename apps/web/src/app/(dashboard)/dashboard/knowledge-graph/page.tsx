'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { graphApi, ConceptNode, ConceptEdge, ConceptDetail } from '@/lib/api-client';

// ── react-force-graph-2d must be loaded client-side only (uses canvas/window)
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm">Rendering knowledge graph…</p>
      </div>
    </div>
  ),
});

// ── Color palette per category ───────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  Foundations:           '#6366f1',
  'Data Structures':     '#8b5cf6',
  Sorting:               '#06b6d4',
  Searching:             '#10b981',
  Techniques:            '#f59e0b',
  Recursion:             '#ef4444',
  Graphs:                '#ec4899',
  'Dynamic Programming': '#f97316',
  'String Algorithms':   '#14b8a6',
  Algorithms:            '#84cc16',
  Fundamentals:          '#6366f1',
  Scalability:           '#8b5cf6',
  'Databases & Storage': '#06b6d4',
  Infrastructure:        '#10b981',
  'Design Patterns':     '#f59e0b',
  'Real Systems':        '#ef4444',
};

const DEFAULT_COLOR = '#64748b';

function getNodeColor(node: any): string {
  return CATEGORY_COLORS[node.category] ?? DEFAULT_COLOR;
}

function getDifficultyLabel(d: number): string {
  return ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'][d] ?? '⭐';
}

// ── Types for force-graph ────────────────────────────────────────────────────

interface GraphNode extends ConceptNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  __indexColor?: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const [domain, setDomain] = useState<'DSA' | 'SYSTEM_DESIGN'>('DSA');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // ── Responsive sizing ──────────────────────────────────────────────────────

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Fetch graph data ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setConceptDetail(null);

    graphApi
      .getGraph(domain)
      .then((res) => {
        if (cancelled) return;
        const { nodes, edges } = res.data as any;

        const links: GraphLink[] = (edges ?? [])
          .filter((e: ConceptEdge) => e.type !== 'BELONGS_TO')
          .map((e: ConceptEdge) => ({
            source: e.from,
            target: e.to,
            type: e.type,
          }));

        setGraphData({ nodes: nodes ?? [], links });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError('Failed to load the knowledge graph. Is the backend running?');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [domain]);

  // ── Search highlight ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!search.trim()) {
      setHighlightIds(new Set());
      return;
    }
    const q = search.toLowerCase();
    const ids = new Set(
      graphData.nodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            (n.tags ?? []).some((t) => t.includes(q)) ||
            n.category.toLowerCase().includes(q),
        )
        .map((n) => n.id),
    );
    setHighlightIds(ids);
  }, [search, graphData.nodes]);

  // ── Node click → detail panel ──────────────────────────────────────────────

  const handleNodeClick = useCallback(
    async (node: GraphNode) => {
      if (selectedNode?.id === node.id) {
        setSelectedNode(null);
        setConceptDetail(null);
        return;
      }
      setSelectedNode(node);
      setConceptDetail(null);
      setDetailLoading(true);
      try {
        const res = await graphApi.getConcept(node.id);
        setConceptDetail(res.data as ConceptDetail);
      } catch {
        // Fallback to node data if detail fetch fails
        setConceptDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [selectedNode],
  );

  // ── Canvas node painter ────────────────────────────────────────────────────

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const id = node.id;
      const isSelected = selectedNode?.id === id;
      const isHighlighted = highlightIds.size > 0 && highlightIds.has(id);
      const isHovered = hoveredNode === id;
      const isDimmed = highlightIds.size > 0 && !isHighlighted && !isSelected;

      const baseRadius = Math.max(4, 3 + node.difficulty * 1.5);
      const r = isSelected || isHovered ? baseRadius * 1.4 : baseRadius;
      const color = getNodeColor(node);
      const alpha = isDimmed ? 0.2 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow on selected / highlighted
      if (isSelected || isHighlighted) {
        ctx.shadowBlur = 18 / globalScale;
        ctx.shadowColor = color;
      }

      // Ring for foundation nodes
      if (node.isFoundation) {
        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r + 2.5 / globalScale, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff44';
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Node body
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#ffffff' : color;
      ctx.fill();

      // Label
      const fontSize = Math.max(2.5, 4.5 / globalScale);
      ctx.font = `${isSelected ? 600 : 400} ${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = isDimmed ? '#666' : '#e2e8f0';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (globalScale > 0.6 || isSelected) {
        ctx.fillText(node.name, node.x!, node.y! + r + fontSize * 1.2);
      }

      ctx.restore();
    },
    [selectedNode, highlightIds, hoveredNode],
  );

  // ── Link painter ───────────────────────────────────────────────────────────

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const isDimmed =
      highlightIds.size > 0 &&
      !highlightIds.has(srcId) &&
      !highlightIds.has(tgtId);

    const colors: Record<string, string> = {
      LEADS_TO:   '#6366f180',
      RELATED_TO: '#10b98140',
      REQUIRES:   '#f59e0b60',
    };

    ctx.strokeStyle = isDimmed
      ? '#ffffff08'
      : (colors[link.type] ?? '#ffffff20');
    ctx.lineWidth = link.type === 'LEADS_TO' ? 1.2 : 0.6;

    if (link.type === 'RELATED_TO') {
      ctx.setLineDash([3, 4]);
    } else {
      ctx.setLineDash([]);
    }
  }, [highlightIds]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-[calc(100vh-64px)] overflow-hidden bg-[#060614]">

      {/* ── Left Controls Panel ──────────────────────────────────────────── */}
      <div
        className="relative z-20 flex flex-col gap-4 p-4 w-64 flex-shrink-0"
        style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Title */}
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Knowledge Graph</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {graphData.nodes.length} concepts · {graphData.links.length} connections
          </p>
        </div>

        {/* Domain toggle */}
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {(['DSA', 'SYSTEM_DESIGN'] as const).map((d) => (
            <button
              key={d}
              id={`domain-${d}`}
              onClick={() => setDomain(d)}
              className={`flex-1 py-2 text-xs font-medium transition-all ${
                domain === d
                  ? 'bg-violet-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {d === 'DSA' ? 'DSA' : 'System Design'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            id="kg-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search concepts…"
            className="w-full pl-9 pr-3 py-2 rounded-xl text-xs text-white placeholder-slate-500 outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              ×
            </button>
          )}
        </div>

        {/* Legend */}
        <div
          className="rounded-xl p-3 space-y-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-medium text-slate-400 mb-2">Edge Types</p>
          {[
            { color: '#6366f1', label: 'Leads To', dash: false },
            { color: '#f59e0b', label: 'Requires', dash: false },
            { color: '#10b981', label: 'Related To', dash: true },
          ].map(({ color, label, dash }) => (
            <div key={label} className="flex items-center gap-2">
              <div className="relative w-8 h-px flex-shrink-0">
                <div
                  className="absolute inset-0"
                  style={{
                    background: color,
                    borderTop: dash ? `1px dashed ${color}` : `1px solid ${color}`,
                  }}
                />
              </div>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Node size legend */}
        <div
          className="rounded-xl p-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-xs font-medium text-slate-400 mb-2">Node Size = Difficulty</p>
          <div className="flex items-end gap-2">
            {[1, 3, 5].map((d) => (
              <div key={d} className="flex flex-col items-center gap-1">
                <div
                  className="rounded-full bg-violet-500"
                  style={{ width: 3 + d * 3, height: 3 + d * 3 }}
                />
                <span className="text-[10px] text-slate-600">L{d}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            ○ ring = foundation concept
          </p>
        </div>

        {/* Stats */}
        {highlightIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl p-3"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
          >
            <p className="text-violet-400 text-xs font-medium">
              {highlightIds.size} result{highlightIds.size !== 1 ? 's' : ''} for &ldquo;{search}&rdquo;
            </p>
          </motion.div>
        )}
      </div>

      {/* ── Graph Canvas ──────────────────────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              <p className="text-slate-400 text-sm">Loading {domain} graph…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div
              className="rounded-2xl p-8 max-w-sm text-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <p className="text-red-400 text-2xl mb-3">⚠️</p>
              <p className="text-white font-medium mb-1">Graph unavailable</p>
              <p className="text-slate-400 text-sm">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && graphData.nodes.length > 0 && (
          <ForceGraph2D
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            nodeCanvasObject={paintNode as any}
            nodeCanvasObjectMode={() => 'replace'}
            linkCanvasObjectMode={() => 'before'}
            linkCanvasObject={paintLink as any}
            linkDirectionalArrowLength={3.5}
            linkDirectionalArrowRelPos={1}
            linkDirectionalParticles={(link: any) =>
              link.type === 'LEADS_TO' ? 2 : 0
            }
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleWidth={1.5}
            linkDirectionalParticleColor={() => '#6366f1'}
            onNodeClick={(node: any) => handleNodeClick(node)}
            onNodeHover={(node: any) => setHoveredNode(node?.id ?? null)}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.fillStyle = color;
              const r = Math.max(4, 3 + (node.difficulty ?? 1) * 1.5) + 4;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fill();
            }}
            backgroundColor="transparent"
            cooldownTicks={120}
            d3VelocityDecay={0.3}
          />
        )}

        {/* Click hint */}
        {!loading && !error && !selectedNode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full text-xs text-slate-500 pointer-events-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span>Click any node to explore</span>
            <span>·</span>
            <span>Scroll to zoom</span>
            <span>·</span>
            <span>Drag to pan</span>
          </motion.div>
        )}
      </div>

      {/* ── Concept Detail Panel ──────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            key={selectedNode.id}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute right-0 top-0 bottom-0 w-80 z-30 overflow-y-auto flex flex-col"
            style={{
              background: 'rgba(6,6,20,0.95)',
              backdropFilter: 'blur(20px)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="p-5 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div
                    className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mb-2"
                    style={{
                      background: `${getNodeColor(selectedNode)}20`,
                      color: getNodeColor(selectedNode),
                    }}
                  >
                    {selectedNode.category}
                  </div>
                  <h2 className="text-white font-bold text-base leading-snug">
                    {selectedNode.name}
                  </h2>
                </div>
                <button
                  id="kg-close-panel"
                  onClick={() => { setSelectedNode(null); setConceptDetail(null); }}
                  className="text-slate-500 hover:text-white mt-1 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
                <span title="Difficulty">{getDifficultyLabel(selectedNode.difficulty)}</span>
                <span>⚡ {selectedNode.xpReward} XP</span>
                <span>⏱ {selectedNode.estimatedMinutes}m</span>
                {selectedNode.isFoundation && (
                  <span className="text-amber-400">⚓ Foundation</span>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 p-5 space-y-5">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <>
                  {/* Description */}
                  {(conceptDetail?.description ?? selectedNode.description) && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        About
                      </h3>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        {conceptDetail?.description ?? selectedNode.description}
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  {(conceptDetail?.tags ?? selectedNode.tags ?? []).length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Tags
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {(conceptDetail?.tags ?? selectedNode.tags ?? []).map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-full text-[10px] text-slate-400"
                            style={{ background: 'rgba(255,255,255,0.06)' }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prerequisites */}
                  {conceptDetail && conceptDetail.prerequisites.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Prerequisites ({conceptDetail.prerequisites.length})
                      </h3>
                      <div className="space-y-2">
                        {conceptDetail.prerequisites.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => {
                              const n = graphData.nodes.find((n) => n.id === p.id);
                              if (n) handleNodeClick(n);
                            }}
                          >
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: '#f59e0b' }}
                            />
                            <span className="text-white text-xs flex-1">{p.name}</span>
                            <span className="text-slate-600 text-[10px]">L{p.difficulty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unlocks */}
                  {conceptDetail && conceptDetail.unlocks.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Unlocks ({conceptDetail.unlocks.length})
                      </h3>
                      <div className="space-y-2">
                        {conceptDetail.unlocks.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center gap-2 p-2 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => {
                              const n = graphData.nodes.find((n) => n.id === u.id);
                              if (n) handleNodeClick(n);
                            }}
                          >
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: '#6366f1' }}
                            />
                            <span className="text-white text-xs flex-1">{u.name}</span>
                            <span className="text-slate-600 text-[10px]">L{u.difficulty}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* LeetCode link */}
                  {(conceptDetail?.leetcodeTag ?? selectedNode.leetcodeTag) && (
                    <a
                      href={`https://leetcode.com/tag/${conceptDetail?.leetcodeTag ?? selectedNode.leetcodeTag}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-3 rounded-xl text-orange-400 hover:bg-orange-500/10 transition-colors text-xs font-medium"
                      style={{ border: '1px solid rgba(251,146,60,0.2)' }}
                    >
                      <span>🔗</span>
                      <span>Practice on LeetCode</span>
                      <svg className="w-3 h-3 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </>
              )}
            </div>

            {/* Practice CTA */}
            <div
              className="p-5 flex-shrink-0"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Link
                id="kg-start-learning"
                href={`/dashboard/practice?concept=${selectedNode.id}`}
                className="block w-full py-3 rounded-xl text-sm font-semibold text-white text-center transition-all hover:scale-[1.02] active:scale-100"
                style={{
                  background: `linear-gradient(135deg, ${getNodeColor(selectedNode)}, ${getNodeColor(selectedNode)}cc)`,
                  textDecoration: 'none',
                }}
              >
                ⚡ Practice This Concept →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
