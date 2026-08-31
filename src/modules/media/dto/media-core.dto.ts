import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
  MediaSourceType,
} from '../schemas/media-post.schema';
import {
  MediaAccountConnectionStatus,
  MediaDeliveryProvider,
} from '../schemas/media-account.schema';
import {
  MediaAssetStatus,
  MediaAssetType,
} from '../schemas/media-asset.schema';
import {
  MediaContentItemStatus,
  MediaContentOrigin,
} from '../schemas/media-content-item.schema';
import { MediaGenerationPurpose } from '../schemas/media-generation-run.schema';
import { MetricSnapshotPeriod } from '../schemas/media-metric-snapshot.schema';
import { MediaGrowthExperimentStatus } from '../schemas/media-growth-experiment.schema';

export class MediaAccountCapabilitiesDto {
  @IsOptional() @IsBoolean() canPublish?: boolean;
  @IsOptional() @IsBoolean() canSchedule?: boolean;
  @IsOptional() @IsBoolean() canReadAnalytics?: boolean;
  @IsOptional() @IsBoolean() canReadEngagement?: boolean;
  @IsOptional() @IsBoolean() canUploadAssets?: boolean;
  @IsOptional() @IsBoolean() requiresManualPublish?: boolean;
}
export class MediaAccountStrategyDto {
  @IsOptional()
  @IsArray()
  @IsEnum(MediaGoal, { each: true })
  goals?: MediaGoal[];
  @IsOptional() @IsArray() @IsString({ each: true }) contentPillars?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) audiences?: string[];
  @IsOptional() @IsInt() @Min(7) @Max(31) planningHorizonDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) desiredPublicationsPerWeek?: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  preferredDaysOfWeek?: number[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredPublishTimes?: string[];
  @IsOptional() @IsString() positioning?: string;
  @IsOptional() @IsString() notes?: string;
}
export class CreateMediaAccountDto {
  @IsEnum(MediaPlatform) platform: MediaPlatform;
  @IsString() displayName: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() externalAccountId?: string;
  @IsOptional()
  @IsEnum(MediaAccountConnectionStatus)
  connectionStatus?: MediaAccountConnectionStatus;
  @IsOptional() @IsString() credentialRef?: string;
  @IsOptional()
  @IsEnum(MediaDeliveryProvider)
  deliveryProvider?: MediaDeliveryProvider;
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaAccountCapabilitiesDto)
  capabilities?: MediaAccountCapabilitiesDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaAccountStrategyDto)
  strategy?: MediaAccountStrategyDto;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class CreateMediaContentItemDto {
  @IsString() title: string;
  @IsOptional() @IsString() thesis?: string;
  @IsOptional() @IsString() whyNow?: string;
  @IsOptional() @IsString() canonicalBody?: string;
  @IsOptional() @IsString() story?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) evidence?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) contentPillars?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) audiences?: string[];
  @IsOptional()
  @IsArray()
  @IsEnum(MediaGoal, { each: true })
  goals?: MediaGoal[];
  @IsOptional() @IsEnum(MediaContentItemStatus) status?: MediaContentItemStatus;
  @IsOptional() @IsEnum(MediaContentOrigin) origin?: MediaContentOrigin;
  @IsOptional() @IsMongoId() companyId?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) memoryIds?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) personIds?: string[];
  @IsOptional() @IsMongoId() generationRunId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class CreateMediaPublicationDto {
  @IsMongoId() contentItemId: string;
  @IsOptional() @IsMongoId() accountId?: string;
  @IsEnum(MediaPlatform) platform: MediaPlatform;
  @IsEnum(MediaPostType) format: MediaPostType;
  @IsOptional() @IsEnum(MediaPostStatus) status?: MediaPostStatus;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsString() script?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() cta?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) hashtags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) slides?: string[];
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsDateString() planningDueAt?: string;
  @IsOptional() @IsDateString() scriptDueAt?: string;
  @IsOptional() @IsDateString() assetDueAt?: string;
  @IsOptional() @IsDateString() reviewDueAt?: string;
  @IsOptional() @IsBoolean() intentionalRepurpose?: boolean;
  @IsOptional() @IsMongoId() sourcePublicationId?: string;
  @IsOptional() @IsMongoId() generationRunId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class CreateMediaAssetDto {
  @IsOptional() @IsMongoId() contentItemId?: string;
  @IsOptional() @IsMongoId() publicationId?: string;
  @IsEnum(MediaAssetType) type: MediaAssetType;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsEnum(MediaSourceType) source?: MediaSourceType;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() storageKey?: string;
  @IsOptional() @IsString() prompt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(MediaAssetStatus) status?: MediaAssetStatus;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class MediaCandidateFingerprintDto {
  @IsString() title: string;
  @IsOptional() @IsString() thesis?: string;
  @IsOptional() @IsString() whyNow?: string;
  @IsOptional() @IsString() canonicalBody?: string;
  @IsOptional() @IsString() story?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) evidence?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) contentPillars?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) audiences?: string[];
  @IsOptional() @IsEnum(MediaPlatform) platform?: MediaPlatform;
  @IsOptional() @IsEnum(MediaPostType) format?: MediaPostType;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsString() script?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() cta?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) slides?: string[];
  @IsOptional() @IsBoolean() intentionalRepurpose?: boolean;
  @IsOptional() @IsMongoId() sourceContentItemId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class RecordRejectedMediaCandidateDto extends MediaCandidateFingerprintDto {
  @IsOptional() @IsString() rejectionReason?: string;
  @IsOptional() @IsMongoId() generationRunId?: string;
}

