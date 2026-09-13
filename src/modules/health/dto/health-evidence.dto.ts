import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

import { HealthAutonomyMode } from '../schemas/health-evidence-settings.schema';

export class UpdateHealthEvidenceSettingsDto {
  @IsOptional()
  @IsObject()
  autonomy?: Record<string, HealthAutonomyMode>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(365)
  baselineRefreshDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  bodyPhotoRefreshDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  skinPhotoRefreshDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  hairPhotoRefreshDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(730)
  reportFreshnessDays?: number;
}

export class UpdateHealthAutonomyModeDto {
  @IsEnum(HealthAutonomyMode)
  mode: HealthAutonomyMode;
}
