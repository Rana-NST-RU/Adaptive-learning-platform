import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';

import { GraphService } from './graph.service';
import {
  GraphResponseDto,
  ConceptDetailDto,
  TopicDto,
  SeedStatusDto,
} from './dto/graph.dto';

@ApiTags('graph')
@Controller('graph')
export class GraphController {
  constructor(private readonly graphService: GraphService) {}

  // ─── GET /graph ───────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Fetch the full knowledge graph',
    description:
      'Returns all concept nodes and directed edges. Optionally filter by domain.',
  })
  @ApiQuery({ name: 'domain', required: false, enum: ['DSA', 'SYSTEM_DESIGN'] })
  @ApiResponse({ status: 200, type: GraphResponseDto })
  getFullGraph(
    @Query('domain') domain?: 'DSA' | 'SYSTEM_DESIGN',
  ): Promise<GraphResponseDto> {
    return this.graphService.getFullGraph(domain);
  }

  // ─── GET /graph/topics ────────────────────────────────────────────────────

  @Get('topics')
  @ApiOperation({ summary: 'List all topics for a domain with concept counts' })
  @ApiQuery({ name: 'domain', required: false, enum: ['DSA', 'SYSTEM_DESIGN'] })
  @ApiResponse({ status: 200, type: [TopicDto] })
  getTopics(
    @Query('domain') domain: 'DSA' | 'SYSTEM_DESIGN' = 'DSA',
  ): Promise<TopicDto[]> {
    return this.graphService.getTopics(domain);
  }

  // ─── GET /graph/status ────────────────────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Get current database seed status' })
  @ApiResponse({ status: 200, type: SeedStatusDto })
  getSeedStatus(): Promise<SeedStatusDto> {
    return this.graphService.getSeedStatus();
  }

  // ─── GET /graph/path/:targetId ────────────────────────────────────────────

  @Get('path/:targetId')
  @ApiOperation({
    summary: 'Get learning path to a concept',
    description:
      'Returns an ordered list of concepts from a foundation node to the target, following LEADS_TO edges.',
  })
  @ApiParam({ name: 'targetId', example: 'dp-introduction' })
  getLearningPath(@Param('targetId') targetId: string): Promise<any[]> {
    return this.graphService.getLearningPath(targetId);
  }

  // ─── GET /graph/concepts/:id ──────────────────────────────────────────────

  @Get('concepts/:id')
  @ApiOperation({
    summary: 'Get a single concept with its full neighbourhood',
    description:
      'Returns concept details including direct prerequisites and what concepts it unlocks.',
  })
  @ApiParam({ name: 'id', example: 'binary-search' })
  @ApiResponse({ status: 200, type: ConceptDetailDto })
  @ApiResponse({ status: 404, description: 'Concept not found' })
  getConceptDetail(@Param('id') id: string): Promise<ConceptDetailDto> {
    return this.graphService.getConceptDetail(id);
  }

  // ─── POST /graph/seed ─────────────────────────────────────────────────────

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seed the Neo4j database from the .cypher file',
    description:
      'Idempotent — skips if concepts already exist. Pass { "force": true } to re-seed.',
  })
  seedDatabase(
    @Body() body: { force?: boolean },
  ): Promise<{ seeded: boolean; message: string }> {
    return this.graphService.seedDatabase(body?.force ?? false);
  }
}
