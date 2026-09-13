import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HsakaaAiUsageDocument = HydratedDocument<HsakaaAiUsage>;

export enum HsakaaAiUsageFeature {
  CONTEXT_ANSWER = 'context_answer',
  PROACTIVE_SCAN = 'proactive_scan',
  PROACTIVE_REVIEW = 'proactive_review',
  SEARCH_INDEX_EMBEDDING = 'search_index_embedding',
  SEARCH_QUERY_EMBEDDING = 'search_query_embedding',
  HEALTH_PLANNER = 'health_planner',
}

export enum HsakaaAiUsageStatus {
  SUCCESS = 'success',
  FALLBACK = 'fallback',
  ERROR = 'error',
  BLOCKED = 'blocked',
}

export enum HsakaaAiUsageMeasurement {
  PROVIDER = 'provider',
  ESTIMATED = 'estimated',
  NONE = 'none',
}

@Schema({ timestamps: true, collection: 'hsakaa_ai_usage' })
export class HsakaaAiUsage {
  @Prop({ required: true, enum: HsakaaAiUsageFeature, index: true })
  feature: HsakaaAiUsageFeature;

  @Prop({ required: true, enum: HsakaaAiUsageStatus, index: true })
  status: HsakaaAiUsageStatus;

  @Prop({ required: true, enum: HsakaaAiUsageMeasurement })
  measurement: HsakaaAiUsageMeasurement;

  @Prop({ type: String, trim: true, default: null })
  aiModel?: string | null;

  @Prop({ type: String, trim: true, default: null })
  responseId?: string | null;

  @Prop({ required: true, min: 0, default: 0 })
  inputTokens: number;

  @Prop({ required: true, min: 0, default: 0 })
  outputTokens: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalTokens: number;

  @Prop({ type: Number, min: 0, default: null })
  estimatedCostUsd?: number | null;

  @Prop({ required: true, min: 0, default: 0 })
  durationMs: number;

  @Prop({ required: true, min: 1, default: 1 })
  requestUnits: number;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ type: String, trim: true, default: null })
  error?: string | null;

  @Prop({ required: true, index: true })
  occurredAt: Date;

  @Prop({ required: true })
  expiresAt: Date;
}

export const HsakaaAiUsageSchema = SchemaFactory.createForClass(HsakaaAiUsage);

HsakaaAiUsageSchema.index({ occurredAt: -1, feature: 1 });
HsakaaAiUsageSchema.index({ occurredAt: -1, status: 1 });
HsakaaAiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
