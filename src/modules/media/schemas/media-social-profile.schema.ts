import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaSocialProfileDocument = HydratedDocument<MediaSocialProfile>;

export enum MediaSocialProfileSyncStatus {
  SYNCED = 'synced',
  NOT_CONFIGURED = 'not_configured',
  NOT_SUPPORTED = 'not_supported',
  ERROR = 'error',
}

@Schema({ timestamps: true, collection: 'media_social_profiles' })
export class MediaSocialProfile {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ trim: true }) externalAccountId?: string;
  @Prop({ trim: true }) displayName?: string;
  @Prop({ trim: true }) username?: string;
  @Prop({ trim: true }) headline?: string;
  @Prop({ trim: true }) bio?: string;
  @Prop({ trim: true }) profileUrl?: string;
  @Prop({ trim: true }) profileImageUrl?: string;
  @Prop({ trim: true }) bannerUrl?: string;
  @Prop({ trim: true }) websiteUrl?: string;
  @Prop() followerCount?: number;
  @Prop() followingCount?: number;
  @Prop() mediaCount?: number;
  @Prop() verified?: boolean;

  @Prop({
    type: String,
    enum: MediaSocialProfileSyncStatus,
    default: MediaSocialProfileSyncStatus.NOT_CONFIGURED,
    index: true,
  })
  syncStatus: MediaSocialProfileSyncStatus;

  @Prop({ trim: true }) syncNote?: string;
  @Prop() syncedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true }) isActive: boolean;
}

export const MediaSocialProfileSchema =
  SchemaFactory.createForClass(MediaSocialProfile);

MediaSocialProfileSchema.index({ accountId: 1 }, { unique: true });
MediaSocialProfileSchema.index({ platform: 1, syncedAt: -1 });
