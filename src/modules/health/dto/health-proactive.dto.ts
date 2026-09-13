import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { HealthAttentionStatus } from '../schemas/health-attention-item.schema';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateHealthNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  morningBriefEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  morningBriefTime?: string;

  @IsOptional()
  @IsBoolean()
  workoutRemindersEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  defaultWorkoutTime?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  workoutLeadMinutes?: number;

  @IsOptional()
  @IsBoolean()
  mealRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  supplementRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  meditationRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  skincareRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  haircareRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  intimateCareRemindersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  sleepRemindersEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  sleepLeadMinutes?: number;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_PATTERN)
  quietHoursEnd?: string;
}

export class HealthAttentionQueryDto {
  @IsOptional()
  @IsEnum(HealthAttentionStatus)
  status?: HealthAttentionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RunHealthProactiveDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
