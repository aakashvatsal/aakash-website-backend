import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  HobbyCategory,
  HobbyIntensity,
  HobbyPracticeTimeWindow,
  HobbySource,
  HobbyStageStatus,
  HobbyStatus,
} from '../schemas/hobby.schema';

export class HobbyCurriculumStageDto {
  @IsString()
  @MaxLength(120)
  key: string;

  @IsString()
  @MaxLength(160)
  title: string;

  @IsInt()
  @Min(1)
  order: number;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  objective?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  focusAreas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  exercises?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  completionCriteria?: string[];

  @IsOptional()
  @IsEnum(HobbyStageStatus)
  status?: HobbyStageStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  targetWeeks?: number;
}

export class HobbyCandidateProfileDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  genuineCuriosity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  lifestyleFit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  novelty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  strategicUsefulness?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  mediaUsefulness?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  weeklyMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CreateHobbyDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsEnum(HobbyStatus)
  status?: HobbyStatus;

  @IsOptional()
  @IsEnum(HobbyCategory)
  category?: HobbyCategory;

  @IsOptional()
  @IsEnum(HobbyIntensity)
  intensity?: HobbyIntensity;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  goal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  why?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentSkillLevel?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(104)
  targetHorizonWeeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  weeklyTargetMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(14)
  targetSessionsPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  recommendedSessionMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  preferredWeekdays?: number[];

  @IsOptional()
  @IsEnum(HobbyPracticeTimeWindow)
  preferredPracticeTime?: HobbyPracticeTimeWindow;

  @IsOptional()
  @IsBoolean()
  aiCoachingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  automaticReviewsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentStageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1600)
  nextAction?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  nextActionMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HobbyCurriculumStageDto)
  curriculum?: HobbyCurriculumStageDto[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  linkedLibraryItemIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => HobbyCandidateProfileDto)
  candidateProfile?: HobbyCandidateProfileDto;

  @IsOptional()
  @IsEnum(HobbySource)
  source?: HobbySource;

  @IsOptional()
  @IsBoolean()
  mediaEligible?: boolean;
}
