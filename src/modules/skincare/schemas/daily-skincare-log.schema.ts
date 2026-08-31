import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import {
  SkincareApplicationArea,
  SkincareTimeOfDay,
} from './skincare-product.schema';

export type DailySkincareLogDocument = HydratedDocument<DailySkincareLog>;

export enum SkincareLogStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  PARTIAL = 'partial',
  MISSED = 'missed',
  SKIPPED = 'skipped',
}

export enum SkinConditionLevel {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

export enum SkinReactionType {
  NONE = 'none',
  DRYNESS = 'dryness',
  REDNESS = 'redness',
  ITCHING = 'itching',
  BURNING = 'burning',
  PEELING = 'peeling',
  BREAKOUT = 'breakout',
  SWELLING = 'swelling',
  IRRITATION = 'irritation',
  OTHER = 'other',
}

@Schema({ _id: false })
export class SkincareRoutineItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'SkincareProduct',
    required: true,
  })
  productId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  productName: string;

  @Prop({
    required: true,
    trim: true,
  })
  category: string;

  @Prop({
    type: String,
    enum: SkincareTimeOfDay,
    required: true,
  })
  timeOfDay: SkincareTimeOfDay;

  @Prop({
    type: [String],
    enum: SkincareApplicationArea,
    default: [],
  })
  applicationAreas: SkincareApplicationArea[];

  @Prop({
    type: String,
    enum: SkincareLogStatus,
    default: SkincareLogStatus.PENDING,
  })
  status: SkincareLogStatus;

  @Prop()
  plannedAt?: Date;

  @Prop()
  appliedAt?: Date;

  @Prop({
    min: 0,
  })
  amountUsed?: number;

  @Prop({
    trim: true,
  })
  amountUnit?: string;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  completionPercentage: number;

  @Prop({
    type: [String],
    enum: SkinReactionType,
    default: [],
  })
  reactions: SkinReactionType[];

  @Prop({
    min: 0,
    max: 10,
  })
  reactionSeverity?: number;

  @Prop({
    trim: true,
  })
  reactionNotes?: string;

  @Prop({
    trim: true,
  })
  skipReason?: string;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const SkincareRoutineItemSchema =
  SchemaFactory.createForClass(SkincareRoutineItem);

@Schema({ _id: false })
export class DailySkinObservation {
  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  acne: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  dryness: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  oiliness: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  redness: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  pigmentation: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  darkCircles: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  itching: SkinConditionLevel;

  @Prop({
    type: String,
    enum: SkinConditionLevel,
    default: SkinConditionLevel.NONE,
  })
  irritation: SkinConditionLevel;

  @Prop({
    min: 0,
    max: 10,
  })
  hydrationScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  textureScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  overallSkinScore?: number;

  @Prop({
    type: [String],
    default: [],
  })
  affectedAreas: string[];

  @Prop({
    type: [String],
    default: [],
  })
  newConcerns: string[];

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const DailySkinObservationSchema =
  SchemaFactory.createForClass(DailySkinObservation);

@Schema({ _id: false })
export class SkinEnvironmentData {
  @Prop({
    min: 0,
  })
  sunExposureMinutes?: number;

  @Prop({
    default: false,
  })
  sunscreenReapplied: boolean;

  @Prop({
    min: 0,
  })
  sunscreenReapplicationCount?: number;

  @Prop({
    default: false,
  })
  heavySweating: boolean;

  @Prop({
    default: false,
  })
  outdoorWorkout: boolean;

  @Prop({
    default: false,
  })
  shavingDone: boolean;

  @Prop({
    default: false,
  })
  pollutionExposure: boolean;

  @Prop({
    trim: true,
  })
  weatherCondition?: string;

  @Prop({
    min: 0,
    max: 100,
  })
  humidityPercentage?: number;
}

export const SkinEnvironmentDataSchema =
  SchemaFactory.createForClass(SkinEnvironmentData);

@Schema({
  timestamps: true,
  collection: 'daily_skincare_logs',
})
export class DailySkincareLog {
  @Prop({
    required: true,
  })
  date: Date;

  @Prop({
    type: [SkincareRoutineItemSchema],
    default: [],
  })
  routineItems: SkincareRoutineItem[];

  @Prop({
    type: DailySkinObservationSchema,
    default: () => ({}),
  })
  observation: DailySkinObservation;

  @Prop({
    type: SkinEnvironmentDataSchema,
    default: () => ({}),
  })
  environment: SkinEnvironmentData;

  @Prop({
    min: 0,
    default: 0,
  })
  totalScheduled: number;

  @Prop({
    min: 0,
    default: 0,
  })
  totalApplied: number;

  @Prop({
    min: 0,
    default: 0,
  })
  totalMissed: number;

  @Prop({
    min: 0,
    default: 0,
  })
  totalSkipped: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  adherencePercentage: number;

  @Prop({
    type: [String],
    default: [],
  })
  progressPhotoUrls: string[];

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    default: false,
  })
  dermatologistReviewRecommended: boolean;

  @Prop({
    trim: true,
  })
  dermatologistReviewReason?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const DailySkincareLogSchema =
  SchemaFactory.createForClass(DailySkincareLog);

DailySkincareLogSchema.index(
  {
    date: 1,
  },
  {
    unique: true,
  },
);

DailySkincareLogSchema.index({
  adherencePercentage: 1,
  date: -1,
});
