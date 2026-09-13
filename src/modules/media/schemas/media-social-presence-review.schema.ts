import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type MediaSocialPresenceReviewDocument =
  HydratedDocument<MediaSocialPresenceReview>;

@Schema({ timestamps: true, collection: 'media_social_presence_reviews' })
export class MediaSocialPresenceReview {
  @Prop({ required: true, index: true }) weekOf: Date;
  @Prop({ required: true }) generatedAt: Date;
  @Prop({ required: true, trim: true }) summary: string;
  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  platformReviews: Array<Record<string, unknown>>;
  @Prop({ type: [String], default: [] }) wins: string[];
  @Prop({ type: [String], default: [] }) changesRecommended: string[];
  @Prop({ type: [String], default: [] }) networkActions: string[];
  @Prop({ default: 0 }) profileChangesRecommended: number;
  @Prop({ default: 0 }) profilesKept: number;
  @Prop({ default: 0 }) recommendationsActive: number;
  @Prop({ type: SchemaTypes.Mixed, default: {} }) metadata: Record<
    string,
    unknown
  >;
}

export const MediaSocialPresenceReviewSchema = SchemaFactory.createForClass(
  MediaSocialPresenceReview,
);

MediaSocialPresenceReviewSchema.index({ weekOf: -1 }, { unique: true });