export class MediaIntelligenceBackfillDto {
  @IsOptional() @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @IsBoolean() refresh?: boolean;
  @IsOptional() @IsBoolean() includePublications?: boolean;
}

export class GenerateMediaContentBatchDto {
  @IsString()
  brief: string;

  @IsOptional()
  @IsEnum(MediaGenerationPurpose)
  purpose?: MediaGenerationPurpose;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsEnum(MediaPlatform, { each: true })
  platforms?: MediaPlatform[];

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(8)
  candidateCount?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(MediaGoal, { each: true })
  goals?: MediaGoal[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentPillars?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audiences?: string[];

  @IsOptional()
  @IsString()
  whyNow?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  constraints?: string[];

  @IsOptional()
  @IsMongoId()
  sourceContentItemId?: string;

  @IsOptional()
  @IsBoolean()
  intentionalRepurpose?: boolean;

  @IsOptional()
  @IsString()
  contextSummary?: string;
}

export class AcceptMediaDirectorCandidateDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsEnum(MediaPlatform, { each: true })
  platforms?: MediaPlatform[];
}

export class RejectMediaDirectorCandidateDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GenerateMediaProductionPackDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpdateMediaProductionAssetDto {
  @IsOptional()
  @IsEnum(MediaAssetStatus)
  status?: MediaAssetStatus;

  @IsOptional()
  @IsEnum(MediaSourceType)
  source?: MediaSourceType;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMediaAccountDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() externalAccountId?: string;
  @IsOptional()
  @IsEnum(MediaAccountConnectionStatus)
  connectionStatus?: MediaAccountConnectionStatus;
  @IsOptional() @IsString() credentialRef?: string;
  @IsOptional()
  @IsEnum(MediaDeliveryProvider)
  deliveryProvider?: MediaDeliveryProvider;
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaAccountCapabilitiesDto)
  capabilities?: MediaAccountCapabilitiesDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => MediaAccountStrategyDto)
  strategy?: MediaAccountStrategyDto;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class ReserveMediaCalendarSlotDto {
  @IsMongoId() publicationId: string;
  @IsOptional() @IsString() notes?: string;
}

export class ScheduleMediaPublicationDto {
  @IsOptional() @IsMongoId() slotId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsBoolean() autoPublish?: boolean;
}

export class PublishMediaNowDto {
  @IsOptional() @IsBoolean() force?: boolean;
}

export class CompleteManualMediaPublishDto {
  @IsOptional() @IsString() externalPostUrl?: string;
  @IsOptional() @IsString() platformPostId?: string;
}

export class RetryMediaPublishDto {
  @IsOptional() @IsBoolean() publishNow?: boolean;
}

export class ConnectBufferChannelDto {
  @IsString()
  organizationId: string;

  @IsString()
  channelId: string;
}

export class SyncMediaPublicationMetricsDto {
  @IsOptional() @IsEnum(MetricSnapshotPeriod) period?: MetricSnapshotPeriod;
}

export class MediaGrowthSyncPublishedDto {
  @IsOptional() @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsEnum(MetricSnapshotPeriod) period?: MetricSnapshotPeriod;
}

export class MediaGrowthSyncAccountsDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

export class RecordMediaAccountMetricsDto {
  @IsOptional() @IsDateString() capturedAt?: string;
  @IsOptional() @IsInt() @Min(0) followers?: number;
  @IsOptional() @IsInt() @Min(0) subscribers?: number;
  @IsOptional() @IsInt() @Min(0) profileViews?: number;
  @IsOptional() @IsInt() @Min(0) impressions?: number;
  @IsOptional() @IsInt() @Min(0) reach?: number;
  @IsOptional() @IsInt() @Min(0) views?: number;
  @IsOptional() @IsInt() @Min(0) websiteClicks?: number;
  @IsOptional() @IsInt() @Min(0) leads?: number;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsObject() rawMetrics?: Record<string, unknown>;
}

export class RebuildMediaGrowthLearningsDto {
  @IsOptional() @IsInt() @Min(7) @Max(365) days?: number;
  @IsOptional() @IsInt() @Min(2) @Max(100) minSampleSize?: number;
}

export class CreateMediaGrowthExperimentDto {
  @IsString() title: string;
  @IsString() hypothesis: string;
  @IsOptional() @IsEnum(MediaPlatform) platform?: MediaPlatform;
  @IsString() variable: string;
  @IsString() control: string;
  @IsString() variant: string;
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  controlPublicationIds?: string[];
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  variantPublicationIds?: string[];
  @IsOptional()
  @IsEnum(MediaGrowthExperimentStatus)
  status?: MediaGrowthExperimentStatus;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

export class UpdateMediaGrowthExperimentDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() hypothesis?: string;
  @IsOptional() @IsEnum(MediaPlatform) platform?: MediaPlatform;
  @IsOptional() @IsString() variable?: string;
  @IsOptional() @IsString() control?: string;
  @IsOptional() @IsString() variant?: string;
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  controlPublicationIds?: string[];
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  variantPublicationIds?: string[];
  @IsOptional()
  @IsEnum(MediaGrowthExperimentStatus)
  status?: MediaGrowthExperimentStatus;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsString() winner?: string;
  @IsOptional() @IsNumber() @Min(-1000) @Max(1000) liftPercent?: number;
  @IsOptional() @IsString() resultSummary?: string;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
