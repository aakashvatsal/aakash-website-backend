import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaLaunchStateDocument = HydratedDocument<MediaLaunchState>;

export enum MediaLaunchStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
}

export enum MediaLaunchPhase {
  DAYS_1_30_EXPLORATION = 'days_1_30_exploration',
  DAYS_31_90_PATTERN_DISCOVERY = 'days_31_90_pattern_discovery',
  DAY_91_PLUS_COMPOUNDING = 'day_91_plus_compounding',
}

@Schema({ _id: false })
export class MediaLaunchProfilePlan {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;

  @Prop({ required: true, trim: true })
  objective: string;

  @Prop({ trim: true, default: '' })
  headline: string;

  @Prop({ trim: true, default: '' })
  bio: string;

  @Prop({ trim: true, default: '' })
  linkStrategy: string;

  @Prop({ trim: true, default: '' })
  profileImageGuidance: string;

  @Prop({ trim: true, default: '' })
  bannerGuidance: string;

  @Prop({ type: [String], default: [] })
  pinnedOrFeatured: string[];

  @Prop({ type: [String], default: [] })
  setupChecklist: string[];

  @Prop({ default: false })
  applied: boolean;

  @Prop()
  appliedAt?: Date;
}
export const MediaLaunchProfilePlanSchema = SchemaFactory.createForClass(
  MediaLaunchProfilePlan,
);

@Schema({ _id: false })
export class MediaLaunchExperimentPolicy {
  @Prop({ required: true, min: 0, max: 100 })
  experimentSharePercent: number;

  @Prop({ required: true, min: 1, max: 20 })
  minimumSamplesBeforeConclusion: number;

  @Prop({ required: true, min: 1, max: 10 })
  minimumDistinctFormatsPerWeek: number;

  @Prop({ required: true, min: 1, max: 10 })
  minimumDistinctNarrativesPerWeek: number;

  @Prop({ default: true })
  preserveVoiceOverOptimization: boolean;

  @Prop({ default: true })
  avoidEarlyWinnerLockIn: boolean;
}
export const MediaLaunchExperimentPolicySchema = SchemaFactory.createForClass(
  MediaLaunchExperimentPolicy,
);

@Schema({ timestamps: true, collection: 'media_launch_states' })
export class MediaLaunchState {
  @Prop({ required: true, default: 'primary', unique: true, index: true })
  key: string;

  @Prop({
    type: String,
    enum: MediaLaunchStatus,
    default: MediaLaunchStatus.DRAFT,
  })
  status: MediaLaunchStatus;

  @Prop({ required: true })
  startedAt: Date;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ type: [MediaLaunchProfilePlanSchema], default: [] })
  profilePlans: MediaLaunchProfilePlan[];

  @Prop({ type: MediaLaunchExperimentPolicySchema, required: true })
  experimentPolicy: MediaLaunchExperimentPolicy;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ required: true, trim: true })
  strategyFingerprint: string;

  @Prop({ required: true, trim: true })
  voiceFingerprint: string;

  @Prop({ required: true, default: Date.now })
  generatedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaLaunchStateSchema =
  SchemaFactory.createForClass(MediaLaunchState);
MediaLaunchStateSchema.index({ startedAt: -1 });
