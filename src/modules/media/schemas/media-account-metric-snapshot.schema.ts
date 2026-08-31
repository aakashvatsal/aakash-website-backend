import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaAccountMetricSnapshotDocument =
  HydratedDocument<MediaAccountMetricSnapshot>;

@Schema({ timestamps: true, collection: 'media_account_metric_snapshots' })
export class MediaAccountMetricSnapshot {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaAccount',
    required: true,
    index: true,
  })
  accountId: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ required: true, index: true })
  capturedAt: Date;

  @Prop({ min: 0, default: 0 }) followers: number;
  @Prop({ min: 0, default: 0 }) subscribers: number;
  @Prop({ min: 0, default: 0 }) profileViews: number;
  @Prop({ min: 0, default: 0 }) impressions: number;
  @Prop({ min: 0, default: 0 }) reach: number;
  @Prop({ min: 0, default: 0 }) views: number;
  @Prop({ min: 0, default: 0 }) websiteClicks: number;
  @Prop({ min: 0, default: 0 }) leads: number;

  @Prop({ trim: true, default: 'manual_or_connector' })
  source: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  rawMetrics: Record<string, unknown>;
}

export const MediaAccountMetricSnapshotSchema = SchemaFactory.createForClass(
  MediaAccountMetricSnapshot,
);

MediaAccountMetricSnapshotSchema.index({ accountId: 1, capturedAt: -1 });
MediaAccountMetricSnapshotSchema.index(
  { accountId: 1, capturedAt: 1 },
  { unique: true },
);
