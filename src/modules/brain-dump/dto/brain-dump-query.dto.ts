import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { BrainDumpSource, BrainDumpStatus } from '../schemas/brain-dump.schema';

export enum BrainDumpSortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum BrainDumpSortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export class BrainDumpQueryDto {
  @IsOptional()
  @IsEnum(BrainDumpStatus)
  status?: BrainDumpStatus;

  @IsOptional()
  @IsEnum(BrainDumpSource)
  source?: BrainDumpSource;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(BrainDumpSortBy)
  sortBy?: BrainDumpSortBy;

  @IsOptional()
  @IsEnum(BrainDumpSortOrder)
  sortOrder?: BrainDumpSortOrder;
}
