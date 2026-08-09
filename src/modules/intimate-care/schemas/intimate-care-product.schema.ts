import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type IntimateCareProductDocument =
  HydratedDocument<IntimateCareProduct>;

export enum IntimateCareProductCategory {
  GENTLE_WASH = 'gentle_wash',
  ANTIFUNGAL_CREAM = 'antifungal_cream',
  ANTIFUNGAL_POWDER = 'antifungal_powder',
  MOISTURIZER = 'moisturizer',
  BARRIER_CREAM = 'barrier_cream',
  ANTI_CHAFING = 'anti_chafing',
  DEODORANT = 'deodorant',
  WIPES = 'wipes',
  MENSTRUAL_PRODUCT = 'menstrual_product',
  LUBRICANT = 'lubricant',
  PRESCRIBED_MEDICATION = 'prescribed_medication',
  OTHER = 'other',
}

export enum IntimateCareProductStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FINISHED = 'finished',
  DISCONTINUED = 'discontinued',
}

export enum IntimateCareApplicationArea {
  GROIN = 'groin',
  INNER_THIGHS = 'inner_thighs',
  EXTERNAL_GENITAL_AREA = 'external_genital_area',
  UNDERWEAR_LINE = 'underwear_line',
  BUTTOCKS = 'buttocks',
  OTHER = 'other',
}

export enum IntimateCareTimeOfDay {
  MORNING = 'morning',
  AFTER_BATH = 'after_bath',
  AFTER_WORKOUT = 'after_workout',
  EVENING = 'evening',
  NIGHT = 'night',
  AS_NEEDED = 'as_needed',
}

export enum IntimateCareFrequency {
  DAILY = 'daily',
  TWICE_DAILY = 'twice_daily',
  ALTERNATE_DAYS = 'alternate_days',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
  AS_NEEDED = 'as_needed',
}

@Schema({ _id: false })
export class IntimateCareSchedule {
  @Prop({
    type: String,
    enum: IntimateCareFrequency,
    default: IntimateCareFrequency.DAILY,
  })
  frequency: IntimateCareFrequency;

  @Prop({
    type: [String],
    enum: IntimateCareTimeOfDay,
    default: [],
  })
  timesOfDay: IntimateCareTimeOfDay[];

  @Prop({
    type: [Number],
    default: [],
  })
  daysOfWeek: number[];

  @Prop({ min: 1 })
  intervalDays?: number;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ trim: true })
  instructions?: string;
}

export const IntimateCareScheduleSchema =
  SchemaFactory.createForClass(IntimateCareSchedule);

@Schema({
  timestamps: true,
  collection: 'intimate_care_products',
})
export class IntimateCareProduct {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({ trim: true })
  brand?: string;

  @Prop({
    type: String,
    enum: IntimateCareProductCategory,
    required: true,
    index: true,
  })
  category: IntimateCareProductCategory;

  @Prop({
    type: String,
    enum: IntimateCareProductStatus,
    default: IntimateCareProductStatus.ACTIVE,
    index: true,
  })
  status: IntimateCareProductStatus;

  @Prop({
    type: [String],
    enum: IntimateCareApplicationArea,
    default: [],
  })
  applicationAreas: IntimateCareApplicationArea[];

  @Prop({
    type: [String],
    default: [],
  })
  activeIngredients: string[];

  @Prop({
    type: [String],
    default: [],
  })
  purposes: string[];

  @Prop({
    type: [String],
    default: [],
  })
  targetedConcerns: string[];

  @Prop({
    type: IntimateCareScheduleSchema,
    required: true,
  })
  schedule: IntimateCareSchedule;

  @Prop({ min: 0 })
  amountPerUse?: number;

  @Prop({ trim: true })
  amountUnit?: string;

  @Prop({ default: false })
  externalUseOnly: boolean;

  @Prop({ default: false })
  requiresRinsing: boolean;

  @Prop({ default: false })
  patchTestRequired: boolean;

  @Prop({ default: false })
  patchTestCompleted: boolean;

  @Prop()
  patchTestAt?: Date;

  @Prop({ trim: true })
  patchTestResult?: string;

  @Prop({
    type: [String],
    default: [],
  })
  warnings: string[];

  @Prop({
    type: [String],
    default: [],
  })
  knownInteractions: string[];

  @Prop({ default: false })
  medicallyPrescribed: boolean;

  @Prop({ trim: true })
  prescribedBy?: string;

  @Prop()
  expiresAt?: Date;

  @Prop({ default: false })
  reminderEnabled: boolean;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const IntimateCareProductSchema =
  SchemaFactory.createForClass(IntimateCareProduct);

IntimateCareProductSchema.index({
  userId: 1,
  category: 1,
  status: 1,
});

IntimateCareProductSchema.index(
  {
    userId: 1,
    name: 1,
    brand: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
    },
  },
);