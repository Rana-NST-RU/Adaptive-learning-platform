// ─────────────────────────────────────────────────────────────────────────────
// Graph Service
// Business logic for all Knowledge Graph operations.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

import { Neo4jService } from './neo4j.service';
import {
  GET_FULL_GRAPH,
  GET_CONCEPT_BY_ID,
  GET_TOPICS_WITH_COUNTS,
  GET_SEED_STATUS,
} from './cypher/concept.queries';
import { GET_LEARNING_PATH_TO_TARGET } from './cypher/path.queries';
import {
  GraphResponseDto,
  ConceptDetailDto,
  TopicDto,
  SeedStatusDto,
} from './dto/graph.dto';

@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  // ─── Full Graph ───────────────────────────────────────────────────────────

  /**
   * Fetch all concept nodes and their edges.
   * Optionally filter by domain ('DSA' | 'SYSTEM_DESIGN').
   */
  async getFullGraph(domain?: string): Promise<GraphResponseDto> {
    const domainParam = domain ?? null;

    const results = await this.neo4j.runQuery<{
      nodes: any[];
      edges: any[];
    }>(GET_FULL_GRAPH, { domain: domainParam });

    if (!results.length) {
      return { nodes: [], edges: [] };
    }

    const { nodes, edges } = results[0];
    return { nodes: nodes ?? [], edges: edges ?? [] };
  }

  // ─── Concept Detail ───────────────────────────────────────────────────────

  /**
   * Fetch a single concept's full detail including its prerequisite/unlock neighborhood.
   */
  async getConceptDetail(id: string): Promise<ConceptDetailDto> {
    const results = await this.neo4j.runQuery<{ concept: ConceptDetailDto }>(
      GET_CONCEPT_BY_ID,
      { id },
    );

    if (!results.length || !results[0].concept) {
      throw new NotFoundException(`Concept with id "${id}" not found`);
    }

    return results[0].concept;
  }

  // ─── Learning Path ────────────────────────────────────────────────────────

  /**
   * Returns an ordered array of concepts from a foundation node to the target.
   * Uses Neo4j's shortestPath algorithm along LEADS_TO edges.
   */
  async getLearningPath(targetId: string): Promise<any[]> {
    const results = await this.neo4j.runQuery<{ path: any[] }>(
      GET_LEARNING_PATH_TO_TARGET,
      { targetId },
    );

    if (!results.length || !results[0].path) {
      // Target may be a foundation node itself — return just that concept
      const detail = await this.getConceptDetail(targetId);
      return [detail];
    }

    return results[0].path;
  }

  // ─── Topics ───────────────────────────────────────────────────────────────

  /**
   * Return all topics for a domain with their concept counts.
   */
  async getTopics(domain: string): Promise<TopicDto[]> {
    return this.neo4j.runQuery<TopicDto>(GET_TOPICS_WITH_COUNTS, { domain });
  }

  // ─── Seed Database ────────────────────────────────────────────────────────

  /**
   * Idempotent seed operation.
   * Reads the .cypher file and executes each statement in order.
   * Skips if DB already has data.
   */
  async seedDatabase(force = false): Promise<{ seeded: boolean; message: string }> {
    // Check current state
    const statusResults = await this.neo4j.runQuery<{
      totalNodes: number;
      conceptCount: number;
      topicCount: number;
    }>(GET_SEED_STATUS);

    const status = statusResults[0];
    this.logger.log(
      `Seed check — nodes: ${status?.totalNodes}, concepts: ${status?.conceptCount}, topics: ${status?.topicCount}`,
    );

    if (!force && status?.conceptCount > 0) {
      return {
        seeded: false,
        message: `Database already has ${status.conceptCount} concepts. Use force=true to re-seed.`,
      };
    }

    // Resolve the seed file relative to the monorepo root.
    // process.cwd() = apps/api when NestJS starts, so we go up two levels to the repo root.
    const seedFilePath = path.resolve(
      process.cwd(),
      '../../infrastructure/neo4j/seed-graph.cypher',
    );

    if (!fs.existsSync(seedFilePath)) {
      throw new ServiceUnavailableException(
        `Seed file not found at: ${seedFilePath}`,
      );
    }

    this.logger.log(`Reading seed file from: ${seedFilePath}`);
    const cypher = fs.readFileSync(seedFilePath, 'utf-8');

    // Split on semicolons (each statement ends with ;)
    // Strip comment lines from within each chunk, then filter empty results.
    // Previous approach (filtering chunks that START with //) was wrong —
    // it silently dropped Cypher statements that followed comment headers.
    const statements = cypher
      .split(';')
      .map((chunk) =>
        chunk
          .split('\n')
          .filter((line) => {
            const t = line.trim();
            return t !== '' && !t.startsWith('//');
          })
          .join('\n')
          .trim(),
      )
      .filter((s) => s.length > 0);

    this.logger.log(`Executing ${statements.length} Cypher statements...`);
    let executed = 0;
    let failed = 0;

    for (const statement of statements) {
      try {
        await this.neo4j.runWrite(statement);
        executed++;
      } catch (err: any) {
        failed++;
        this.logger.warn(`Statement ${executed + failed} failed: ${err.message?.slice(0, 120)}`);
      }
    }

    this.logger.log(`✅ Seed complete — ${executed} OK, ${failed} failed`);

    // Verify
    const afterResults = await this.neo4j.runQuery<{
      totalNodes: number;
      conceptCount: number;
      topicCount: number;
    }>(GET_SEED_STATUS);
    const after = afterResults[0];

    return {
      seeded: true,
      message: `Seeded ${after?.conceptCount} concepts and ${after?.topicCount} topics. (${executed} statements OK, ${failed} failed)`,
    };
  }

  // ─── Seed Status ──────────────────────────────────────────────────────────

  async getSeedStatus(): Promise<SeedStatusDto> {
    const results = await this.neo4j.runQuery<{
      conceptCount: number;
      topicCount: number;
    }>(GET_SEED_STATUS);

    const r = results[0] ?? { conceptCount: 0, topicCount: 0 };
    return {
      totalNodes: r.conceptCount + r.topicCount,
      conceptCount: r.conceptCount,
      topicCount: r.topicCount,
      isSeeded: r.conceptCount > 0,
    };
  }
}
