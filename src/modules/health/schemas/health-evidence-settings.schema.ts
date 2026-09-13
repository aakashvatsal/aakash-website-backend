import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthEvidenceSettingsDocument =
  HydratedDocument<HealthEvidenceSettings>;

export enum HealthAutonomyMode {
  AUTONOMOUS = 'autonomous',
  APPROVAL = 'approval',
  NEVER = 'never',
  LOCKED = 'locked',
}

export const DEFAULT_HEALTH_SOURCE_PRIORITY = [
  'professional_instruction',
  'owner_update',
  'connected_objective_data',
  'structured_health_log',
  'task_completion',
  'ai_inference',
] as const;

export const DEFAULT_HEALTH_AUTONOMY: Record<string, HealthAutonomyMode> = {
  training: HealthAutonomyMode.AUTONOMOUS,
  cardio: HealthAutonomyMode.AUTONOMOUS,
  steps: HealthAutonomyMode.AUTONOMOUS,
  mealStructure: HealthAutonomyMode.AUTONOMOUS,
  meditation: HealthAutonomyMode.AUTONOMOUS,
  routineTiming: HealthAutonomyMode.AUTONOMOUS,
  skincareRoutine: HealthAutonomyMode.AUTONOMOUS,
  haircareRoutine: HealthAutonomyMode.AUTONOMOUS,
  intimateCareRoutine: HealthAutonomyMode.AUTONOMOUS,
  supplements: HealthAutonomyMode.APPROVAL,
  medication: HealthAutonomyMode.NEVER,
  professionalInstructions: HealthAutonomyMode.LOCKED,
};

@Schema({ timestamps: true, collection: 'health_evidence_settings' })
export class HealthEvidenceSettings {
  @Prop({ required: true, unique: true, default: 'owner' })
  key: string;

  @Prop({ type: [String], default: () => [...DEFAULT_HEALTH_SOURCE_PRIORITY] })
  sourcePriority: string[];

  @Prop({ type: Object, default: () => ({ ...DEFAULT_HEALTH_AUTONOMY }) })
  autonomy: Record<string, HealthAutonomyMode>;

  @Prop({ min: 14, max: 365, default: 90 })
  baselineRefreshDays: number;

  @Prop({ min: 7, max: 365, default: 30 })
  bodyPhotoRefreshDays: number;

  @Prop({ min: 7, max: 365, default: 28 })
  skinPhotoRefreshDays: number;

  @Prop({ min: 7, max: 365, default: 30 })
  hairPhotoRefreshDays: number;

  @Prop({ min: 30, max: 730, default: 180 })
  reportFreshnessDays: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const HealthEvidenceSettingsSchema = SchemaFactory.createForClass(
  HealthEvidenceSettings,
);
