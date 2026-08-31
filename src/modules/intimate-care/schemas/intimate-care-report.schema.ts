import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type IntimateCareReportDocument = HydratedDocument<IntimateCareReport>;

export enum IntimateCareReportType {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom',
}

export enum IntimateCareTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  INSUFFICIENT_DATA = 'insufficient_data',
}

@Schema({ _id: false })
export class IntimateCareRecommendation {
  @Prop({
    required: true,
    trim: true,
  })
  title: string;

  @Prop({
    required: true,
    trim: true,
  })
  recommendation: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({
    type: [String],
    default: [],
  })
  basedOnConcerns: string[];

  @Prop({ trim: true })
  actionPlan?: string;

  @Prop()
  reviewAt?: Date;

  @Prop({ default: false })
  completed: boolean;

  @Prop()
  completedAt?: Date;

  @Prop({ trim: true })
  result?: string;
}

export const IntimateCareRecommendationSchema = SchemaFactory.createForClass(
  IntimateCareRecommendation,
);

@Schema({
  timestamps: true,
  collection: 'intimate_care_reports',
})
export class IntimateCareReport {
  @Prop({
    type: String,
    enum: IntimateCareReportType,
    required: true,
  })
  reportType: IntimateCareReportType;

  @Prop({ required: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({
    required: true,
    trim: true,
  })
  title: string;

  @Prop({ trim: true })
  executiveSummary?: string;

  @Prop({
    type: String,
    enum: IntimateCareTrend,
    default: IntimateCareTrend.INSUFFICIENT_DATA,
  })
  overallTrend: IntimateCareTrend;

  @Prop({
    min: 0,
    max: 100,
  })
  adherencePercentage?: number;

  @Prop({
    type: [String],
    default: [],
  })
  improvements: string[];

  @Prop({
    type: [String],
    default: [],
  })
  concerns: string[];

  @Prop({
    type: [String],
    default: [],
  })
  possibleTriggers: string[];

  @Prop({
    type: [IntimateCareRecommendationSchema],
    default: [],
  })
  recommendations: IntimateCareRecommendation[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'DailyIntimateCareLog',
    default: [],
  })
  sourceLogIds: Types.ObjectId[];

  @Prop()
  nextReviewAt?: Date;

  @Prop({ default: false })
  professionalReviewRecommended: boolean;

  @Prop({ trim: true })
  professionalReviewReason?: string;

  @Prop({ trim: true })
  generatedBy?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  generationMetadata: Record<string, unknown>;

  @Prop({ default: true })
  isPrivate: boolean;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const IntimateCareReportSchema =
  SchemaFactory.createForClass(IntimateCareReport);

IntimateCareReportSchema.index(
  {
    reportType: 1,
    periodStart: 1,
    periodEnd: 1,
  },
  {
    unique: true,
  },
);
