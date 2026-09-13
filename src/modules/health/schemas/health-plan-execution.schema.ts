import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import {
  HealthRoutineTaskStatus,
  HealthSubstanceUseStatus,
} from '../dto/health-plan-progress.dto';

export type HealthPlanExecutionDocument = HydratedDocument<HealthPlanExecution>;

@Schema({ _id: false })
export class HealthSubstanceUse {
  @Prop({
    type: String,
    enum: HealthSubstanceUseStatus,
    default: HealthSubstanceUseStatus.UNTRACKED,
  })
  status: HealthSubstanceUseStatus;

  @Prop({ min: 0 })
  quantity?: number;

  @Prop({ trim: true, default: '' })
  unit: string;

  @Prop({ trim: true, default: '' })
  type: string;
}

export const HealthSubstanceUseSchema =
  SchemaFactory.createForClass(HealthSubstanceUse);

@Schema({ _id: false })
export class HealthPlanExecutionFeedback {
  @Prop({ min: 1, max: 10 })
  energyScore?: number;

  @Prop({ min: 1, max: 10 })
  fatigueScore?: number;

  @Prop({ min: 1, max: 10 })
  sorenessScore?: number;

  @Prop({ min: 1, max: 10 })
  stressScore?: number;

  @Prop({ min: 1, max: 10 })
  hungerScore?: number;

  @Prop({ min: 1, max: 10 })
  planDifficultyScore?: number;

  @Prop({ type: HealthSubstanceUseSchema, default: () => ({}) })
  smoking: HealthSubstanceUse;

  @Prop({ type: HealthSubstanceUseSchema, default: () => ({}) })
  alcohol: HealthSubstanceUse;

  @Prop({ type: [String], default: [] })
  whatWorked: string[];

  @Prop({ type: [String], default: [] })
  blockers: string[];

  @Prop({ type: [String], default: [] })
  requestedChanges: string[];

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop()
  submittedAt?: Date;
}

export const HealthPlanExecutionFeedbackSchema = SchemaFactory.createForClass(
  HealthPlanExecutionFeedback,
);

@Schema({ _id: false })
export class HealthRoutineTask {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  domain: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true, default: '' })
  detail: string;

  @Prop({ trim: true, default: '' })
  scheduledTime: string;

  @Prop({
    type: String,
    enum: HealthRoutineTaskStatus,
    default: HealthRoutineTaskStatus.PENDING,
  })
  status: HealthRoutineTaskStatus;

  @Prop({ trim: true, default: 'plan' })
  source: string;

  @Prop({ trim: true, default: '' })
  globalTaskId: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const HealthRoutineTaskSchema =
  SchemaFactory.createForClass(HealthRoutineTask);

@Schema({ timestamps: true, collection: 'health_plan_executions' })
export class HealthPlanExecution {
  @Prop({ required: true, unique: true, index: true })
  dateKey: string;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ required: true, min: 1 })
  planVersion: number;

  @Prop({ min: 0, max: 100, default: 0 })
  overallAdherencePercentage: number;

  @Prop({ min: 0, max: 100, default: 0 })
  trackingCoveragePercentage: number;

  @Prop({ min: 0, max: 100, default: 0 })
  taskCompletionPercentage: number;

  @Prop({ min: 0, max: 100, default: 0 })
  taskTrackingCoveragePercentage: number;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  comparison: Record<string, unknown>;

  @Prop({ type: HealthPlanExecutionFeedbackSchema, default: () => ({}) })
  feedback: HealthPlanExecutionFeedback;

  @Prop({ type: [HealthRoutineTaskSchema], default: [] })
  tasks: HealthRoutineTask[];

  @Prop({ required: true, trim: true })
  sourceFingerprint: string;

  @Prop({ required: true })
  computedAt: Date;

  @Prop({ default: false, index: true })
  isFinal: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthPlanExecutionSchema =
  SchemaFactory.createForClass(HealthPlanExecution);

HealthPlanExecutionSchema.index({ date: -1, isActive: 1 });
HealthPlanExecutionSchema.index({ computedAt: -1 });
