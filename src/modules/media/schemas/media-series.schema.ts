import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MediaSeriesDocument = HydratedDocument<MediaSeries>;
@Schema({ timestamps: true, collection: 'media_series' })
export class MediaSeries {
  @Prop({ required: true, unique: true, trim: true }) key: string;
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: String, enum: ['active', 'paused', 'retired'], default: 'paused', index: true }) status: 'active' | 'paused' | 'retired';
  @Prop({ type: [String], default: [] }) channels: string[];
  @Prop({ trim: true }) angle?: string;
  @Prop({ trim: true }) audience?: string;
  @Prop({ type: Object, default: {} }) creativeKit?: Record<string, unknown>;
  @Prop({ type: Object, default: {} }) designReview?: Record<string, unknown>;
  @Prop({ type: String, enum: ['owner', 'seed', 'ai-suggested'], default: 'seed' }) createdFrom?: 'owner' | 'seed' | 'ai-suggested';
  @Prop({ type: Date }) activatedAt?: Date;
  @Prop({ type: Date }) retiredAt?: Date;
  @Prop({ type: String }) rationale?: string;
}
export const MediaSeriesSchema = SchemaFactory.createForClass(MediaSeries);
