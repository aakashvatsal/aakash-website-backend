import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePersonRelationshipContextDto {
  @IsOptional()
  @IsMongoId()
  introducedByPersonId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  howWeMet?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  connectionContexts?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  preferredContactCadenceDays?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  relationshipNotes?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RelationshipContactGapQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  context?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class RelationshipContextSearchQueryDto {
  @IsString()
  @MaxLength(200)
  context: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
