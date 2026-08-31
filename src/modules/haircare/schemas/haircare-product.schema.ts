import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HaircareProductDocument = HydratedDocument<HaircareProduct>;

export enum HaircareProductCategory {
  SHAMPOO = 'shampoo',
  ANTI_DANDRUFF_SHAMPOO = 'anti_dandruff_shampoo',
  CONDITIONER = 'conditioner',
  HAIR_MASK = 'hair_mask',
  HAIR_OIL = 'hair_oil',
  HAIR_SERUM = 'hair_serum',
  SCALP_SERUM = 'scalp_serum',
  MINOXIDIL = 'minoxidil',
  LEAVE_IN_CONDITIONER = 'leave_in_conditioner',
  HEAT_PROTECTANT = 'heat_protectant',
  STYLING_PRODUCT = 'styling_product',
  MEDICATED_TREATMENT = 'medicated_treatment',
  OTHER = 'other',
}

export enum HaircareProductStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FINISHED = 'finished',
  DISCONTINUED = 'discontinued',
}

export enum HairApplicationArea {
  SCALP = 'scalp',
  ROOTS = 'roots',
  HAIR_LENGTH = 'hair_length',
  HAIR_ENDS = 'hair_ends',
  BEARD = 'beard',
}

export enum HaircareTimeOfDay {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
  NIGHT = 'night',
  BEFORE_WASH = 'before_wash',
  AFTER_WASH = 'after_wash',
  AS_NEEDED = 'as_needed',
}

export enum HaircareFrequency {
  DAILY = 'daily',
  TWICE_DAILY = 'twice_daily',
  ALTERNATE_DAYS = 'alternate_days',
  WEEKLY = 'weekly',
  TWICE_WEEKLY = 'twice_weekly',
  THREE_TIMES_WEEKLY = 'three_times_weekly',
  CUSTOM = 'custom',
  AS_NEEDED = 'as_needed',
}

@Schema({ _id: false })
export class HaircareSchedule {
  @Prop({
    type: String,
    enum: HaircareFrequency,
    default: HaircareFrequency.DAILY,
  })
  frequency: HaircareFrequency;

  @Prop({
    type: [String],
    enum: HaircareTimeOfDay,
    default: [],
  })
  timesOfDay: HaircareTimeOfDay[];

  /**
   * JavaScript days:
   * 0 = Sunday
   * 1 = Monday
   * ...
   * 6 = Saturday
   */
  @Prop({
    type: [Number],
    default: [],
  })
  daysOfWeek: number[];

  @Prop({
    min: 1,
  })
  intervalDays?: number;

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({
    trim: true,
  })
  instructions?: string;
}

export const HaircareScheduleSchema =
  SchemaFactory.createForClass(HaircareSchedule);

@Schema({
  timestamps: true,
  collection: 'haircare_products',
})
export class HaircareProduct {
  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name: string;

  @Prop({
    trim: true,
  })
  brand?: string;

  @Prop({
    type: String,
    enum: HaircareProductCategory,
    required: true,
    index: true,
  })
  category: HaircareProductCategory;

  @Prop({
    type: String,
    enum: HaircareProductStatus,
    default: HaircareProductStatus.ACTIVE,
    index: true,
  })
  status: HaircareProductStatus;

  @Prop({
    type: [String],
    enum: HairApplicationArea,
    default: [],
  })
  applicationAreas: HairApplicationArea[];

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
    type: HaircareScheduleSchema,
    required: true,
  })
  schedule: HaircareSchedule;

  @Prop({
    min: 0,
  })
  amountPerUse?: number;

  @Prop({
    trim: true,
  })
  amountUnit?: string;

  @Prop({
    min: 0,
  })
  productSize?: number;

  @Prop({
    trim: true,
  })
  productSizeUnit?: string;

  @Prop({
    min: 0,
  })
  concentrationPercentage?: number;

  @Prop({
    min: 0,
  })
  leaveOnMinutes?: number;

  @Prop({
    default: false,
  })
  requiresRinsing: boolean;

  @Prop({
    default: false,
  })
  patchTestRequired: boolean;

  @Prop({
    default: false,
  })
  patchTestCompleted: boolean;

  @Prop()
  patchTestAt?: Date;

  @Prop({
    trim: true,
  })
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

  @Prop({
    default: false,
  })
  medicallyPrescribed: boolean;

  @Prop({
    trim: true,
  })
  prescribedBy?: string;

  @Prop()
  purchasedAt?: Date;

  @Prop()
  openedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({
    min: 0,
  })
  purchasePrice?: number;

  @Prop({
    trim: true,
    default: 'INR',
  })
  currency: string;

  @Prop({
    trim: true,
  })
  purchaseUrl?: string;

  @Prop({
    trim: true,
  })
  imageUrl?: string;

  @Prop({
    default: false,
  })
  reminderEnabled: boolean;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const HaircareProductSchema =
  SchemaFactory.createForClass(HaircareProduct);

HaircareProductSchema.index({
  status: 1,
  category: 1,
});

HaircareProductSchema.index(
  {
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
