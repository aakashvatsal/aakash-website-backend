import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaGrowthExperimentDocument =
  HydratedDocument<MediaGrowthExperiment>;

export enum MediaGrowthExperimentStatus {
  PLANNED = 'planned',
  RUNNING = 'running',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'media_growth_experiments' })
export class MediaGrowthExperiment {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  hypothesis: string;

  @Prop({ type: String, enum: MediaPlatform, index: true })
  platform?: MediaPlatform;

  @Prop({ required: true, trim: true })
  variable: string;

  @Prop({ required: true, trim: true })
  control: string;

  @Prop({ required: true, trim: true })
  variant: string;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'MediaPublication', default: [] })
  controlPublicationIds: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'MediaPublication', default: [] })
  variantPublicationIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: MediaGrowthExperimentStatus,
    default: MediaGrowthExperimentStatus.PLANNED,
    index: true,
  })
  status: MediaGrowthExperimentStatus;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ trim: true })
  winner?: 'control' | 'variant' | 'inconclusive';

  @Prop({ min: -1000, max: 1000 })
  liftPercent?: number;

  @Prop({ trim: true })
  resultSummary?: string;

  @Prop({ trim: true })
  nextAction?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaGrowthExperimentSchema = SchemaFactory.createForClass(
  MediaGrowthExperiment,
);

MediaGrowthExperimentSchema.index({ status: 1, createdAt: -1 });
MediaGrowthExperimentSchema.index({ platform: 1, status: 1, createdAt: -1 });
