import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthGoalDocument = HydratedDocument<HealthGoal>;

export enum HealthGoalHorizonMode {
  EXACT_DATE = 'exact_date',
  RELATIVE = 'relative',
  ONGOING = 'ongoing',
}

export enum HealthGoalStatus {
  ACTIVE = 'active',
  ACHIEVED = 'achieved',
  PAUSED = 'paused',
}

@Schema({ timestamps: true, collection: 'health_goals' })
export class HealthGoal {
  @Prop({ required: true, trim: true, index: true })
  category: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true, default: '' })
  currentValue: string;

  @Prop({ required: true, trim: true })
  targetValue: string;

  @Prop({ trim: true, default: '' })
  unit: string;

  @Prop({
    required: true,
    type: String,
    enum: HealthGoalHorizonMode,
    index: true,
  })
  horizonMode: HealthGoalHorizonMode;

  @Prop({ type: Date, default: null })
  targetDate?: Date | null;

  @Prop({ type: Number, min: 1, max: 60, default: null })
  relativeMonths?: number | null;

  @Prop({ min: 1, max: 5, default: 3, index: true })
  priority: number;

  @Prop({ trim: true, default: '' })
  successCriteria: string;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({
    type: String,
    enum: HealthGoalStatus,
    default: HealthGoalStatus.ACTIVE,
    index: true,
  })
  status: HealthGoalStatus;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthGoalSchema = SchemaFactory.createForClass(HealthGoal);
HealthGoalSchema.index({ status: 1, priority: -1 });
