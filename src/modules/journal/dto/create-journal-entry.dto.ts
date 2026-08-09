import { Type } from 'class-transformer';

import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  JournalEntryType,
  JournalMood,
  JournalSource,
  JournalVisibility,
} from '../schemas/journal-entry.schema';

export class JournalWorkoutDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(21)
  strainScore?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class JournalReadingDto {
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

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
  @IsInt()
  @Min(0)
  pagesRead?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercentage?: number;

  @IsOptional()
  @IsString()
  thought?: string;
}

export class JournalSleepDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  durationHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  performancePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  quality?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  recoveryScore?: number;
}

export class CreateJournalEntryDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsString()
  dateKey?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsEnum(JournalEntryType)
  type?: JournalEntryType;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  highlight?: string;

  @IsOptional()
  @IsEnum(JournalMood)
  mood?: JournalMood;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  moodScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  productivityScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lessons?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  decisions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ideas?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gratitude?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  challenges?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wins?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => JournalWorkoutDto)
  workout?: JournalWorkoutDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => JournalReadingDto)
  reading?: JournalReadingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => JournalSleepDto)
  sleep?: JournalSleepDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  steps?: number;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memoryIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  companyIds?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  libraryItemIds?: string[];

  @IsOptional()
  @IsEnum(JournalVisibility)
  visibility?: JournalVisibility;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(JournalSource)
  source?: JournalSource;

  @IsOptional()
  @IsString()
  sourceExternalId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}