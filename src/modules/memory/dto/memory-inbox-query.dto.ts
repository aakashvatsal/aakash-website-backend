import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
} from '../schemas/memory.schema';
import { MemoryInboxStatus } from '../schemas/memory-inbox-item.schema';

export class MemoryInboxQueryDto {
  @IsOptional()
  @IsEnum(MemoryInboxStatus)
  status?: MemoryInboxStatus;

  @IsOptional()
  @IsEnum(MemoryCaptureOrigin)
  captureOrigin?: MemoryCaptureOrigin;

  @IsOptional()
  @IsEnum(MemoryDurability)
  durability?: MemoryDurability;

  @IsOptional()
  @IsEnum(MemorySource)
  source?: MemorySource;

  @IsOptional()
  @IsEnum(MemorySensitivity)
  sensitivity?: MemorySensitivity;

  @IsOptional()
  @IsEnum(MemoryScope)
  scope?: MemoryScope;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
