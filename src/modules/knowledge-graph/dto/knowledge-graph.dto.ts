import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { KnowledgeGraphNodeType } from '../schemas/knowledge-graph-node.schema';

export class KnowledgeGraphOverviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : value ? [value] : undefined,
  )
  @IsArray()
  @IsEnum(KnowledgeGraphNodeType, { each: true })
  types?: KnowledgeGraphNodeType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class KnowledgeGraphNeighborsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  depth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  limit?: number;
}

export class KnowledgeGraphPathQueryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  from: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  to: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  maxDepth?: number;
}

export class KnowledgeGraphTimelineQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value) ? value : value ? [value] : undefined,
  )
  @IsArray()
  @IsEnum(KnowledgeGraphNodeType, { each: true })
  types?: KnowledgeGraphNodeType[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class AskKnowledgeGraphDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(80)
  maxEvidence?: number;
}
