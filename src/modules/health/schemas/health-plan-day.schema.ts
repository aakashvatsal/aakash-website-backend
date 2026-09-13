import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthPlanDayDocument = HydratedDocument<HealthPlanDay>;

export enum HealthPlanStatus {
  PLANNED = 'planned',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum HealthPlanRecoveryMode {
  RECOVER = 'recover',
  MAINTAIN = 'maintain',
  BUILD = 'build',
}

export enum HealthPlanIntensity {
  REST = 'rest',
  EASY = 'easy',
  MODERATE = 'moderate',
  HARD = 'hard',
}

@Schema({ _id: false })
export class HealthPlanExercise {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0, max: 12 })
  sets: number;

  @Prop({ required: true, trim: true })
  reps: string;

  @Prop({ required: true, min: 0, max: 5 })
  rir: number;

  @Prop({ required: true, min: 0, max: 10 })
  rpe: number;

  @Prop({ required: true, min: 0, max: 600 })
  restSeconds: number;

  @Prop({ required: true, trim: true })
  tempo: string;

  @Prop({ required: true, trim: true })
  notes: string;
}

export const HealthPlanExerciseSchema =
  SchemaFactory.createForClass(HealthPlanExercise);

@Schema({ _id: false })
export class HealthPlanCardio {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 0, max: 180 })
  durationMinutes: number;

  @Prop({ required: true, trim: true })
  intensity: string;

  @Prop({ required: true, trim: true })
  notes: string;
}

export const HealthPlanCardioSchema =
  SchemaFactory.createForClass(HealthPlanCardio);

@Schema({ _id: false })
export class HealthPlanMovementSession {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 0, max: 180 })
  durationMinutes: number;

  @Prop({ required: true, trim: true })
  intensity: string;

  @Prop({ required: true, trim: true })
  when: string;

  @Prop({ required: true, trim: true })
  notes: string;
}

export const HealthPlanMovementSessionSchema = SchemaFactory.createForClass(
  HealthPlanMovementSession,
);

@Schema({ _id: false })
export class HealthPlanLabFollowUp {
  @Prop({ required: true, trim: true })
  sourceReportId: string;

  @Prop({ required: true, trim: true })
  testName: string;

  @Prop({ required: true })
  dueAt: Date;

  @Prop({ trim: true, default: '' })
  reason: string;
}

export const HealthPlanLabFollowUpSchema = SchemaFactory.createForClass(
  HealthPlanLabFollowUp,
);

@Schema({ _id: false })
export class HealthPlanTraining {
  @Prop({ required: true, trim: true })
  when: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 0, max: 240 })
  durationMinutes: number;

  @Prop({ required: true, type: String, enum: HealthPlanIntensity })
  intensity: HealthPlanIntensity;

  @Prop({ type: [String], default: [] })
  warmup: string[];

  @Prop({ type: [HealthPlanExerciseSchema], default: [] })
  exercises: HealthPlanExercise[];

  @Prop({ type: HealthPlanCardioSchema, required: true })
  cardio: HealthPlanCardio;

  @Prop({ type: [String], default: [] })
  cooldown: string[];

  @Prop({ required: true, trim: true })
  progressionRule: string;

  @Prop({ required: true, trim: true })
  deloadNote: string;
}

export const HealthPlanTrainingSchema =
  SchemaFactory.createForClass(HealthPlanTraining);

@Schema({ _id: false })
export class HealthPlanFoodItem {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    enum: [
      'vegetable',
      'fruit',
      'grain_flour',
      'rice',
      'protein',
      'dairy_alternative',
      'nuts_seeds',
      'fat',
      'other',
    ],
  })
  category: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  @Prop({ required: true, trim: true })
  unit: string;

  @Prop({ trim: true, default: '' })
  preparation: string;

  @Prop({ trim: true, default: '' })
  reason: string;

  @Prop({ type: [String], default: [] })
  alternatives: string[];
}

export const HealthPlanFoodItemSchema =
  SchemaFactory.createForClass(HealthPlanFoodItem);

@Schema({ _id: false })
export class HealthPlanPerformanceNutritionItem {
  @Prop({ required: true, enum: ['creatine', 'protein_powder', 'other'] })
  category: 'creatine' | 'protein_powder' | 'other';

  @Prop({
    required: true,
    enum: ['keep', 'add', 'replace', 'review', 'review_stop', 'not_needed'],
  })
  action: 'keep' | 'add' | 'replace' | 'review' | 'review_stop' | 'not_needed';

  @Prop({
    required: true,
    enum: ['active', 'pending_approval', 'review_required', 'not_needed_today'],
  })
  status:
    'active' | 'pending_approval' | 'review_required' | 'not_needed_today';

  @Prop({ required: true, trim: true })
  item: string;

  @Prop({ required: true, trim: true })
  when: string;

  @Prop({ required: true, trim: true })
  guidance: string;

  @Prop({ default: false })
  approvalRequired: boolean;
}

export const HealthPlanPerformanceNutritionItemSchema =
  SchemaFactory.createForClass(HealthPlanPerformanceNutritionItem);

@Schema({ _id: false })
export class HealthPlanMeal {
  @Prop({ required: true, trim: true })
  time: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true })
  guidance: string;

  @Prop({ type: [HealthPlanFoodItemSchema], default: [] })
  items: HealthPlanFoodItem[];

  @Prop({ required: true, min: 0, max: 200 })
  proteinGrams: number;
}

export const HealthPlanMealSchema =
  SchemaFactory.createForClass(HealthPlanMeal);

@Schema({ _id: false })
export class HealthPlanNutrition {
  @Prop({ required: true, trim: true })
  focus: string;

  @Prop({ required: true, min: 0, max: 10000 })
  calorieTarget: number;

