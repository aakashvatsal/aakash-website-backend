import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { ProactiveReviewPeriod } from '../dto/proactive.dto';

export type ProactiveReviewDocument = HydratedDocument<ProactiveReview>;

export type ProactiveReviewItem = {
  title: string;
  detail: string;
  signalId?: string;
  citations: string[];
};

@Schema({ timestamps: true, collection: 'hsakaa_proactive_reviews' })
export class ProactiveReview {
  @Prop({ required: true, trim: true, unique: true, index: true })
  periodKey: string;

  @Prop({
    type: String,
    enum: ProactiveReviewPeriod,
    required: true,
    index: true,
  })
  period: ProactiveReviewPeriod;

  @Prop({ required: true, index: true })
  periodStart: Date;

  @Prop({ required: true, index: true })
  periodEnd: Date;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 6000 })
  summary: string;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  priorities: ProactiveReviewItem[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  wins: ProactiveReviewItem[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  patterns: ProactiveReviewItem[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  watchlist: ProactiveReviewItem[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  recommendations: ProactiveReviewItem[];

  @Prop({ type: [String], default: [] })
  signalIds: string[];

  @Prop({ type: [String], default: [] })
  evidenceCitationIds: string[];

  @Prop({
    trim: true,
    enum: ['draft', 'reviewed'],
    default: 'draft',
    index: true,
  })
  status: 'draft' | 'reviewed';

  @Prop({ index: true })
  reviewedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  ai: Record<string, unknown>;

  @Prop({ required: true, default: Date.now })
  generatedAt: Date;
}

export const ProactiveReviewSchema =
  SchemaFactory.createForClass(ProactiveReview);

ProactiveReviewSchema.index({ period: 1, periodStart: -1 });
