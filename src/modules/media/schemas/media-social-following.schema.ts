import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaSocialFollowingDocument =
  HydratedDocument<MediaSocialFollowing>;

@Schema({ timestamps: true, collection: 'media_social_following' })
export class MediaSocialFollowing {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  accountId: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ required: true, trim: true }) identityKey: string;
  @Prop({ trim: true }) externalProfileId?: string;
  @Prop({ trim: true }) username?: string;
  @Prop({ trim: true }) displayName?: string;
  @Prop({ trim: true }) profileUrl?: string;
  @Prop({ trim: true }) profileImageUrl?: string;
  @Prop({ default: 'native_api', trim: true }) source: string;
  @Prop() observedAt: Date;
  @Prop({ default: true, index: true }) isActive: boolean;
  @Prop({ type: SchemaTypes.Mixed, default: {} }) metadata: Record<
    string,
    unknown
  >;
}

export const MediaSocialFollowingSchema =
  SchemaFactory.createForClass(MediaSocialFollowing);

MediaSocialFollowingSchema.index(
  { accountId: 1, identityKey: 1 },
  { unique: true },
);
MediaSocialFollowingSchema.index({ platform: 1, observedAt: -1 });