  @Prop({ required: true, min: 0, max: 500 })
  proteinGrams: number;

  @Prop({ required: true, min: 0, max: 1000 })
  carbsGrams: number;

  @Prop({ required: true, min: 0, max: 400 })
  fatGrams: number;

  @Prop({ required: true, min: 0.5, max: 8 })
  hydrationLitres: number;

  @Prop({ type: [HealthPlanMealSchema], default: [] })
  meals: HealthPlanMeal[];

  @Prop({ type: [HealthPlanPerformanceNutritionItemSchema], default: [] })
  performanceNutrition: HealthPlanPerformanceNutritionItem[];

  @Prop({ type: [String], default: [] })
  notes: string[];
}

export const HealthPlanNutritionSchema =
  SchemaFactory.createForClass(HealthPlanNutrition);

@Schema({ _id: false })
export class HealthPlanMeditation {
  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 0, max: 120 })
  durationMinutes: number;

  @Prop({ required: true, trim: true })
  when: string;

  @Prop({ required: true, trim: true })
  intention: string;
}

export const HealthPlanMeditationSchema =
  SchemaFactory.createForClass(HealthPlanMeditation);

@Schema({ _id: false })
export class HealthPlanSleep {
  @Prop({ required: true, min: 4, max: 12 })
  targetHours: number;

  @Prop({ required: true, trim: true })
  bedtimeWindow: string;

  @Prop({ required: true, trim: true })
  wakeWindow: string;

  @Prop({ type: [String], default: [] })
  notes: string[];
}

export const HealthPlanSleepSchema =
  SchemaFactory.createForClass(HealthPlanSleep);

@Schema({ _id: false })
export class HealthPlanCareRoutine {
  @Prop({ type: [String], default: [] })
  morning: string[];

  @Prop({ type: [String], default: [] })
  evening: string[];

  @Prop({ type: [String], default: [] })
  other: string[];

  @Prop({ required: true, trim: true })
  improvementFocus: string;
}

export const HealthPlanCareRoutineSchema = SchemaFactory.createForClass(
  HealthPlanCareRoutine,
);

@Schema({ _id: false })
export class HealthPlanHairRoutine {
  @Prop({ type: [String], default: [] })
  routine: string[];

  @Prop({ required: true })
  washDay: boolean;

  @Prop({ required: true, trim: true })
  improvementFocus: string;
}

export const HealthPlanHairRoutineSchema = SchemaFactory.createForClass(
  HealthPlanHairRoutine,
);

@Schema({ _id: false })
export class HealthPlanIntimateCareRoutine {
  @Prop({ type: [String], default: [] })
  routine: string[];

  @Prop({ required: true, trim: true })
  improvementFocus: string;
}

export const HealthPlanIntimateCareRoutineSchema = SchemaFactory.createForClass(
  HealthPlanIntimateCareRoutine,
);

@Schema({ timestamps: true, collection: 'health_plan_days' })
export class HealthPlanDay {
  @Prop({ required: true, unique: true, index: true })
  dateKey: string;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({
    type: String,
    enum: HealthPlanStatus,
    default: HealthPlanStatus.PLANNED,
    index: true,
  })
  status: HealthPlanStatus;

  @Prop({ default: false, index: true })
  lockedByOwner: boolean;

  @Prop({ trim: true, default: '' })
  ownerNotes: string;

  @Prop({ required: true, trim: true })
  focus: string;

  @Prop({ required: true, trim: true })
  rationale: string;

  @Prop({ required: true, type: String, enum: HealthPlanRecoveryMode })
  recoveryMode: HealthPlanRecoveryMode;

  @Prop({ type: HealthPlanMovementSessionSchema, required: true })
  morningConditioning: HealthPlanMovementSession;

  @Prop({ type: HealthPlanTrainingSchema, required: true })
  training: HealthPlanTraining;

  @Prop({ type: HealthPlanMovementSessionSchema, required: true })
  normalWalk: HealthPlanMovementSession;

  @Prop({ type: HealthPlanNutritionSchema, required: true })
  nutrition: HealthPlanNutrition;

  @Prop({ type: HealthPlanMeditationSchema, required: true })
  meditation: HealthPlanMeditation;

  @Prop({ type: HealthPlanSleepSchema, required: true })
  sleep: HealthPlanSleep;

  @Prop({ type: HealthPlanCareRoutineSchema, required: true })
  skincare: HealthPlanCareRoutine;

  @Prop({ type: HealthPlanCareRoutineSchema, required: true })
  bodyCare: HealthPlanCareRoutine;

  @Prop({ type: HealthPlanHairRoutineSchema, required: true })
  haircare: HealthPlanHairRoutine;

  @Prop({ type: HealthPlanIntimateCareRoutineSchema, required: true })
  intimateCare: HealthPlanIntimateCareRoutine;

  @Prop({ type: [String], default: [] })
  supplementSchedule: string[];

  @Prop({ type: [HealthPlanLabFollowUpSchema], default: [] })
  labFollowUps: HealthPlanLabFollowUp[];

  @Prop({ required: true, min: 0, max: 50000 })
  stepsTarget: number;

  @Prop({ type: [String], default: [] })
  checkIns: string[];

  @Prop({ type: [String], default: [] })
  signals: string[];

  @Prop({ type: [String], default: [] })
  guardrails: string[];

  @Prop({ required: true, trim: true, index: true })
  contextHash: string;

  @Prop({ required: true, trim: true })
  generationReason: string;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ required: true, trim: true })
  aiResponseId: string;

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({ min: 1, default: 1 })
  version: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthPlanDaySchema = SchemaFactory.createForClass(HealthPlanDay);
HealthPlanDaySchema.index({ date: 1, isActive: 1 });
HealthPlanDaySchema.index({ generatedAt: -1 });
