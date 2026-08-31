import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../schemas/memory.schema';
import {
  MemoryEntityReferenceDto,
  MemoryPersonLinkDto,
  MemorySourceReferenceDto,
} from './create-memory.dto';

export class CaptureMemoryInboxItemDto {
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
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  proposalReason?: string;
}

export class AcceptMemoryInboxItemDto {
  @IsOptional()
  @IsString()
  content?: string;

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

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

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
  @IsDateString()
  happenedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class RejectMemoryInboxItemDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
