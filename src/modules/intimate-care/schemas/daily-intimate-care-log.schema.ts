import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

import {
  IntimateCareApplicationArea,
  IntimateCareTimeOfDay,
} from './intimate-care-product.schema';

export type DailyIntimateCareLogDocument =
  HydratedDocument<DailyIntimateCareLog>;

export enum IntimateCareLogStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  PARTIAL = 'partial',
  MISSED = 'missed',
  SKIPPED = 'skipped',
}

export enum IntimateCareConcernLevel {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

export enum IntimateCareReactionType {
  NONE = 'none',
  ITCHING = 'itching',
  BURNING = 'burning',
  REDNESS = 'redness',
  RASH = 'rash',
  DRYNESS = 'dryness',
  SWELLING = 'swelling',
  PAIN = 'pain',
  DISCOMFORT = 'discomfort',
  OTHER = 'other',
}

@Schema({ _id: false })
export class IntimateCareRoutineItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'IntimateCareProduct',
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
    enum: IntimateCareTimeOfDay,
    required: true,
  })
  timeOfDay: IntimateCareTimeOfDay;

  @Prop({
    type: [String],
    enum: IntimateCareApplicationArea,
    default: [],
  })
  applicationAreas: IntimateCareApplicationArea[];

  @Prop({
    type: String,
    enum: IntimateCareLogStatus,
    default: IntimateCareLogStatus.PENDING,
  })
  status: IntimateCareLogStatus;

  @Prop()
  appliedAt?: Date;

  @Prop({ min: 0 })
  amountUsed?: number;

  @Prop({ trim: true })
  amountUnit?: string;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  completionPercentage: number;

  @Prop({
    type: [String],
    enum: IntimateCareReactionType,
    default: [],
  })
  reactions: IntimateCareReactionType[];

  @Prop({
    min: 0,
    max: 10,
  })
  reactionSeverity?: number;

  @Prop({ trim: true })
  reactionNotes?: string;

  @Prop({ trim: true })
  skipReason?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const IntimateCareRoutineItemSchema =
  SchemaFactory.createForClass(IntimateCareRoutineItem);

@Schema({ _id: false })
export class IntimateCareObservation {
  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  itching: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  redness: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  rash: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  chafing: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  dryness: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  pigmentation: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  odourConcern: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  dischargeConcern: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  pain: IntimateCareConcernLevel;

  @Prop({
    type: String,
    enum: IntimateCareConcernLevel,
    default: IntimateCareConcernLevel.NONE,
  })
  swelling: IntimateCareConcernLevel;

  @Prop({
    min: 0,
    max: 10,
  })
  comfortScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  overallConditionScore?: number;

  @Prop({
    type: [String],
    default: [],
  })
  affectedAreas: string[];

  @Prop({
    type: [String],
    default: [],
  })
  possibleTriggers: string[];

  @Prop({ trim: true })
  notes?: string;
}

export const IntimateCareObservationSchema =
  SchemaFactory.createForClass(IntimateCareObservation);

@Schema({ _id: false })
export class IntimateCareHygieneData {
  @Prop({ default: false })
  bathTaken: boolean;

  @Prop({ default: false })
  areaKeptDry: boolean;

  @Prop({ default: false })
  underwearChanged: boolean;

  @Prop({ default: false })
  breathableUnderwearUsed: boolean;

  @Prop({ default: false })
  postWorkoutCleaned: boolean;

  @Prop({ default: false })
  shavingDone: boolean;

  @Prop({ default: false })
  tightClothingUsed: boolean;

  @Prop({ default: false })
  heavySweating: boolean;

  @Prop({ default: false })
  prolongedSitting: boolean;

  @Prop({ default: false })
  menstrualProductChangedRegularly: boolean;

  @Prop({ min: 0 })
  menstrualProductChangeCount?: number;

  @Prop({ trim: true })
  notes?: string;
}

export const IntimateCareHygieneDataSchema =
  SchemaFactory.createForClass(IntimateCareHygieneData);

@Schema({
  timestamps: true,
  collection: 'daily_intimate_care_logs',
})
export class DailyIntimateCareLog {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    index: true,
  })
  date: Date;

  @Prop({
    type: [IntimateCareRoutineItemSchema],
    default: [],
  })
  routineItems: IntimateCareRoutineItem[];

  @Prop({
    type: IntimateCareObservationSchema,
    default: () => ({}),
  })
  observation: IntimateCareObservation;

  @Prop({
    type: IntimateCareHygieneDataSchema,
    default: () => ({}),
  })
  hygiene: IntimateCareHygieneData;

  @Prop({ min: 0, default: 0 })
  totalScheduled: number;

  @Prop({ min: 0, default: 0 })
  totalApplied: number;

  @Prop({ min: 0, default: 0 })
  totalMissed: number;

  @Prop({ min: 0, default: 0 })
  totalSkipped: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  adherencePercentage: number;

  @Prop({ default: false })
  professionalReviewRecommended: boolean;

  @Prop({ trim: true })
  professionalReviewReason?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true })
  isPrivate: boolean;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const DailyIntimateCareLogSchema =
  SchemaFactory.createForClass(DailyIntimateCareLog);

DailyIntimateCareLogSchema.index(
  {
    userId: 1,
    date: 1,
  },
  {
    unique: true,
  },
);

DailyIntimateCareLogSchema.index({
  userId: 1,
  adherencePercentage: 1,
  date: -1,
});