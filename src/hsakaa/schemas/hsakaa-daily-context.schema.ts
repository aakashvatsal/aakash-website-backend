import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type HsakaaDailyContextDocument = HydratedDocument<HsakaaDailyContext>;

export enum HsakaaDailyContextPrivacy {
  PRIVATE_ONLY = 'private_only',
  INTERNAL_SAFE = 'internal_safe',
  PUBLIC_SAFE = 'public_safe',
  NEEDS_REVIEW = 'needs_review',
}

export enum HsakaaDailyContextSource {
  TASK = 'task',
  BRAIN_DUMP = 'brain_dump',
  JOURNAL = 'journal',
  LIBRARY = 'library',
  HIGHLIGHT = 'highlight',
  MEMORY = 'memory',
  DECISION = 'decision',
  HEALTH = 'health',
  MEDIA = 'media',
  PEOPLE = 'people',
  COMPANY = 'company',
  HSAKAA = 'hsakaa',
}

export interface HsakaaDailyPrivacyOverride {
  privacy: HsakaaDailyContextPrivacy;
  reason: string;
  reviewedAt: string;
}

export interface HsakaaDailyContextItem {
  id: string;
  source: HsakaaDailyContextSource;
  kind: string;
  title: string;
  summary: string;
  occurredAt: string;
  sourceId: string;
  privacy: HsakaaDailyContextPrivacy;
  defaultPrivacy: HsakaaDailyContextPrivacy;
  privacyOverride?: HsakaaDailyPrivacyOverride;
  significantChange: boolean;
  metadata: Record<string, unknown>;
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_daily_contexts',
})
export class HsakaaDailyContext {
  @Prop({ required: true, unique: true, index: true, trim: true })
  dateKey: string;

  @Prop({ required: true })
  dayStart: Date;

  @Prop({ required: true })
  dayEnd: Date;

  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  @Prop({ required: true, default: Date.now })
  capturedAt: Date;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  items: HsakaaDailyContextItem[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  changes: HsakaaDailyContextItem[];

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  sourceCounts: Record<string, number>;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  privacyCounts: Record<string, number>;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  privacyOverrides: Record<string, HsakaaDailyPrivacyOverride>;

  @Prop({ required: true, default: 1, min: 1 })
  privacyVersion: number;

  @Prop({ required: true, default: 'clear', enum: ['clear', 'needs_review'] })
  privacyReviewStatus: 'clear' | 'needs_review';

  @Prop({ required: true, default: '' })
  publicSourceFingerprint: string;
}

export const HsakaaDailyContextSchema =
  SchemaFactory.createForClass(HsakaaDailyContext);

HsakaaDailyContextSchema.index({ capturedAt: -1 });
