import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
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

import {
  PersonOpenLoopKind,
  PersonOpenLoopStatus,
} from '../schemas/person-open-loop.schema';

export class CreatePersonOpenLoopDto {
  @IsEnum(PersonOpenLoopKind)
  kind: PersonOpenLoopKind;

  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsMongoId()
  sourceInteractionId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdatePersonOpenLoopDto {
  @IsOptional()
  @IsEnum(PersonOpenLoopKind)
  kind?: PersonOpenLoopKind;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  details?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsMongoId()
  sourceInteractionId?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ClosePersonOpenLoopDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class ReopenPersonOpenLoopDto {
  @IsOptional()
  @IsDateString()
  dueAt?: string | null;
}

export class PersonOpenLoopQueryDto {
  @IsOptional()
  @IsEnum(PersonOpenLoopStatus)
  status?: PersonOpenLoopStatus;

  @IsOptional()
  @IsEnum(PersonOpenLoopKind)
  kind?: PersonOpenLoopKind;

  @IsOptional()
  @IsDateString()
  dueBefore?: string;

  @IsOptional()
  @IsDateString()
  dueAfter?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return value;
  })
  @IsBoolean()
  overdueOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
