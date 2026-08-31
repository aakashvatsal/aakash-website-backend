import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaAutopilotRunDocument = HydratedDocument<MediaAutopilotRun>;
export type MediaAutopilotSettingsDocument =
  HydratedDocument<MediaAutopilotSettings>;

export enum MediaAutopilotRunType {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MANUAL = 'manual',
}

export enum MediaAutopilotRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

export enum MediaAutopilotRecommendationKind {
  CALENDAR_GAP = 'calendar_gap',
  PRODUCTION_GAP = 'production_gap',
  READY_UNSCHEDULED = 'ready_unscheduled',
  PUBLISHING_FAILURE = 'publishing_failure',
  MANUAL_PUBLISH = 'manual_publish',
  ENGAGEMENT = 'engagement',
  GROWTH_OPPORTUNITY = 'growth_opportunity',
  GROWTH_RISK = 'growth_risk',
  EXPERIMENT = 'experiment',
  ANALYTICS_GAP = 'analytics_gap',
  CONTENT_CANDIDATE = 'content_candidate',
}

export enum MediaAutopilotPriority {
  URGENT = 'urgent',
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum MediaAutopilotRecommendationStatus {
  OPEN = 'open',
  DISMISSED = 'dismissed',
  COMPLETED = 'completed',
}

@Schema({ _id: false })
export class MediaAutopilotRecommendation {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({
    type: String,
    enum: MediaAutopilotRecommendationKind,
    required: true,
  })
  kind: MediaAutopilotRecommendationKind;

  @Prop({ type: String, enum: MediaAutopilotPriority, required: true })
  priority: MediaAutopilotPriority;

  @Prop({ type: String, enum: MediaPlatform })
  platform?: MediaPlatform;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaAccount' })
  accountId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication' })
  publicationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaEngagementItem' })
  engagementId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaGenerationRun' })
  generationRunId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  evidence: string[];

  @Prop({ trim: true })
  recommendedAction?: string;

  @Prop({ trim: true })
  actionLabel?: string;

  @Prop()
  dueAt?: Date;

  @Prop({
    type: String,
    enum: MediaAutopilotRecommendationStatus,
    default: MediaAutopilotRecommendationStatus.OPEN,
  })
  status: MediaAutopilotRecommendationStatus;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

const MediaAutopilotRecommendationSchema = SchemaFactory.createForClass(
  MediaAutopilotRecommendation,
);

@Schema({ _id: false })
export class MediaAutopilotStrategyReview {
  @Prop({ trim: true })
  summary?: string;

  @Prop({ type: [String], default: [] })
  focusThisWeek: string[];

  @Prop({ type: [String], default: [] })
  avoidThisWeek: string[];

  @Prop({ type: [String], default: [] })
  experimentsToConsider: string[];

  @Prop({
    type: [
      {
        platform: { type: String, enum: MediaPlatform },
        priority: { type: String },
        reason: { type: String },
      },
    ],
    default: [],
  })
  platformPriorities: Array<{
    platform: MediaPlatform;
    priority: string;
    reason: string;
  }>;
}

const MediaAutopilotStrategyReviewSchema = SchemaFactory.createForClass(
  MediaAutopilotStrategyReview,
);

@Schema({ timestamps: true, collection: 'media_autopilot_runs' })
export class MediaAutopilotRun {
  @Prop({
    type: String,
    enum: MediaAutopilotRunType,
    required: true,
    index: true,
  })
  type: MediaAutopilotRunType;

  @Prop({
    type: String,
    enum: MediaAutopilotRunStatus,
    default: MediaAutopilotRunStatus.RUNNING,
    index: true,
  })
  status: MediaAutopilotRunStatus;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ required: true })
  windowStart: Date;

  @Prop({ required: true })
  windowEnd: Date;

  @Prop({ type: Object, default: {} })
  signals: Record<string, unknown>;

  @Prop({ type: [MediaAutopilotRecommendationSchema], default: [] })
  recommendations: MediaAutopilotRecommendation[];

  @Prop({ type: MediaAutopilotStrategyReviewSchema })
  strategyReview?: MediaAutopilotStrategyReview;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'MediaGenerationRun',
    default: [],
  })
  generatedDraftRunIds: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  runErrors: string[];

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaAutopilotRunSchema =
  SchemaFactory.createForClass(MediaAutopilotRun);

MediaAutopilotRunSchema.index({ type: 1, createdAt: -1 });
MediaAutopilotRunSchema.index({ status: 1, createdAt: -1 });

@Schema({ timestamps: true, collection: 'media_autopilot_settings' })
export class MediaAutopilotSettings {
  @Prop({ default: 'primary', unique: true, index: true })
  key: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ default: true })
  dailyEnabled: boolean;

  @Prop({ default: true })
  weeklyEnabled: boolean;

  @Prop({ default: true })
  autoDraftCalendarGaps: boolean;

  @Prop({ min: 7, max: 30, default: 7 })
  planningHorizonDays: number;

  @Prop({ min: 0, max: 10, default: 3 })
  maxDailyDraftRuns: number;

  @Prop({ min: 2, max: 8, default: 4 })
  candidateCount: number;

  @Prop({ default: 'Asia/Kolkata' })
  timezone: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const MediaAutopilotSettingsSchema = SchemaFactory.createForClass(
  MediaAutopilotSettings,
);
