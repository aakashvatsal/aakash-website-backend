import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type HealthReportDocument =
  HydratedDocument<HealthReport>;

export enum HealthReportType {
  WEEKLY = 'weekly',
  FORTNIGHTLY = 'fortnightly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom',
}

export enum HealthTrend {
  IMPROVING = 'improving',
  STABLE = 'stable',
  DECLINING = 'declining',
  INSUFFICIENT_DATA = 'insufficient_data',
}

export enum HealthRecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum HealthReportStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  REVIEWED = 'reviewed',
}

@Schema({ _id: false })
export class HealthMetricSummary {
  @Prop({
    required: true,
    trim: true,
  })
  metric: string;

  @Prop({
    type: SchemaTypes.Mixed,
  })
  startValue?: string | number | boolean;

  @Prop({
    type: SchemaTypes.Mixed,
  })
  endValue?: string | number | boolean;

  @Prop({
    type: SchemaTypes.Mixed,
  })
  averageValue?: string | number;

  @Prop({
    type: SchemaTypes.Mixed,
  })
  minimumValue?: string | number;

  @Prop({
    type: SchemaTypes.Mixed,
  })
  maximumValue?: string | number;

  @Prop({
    type: String,
    enum: HealthTrend,
    default: HealthTrend.INSUFFICIENT_DATA,
  })
  trend: HealthTrend;

  @Prop({
    trim: true,
  })
  unit?: string;

  @Prop({
    trim: true,
  })
  interpretation?: string;
}

export const HealthMetricSummarySchema =
  SchemaFactory.createForClass(HealthMetricSummary);

@Schema({ _id: false })
export class HealthRecommendation {
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
    enum: HealthRecommendationPriority,
    default: HealthRecommendationPriority.MEDIUM,
  })
  priority: HealthRecommendationPriority;

  @Prop({
    trim: true,
  })
  reason?: string;

  @Prop({
    type: [String],
    default: [],
  })
  basedOnMetrics: string[];

  @Prop({
    trim: true,
  })
  expectedBenefit?: string;

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

export const HealthRecommendationSchema =
  SchemaFactory.createForClass(HealthRecommendation);

@Schema({ _id: false })
export class HealthReportSection {
  @Prop({
    required: true,
    trim: true,
  })
  category: string;

  @Prop({
    trim: true,
  })
  summary?: string;

  @Prop({
    type: String,
    enum: HealthTrend,
    default: HealthTrend.INSUFFICIENT_DATA,
  })
  trend: HealthTrend;

  @Prop({
    type: [String],
    default: [],
  })
  positives: string[];

  @Prop({
    type: [String],
    default: [],
  })
  concerns: string[];

  @Prop({
    type: [HealthMetricSummarySchema],
    default: [],
  })
  metrics: HealthMetricSummary[];
}

export const HealthReportSectionSchema =
  SchemaFactory.createForClass(HealthReportSection);

@Schema({ _id: false })
export class HealthReportSources {
  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'HealthEntry',
    default: [],
  })
  healthEntryIds: Types.ObjectId[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'DietEntry',
    default: [],
  })
  dietEntryIds: Types.ObjectId[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'DailySupplementLog',
    default: [],
  })
  supplementLogIds: Types.ObjectId[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'JournalEntry',
    default: [],
  })
  journalEntryIds: Types.ObjectId[];
}

export const HealthReportSourcesSchema =
  SchemaFactory.createForClass(HealthReportSources);

@Schema({
  timestamps: true,
  collection: 'health_reports',
})
export class HealthReport {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: HealthReportType,
    required: true,
    index: true,
  })
  reportType: HealthReportType;

  @Prop({
    required: true,
    index: true,
  })
  periodStart: Date;

  @Prop({
    required: true,
    index: true,
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
    enum: HealthTrend,
    default: HealthTrend.INSUFFICIENT_DATA,
  })
  overallTrend: HealthTrend;

  @Prop({
    min: 0,
    max: 100,
  })
  overallHealthScore?: number;

  @Prop({
    type: [HealthReportSectionSchema],
    default: [],
  })
  sections: HealthReportSection[];

  @Prop({
    type: [HealthRecommendationSchema],
    default: [],
  })
  recommendations: HealthRecommendation[];

  @Prop({
    type: [String],
    default: [],
  })
  achievements: string[];

  @Prop({
    type: [String],
    default: [],
  })
  risks: string[];

  @Prop({
    type: [String],
    default: [],
  })
  missingData: string[];

  @Prop({
    type: HealthReportSourcesSchema,
    default: () => ({}),
  })
  sources: HealthReportSources;

  @Prop({
    trim: true,
  })
  nextPeriodFocus?: string;

  @Prop()
  nextReviewAt?: Date;

  @Prop({
    type: String,
    enum: HealthReportStatus,
    default: HealthReportStatus.DRAFT,
  })
  status: HealthReportStatus;

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
  medicalReviewRecommended: boolean;

  @Prop({
    trim: true,
  })
  medicalReviewReason?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const HealthReportSchema =
  SchemaFactory.createForClass(HealthReport);

HealthReportSchema.index(
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

HealthReportSchema.index({
  userId: 1,
  periodEnd: -1,
  status: 1,
});