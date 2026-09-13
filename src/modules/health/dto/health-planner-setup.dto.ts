import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  HealthGoalHorizonMode,
  HealthGoalStatus,
} from '../schemas/health-goal.schema';
import { HealthPhotoCategory } from '../schemas/health-progress-photo.schema';

export class UpsertHealthBaselineDto {
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  currentLookSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  expectationSummary?: string;

  @IsOptional()
  @IsObject()
  body?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  location?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  lifestyle?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  gym?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  diet?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  meditation?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  skin?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  hair?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  intimateCare?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  reportNotes?: string[];

  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;
}

export class ResolveHealthLocationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  accuracyMeters?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class CreateHealthGoalDto {
  @IsString()
  @MaxLength(120)
  category: string;

  @IsString()
  @MaxLength(240)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  currentValue?: string;

  @IsString()
  @MaxLength(160)
  targetValue: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsEnum(HealthGoalHorizonMode)
  horizonMode: HealthGoalHorizonMode;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  relativeMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  successCriteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1600)
  notes?: string;
}

export class UpdateHealthGoalDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  currentValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  targetValue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @IsOptional()
  @IsEnum(HealthGoalHorizonMode)
  horizonMode?: HealthGoalHorizonMode;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  relativeMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  successCriteria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1600)
  notes?: string;

  @IsOptional()
  @IsEnum(HealthGoalStatus)
  status?: HealthGoalStatus;
}

export class HealthPhotoQueryDto {
  @IsOptional()
  @IsEnum(HealthPhotoCategory)
  category?: HealthPhotoCategory;
}

export class HealthPhotoUploadQueryDto {
  @IsEnum(HealthPhotoCategory)
  category: HealthPhotoCategory;

  @IsString()
  @MaxLength(80)
  angle: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;
}

export class GenerateHealthStrategyDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
export class HealthSourceReportUploadQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  @IsOptional()
  @IsDateString()
  reportDate?: string;
}

export class UpdateHealthSourceReportFollowUpDto {
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsIn(['scheduled', 'needs_confirmation', 'completed', 'dismissed'])
  status?: 'scheduled' | 'needs_confirmation' | 'completed' | 'dismissed';

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}
