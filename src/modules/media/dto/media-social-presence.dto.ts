import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
} from "class-validator";

import { MediaPlatform } from "../schemas/media-post.schema";
import { MediaSocialRecommendationStatus } from "../schemas/media-social-recommendation.schema";

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

export class UpdateMediaSocialPinnedPublicationsDto {
  @IsEnum(MediaPlatform)
  platform: MediaPlatform;

  @IsArray()
  @ArrayMaxSize(5)
  @IsMongoId({ each: true })
  publicationIds: string[];
}
