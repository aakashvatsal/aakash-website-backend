import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { MediaPlatform } from '../schemas/media-post.schema';
import { MediaSocialRecommendationStatus } from '../schemas/media-social-recommendation.schema';

export class SyncMediaSocialProfileDto {
  @IsOptional()
  @IsBoolean()
  syncNetwork?: boolean;
}

export class RefreshMediaSocialRecommendationsDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class UpdateMediaSocialRecommendationDto {
  @IsEnum(MediaSocialRecommendationStatus)
  status: MediaSocialRecommendationStatus;
}

export class RunMediaSocialPresenceReviewDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class MediaSocialPlatformDto {
  @IsEnum(MediaPlatform)
  platform: MediaPlatform;
}
