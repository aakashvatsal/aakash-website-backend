import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaAudienceInsightDocument =
  HydratedDocument<MediaAudienceInsight>;

export enum MediaAudienceSignalType {
  QUESTION = 'question',
  OBJECTION = 'objection',
  AGREEMENT = 'agreement',
  PROBLEM = 'problem',
  LEAD = 'lead',
  COLLABORATION = 'collaboration',
  LANGUAGE = 'language',
  CONTENT_REQUEST = 'content_request',
}

@Schema({ timestamps: true, collection: 'media_audience_insights' })
export class MediaAudienceInsight {
  @Prop({ required: true, trim: true, index: true })
  key: string;

  @Prop({
    type: String,
    enum: MediaAudienceSignalType,
    required: true,
    index: true,
  })
  type: MediaAudienceSignalType;

  @Prop({ required: true, trim: true })
  topic: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ type: [String], enum: MediaPlatform, default: [] })
  platforms: MediaPlatform[];

  @Prop({ min: 1, required: true })
  occurrences: number;

  @Prop({ min: 0, max: 100, default: 0 })
  confidence: number;

  @Prop({ type: [String], default: [] })
  examples: string[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'MediaEngagementItem',
    default: [],
  })
  engagementIds: Types.ObjectId[];

  @Prop({ required: true, trim: true })
  recommendedContentAngle: string;

  @Prop({ type: [String], default: [] })
  recommendedPlatforms: string[];

  @Prop({ default: false, index: true })
  highIntent: boolean;

  @Prop({ required: true, default: Date.now, index: true })
  generatedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaAudienceInsightSchema =
  SchemaFactory.createForClass(MediaAudienceInsight);
MediaAudienceInsightSchema.index({ type: 1, confidence: -1, occurrences: -1 });
