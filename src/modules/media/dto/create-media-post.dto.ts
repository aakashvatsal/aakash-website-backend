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
  MediaGoal,
  MediaOutcomeStatus,
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
  MediaSourceType,
} from '../schemas/media-post.schema';

export class MediaStrategyDto {
  @IsEnum(MediaGoal)
  primaryGoal: MediaGoal;

  @IsOptional()
  @IsArray()
  @IsEnum(MediaGoal, { each: true })
  secondaryGoals?: MediaGoal[];

  @IsString()
  whyChosen: string;

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  audienceProblem?: string;

  @IsOptional()
  @IsString()
  coreMessage?: string;

  @IsOptional()
  @IsString()
  contentPillar?: string;

  @IsOptional()
  @IsString()
  desiredAudienceAction?: string;

  @IsOptional()
  @IsString()
  hypothesis?: string;
}

export class MediaContentDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  hook?: string;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  detailedDescription?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  textPostScript?: string;

  @IsOptional()
  @IsString()
  videoScript?: string;

  @IsOptional()
  @IsString()
  voiceOverScript?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  carouselSlides?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shotList?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];

  @IsOptional()
  @IsString()
  cta?: string;
}

export class MediaCreativeDto {
  @IsOptional()
  @IsEnum(MediaSourceType)
  imageSource?: MediaSourceType;

  @IsOptional()
  @IsEnum(MediaSourceType)
  videoSource?: MediaSourceType;

  @IsOptional()
  @IsString()
  designBrief?: string;

  @IsOptional()
  @IsString()
  imagePrompt?: string;

  @IsOptional()
  @IsString()
  thumbnailPrompt?: string;

  @IsOptional()
  @IsString()
  aiImagePrompt?: string;

  @IsOptional()
  @IsString()
  aiVideoPrompt?: string;

  @IsOptional()
  @IsString()
  realImageScript?: string;

  @IsOptional()
  @IsString()
  realVideoScript?: string;

  @IsOptional()
  @IsString()
  brollScript?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredAssets?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentRequired?: string[];

  @IsOptional()
  @IsBoolean()
  permissionRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  permissionTaken?: boolean;

  @IsOptional()
  @IsString()
  permissionNotes?: string;
}

export class MediaPublishingDto {
  @IsOptional()
  @IsEnum(MediaPostStatus)
  status?: MediaPostStatus;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @IsOptional()
  @IsString()
  externalPostUrl?: string;

  @IsOptional()
  @IsString()
  platformPostId?: string;

  @IsOptional()
  @IsString()
  platformAccountId?: string;

  @IsOptional()
  @IsString()
  platformMediaId?: string;

  @IsOptional()
  @IsString()
  analyticsUrl?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class MediaExpectationMetricDto {
  @IsString()
  metric: string;

  @IsNumber()
  @Min(0)
  expectedValue: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class MediaExpectationDto {
  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaExpectationMetricDto)
  metrics?: MediaExpectationMetricDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  evaluationAfterHours?: number;
}

export class MediaOutcomeDto {
  @IsOptional()
  @IsEnum(MediaOutcomeStatus)
  status?: MediaOutcomeStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string;

  @IsOptional()
  @IsString()
  expectationResult?: string;

  @IsOptional()
  @IsString()
  whatWorked?: string;

  @IsOptional()
  @IsString()
  whatDidNotWork?: string;

  @IsOptional()
  @IsString()
  lessonLearned?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  contentScore?: number;

  @IsOptional()
  @IsDateString()
  evaluatedAt?: string;
}

export class MediaAnalyticsSyncDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  syncAttempts?: number;

  @IsOptional()
  @IsDateString()
  lastSyncedAt?: string;

  @IsOptional()
  @IsString()
  lastSyncError?: string;
}

export class CreateMediaPostDto {
  @IsOptional()
  @IsMongoId()
  companyId?: string;

  @IsDateString()
  date: string;

  @IsEnum(MediaPlatform)
  platform: MediaPlatform;

  @IsEnum(MediaPostType)
  postType: MediaPostType;

  @IsObject()
  @ValidateNested()
  @Type(() => MediaStrategyDto)
  strategy: MediaStrategyDto;

  @IsObject()
  @ValidateNested()
  @Type(() => MediaContentDto)
  content: MediaContentDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaCreativeDto)
  creative?: MediaCreativeDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaPublishingDto)
  publishing?: MediaPublishingDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaExpectationDto)
  expectation?: MediaExpectationDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaOutcomeDto)
  outcome?: MediaOutcomeDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MediaAnalyticsSyncDto)
  analyticsSync?: MediaAnalyticsSyncDto;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memoryIds?: string[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
