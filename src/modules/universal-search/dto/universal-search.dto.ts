import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { KnowledgeGraphNodeType } from '../../knowledge-graph/schemas/knowledge-graph-node.schema';

export enum UniversalSearchMode {
  HYBRID = 'hybrid',
  EXACT = 'exact',
  SEMANTIC = 'semantic',
}

export enum UniversalSearchSort {
  RELEVANCE = 'relevance',
  RECENT = 'recent',
  IMPORTANCE = 'importance',
}

function asArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value as unknown[];
  if (value === undefined || value === null || value === '') return undefined;
  return [value];
}

function asBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return value === 'true' || value === '1';
}

export class UniversalSearchQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  q: string;

  @IsOptional()
  @IsEnum(UniversalSearchMode)
  mode?: UniversalSearchMode;

  @IsOptional()
  @IsEnum(UniversalSearchSort)
  sort?: UniversalSearchSort;

  @IsOptional()
  @Transform(({ value }) => asArray(value))
  @IsArray()
  @IsEnum(KnowledgeGraphNodeType, { each: true })
  types?: KnowledgeGraphNodeType[];

  @IsOptional()
  @Transform(({ value }) => asArray(value))
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minImportance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5000)
  offset?: number;
}

export class UniversalSearchIndexSyncDto {
  @IsOptional()
  @Transform(({ value }) => asBoolean(value))
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  maxEmbeddings?: number;
}

export class HsakaaUniversalSearchDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @Transform(({ value }) => asArray(value))
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
  @Min(5)
  @Max(60)
  maxEvidence?: number;
}
