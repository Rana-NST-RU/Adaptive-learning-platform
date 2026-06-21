// ─────────────────────────────────────────────────────────────────────────────
// Concept Read Queries
// All Cypher queries that retrieve Concept and Topic nodes from the graph.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all concepts and all relationships for the full graph view.
 * Optionally filter by domain ('DSA' | 'SYSTEM_DESIGN').
 */
export const GET_FULL_GRAPH = `
  MATCH (c:Concept)
  WHERE ($domain IS NULL OR c.domain = $domain)
  WITH collect(c) AS concepts

  MATCH (a:Concept)-[r]->(b:Concept)
  WHERE ($domain IS NULL OR a.domain = $domain)
    AND ($domain IS NULL OR b.domain = $domain)

  RETURN
    [concept IN concepts | {
      id:               concept.id,
      name:             concept.name,
      domain:           concept.domain,
      category:         concept.category,
      difficulty:       concept.difficulty,
      xpReward:         concept.xpReward,
      estimatedMinutes: concept.estimatedMinutes,
      description:      concept.description,
      tags:             concept.tags,
      isFoundation:     concept.isFoundation,
      leetcodeTag:      concept.leetcodeTag
    }] AS nodes,
    collect({
      from:  a.id,
      to:    b.id,
      type:  type(r)
    }) AS edges
`;

/**
 * Fetch a single concept by its string id,
 * along with its direct prerequisites and the concepts it directly unlocks.
 */
export const GET_CONCEPT_BY_ID = `
  MATCH (c:Concept {id: $id})
  OPTIONAL MATCH (c)-[:BELONGS_TO]->(t:Topic)

  OPTIONAL MATCH (prereq:Concept)-[:LEADS_TO]->(c)
  WITH c, t, collect(DISTINCT {
    id: prereq.id, name: prereq.name, difficulty: prereq.difficulty
  }) AS prerequisites

  OPTIONAL MATCH (c)-[:LEADS_TO]->(next:Concept)
  WITH c, t, prerequisites, collect(DISTINCT {
    id: next.id, name: next.name, difficulty: next.difficulty
  }) AS unlocks

  RETURN {
    id:               c.id,
    name:             c.name,
    domain:           c.domain,
    category:         c.category,
    difficulty:       c.difficulty,
    xpReward:         c.xpReward,
    estimatedMinutes: c.estimatedMinutes,
    description:      c.description,
    tags:             c.tags,
    isFoundation:     c.isFoundation,
    leetcodeTag:      c.leetcodeTag,
    topic:            t.name,
    prerequisites:    prerequisites,
    unlocks:          unlocks
  } AS concept
`;

/**
 * Return all topics for a given domain with their concept counts.
 */
export const GET_TOPICS_WITH_COUNTS = `
  MATCH (t:Topic {domain: $domain})
  OPTIONAL MATCH (c:Concept)-[:BELONGS_TO]->(t)
  RETURN t.id AS id, t.name AS name, t.color AS color, t.order AS order,
         count(c) AS conceptCount
  ORDER BY t.order ASC
`;

/**
 * Count total nodes — used to check if the DB is already seeded.
 */
export const GET_SEED_STATUS = `
  MATCH (n)
  RETURN count(n) AS totalNodes,
         count { (c:Concept) } AS conceptCount,
         count { (t:Topic) } AS topicCount
`;
