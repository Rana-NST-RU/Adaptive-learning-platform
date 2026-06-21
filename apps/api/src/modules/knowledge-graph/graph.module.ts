// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Graph Module
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from '@nestjs/common';
import { Neo4jService } from './neo4j.service';
import { GraphService } from './graph.service';
import { GraphController } from './graph.controller';

@Module({
  providers: [Neo4jService, GraphService],
  controllers: [GraphController],
  exports: [Neo4jService, GraphService], // Export for use in future Sprint modules
})
export class KnowledgeGraphModule {}
