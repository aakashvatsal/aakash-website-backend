import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaMetricSnapshotDocument = HydratedDocument<MediaMetricSnapshot>;

export enum MetricSnapshotPeriod {
  ONE_HOUR = '1_hour',
  TWENTY_FOUR_HOURS = '24_hours',
  SEVENTY_TWO_HOURS = '72_hours',
  SEVEN_DAYS = '7_days',
  THIRTY_DAYS = '30_days',
  LATEST = 'latest',
}

export enum MediaAnalyticsSource {
  DIRECT_PLATFORM = 'direct_platform',
  MANUAL = 'manual',
  LEGACY = 'legacy',
}

@Schema({
  timestamps: true,
  collection: 'media_metric_snapshots',
})
export class MediaMetricSnapshot {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  mediaPublicationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPost', index: true })
  mediaPostId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaAccount', index: true })
  accountId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ type: String, enum: MediaPostType, index: true })
  format?: MediaPostType;

  @Prop({ required: true, index: true })
  capturedAt: Date;

  @Prop({
    type: String,
    enum: MetricSnapshotPeriod,
    default: MetricSnapshotPeriod.LATEST,
    index: true,
  })
  period: MetricSnapshotPeriod;

  @Prop({
    type: String,
    enum: MediaAnalyticsSource,
    default: MediaAnalyticsSource.DIRECT_PLATFORM,
  })
  source: MediaAnalyticsSource;

  @Prop({ min: 0, default: 0 }) impressions: number;
  @Prop({ min: 0, default: 0 }) reach: number;
  @Prop({ min: 0, default: 0 }) views: number;
  @Prop({ min: 0, default: 0 }) engagedViews: number;
  @Prop({ min: 0, default: 0 }) likes: number;
  @Prop({ min: 0, default: 0 }) comments: number;
  @Prop({ min: 0, default: 0 }) shares: number;
  @Prop({ min: 0, default: 0 }) saves: number;
  @Prop({ min: 0, default: 0 }) sends: number;
  @Prop({ min: 0, default: 0 }) clicks: number;
  @Prop({ min: 0, default: 0 }) profileVisits: number;
  @Prop({ min: 0, default: 0 }) followersGained: number;
  @Prop({ min: 0, default: 0 }) followersLost: number;
  @Prop({ min: 0, default: 0 }) leadsGenerated: number;
  @Prop({ min: 0, default: 0 }) conversions: number;
  @Prop({ min: 0, default: 0 }) watchTimeSeconds: number;
  @Prop({ min: 0, default: 0 }) averageViewDurationSeconds: number;

  @Prop({ min: 0, max: 100 })
  averageWatchPercentage?: number;

  @Prop({ min: 0, default: 0 })
  engagementRate: number;

  @Prop({ min: 0, default: 0 })
  shareSaveRate: number;

  @Prop({ min: 0, default: 0 })
  followerConversionRate: number;

  @Prop({ min: 0, max: 100, default: 0 })
  performanceScore: number;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  rawMetrics: Record<string, unknown>;
}

export const MediaMetricSnapshotSchema =
  SchemaFactory.createForClass(MediaMetricSnapshot);

MediaMetricSnapshotSchema.index({ mediaPublicationId: 1, capturedAt: -1 });
MediaMetricSnapshotSchema.index({ mediaPostId: 1, capturedAt: -1 });
MediaMetricSnapshotSchema.index({ accountId: 1, capturedAt: -1 });
MediaMetricSnapshotSchema.index(
  { mediaPublicationId: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: {
      mediaPublicationId: { $type: 'objectId' },
    },
  },
);
MediaMetricSnapshotSchema.index(
  { mediaPostId: 1, period: 1 },
  {
    unique: true,
    partialFilterExpression: {
      mediaPostId: { $type: 'objectId' },
    },
  },
);
