import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupplementDocument = HydratedDocument<Supplement>;

export enum SupplementStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  STOPPED = 'stopped',
}

export enum SupplementFrequency {
  DAILY = 'daily',
  ALTERNATE_DAYS = 'alternate_days',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
  AS_NEEDED = 'as_needed',
}

export enum SupplementTimingRelation {
  BEFORE_MEAL = 'before_meal',
  WITH_MEAL = 'with_meal',
  AFTER_MEAL = 'after_meal',
  EMPTY_STOMACH = 'empty_stomach',
  BEFORE_WORKOUT = 'before_workout',
  AFTER_WORKOUT = 'after_workout',
  BEFORE_SLEEP = 'before_sleep',
  ANYTIME = 'anytime',
}

export enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday',
}

@Schema({ _id: false })
export class SupplementDose {
  @Prop({
    required: true,
    min: 0,
  })
  amount: number;

  @Prop({
    required: true,
    trim: true,
  })
  unit: string;

  @Prop({
    min: 1,
    default: 1,
  })
  quantity: number;
}

export const SupplementDoseSchema =
  SchemaFactory.createForClass(SupplementDose);

@Schema({ _id: false })
export class SupplementSchedule {
  @Prop({
    type: String,
    enum: SupplementFrequency,
    default: SupplementFrequency.DAILY,
  })
  frequency: SupplementFrequency;

  @Prop({
    type: [String],
    enum: DayOfWeek,
    default: [],
  })
  daysOfWeek: DayOfWeek[];

  @Prop({
    type: [String],
    default: [],
  })
  times: string[];

  @Prop({
    type: String,
    enum: SupplementTimingRelation,
    default: SupplementTimingRelation.ANYTIME,
  })
  timingRelation: SupplementTimingRelation;

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
  customInstructions?: string;
}

export const SupplementScheduleSchema =
  SchemaFactory.createForClass(SupplementSchedule);

@Schema({
  timestamps: true,
  collection: 'supplements',
})
export class Supplement {
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
    trim: true,
  })
  category?: string;

  @Prop({
    trim: true,
  })
  form?: string;

  @Prop({
    type: SupplementDoseSchema,
    required: true,
  })
  dose: SupplementDose;

  @Prop({
    type: SupplementScheduleSchema,
    required: true,
  })
  schedule: SupplementSchedule;

  @Prop({
    type: String,
    enum: SupplementStatus,
    default: SupplementStatus.ACTIVE,
    index: true,
  })
  status: SupplementStatus;

  @Prop({
    type: [String],
    default: [],
  })
  purposes: string[];

  @Prop({
    trim: true,
  })
  prescribedBy?: string;

  @Prop({
    default: false,
  })
  medicallyPrescribed: boolean;

  @Prop({
    type: [String],
    default: [],
  })
  linkedHealthGoals: string[];

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
    trim: true,
  })
  notes?: string;

  @Prop({
    default: false,
  })
  reminderEnabled: boolean;

  @Prop({
    min: 0,
  })
  stockQuantity?: number;

  @Prop({
    min: 0,
  })
  lowStockThreshold?: number;

  @Prop({
    trim: true,
  })
  stockUnit?: string;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const SupplementSchema = SchemaFactory.createForClass(Supplement);

SupplementSchema.index({
  status: 1,
  isActive: 1,
});

SupplementSchema.index(
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
