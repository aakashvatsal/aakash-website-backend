import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthPlanReviewDocument = HydratedDocument<HealthPlanReview>;

export enum HealthPlanReviewPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Schema({ timestamps: true, collection: 'health_plan_reviews' })
export class HealthPlanReview {
  @Prop({
    required: true,
    type: String,
    enum: HealthPlanReviewPeriod,
    index: true,
  })
  periodType: HealthPlanReviewPeriod;

  @Prop({ required: true, trim: true, index: true })
  periodKey: string;

  @Prop({ required: true, trim: true })
  startDateKey: string;

  @Prop({ required: true, trim: true })
  endDateKey: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  wins: string[];

  @Prop({ type: [String], default: [] })
  misses: string[];

  @Prop({ type: [String], default: [] })
  blockers: string[];

  @Prop({ type: [String], default: [] })
  recommendedChanges: string[];

  @Prop({ type: [String], default: [] })
  targetProgress: string[];

  @Prop({ type: [String], default: [] })
  safetyFlags: string[];

  @Prop({ type: [String], default: [] })
  nextActions: string[];

  @Prop({ required: true, trim: true })
  evidenceHash: string;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ required: true, trim: true })
  aiResponseId: string;

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({ min: 1, default: 1 })
  version: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthPlanReviewSchema =
  SchemaFactory.createForClass(HealthPlanReview);
HealthPlanReviewSchema.index({ periodType: 1, periodKey: 1 }, { unique: true });
HealthPlanReviewSchema.index({ generatedAt: -1 });
