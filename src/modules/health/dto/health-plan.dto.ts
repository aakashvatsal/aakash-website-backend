import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { HealthPlanStatus } from '../schemas/health-plan-day.schema';

export class HealthPlanWindowQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(14)
  aheadDays?: number;
}

export class EnsureHealthPlanDto {
  @IsOptional()
  @IsBoolean()
  forceRefresh?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(14)
  aheadDays?: number;
}

export class UpdateHealthPlanDayDto {
  @IsOptional()
  @IsBoolean()
  lockedByOwner?: boolean;

  @IsOptional()
  @IsEnum(HealthPlanStatus)
  status?: HealthPlanStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  ownerNotes?: string;
}
