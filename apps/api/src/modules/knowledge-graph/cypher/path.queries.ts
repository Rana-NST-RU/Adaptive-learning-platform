// ─────────────────────────────────────────────────────────────────────────────
// Learning Path Queries
// Cypher queries for computing ordered learning paths between concepts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the shortest ordered learning path from any foundation node to a
 * target concept, following LEADS_TO edges.
 * Returns an ordered list of concept nodes (start → target).
 */
export const GET_LEARNING_PATH_TO_TARGET = `
  MATCH (target:Concept {id: $targetId})

  // Find all foundation concepts in the same domain
  MATCH (start:Concept {domain: target.domain, isFoundation: true})

  // Find shortest path from any foundation to target via LEADS_TO edges
  MATCH path = shortestPath((start)-[:LEADS_TO*]->(target))

  // Return the path with fewest hops
  WITH path
  ORDER BY length(path) ASC
  LIMIT 1

  RETURN [node IN nodes(path) | {
    id:               node.id,
    name:             node.name,
    domain:           node.domain,
    category:         node.category,
    difficulty:       node.difficulty,
    xpReward:         node.xpReward,
    estimatedMinutes: node.estimatedMinutes,
    description:      node.description,
    isFoundation:     node.isFoundation
  }] AS path
`;

/**
 * Fetch all concepts within a specific Topic, ordered by difficulty.
 */
export const GET_CONCEPTS_BY_TOPIC = `
  MATCH (c:Concept)-[:BELONGS_TO]->(t:Topic {id: $topicId})
  RETURN {
    id:               c.id,
    name:             c.name,
    domain:           c.domain,
    category:         c.category,
    difficulty:       c.difficulty,
    xpReward:         c.xpReward,
    estimatedMinutes: c.estimatedMinutes,
    isFoundation:     c.isFoundation
  } AS concept
  ORDER BY c.difficulty ASC, c.name ASC
`;

/**
 * Recommended "what to learn next" — returns concepts whose all prerequisites
 * are in the provided masteredIds list, but which are not yet mastered.
 */
export const GET_RECOMMENDED_NEXT = `
  MATCH (candidate:Concept {domain: $domain})
  WHERE NOT candidate.id IN $masteredIds

  // All prerequisites of this candidate must be mastered
  AND ALL(prereq IN [(p:Concept)-[:LEADS_TO]->(candidate) | p.id]
          WHERE prereq IN $masteredIds)

  RETURN {
    id:               candidate.id,
    name:             candidate.name,
    difficulty:       candidate.difficulty,
    xpReward:         candidate.xpReward,
    estimatedMinutes: candidate.estimatedMinutes,
    category:         candidate.category
  } AS concept
  ORDER BY candidate.difficulty ASC
  LIMIT 5
`;
