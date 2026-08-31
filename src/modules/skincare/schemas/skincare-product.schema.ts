import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SkincareProductDocument = HydratedDocument<SkincareProduct>;

export enum SkincareProductCategory {
  CLEANSER = 'cleanser',
  TONER = 'toner',
  SERUM = 'serum',
  MOISTURIZER = 'moisturizer',
  SUNSCREEN = 'sunscreen',
  EXFOLIANT = 'exfoliant',
  RETINOID = 'retinoid',
  FACE_MASK = 'face_mask',
  EYE_CREAM = 'eye_cream',
  SPOT_TREATMENT = 'spot_treatment',
  LIP_CARE = 'lip_care',
  BODY_WASH = 'body_wash',
  BODY_LOTION = 'body_lotion',
  BODY_EXFOLIANT = 'body_exfoliant',
  ANTIFUNGAL = 'antifungal',
  DEODORANT = 'deodorant',
  POWDER = 'powder',
  OTHER = 'other',
}

export enum SkincareProductStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  FINISHED = 'finished',
  DISCONTINUED = 'discontinued',
}

export enum SkincareApplicationArea {
  FACE = 'face',
  NECK = 'neck',
  LIPS = 'lips',
  EYES = 'eyes',
  BODY = 'body',
  UNDERARMS = 'underarms',
  INNER_THIGHS = 'inner_thighs',
  HANDS = 'hands',
  FEET = 'feet',
  SCALP = 'scalp',
  OTHER = 'other',
}

export enum SkincareTimeOfDay {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
  NIGHT = 'night',
  AS_NEEDED = 'as_needed',
}

export enum SkincareFrequency {
  DAILY = 'daily',
  TWICE_DAILY = 'twice_daily',
  ALTERNATE_DAYS = 'alternate_days',
  WEEKLY = 'weekly',
  TWICE_WEEKLY = 'twice_weekly',
  CUSTOM = 'custom',
  AS_NEEDED = 'as_needed',
}

@Schema({ _id: false })
export class SkincareSchedule {
  @Prop({
    type: String,
    enum: SkincareFrequency,
    default: SkincareFrequency.DAILY,
  })
  frequency: SkincareFrequency;

  @Prop({
    type: [String],
    enum: SkincareTimeOfDay,
    default: [],
  })
  timesOfDay: SkincareTimeOfDay[];

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

export const SkincareScheduleSchema =
  SchemaFactory.createForClass(SkincareSchedule);

@Schema({
  timestamps: true,
  collection: 'skincare_products',
})
export class SkincareProduct {
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
    enum: SkincareProductCategory,
    required: true,
    index: true,
  })
  category: SkincareProductCategory;

  @Prop({
    type: String,
    enum: SkincareProductStatus,
    default: SkincareProductStatus.ACTIVE,
    index: true,
  })
  status: SkincareProductStatus;

  @Prop({
    type: [String],
    enum: SkincareApplicationArea,
    default: [],
  })
  applicationAreas: SkincareApplicationArea[];

  @Prop({
    type: [String],
    default: [],
  })
  activeIngredients: string[];

  @Prop({
    type: [String],
    default: [],
  })
  inactiveIngredients: string[];

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
    type: SkincareScheduleSchema,
    required: true,
  })
  schedule: SkincareSchedule;

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
    trim: true,
  })
  texture?: string;

  @Prop({
    trim: true,
  })
  formulation?: string;

  @Prop({
    trim: true,
  })
  skinTypeSuitability?: string;

  @Prop({
    min: 0,
  })
  spf?: number;

  @Prop({
    min: 0,
  })
  purchasePrice?: number;

  @Prop({
    trim: true,
    default: 'INR',
  })
  currency: string;

  @Prop()
  purchasedAt?: Date;

  @Prop()
  openedAt?: Date;

  @Prop()
  expiresAt?: Date;

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
  incompatibleIngredients: string[];

  @Prop({
    default: false,
  })
  medicallyPrescribed: boolean;

  @Prop({
    trim: true,
  })
  prescribedBy?: string;

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

export const SkincareProductSchema =
  SchemaFactory.createForClass(SkincareProduct);

SkincareProductSchema.index({
  status: 1,
  category: 1,
});

SkincareProductSchema.index(
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
