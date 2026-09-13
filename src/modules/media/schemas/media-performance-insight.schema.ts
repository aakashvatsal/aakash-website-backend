import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MEDIA_PUBLIC_IDENTITY_PILLARS } from '../media-public-identity';
import type { MediaPublicIdentityPillar } from '../media-public-identity';
import { MetricSnapshotPeriod } from './media-metric-snapshot.schema';
import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaPerformanceInsightDocument =
  HydratedDocument<MediaPerformanceInsight>;

@Schema({ timestamps: true, collection: 'media_performance_insights' })
export class MediaPerformanceInsight {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaPublication',
    required: true,
    unique: true,
    index: true,
  })
  publicationId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaContentItem', index: true })
  contentItemId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ type: String, enum: MediaPostType, required: true, index: true })
  format: MediaPostType;

  @Prop({ type: String, enum: MetricSnapshotPeriod, required: true })
  period: MetricSnapshotPeriod;

  @Prop({ min: 0, max: 100, default: 0 })
  percentile: number;

  @Prop({ min: 0, max: 100, default: 0 })
  confidence: number;

  @Prop({
    type: String,
    enum: MEDIA_PUBLIC_IDENTITY_PILLARS,
    default: 'ideas_thinking',
    index: true,
  })
  identityPillar: MediaPublicIdentityPillar;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  publicFigureSignals: {
    reach: number;
    authority: number;
    affinity: number;
    engagement: number;
  };

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ required: true, trim: true })
  whyItWorked: string;

  @Prop({ required: true, trim: true })
  whatLimitedIt: string;

  @Prop({ type: [String], default: [] })
  doMore: string[];

  @Prop({ type: [String], default: [] })
  doLess: string[];

  @Prop({ required: true, trim: true })
  nextExperiment: string;

  @Prop({ type: [String], default: [] })
  mechanisms: string[];

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  evidence: Record<string, unknown>;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ required: true, default: Date.now, index: true })
  generatedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaPerformanceInsightSchema = SchemaFactory.createForClass(
  MediaPerformanceInsight,
);
MediaPerformanceInsightSchema.index({
  platform: 1,
  format: 1,
  generatedAt: -1,
});
MediaPerformanceInsightSchema.index({ percentile: -1, confidence: -1 });
