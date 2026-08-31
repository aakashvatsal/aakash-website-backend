import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type DailySupplementLogDocument = HydratedDocument<DailySupplementLog>;

export enum SupplementLogStatus {
  PENDING = 'pending',
  TAKEN = 'taken',
  MISSED = 'missed',
  SKIPPED = 'skipped',
  PARTIAL = 'partial',
}

@Schema({ _id: false })
export class DailySupplementItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Supplement',
    required: true,
  })
  supplementId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
  })
  supplementName: string;

  @Prop({
    required: true,
    trim: true,
  })
  scheduledTime: string;

  @Prop({
    type: String,
    enum: SupplementLogStatus,
    default: SupplementLogStatus.PENDING,
  })
  status: SupplementLogStatus;

  @Prop({
    min: 0,
  })
  plannedAmount?: number;

  @Prop({
    min: 0,
  })
  actualAmount?: number;

  @Prop({
    trim: true,
  })
  unit?: string;

  @Prop()
  takenAt?: Date;

  @Prop({
    trim: true,
  })
  skipReason?: string;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: [String],
    default: [],
  })
  symptomsAfterTaking: string[];

  @Prop({
    type: [String],
    default: [],
  })
  sideEffects: string[];
}

export const DailySupplementItemSchema =
  SchemaFactory.createForClass(DailySupplementItem);

@Schema({
  timestamps: true,
  collection: 'daily_supplement_logs',
})
export class DailySupplementLog {
  @Prop({
    required: true,
  })
  date: Date;

  @Prop({
    type: [DailySupplementItemSchema],
    default: [],
  })
  supplements: DailySupplementItem[];

  @Prop({
    min: 0,
    default: 0,
  })
  totalScheduled: number;

  @Prop({
    min: 0,
    default: 0,
  })
  totalTaken: number;

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

export const DailySupplementLogSchema =
  SchemaFactory.createForClass(DailySupplementLog);

DailySupplementLogSchema.index(
  {
    date: 1,
  },
  {
    unique: true,
  },
);

DailySupplementLogSchema.index({
  adherencePercentage: 1,
  date: -1,
});
