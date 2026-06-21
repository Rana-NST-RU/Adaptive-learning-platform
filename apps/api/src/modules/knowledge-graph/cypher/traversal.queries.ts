// ─────────────────────────────────────────────────────────────────────────────
// Traversal Queries
// Deep prerequisite traversals and graph structural queries.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recursively fetch all ancestors (prerequisites) of a concept
 * following LEADS_TO edges in reverse, up to 10 hops deep.
 * Returns concepts ordered by depth ascending (closest first).
 */
export const GET_ALL_PREREQUISITES_DEEP = `
  MATCH (target:Concept {id: $id})
  MATCH (ancestor:Concept)-[:LEADS_TO*1..10]->(target)
  WITH DISTINCT ancestor,
       length(shortestPath((ancestor)-[:LEADS_TO*]->(target))) AS depth
  RETURN {
    id:         ancestor.id,
    name:       ancestor.name,
    difficulty: ancestor.difficulty,
    depth:      depth
  } AS prerequisite
  ORDER BY depth ASC
`;

/**
 * Fetch everything a concept directly unlocks (1 hop forward via LEADS_TO).
 */
export const GET_DIRECT_UNLOCKS = `
  MATCH (c:Concept {id: $id})-[:LEADS_TO]->(next:Concept)
  RETURN {
    id:               next.id,
    name:             next.name,
    difficulty:       next.difficulty,
    xpReward:         next.xpReward,
    estimatedMinutes: next.estimatedMinutes,
    category:         next.category
  } AS unlocks
  ORDER BY next.difficulty ASC
`;

/**
 * Find all concepts in the same domain that have NO prerequisites
 * (entry points / foundation nodes).
 */
export const GET_ENTRY_POINTS = `
  MATCH (c:Concept {domain: $domain})
  WHERE NOT ()-[:LEADS_TO]->(c)
  RETURN {
    id:               c.id,
    name:             c.name,
    difficulty:       c.difficulty,
    xpReward:         c.xpReward,
    estimatedMinutes: c.estimatedMinutes,
    isFoundation:     c.isFoundation
  } AS concept
  ORDER BY c.difficulty ASC
`;

/**
 * Find all related concepts (RELATED_TO edges in either direction).
 */
export const GET_RELATED_CONCEPTS = `
  MATCH (c:Concept {id: $id})-[:RELATED_TO]-(related:Concept)
  RETURN DISTINCT {
    id:       related.id,
    name:     related.name,
    domain:   related.domain,
    category: related.category,
    difficulty: related.difficulty
  } AS related
`;
