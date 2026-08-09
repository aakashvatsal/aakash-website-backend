import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type SkinReportDocument =
  HydratedDocument<SkinReport>;

export enum SkinReportType {
  WEEKLY = 'weekly',
  FORTNIGHTLY = 'fortnightly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom',
}

export enum SkinTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export enum SkinRecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ _id: false })
export class SkinConcernSummary {
  @Prop({
    required: true,
    trim: true,
  })
  concern: string;

  @Prop({
    min: 0,
    max: 10,
  })
  startScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  endScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  averageScore?: number;

  @Prop({
    type: String,
    enum: SkinTrend,
    default: SkinTrend.INSUFFICIENT_DATA,
  })
  trend: SkinTrend;

  @Prop({
    trim: true,
  })
  interpretation?: string;
}

export const SkinConcernSummarySchema =
  SchemaFactory.createForClass(SkinConcernSummary);

@Schema({ _id: false })
export class SkinRecommendation {
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

  @Prop({
    type: String,
    enum: SkinRecommendationPriority,
    default: SkinRecommendationPriority.MEDIUM,
  })
  priority: SkinRecommendationPriority;

  @Prop({
    trim: true,
  })
  reason?: string;

  @Prop({
    type: [String],
    default: [],
  })
  basedOnConcerns: string[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'SkincareProduct',
    default: [],
  })
  relatedProductIds: Types.ObjectId[];

  @Prop({
    trim: true,
  })
  actionPlan?: string;

  @Prop()
  reviewAt?: Date;

  @Prop({
    default: false,
  })
  completed: boolean;

  @Prop()
  completedAt?: Date;

  @Prop({
    trim: true,
  })
  result?: string;
}

export const SkinRecommendationSchema =
  SchemaFactory.createForClass(SkinRecommendation);

@Schema({
  timestamps: true,
  collection: 'skin_reports',
})
export class SkinReport {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: SkinReportType,
    required: true,
  })
  reportType: SkinReportType;

  @Prop({
    required: true,
  })
  periodStart: Date;

  @Prop({
    required: true,
  })
  periodEnd: Date;

  @Prop({
    required: true,
    trim: true,
  })
  title: string;

  @Prop({
    trim: true,
  })
  executiveSummary?: string;

  @Prop({
    type: String,
    enum: SkinTrend,
    default: SkinTrend.INSUFFICIENT_DATA,
  })
  overallTrend: SkinTrend;

  @Prop({
    min: 0,
    max: 100,
  })
  overallSkinScore?: number;

  @Prop({
    min: 0,
    max: 100,
  })
  routineAdherencePercentage?: number;

  @Prop({
    type: [SkinConcernSummarySchema],
    default: [],
  })
  concernSummaries: SkinConcernSummary[];

  @Prop({
    type: [SkinRecommendationSchema],
    default: [],
  })
  recommendations: SkinRecommendation[];

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
    type: [String],
    default: [],
  })
  productsWithPositiveResponse: string[];

  @Prop({
    type: [String],
    default: [],
  })
  productsWithNegativeResponse: string[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'DailySkincareLog',
    default: [],
  })
  sourceLogIds: Types.ObjectId[];

  @Prop({
    type: [String],
    default: [],
  })
  progressPhotoUrls: string[];

  @Prop({
    trim: true,
  })
  nextPeriodFocus?: string;

  @Prop()
  nextReviewAt?: Date;

  @Prop({
    default: false,
  })
  dermatologistReviewRecommended: boolean;

  @Prop({
    trim: true,
  })
  dermatologistReviewReason?: string;

  @Prop({
    trim: true,
  })
  generatedBy?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  generationMetadata: Record<string, unknown>;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const SkinReportSchema =
  SchemaFactory.createForClass(SkinReport);

SkinReportSchema.index(
  {
    userId: 1,
    reportType: 1,
    periodStart: 1,
    periodEnd: 1,
  },
  {
    unique: true,
  },
);

SkinReportSchema.index({
  userId: 1,
  periodEnd: -1,
});