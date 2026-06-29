// ─────────────────────────────────────────────────────────────────────────────
// Tracker Module — Sprint 4
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from '@nestjs/common';
import { TrackerService } from './tracker.service';
import { TrackerController } from './tracker.controller';
import { KnowledgeGraphModule } from '../knowledge-graph/graph.module';

@Module({
  imports: [KnowledgeGraphModule], // for Neo4jService
  controllers: [TrackerController],
  providers: [TrackerService],
  exports: [TrackerService], // exported for use in QuestionsModule
})
export class TrackerModule {}
