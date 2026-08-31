import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import {
  HairApplicationArea,
  HaircareTimeOfDay,
} from './haircare-product.schema';

export type DailyHaircareLogDocument = HydratedDocument<DailyHaircareLog>;

export enum HaircareLogStatus {
  PENDING = 'pending',
  APPLIED = 'applied',
  PARTIAL = 'partial',
  MISSED = 'missed',
  SKIPPED = 'skipped',
}

export enum HairConditionLevel {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

export enum HairReactionType {
  NONE = 'none',
  ITCHING = 'itching',
  BURNING = 'burning',
  REDNESS = 'redness',
  DRYNESS = 'dryness',
  FLAKING = 'flaking',
  EXCESS_OIL = 'excess_oil',
  HAIR_FALL = 'hair_fall',
  SCALP_TENDERNESS = 'scalp_tenderness',
  HEADACHE = 'headache',
  OTHER = 'other',
}

@Schema({ _id: false })
export class HaircareRoutineItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'HaircareProduct',
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
    enum: HaircareTimeOfDay,
    required: true,
  })
  timeOfDay: HaircareTimeOfDay;

  @Prop({
    type: [String],
    enum: HairApplicationArea,
    default: [],
  })
  applicationAreas: HairApplicationArea[];

  @Prop({
    type: String,
    enum: HaircareLogStatus,
    default: HaircareLogStatus.PENDING,
  })
  status: HaircareLogStatus;

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
    enum: HairReactionType,
    default: [],
  })
  reactions: HairReactionType[];

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

export const HaircareRoutineItemSchema =
  SchemaFactory.createForClass(HaircareRoutineItem);

@Schema({ _id: false })
export class HairWashData {
  @Prop({
    default: false,
  })
  washDone: boolean;

  @Prop()
  washedAt?: Date;

  @Prop({
    min: 0,
  })
  shampooApplications?: number;

  @Prop({
    default: false,
  })
  conditionerUsed: boolean;

  @Prop({
    default: false,
  })
  oilAppliedBeforeWash: boolean;

  @Prop({
    min: 0,
  })
  oilLeftOnMinutes?: number;

  @Prop({
    default: false,
  })
  warmWaterUsed: boolean;

  @Prop({
    default: false,
  })
  hotWaterUsed: boolean;

  @Prop({
    default: false,
  })
  blowDryUsed: boolean;

  @Prop({
    default: false,
  })
  heatStylingUsed: boolean;

  @Prop({
    trim: true,
  })
  dryingMethod?: string;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const HairWashDataSchema = SchemaFactory.createForClass(HairWashData);

@Schema({ _id: false })
export class DailyHairObservation {
  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  hairFall: HairConditionLevel;

  @Prop({
    min: 0,
  })
  estimatedHairFallCount?: number;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  dandruff: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpDryness: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpOiliness: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpItching: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpRedness: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpFlaking: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  hairDryness: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  frizz: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  breakage: HairConditionLevel;

  @Prop({
    type: String,
    enum: HairConditionLevel,
    default: HairConditionLevel.NONE,
  })
  scalpPain: HairConditionLevel;

  @Prop({
    min: 0,
    max: 10,
  })
  hairSoftnessScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  scalpComfortScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  overallHairScore?: number;

  @Prop({
    type: [String],
    default: [],
  })
  thinningAreas: string[];

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

export const DailyHairObservationSchema =
  SchemaFactory.createForClass(DailyHairObservation);

@Schema({ _id: false })
export class HairLifestyleData {
  @Prop({
    default: false,
  })
  helmetUsed: boolean;

  @Prop({
    min: 0,
  })
  helmetDurationMinutes?: number;

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
  swimmingDone: boolean;

  @Prop({
    default: false,
  })
  hairCoveredWhileSleeping: boolean;

  @Prop({
    default: false,
  })
  tightHairstyleUsed: boolean;

  @Prop({
    default: false,
  })
  chemicalTreatmentDone: boolean;

  @Prop({
    default: false,
  })
  haircutDone: boolean;

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

export const HairLifestyleDataSchema =
  SchemaFactory.createForClass(HairLifestyleData);

@Schema({
  timestamps: true,
  collection: 'daily_haircare_logs',
})
export class DailyHaircareLog {
  @Prop({
    required: true,
  })
  date: Date;

  @Prop({
    type: [HaircareRoutineItemSchema],
    default: [],
  })
  routineItems: HaircareRoutineItem[];

  @Prop({
    type: HairWashDataSchema,
    default: () => ({}),
  })
  wash: HairWashData;

  @Prop({
    type: DailyHairObservationSchema,
    default: () => ({}),
  })
  observation: DailyHairObservation;

  @Prop({
    type: HairLifestyleDataSchema,
    default: () => ({}),
  })
  lifestyle: HairLifestyleData;

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

export const DailyHaircareLogSchema =
  SchemaFactory.createForClass(DailyHaircareLog);

DailyHaircareLogSchema.index(
  {
    date: 1,
  },
  {
    unique: true,
  },
);

DailyHaircareLogSchema.index({
  adherencePercentage: 1,
  date: -1,
});

DailyHaircareLogSchema.index({
  'observation.hairFall': 1,
  date: -1,
});
