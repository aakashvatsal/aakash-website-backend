import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MediaPlatform } from './media-post.schema';

export type MediaDailyExecutionDocument = HydratedDocument<MediaDailyExecution>;

export enum MediaExecutionKind {
  POST = 'post',
  PRODUCTION = 'production',
  ENGAGEMENT = 'engagement',
  MANUAL_PUBLISH = 'manual_publish',
  ANALYTICS_REVIEW = 'analytics_review',
  INBOUND_REPLY = 'inbound_reply',
}

export enum MediaExecutionStatus {
  PENDING = 'pending',
  DONE = 'done',
  MISSED = 'missed',
  BLOCKED = 'blocked',
  RESCHEDULED = 'rescheduled',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true, collection: 'media_daily_executions' })
export class MediaDailyExecution {
  @Prop({ required: true, unique: true, index: true, trim: true }) key: string;
  @Prop({ required: true, index: true, trim: true }) date: string;
  @Prop({ type: String, enum: MediaExecutionKind, required: true, index: true })
  kind: MediaExecutionKind;
  @Prop({
    type: String,
    enum: MediaExecutionStatus,
    required: true,
    default: MediaExecutionStatus.PENDING,
    index: true,
  })
  status: MediaExecutionStatus;
  @Prop({ type: String, enum: MediaPlatform }) platform?: MediaPlatform;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ trim: true }) time?: string;
  @Prop({ trim: true }) sourceKey?: string;
  @Prop({ trim: true }) sourceId?: string;
  @Prop({ min: 0, default: 0 }) plannedCount: number;
  @Prop({ min: 0, default: 0 }) completedCount: number;
  @Prop({ trim: true }) instruction?: string;
  @Prop({ trim: true }) notes?: string;
  @Prop({ trim: true }) blockedReason?: string;
  @Prop({ trim: true }) rescheduledTo?: string;
  @Prop() completedAt?: Date;
  @Prop({ default: true, index: true }) isActive: boolean;
}

export const MediaDailyExecutionSchema =
  SchemaFactory.createForClass(MediaDailyExecution);
MediaDailyExecutionSchema.index({ date: -1, status: 1 });
MediaDailyExecutionSchema.index({ platform: 1, date: -1 });
