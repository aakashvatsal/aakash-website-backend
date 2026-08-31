import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PersonGraphRelationshipKind } from '../schemas/person-graph-edge.schema';

export class CreatePersonGraphEdgeDto {
  @IsMongoId()
  targetPersonId: string;

  @IsEnum(PersonGraphRelationshipKind)
  kind: PersonGraphRelationshipKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contexts?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  strength?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePersonGraphEdgeDto {
  @IsOptional()
  @IsEnum(PersonGraphRelationshipKind)
  kind?: PersonGraphRelationshipKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contexts?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  strength?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PersonGraphOverviewQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  context?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class PersonGraphPathQueryDto {
  @IsMongoId()
  fromPersonId: string;

  @IsMongoId()
  toPersonId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  maxDepth?: number;
}
