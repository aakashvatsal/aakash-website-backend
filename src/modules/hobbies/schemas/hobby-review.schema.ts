import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HobbyReviewDocument = HydratedDocument<HobbyReview>;

export enum HobbyReviewPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum HobbyCurriculumRecommendation {
  HOLD = 'hold',
  ADVANCE = 'advance',
  SIMPLIFY = 'simplify',
  MAINTENANCE = 'maintenance',
}

@Schema({ _id: false })
export class HobbyReviewMetrics {
  @Prop({ min: 0, default: 0 })
  practiceMinutes: number;

  @Prop({ min: 0, default: 0 })
  sessions: number;

  @Prop({ min: 0, default: 0 })
  targetMinutes: number;

  @Prop({ min: 0, default: 0 })
  targetSessions: number;

  @Prop({ min: 0, max: 100, default: 0 })
  minutesAdherence: number;

  @Prop({ min: 0, max: 100, default: 0 })
  sessionAdherence: number;

  @Prop({ min: 0, max: 5 })
  averageDifficulty?: number;

  @Prop({ min: 0, max: 5 })
  averageEnjoyment?: number;

  @Prop({ min: 0, default: 0 })
  evidenceCount: number;
}

export const HobbyReviewMetricsSchema =
  SchemaFactory.createForClass(HobbyReviewMetrics);

@Schema({ _id: false })
export class HobbyReviewPlanItem {
  @Prop({ required: true, trim: true, maxlength: 1000 })
  focus: string;

  @Prop({ min: 5, max: 180, required: true })
  minutes: number;

  @Prop({ trim: true, maxlength: 1000 })
  reason?: string;
}

export const HobbyReviewPlanItemSchema =
  SchemaFactory.createForClass(HobbyReviewPlanItem);

@Schema({ _id: false })
export class HobbyEvidenceComparison {
  @Prop({ trim: true, maxlength: 2500 })
  summary?: string;

  @Prop({ type: [String], default: [] })
  observedChanges: string[];

  @Prop({ type: [String], default: [] })
  evidenceTypes: string[];

  @Prop({ default: false })
  requiresMultimodalReview: boolean;

  @Prop({ trim: true, maxlength: 1200 })
  limitation?: string;
}

export const HobbyEvidenceComparisonSchema = SchemaFactory.createForClass(
  HobbyEvidenceComparison,
);

@Schema({ timestamps: true, collection: 'hobby_reviews' })
export class HobbyReview {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Hobby',
    required: true,
    index: true,
  })
  hobbyId: Types.ObjectId;

  @Prop({ type: String, enum: HobbyReviewPeriod, required: true, index: true })
  period: HobbyReviewPeriod;

  @Prop({ required: true, index: true })
  periodStart: Date;

  @Prop({ required: true })
  periodEnd: Date;

  @Prop({ trim: true })
  stageKey?: string;

  @Prop({ type: HobbyReviewMetricsSchema, required: true })
  metrics: HobbyReviewMetrics;

  @Prop({ required: true, trim: true, maxlength: 3000 })
  summary: string;

  @Prop({ type: [String], default: [] })
  wins: string[];

  @Prop({ type: [String], default: [] })
  stuckPoints: string[];

  @Prop({ type: [String], default: [] })
  coachingNotes: string[];

  @Prop({ trim: true, maxlength: 1800 })
  nextFocus?: string;

  @Prop({ min: 0, max: 3000 })
  suggestedWeeklyMinutes?: number;

  @Prop({ min: 0, max: 14 })
  suggestedSessions?: number;

  @Prop({ min: 0, max: 300 })
  suggestedSessionMinutes?: number;

  @Prop({
    type: String,
    enum: HobbyCurriculumRecommendation,
    default: HobbyCurriculumRecommendation.HOLD,
  })
  curriculumRecommendation: HobbyCurriculumRecommendation;

  @Prop({ type: [HobbyReviewPlanItemSchema], default: [] })
  nextPlan: HobbyReviewPlanItem[];

  @Prop({ type: [String], default: [] })
  resourceSearchTerms: string[];

  @Prop({ type: HobbyEvidenceComparisonSchema, default: undefined })
  evidenceComparison?: HobbyEvidenceComparison;

  @Prop({ trim: true })
  model?: string;

  @Prop({ trim: true })
  responseId?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  usage: Record<string, unknown>;

  @Prop({ default: true })
  isActive: boolean;
}

export const HobbyReviewSchema = SchemaFactory.createForClass(HobbyReview);

HobbyReviewSchema.index(
  { hobbyId: 1, period: 1, periodStart: 1 },
  { unique: true },
);
HobbyReviewSchema.index({ hobbyId: 1, periodStart: -1 });
