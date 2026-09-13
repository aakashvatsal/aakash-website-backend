import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { HealthPlanReviewPeriod } from '../schemas/health-plan-review.schema';

export enum HealthRoutineTaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum HealthSubstanceUseStatus {
  UNTRACKED = 'untracked',
  NO = 'no',
  YES = 'yes',
}

export class UpsertHealthExecutionFeedbackDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  fatigueScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  sorenessScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  stressScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  hungerScore?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  planDifficultyScore?: number;

  @IsOptional()
  @IsEnum(HealthSubstanceUseStatus)
  smokingStatus?: HealthSubstanceUseStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  smokingQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  smokingUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  smokingType?: string;

  @IsOptional()
  @IsEnum(HealthSubstanceUseStatus)
  alcoholStatus?: HealthSubstanceUseStatus;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alcoholQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  alcoholUnit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  alcoholType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  whatWorked?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blockers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requestedChanges?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}

export class UpdateHealthRoutineTaskDto {
  @IsEnum(HealthRoutineTaskStatus)
  status: HealthRoutineTaskStatus;
}

export class HealthIntelligenceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(90)
  days?: number;
}

export class HealthProgressSummaryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number;
}

export class HealthPlanReviewsQueryDto {
  @IsOptional()
  @IsEnum(HealthPlanReviewPeriod)
  periodType?: HealthPlanReviewPeriod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  limit?: number;
}

export class GenerateHealthPlanReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(10)
  anchorDateKey?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
