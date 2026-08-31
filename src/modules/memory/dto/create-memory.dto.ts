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
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryEntityType,
  MemoryPersonRelation,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../schemas/memory.schema';

export class MemoryEntityReferenceDto {
  @IsEnum(MemoryEntityType)
  type: MemoryEntityType;

  @IsString()
  name: string;

  @IsOptional()
  @IsMongoId()
  entityId?: string;

  @IsOptional()
  @IsString()
  externalId?: string;
}

export class MemoryPersonLinkDto {
  @IsMongoId()
  personId: string;

  @IsEnum(MemoryPersonRelation)
  relation: MemoryPersonRelation;
}

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

  @IsOptional()
  @IsEnum(MemoryScope)
  scope?: MemoryScope;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemoryPersonLinkDto)
  personLinks?: MemoryPersonLinkDto[];

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
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MemoryEntityReferenceDto)
  entities?: MemoryEntityReferenceDto[];

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
  @IsEnum(MemoryDurability)
  durability?: MemoryDurability;

  @IsOptional()
  @IsEnum(MemoryCaptureOrigin)
  captureOrigin?: MemoryCaptureOrigin;

  @IsOptional()
  @IsDateString()
  capturedAt?: string;

  @IsOptional()
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsMongoId()
  inboxItemId?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
