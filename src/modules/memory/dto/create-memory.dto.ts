import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MemoryAccessLevel,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../schemas/memory.schema';

export class MemorySourceReferenceDto {
  @IsOptional()
  @IsMongoId()
  entityId?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  sourceUrl?: string;

  @IsOptional()
  @IsDateString()
  sourceCreatedAt?: string;
}

export class CreateMemoryDto {
  // @IsMongoId()
  // ownerUserId: string;

  @IsOptional()
  @IsMongoId()
  personId?: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @IsEnum(MemorySource)
  source?: MemorySource;

  @IsOptional()
  @ValidateNested()
  @Type(() => MemorySourceReferenceDto)
  sourceReference?: MemorySourceReferenceDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  importance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsEnum(MemoryVerificationStatus)
  verificationStatus?: MemoryVerificationStatus;

  @IsOptional()
  @IsEnum(MemoryAccessLevel)
  accessLevel?: MemoryAccessLevel;

  @IsOptional()
  @IsEnum(MemorySensitivity)
  sensitivity?: MemorySensitivity;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}