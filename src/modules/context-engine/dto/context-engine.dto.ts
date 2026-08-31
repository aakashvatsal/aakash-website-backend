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

import { KnowledgeGraphNodeType } from '../../knowledge-graph/schemas/knowledge-graph-node.schema';

export enum ContextPrivacyBoundary {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export enum ContextAssemblyMode {
  BALANCED = 'balanced',
  FRESH = 'fresh',
  AUTHORITATIVE = 'authoritative',
  COMPACT = 'compact',
}

function asArray(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value as unknown[];
  if (value === undefined || value === null || value === '') return undefined;
  return [value];
}

export class AssembleContextDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  question: string;

  @IsOptional()
  @IsEnum(ContextPrivacyBoundary)
  boundary?: ContextPrivacyBoundary;

  @IsOptional()
  @IsEnum(ContextAssemblyMode)
  mode?: ContextAssemblyMode;

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(4000)
  @Max(60000)
  contextBudgetChars?: number;
}

export class AnswerWithContextDto extends AssembleContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  answerStyle?: string;
}
