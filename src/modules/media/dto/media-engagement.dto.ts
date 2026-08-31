import { Transform, Type } from 'class-transformer';

import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  MediaEngagementIntent,
  MediaEngagementPriority,
  MediaEngagementStatus,
} from '../schemas/media-engagement-item.schema';
import { MediaPlatform } from '../schemas/media-post.schema';

export class MediaEngagementListQueryDto {
  @IsOptional() @IsEnum(MediaPlatform) platform?: MediaPlatform;
  @IsOptional() @IsEnum(MediaEngagementStatus) status?: MediaEngagementStatus;
  @IsOptional()
  @IsEnum(MediaEngagementPriority)
  priority?: MediaEngagementPriority;
  @IsOptional() @IsEnum(MediaEngagementIntent) intent?: MediaEngagementIntent;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  needsResponse?: boolean;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(300) limit?: number;
}

export class SyncMediaEngagementDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) limitPerAccount?: number;
}

export class DraftMediaEngagementReplyDto {
  @IsOptional() @IsBoolean() force?: boolean;
  @IsOptional() @IsString() instructions?: string;
}

export class SendMediaEngagementReplyDto {
  @IsString() text: string;
}

export class UpdateMediaEngagementStatusDto {
  @IsEnum(MediaEngagementStatus) status: MediaEngagementStatus;
}
