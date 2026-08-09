import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  MemoryAccessLevel,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from '../schemas/memory.schema';

const transformBoolean = ({
  value,
}: {
  value: unknown;
}) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class MemoryQueryDto {
  // @IsMongoId()
  // ownerUserId: string;

  @IsOptional()
  @IsMongoId()
  personId?: string;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @IsEnum(MemorySource)
  source?: MemorySource;

  @IsOptional()
  @IsEnum(MemoryAccessLevel)
  accessLevel?: MemoryAccessLevel;

  @IsOptional()
  @IsEnum(MemorySensitivity)
  sensitivity?: MemorySensitivity;

  @IsOptional()
  @IsEnum(MemoryVerificationStatus)
  verificationStatus?: MemoryVerificationStatus;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minimumImportance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  minimumConfidence?: number;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isDisputed?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isArchived?: boolean;

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