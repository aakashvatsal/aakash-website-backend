import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaGrowthLearningDocument = HydratedDocument<MediaGrowthLearning>;

export enum MediaGrowthDimension {
  PLATFORM = 'platform',
  FORMAT = 'format',
  CONTENT_PILLAR = 'content_pillar',
  HOOK_ARCHETYPE = 'hook_archetype',
  CTA_ARCHETYPE = 'cta_archetype',
  PUBLISH_HOUR = 'publish_hour',
  PUBLISH_WEEKDAY = 'publish_weekday',
  ORIGIN = 'origin',
}

export enum MediaGrowthLearningDirection {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
}

@Schema({ timestamps: true, collection: 'media_growth_learnings' })
export class MediaGrowthLearning {
  @Prop({
    type: String,
    enum: MediaGrowthDimension,
    required: true,
    index: true,
  })
  dimension: MediaGrowthDimension;

  @Prop({ required: true, trim: true, index: true })
  value: string;

  @Prop({ type: String, enum: MediaPlatform, index: true })
  platform?: MediaPlatform;

  @Prop({ min: 1, required: true })
  sampleSize: number;

  @Prop({ min: 0, max: 100, required: true })
  confidence: number;

  @Prop({ min: -1000, max: 1000, default: 0 })
  liftPercent: number;

  @Prop({ min: 0, max: 100, default: 0 })
  averagePerformanceScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  baselinePerformanceScore: number;

  @Prop({
    type: String,
    enum: MediaGrowthLearningDirection,
    default: MediaGrowthLearningDirection.NEUTRAL,
    index: true,
  })
  direction: MediaGrowthLearningDirection;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ trim: true })
  recommendedAction?: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'MediaPublication', default: [] })
  evidencePublicationIds: Types.ObjectId[];

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  generatedAt: Date;
}

export const MediaGrowthLearningSchema =
  SchemaFactory.createForClass(MediaGrowthLearning);

MediaGrowthLearningSchema.index({
  platform: 1,
  dimension: 1,
  value: 1,
  isActive: 1,
});
MediaGrowthLearningSchema.index({
  direction: 1,
  confidence: -1,
  liftPercent: -1,
});
