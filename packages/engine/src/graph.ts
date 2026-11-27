// ─────────────────────────────────────────────────────────────────────────────
// Concept-graph utilities: validation, topological order, unlocking, and
// graph-aware evidence propagation (a correct answer on an advanced concept
// is evidence its prerequisites are known, and vice versa).
// ─────────────────────────────────────────────────────────────────────────────

import type { ConceptNode, ConceptState, ConceptStatus } from './types.js';

export const MASTERY_THRESHOLD = 0.8;
export const UNLOCK_THRESHOLD = 0.6;

export function indexGraph(nodes: ConceptNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const dependents = new Map<string, string[]>();
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (!dependents.has(p)) dependents.set(p, []);
      dependents.get(p)!.push(n.id);
    }
  }
  return { byId, dependents };
}

/** Returns a topological order, or throws if the graph has a cycle or dangling edge. */
export function topoSort(nodes: ConceptNode[]): string[] {
  const { byId } = indexGraph(nodes);
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const n of nodes) {
    for (const p of n.prerequisites) {
      if (!byId.has(p)) throw new Error(`Concept "${n.id}" requires unknown concept "${p}"`);
      indeg.set(n.id, (indeg.get(n.id) ?? 0) + 1);
    }
  }
  const { dependents } = indexGraph(nodes);
  const queue = nodes
    .filter((n) => indeg.get(n.id) === 0)
    .sort((a, b) => a.order - b.order)
    .map((n) => n.id);
  const out: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(id);
    for (const d of dependents.get(id) ?? []) {
      indeg.set(d, indeg.get(d)! - 1);
      if (indeg.get(d) === 0) queue.push(d);
    }
  }
  if (out.length !== nodes.length) throw new Error('Concept graph contains a cycle');
  return out;
}

export function validateGraph(nodes: ConceptNode[]): { ok: true } | { ok: false; error: string } {
  try {
    if (new Set(nodes.map((n) => n.id)).size !== nodes.length) {
      return { ok: false, error: 'Duplicate concept ids' };
    }
    topoSort(nodes);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function statusOf(
  node: ConceptNode,
  states: Record<string, ConceptState>,
  effectiveMastery: (s: ConceptState) => number,
): ConceptStatus {
  const s = states[node.id];
  if (s && effectiveMastery(s) >= MASTERY_THRESHOLD) return 'mastered';
  const unlocked = node.prerequisites.every((p) => {
    const ps = states[p];
    return ps !== undefined && ps.pKnown >= UNLOCK_THRESHOLD;
  });
  if (!unlocked) return 'locked';
  return s && s.attempts > 0 ? 'learning' : 'available';
}

/** All ancestors (transitive prerequisites) of a concept. */
export function ancestors(id: string, nodes: ConceptNode[]): string[] {
  const { byId } = indexGraph(nodes);
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.prerequisites ?? [])];
  while (stack.length) {
    const p = stack.pop()!;
    if (seen.has(p)) continue;
    seen.add(p);
    stack.push(...(byId.get(p)?.prerequisites ?? []));
  }
  return [...seen];
}

/** All descendants (transitive dependents) of a concept. */
export function descendants(id: string, nodes: ConceptNode[]): string[] {
  const { dependents } = indexGraph(nodes);
  const seen = new Set<string>();
  const stack = [...(dependents.get(id) ?? [])];
  while (stack.length) {
    const d = stack.pop()!;
    if (seen.has(d)) continue;
    seen.add(d);
    stack.push(...(dependents.get(d) ?? []));
  }
  return [...seen];
}

/**
 * Soft evidence propagation. Returns the new pKnown for neighbouring concepts:
 *  • correct on X  → ancestors move towards ≥ pKnown(X)   (strength decays)
 *  • wrong on X    → descendants are capped near pKnown(X) (strength decays)
 * Only untouched or weakly-evidenced concepts move much, so direct evidence
 * always dominates inferred evidence.
 */
export function propagate(
  conceptId: string,
  correct: boolean,
  states: Record<string, ConceptState>,
  nodes: ConceptNode[],
  strength = 0.35,
): Record<string, number> {
  const updates: Record<string, number> = {};
  const src = states[conceptId];
  if (!src) return updates;

  const targets = correct ? ancestors(conceptId, nodes) : descendants(conceptId, nodes);
  for (const t of targets) {
    const s = states[t];
    if (!s) continue;
    // Less movement for concepts with their own direct evidence.
    const w = strength / (1 + s.attempts * 0.5);
    if (correct && s.pKnown < src.pKnown) {
      updates[t] = s.pKnown + (src.pKnown - s.pKnown) * w;
    } else if (!correct && s.pKnown > src.pKnown) {
      updates[t] = s.pKnown - (s.pKnown - src.pKnown) * w;
    }
  }
  return updates;
}
