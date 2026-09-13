import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaSocialRecommendationDocument =
  HydratedDocument<MediaSocialRecommendation>;

export enum MediaSocialRecommendationStatus {
  RECOMMENDED = 'recommended',
  FOLLOWED = 'followed',
  DISMISSED = 'dismissed',
}

export enum MediaSocialRecommendationPriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum MediaSocialRecommendationVerification {
  VERIFIED = 'verified',
  UNVERIFIED = 'unverified',
  MANUAL_REQUIRED = 'manual_required',
}

@Schema({ timestamps: true, collection: 'media_social_recommendations' })
export class MediaSocialRecommendation {
  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ required: true, trim: true, index: true }) identityKey: string;
  @Prop({ trim: true }) externalProfileId?: string;
  @Prop({ trim: true }) username?: string;
  @Prop({ required: true, trim: true }) displayName: string;
  @Prop({ trim: true }) profileUrl?: string;
  @Prop({ trim: true }) profileImageUrl?: string;
  @Prop({ required: true, trim: true }) category: string;
  @Prop({ required: true, trim: true }) whyFollow: string;
  @Prop({ required: true, trim: true }) whatToLearn: string;
  @Prop({ required: true, trim: true }) doNotImitate: string;
  @Prop({
    type: String,
    enum: MediaSocialRecommendationPriority,
    default: MediaSocialRecommendationPriority.MEDIUM,
    index: true,
  })
  priority: MediaSocialRecommendationPriority;
  @Prop({
    type: String,
    enum: MediaSocialRecommendationStatus,
    default: MediaSocialRecommendationStatus.RECOMMENDED,
    index: true,
  })
  status: MediaSocialRecommendationStatus;
  @Prop({
    type: String,
    enum: MediaSocialRecommendationVerification,
    default: MediaSocialRecommendationVerification.UNVERIFIED,
  })
  verification: MediaSocialRecommendationVerification;
  @Prop({ trim: true }) verificationNote?: string;
  @Prop({ trim: true }) source?: string;
  @Prop() firstRecommendedAt: Date;
  @Prop() lastRecommendedAt: Date;
  @Prop() actedAt?: Date;
  @Prop({ type: SchemaTypes.Mixed, default: {} }) metadata: Record<
    string,
    unknown
  >;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export const MediaSocialRecommendationSchema = SchemaFactory.createForClass(
  MediaSocialRecommendation,
);

MediaSocialRecommendationSchema.index(
  { platform: 1, identityKey: 1 },
  { unique: true },
);
MediaSocialRecommendationSchema.index({
  status: 1,
  priority: 1,
  lastRecommendedAt: -1,
});
