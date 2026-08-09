import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';

import {
  MeditationEnvironment,
  MeditationMood,
  MeditationPosition,
  MeditationStatus,
  MeditationType,
} from '../schemas/meditation-entry.schema';

export class CreateMeditationEntryDto {
  @IsMongoId()
  userId: string;

  @IsDateString()
  date: string;

  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsEnum(MeditationType)
  type?: MeditationType;

  @IsOptional()
  @IsEnum(MeditationStatus)
  status?: MeditationStatus;

  @IsOptional()
  @IsEnum(MeditationPosition)
  position?: MeditationPosition;

  @IsOptional()
  @IsEnum(MeditationEnvironment)
  environment?: MeditationEnvironment;

  @IsOptional()
  @IsNumber()
  @Min(0)
  plannedDurationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualDurationMinutes?: number;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  pausedAt?: string;

  @IsOptional()
  @IsDateString()
  resumedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsDateString()
  skippedAt?: string;

  @IsOptional()
  @IsDateString()
  abandonedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPausedMinutes?: number;

  @IsOptional()
  @IsString()
  technique?: string;

  @IsOptional()
  @IsString()
  guideName?: string;

  @IsOptional()
  @IsString()
  appName?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  audioUrl?: string;

  @IsOptional()
  @IsString()
  skippedReason?: string;

  @IsOptional()
  @IsString()
  abandonedReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  focusScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  calmnessBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  calmnessAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  satisfactionScore?: number;

  @IsOptional()
  @IsEnum(MeditationMood)
  moodBefore?: MeditationMood;

  @IsOptional()
  @IsEnum(MeditationMood)
  moodAfter?: MeditationMood;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distractionsCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  distractions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insights?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  intentions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memoryIds?: string[];

  @IsOptional()
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}