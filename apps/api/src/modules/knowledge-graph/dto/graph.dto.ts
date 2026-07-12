// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Graph DTOs
// Typed response shapes for the graph API endpoints.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Concept Node ────────────────────────────────────────────────────────────

export class ConceptNodeDto {
  @ApiProperty({ example: 'binary-search' })
  id: string;

  @ApiProperty({ example: 'Binary Search' })
  name: string;

  @ApiProperty({ enum: ['DSA', 'SYSTEM_DESIGN'] })
  domain: 'DSA' | 'SYSTEM_DESIGN';

  @ApiProperty({ example: 'Searching' })
  category: string;

  @ApiProperty({ example: 2, description: 'Difficulty on a 1-5 scale' })
  difficulty: number;

  @ApiProperty({ example: 200 })
  xpReward: number;

  @ApiProperty({ example: 60 })
  estimatedMinutes: number;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @ApiProperty({ example: false })
  isFoundation: boolean;

  @ApiPropertyOptional({ example: 'binary-search' })
  leetcodeTag?: string | null;
}

// ─── Concept Edge ────────────────────────────────────────────────────────────

export class ConceptEdgeDto {
  @ApiProperty({ example: 'arrays' })
  from: string;

  @ApiProperty({ example: 'binary-search' })
  to: string;

  @ApiProperty({ enum: ['REQUIRES', 'LEADS_TO', 'RELATED_TO', 'BELONGS_TO'] })
  type: string;
}

// ─── Graph Response ───────────────────────────────────────────────────────────

export class GraphResponseDto {
  @ApiProperty({ type: [ConceptNodeDto] })
  nodes: ConceptNodeDto[];

  @ApiProperty({ type: [ConceptEdgeDto] })
  edges: ConceptEdgeDto[];
}

// ─── Concept Detail (with neighborhood) ──────────────────────────────────────

class ConceptRefDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  difficulty: number;
}

export class ConceptDetailDto extends ConceptNodeDto {
  @ApiPropertyOptional({ example: 'Searching & Binary Search' })
  topic?: string;

  @ApiProperty({ type: [ConceptRefDto] })
  prerequisites: ConceptRefDto[];

  @ApiProperty({ type: [ConceptRefDto] })
  unlocks: ConceptRefDto[];
}

// ─── Topic ───────────────────────────────────────────────────────────────────

export class TopicDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  color: string;

  @ApiProperty()
  order: number;

  @ApiProperty()
  conceptCount: number;
}

// ─── Seed Status ─────────────────────────────────────────────────────────────

export class SeedStatusDto {
  @ApiProperty()
  totalNodes: number;

  @ApiProperty()
  conceptCount: number;

  @ApiProperty()
  topicCount: number;

  @ApiProperty()
  isSeeded: boolean;
}
