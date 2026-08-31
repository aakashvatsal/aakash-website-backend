import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HairReportDocument = HydratedDocument<HairReport>;

export enum HairReportType {
  WEEKLY = 'weekly',
  FORTNIGHTLY = 'fortnightly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom',
}

export enum HairTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export enum HairRecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Schema({ _id: false })
export class HairConcernSummary {
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
    enum: HairTrend,
    default: HairTrend.INSUFFICIENT_DATA,
  })
  trend: HairTrend;

  @Prop({
    trim: true,
  })
  interpretation?: string;
}

export const HairConcernSummarySchema =
  SchemaFactory.createForClass(HairConcernSummary);

@Schema({ _id: false })
export class HairRecommendation {
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
    enum: HairRecommendationPriority,
    default: HairRecommendationPriority.MEDIUM,
  })
  priority: HairRecommendationPriority;

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
    ref: 'HaircareProduct',
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

export const HairRecommendationSchema =
  SchemaFactory.createForClass(HairRecommendation);

@Schema({
  timestamps: true,
  collection: 'hair_reports',
})
export class HairReport {
  @Prop({
    type: String,
    enum: HairReportType,
    required: true,
    index: true,
  })
  reportType: HairReportType;

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
    enum: HairTrend,
    default: HairTrend.INSUFFICIENT_DATA,
  })
  overallTrend: HairTrend;

  @Prop({
    min: 0,
    max: 100,
  })
  overallHairScore?: number;

  @Prop({
    min: 0,
    max: 100,
  })
  routineAdherencePercentage?: number;

  @Prop({
    min: 0,
  })
  averageEstimatedHairFall?: number;

  @Prop({
    type: [HairConcernSummarySchema],
    default: [],
  })
  concernSummaries: HairConcernSummary[];

  @Prop({
    type: [HairRecommendationSchema],
    default: [],
  })
  recommendations: HairRecommendation[];

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
    ref: 'DailyHaircareLog',
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

export const HairReportSchema = SchemaFactory.createForClass(HairReport);

HairReportSchema.index(
  {
    reportType: 1,
    periodStart: 1,
    periodEnd: 1,
  },
  {
    unique: true,
  },
);

HairReportSchema.index({
  periodEnd: -1,
});
