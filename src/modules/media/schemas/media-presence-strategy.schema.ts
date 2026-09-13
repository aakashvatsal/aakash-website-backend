import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaPresenceStrategyDocument =
  HydratedDocument<MediaPresenceStrategy>;

@Schema({ _id: false })
export class MediaPresenceAudience {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  need: string;

  @Prop({ required: true, trim: true })
  desiredPerception: string;
}
export const MediaPresenceAudienceSchema = SchemaFactory.createForClass(
  MediaPresenceAudience,
);

@Schema({ _id: false })
export class MediaPresenceNarrative {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ required: true, min: 0, max: 100 })
  targetSharePercent: number;

  @Prop({ trim: true })
  companyName?: string;

  @Prop({ type: [String], default: [] })
  guardrails: string[];
}
export const MediaPresenceNarrativeSchema = SchemaFactory.createForClass(
  MediaPresenceNarrative,
);

@Schema({ _id: false })
export class MediaPresencePlatformRole {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;

  @Prop({ required: true, trim: true })
  role: string;

  @Prop({ required: true, trim: true })
  purpose: string;

  @Prop({ type: [String], enum: MediaPostType, default: [] })
  primaryFormats: MediaPostType[];

  @Prop({ required: true, min: 0, max: 30 })
  minPostsPerWeek: number;

  @Prop({ required: true, min: 0, max: 30 })
  preferredPostsPerWeek: number;

  @Prop({ required: true, min: 0, max: 50 })
  maxPostsPerWeek: number;

  @Prop({ default: true })
  allowSkipDays: boolean;
}
export const MediaPresencePlatformRoleSchema = SchemaFactory.createForClass(
  MediaPresencePlatformRole,
);

@Schema({ _id: false })
export class MediaPresenceCompanyBalance {
  @Prop({ required: true, trim: true })
  companyName: string;

  @Prop({ required: true, trim: true })
  narrativeRole: string;

  @Prop({ required: true, min: 0, max: 100 })
  targetSharePercent: number;

  @Prop({ type: [String], default: [] })
  guardrails: string[];
}
export const MediaPresenceCompanyBalanceSchema = SchemaFactory.createForClass(
  MediaPresenceCompanyBalance,
);

@Schema({ timestamps: true, collection: 'media_presence_strategies' })
export class MediaPresenceStrategy {
  @Prop({ required: true, default: 'primary', unique: true, index: true })
  key: string;

  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  @Prop({ required: true, trim: true })
  northStar: string;

  @Prop({ required: true, trim: true })
  positioning: string;

  @Prop({ type: [String], default: [] })
  knownFor: string[];

  @Prop({ type: [MediaPresenceAudienceSchema], default: [] })
  audiences: MediaPresenceAudience[];

  @Prop({ type: [MediaPresenceNarrativeSchema], default: [] })
  narratives: MediaPresenceNarrative[];

  @Prop({ type: [MediaPresencePlatformRoleSchema], default: [] })
  platformRoles: MediaPresencePlatformRole[];

  @Prop({ type: [MediaPresenceCompanyBalanceSchema], default: [] })
  companyBalance: MediaPresenceCompanyBalance[];

  @Prop({ type: [String], default: [] })
  thirtyDayObjectives: string[];

  @Prop({ type: [String], default: [] })
  ninetyDayObjectives: string[];

  @Prop({ type: [String], default: [] })
  reputationGoals: string[];

  @Prop({ type: [String], default: [] })
  neverBecome: string[];

  @Prop({ type: [String], default: [] })
  claimsRequiringReview: string[];

  @Prop({ type: [String], default: [] })
  privacyRules: string[];

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ required: true, trim: true })
  sourceFingerprint: string;

  @Prop({ required: true, default: Date.now })
  generatedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaPresenceStrategySchema = SchemaFactory.createForClass(
  MediaPresenceStrategy,
);
MediaPresenceStrategySchema.index({ generatedAt: -1 });
