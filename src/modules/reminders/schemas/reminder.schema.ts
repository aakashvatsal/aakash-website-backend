import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ReminderDocument = HydratedDocument<Reminder>;

export enum ReminderSourceType {
  TASK = 'task',
  SUPPLEMENT = 'supplement',
  SKINCARE = 'skincare',
  HAIRCARE = 'haircare',
  INTIMATE_CARE = 'intimate_care',
}

export enum ReminderStatus {
  PENDING = 'pending',
  SNOOZED = 'snoozed',
  ACKNOWLEDGED = 'acknowledged',
  DISMISSED = 'dismissed',
}

@Schema({
  timestamps: true,
  collection: 'reminders',
})
export class Reminder {
  @Prop({
    type: String,
    enum: ReminderSourceType,
    required: true,
    index: true,
  })
  sourceType: ReminderSourceType;

  @Prop({
    type: SchemaTypes.ObjectId,
    required: true,
    index: true,
  })
  sourceId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    unique: true,
    index: true,
  })
  occurrenceKey: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 250,
  })
  title: string;

  @Prop({
    trim: true,
    maxlength: 3000,
  })
  message?: string;

  @Prop({
    required: true,
    index: true,
  })
  scheduledFor: Date;

  @Prop({
    required: true,
  })
  originalScheduledFor: Date;

  @Prop({
    type: String,
    enum: ReminderStatus,
    default: ReminderStatus.PENDING,
    index: true,
  })
  status: ReminderStatus;

  @Prop()
  snoozedUntil?: Date;

  @Prop()
  acknowledgedAt?: Date;

  @Prop()
  dismissedAt?: Date;

  @Prop({
    trim: true,
  })
  sourcePath?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: true,
    index: true,
  })
  isActive: boolean;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);

ReminderSchema.index({
  status: 1,
  scheduledFor: 1,
  isActive: 1,
});

ReminderSchema.index({
  sourceType: 1,
  sourceId: 1,
  scheduledFor: 1,
});
