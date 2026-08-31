import { Type } from 'class-transformer';

import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  NowActivityType,
  NowAvailability,
  NowMood,
  NowSource,
  NowVisibility,
} from '../schemas/now-status.schema';

export class NowCompanyReferenceDto {
  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsOptional()
  @IsString()
  currentWork?: string;
}

export class NowReadingReferenceDto {
  @IsOptional()
  @IsMongoId()
  libraryItemId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @IsOptional()
  @IsString()
  currentThought?: string;
}

export class NowHealthReferenceDto {
  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  workoutDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  steps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  sleepHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  recoveryScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(21)
  strainScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heartRateVariabilityMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  restingHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @IsString()
  summary?: string;
}

export class CreateNowStatusDto {
  @IsEnum(NowActivityType)
  activityType: NowActivityType;

  @IsString()
  activity: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currentFocus?: string;

  @IsOptional()
  @IsEnum(NowAvailability)
  availability?: NowAvailability;

  @IsOptional()
  @IsEnum(NowMood)
  mood?: NowMood;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  focusScore?: number;

  @IsOptional()
  @IsString()
  locationName?: string;

  @IsOptional()
  @IsString()
  locationType?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NowCompanyReferenceDto)
  building?: NowCompanyReferenceDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => NowReadingReferenceDto)
  reading?: NowReadingReferenceDto;

  @IsOptional()
  @IsString()
  thinking?: string;

  @IsOptional()
  @IsString()
  writing?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NowHealthReferenceDto)
  health?: NowHealthReferenceDto;

  @IsOptional()
  @IsArray()
  @IsString({
    each: true,
  })
  tags?: string[];

  @IsOptional()
  @IsEnum(NowVisibility)
  visibility?: NowVisibility;

  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @IsOptional()
  @IsBoolean()
  showAvailability?: boolean;

  @IsOptional()
  @IsBoolean()
  showMood?: boolean;

  @IsOptional()
  @IsBoolean()
  showHealth?: boolean;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsDateString()
  lastActivityAt?: string;

  @IsOptional()
  @IsEnum(NowSource)
  source?: NowSource;

  @IsOptional()
  @IsString()
  sourceExternalId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
