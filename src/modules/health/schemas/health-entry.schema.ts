import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type HealthEntryDocument = HydratedDocument<HealthEntry>;

export enum WorkoutType {
  PUSH = 'push',
  PULL = 'pull',
  LEGS = 'legs',
  FULL_BODY = 'full_body',
  WALK = 'walk',
  RUN = 'run',
  CYCLING = 'cycling',
  SWIMMING = 'swimming',
  SPORTS = 'sports',
  MOBILITY = 'mobility',
  YOGA = 'yoga',
  ABS = 'abs',
  REST = 'rest',
  OTHER = 'other',
}

export enum WorkoutIntensity {
  LOW = 'low',
  MODERATE = 'moderate',
  HIGH = 'high',
}

export enum HealthMood {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  NEUTRAL = 'neutral',
  LOW = 'low',
  POOR = 'poor',
}

export enum PainSeverity {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  SEVERE = 'severe',
}

export enum HealthDataSource {
  MANUAL = 'manual',
  WHOOP = 'whoop',
  APPLE_HEALTH = 'apple_health',
  STRAVA = 'strava',
}

@Schema({ _id: false })
export class BodyMeasurement {
  @Prop({ min: 0 })
  weightKg?: number;

  @Prop({ min: 0 })
  heightCm?: number;

  @Prop({ min: 0 })
  bodyFatPercentage?: number;

  @Prop({ min: 0 })
  muscleMassKg?: number;

  @Prop({ min: 0 })
  waistCm?: number;

  @Prop({ min: 0 })
  chestCm?: number;

  @Prop({ min: 0 })
  hipsCm?: number;

  @Prop({ min: 0 })
  leftArmCm?: number;

  @Prop({ min: 0 })
  rightArmCm?: number;

  @Prop({ min: 0 })
  leftThighCm?: number;

  @Prop({ min: 0 })
  rightThighCm?: number;
}

export const BodyMeasurementSchema =
  SchemaFactory.createForClass(BodyMeasurement);

@Schema({ _id: false })
export class SleepData {
  @Prop()
  sleepAt?: Date;

  @Prop()
  wakeAt?: Date;

  @Prop({ min: 0, max: 24 })
  durationHours?: number;

  @Prop({ min: 0, max: 24 })
  timeInBedHours?: number;

  @Prop({ min: 0, max: 100 })
  sleepScore?: number;

  @Prop({ min: 0, max: 10 })
  sleepQuality?: number;

  @Prop({ min: 0 })
  lightSleepMinutes?: number;

  @Prop({ min: 0 })
  deepSleepMinutes?: number;

  @Prop({ min: 0 })
  remSleepMinutes?: number;

  @Prop({ min: 0 })
  awakeMinutes?: number;

  @Prop({ min: 0 })
  disturbances?: number;

  @Prop({ min: 0 })
  sleepNeedMinutes?: number;

  @Prop({ min: 0 })
  sleepDebtMinutes?: number;

  @Prop({ min: 0, max: 100 })
  sleepPerformancePercentage?: number;

  @Prop({ min: 0, max: 100 })
  sleepEfficiencyPercentage?: number;

  @Prop({ min: 0, max: 100 })
  sleepConsistencyPercentage?: number;

  @Prop({ default: false })
  napTaken?: boolean;

  @Prop({ min: 0 })
  napMinutes?: number;
}

export const SleepDataSchema =
  SchemaFactory.createForClass(SleepData);

@Schema({ _id: false })
export class RecoveryData {
  @Prop({ min: 0, max: 100 })
  recoveryScore?: number;

  @Prop({ min: 0 })
  restingHeartRateBpm?: number;

  @Prop({ min: 0 })
  heartRateVariabilityMs?: number;

  @Prop({ min: 0 })
  respiratoryRateBreathsPerMinute?: number;

  @Prop({ min: 0, max: 100 })
  bloodOxygenPercentage?: number;

  @Prop()
  skinTemperatureCelsius?: number;

  @Prop()
  skinTemperatureDeviationCelsius?: number;

  @Prop({ min: 0 })
  vo2Max?: number;

  @Prop({ min: 0, max: 10 })
  fatigueScore?: number;

  @Prop({ min: 0, max: 10 })
  sorenessScore?: number;

  @Prop({ min: 0, max: 10 })
  stressScore?: number;
}

export const RecoveryDataSchema =
  SchemaFactory.createForClass(RecoveryData);

@Schema({ _id: false })
export class CardioData {
  @Prop({ min: 0 })
  distanceKm?: number;

  @Prop({ min: 0 })
  durationMinutes?: number;

  @Prop({ min: 0 })
  averageHeartRateBpm?: number;

  @Prop({ min: 0 })
  maximumHeartRateBpm?: number;

  @Prop({ min: 0 })
  averageSpeedKmph?: number;

  @Prop({ min: 0 })
  averagePaceMinutesPerKm?: number;

  @Prop({ min: 0 })
  caloriesBurned?: number;

  @Prop({ min: 0 })
  elevationGainMetres?: number;
}

export const CardioDataSchema =
  SchemaFactory.createForClass(CardioData);

@Schema({ _id: false })
export class ExerciseSet {
  @Prop({ required: true, min: 1 })
  setNumber: number;

  @Prop({ min: 0 })
  repetitions?: number;

  @Prop({ min: 0 })
  weightKg?: number;

  @Prop({ min: 0 })
  durationSeconds?: number;

  @Prop({ min: 0 })
  distanceMetres?: number;

  @Prop({ min: 0, max: 10 })
  perceivedExertion?: number;

  @Prop({ default: false })
  completed?: boolean;
}

export const ExerciseSetSchema =
  SchemaFactory.createForClass(ExerciseSet);

@Schema({ _id: false })
export class Exercise {
  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({ trim: true })
  muscleGroup?: string;

  @Prop({
    type: [ExerciseSetSchema],
    default: [],
  })
  sets: ExerciseSet[];

  @Prop({ trim: true })
  notes?: string;
}

export const ExerciseSchema =
  SchemaFactory.createForClass(Exercise);

@Schema({ _id: false })
export class WorkoutData {
  @Prop({
    type: String,
    enum: WorkoutType,
    required: true,
  })
  type: WorkoutType;

  @Prop({ trim: true })
  title?: string;

  @Prop({
    type: String,
    enum: WorkoutIntensity,
    default: WorkoutIntensity.MODERATE,
  })
  intensity: WorkoutIntensity;

  @Prop({
    type: String,
    enum: HealthDataSource,
    default: HealthDataSource.MANUAL,
  })
  source: HealthDataSource;

  @Prop({ trim: true })
  externalId?: string;

  @Prop({ min: 0 })
  durationMinutes?: number;

  @Prop({ min: 0 })
  caloriesBurned?: number;

  @Prop({ min: 0 })
  averageHeartRateBpm?: number;

  @Prop({ min: 0 })
  maximumHeartRateBpm?: number;

  @Prop({ min: 0, max: 21 })
  strainScore?: number;

  @Prop({ min: 0, max: 10 })
  perceivedExertion?: number;

  @Prop({
    type: [ExerciseSchema],
    default: [],
  })
  exercises: Exercise[];

  @Prop({
    type: CardioDataSchema,
    default: undefined,
  })
  cardio?: CardioData;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: false })
  completed: boolean;

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;
}

export const WorkoutDataSchema =
  SchemaFactory.createForClass(WorkoutData);

@Schema({ _id: false })
export class NutritionData {
  @Prop({ min: 0 })
  calories?: number;

  @Prop({ min: 0 })
  proteinGrams?: number;

  @Prop({ min: 0 })
  carbohydratesGrams?: number;

  @Prop({ min: 0 })
  fatGrams?: number;

  @Prop({ min: 0 })
  fibreGrams?: number;

  @Prop({ min: 0 })
  sugarGrams?: number;

  @Prop({ min: 0 })
  waterLitres?: number;

  @Prop({ min: 0 })
  caffeineMg?: number;

  @Prop({ min: 0 })
  mealsCount?: number;

  @Prop({ default: false })
  followedMealPlan?: boolean;

  @Prop({ default: false })
  hadAlcohol?: boolean;

  @Prop({ default: false })
  smoked?: boolean;

  @Prop({
    type: [String],
    default: [],
  })
  supplements: string[];

  @Prop({
    type: [String],
    default: [],
  })
  meals: string[];

  @Prop({ trim: true })
  notes?: string;
}

export const NutritionDataSchema =
  SchemaFactory.createForClass(NutritionData);

@Schema({ _id: false })
export class PainEntry {
  @Prop({
    required: true,
    trim: true,
  })
  bodyPart: string;

  @Prop({
    type: String,
    enum: PainSeverity,
    default: PainSeverity.MILD,
  })
  severity: PainSeverity;

  @Prop({ min: 0, max: 10 })
  painScore?: number;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  trigger?: string;

  @Prop({ trim: true })
  treatment?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop({ default: false })
  resolved?: boolean;
}

export const PainEntrySchema =
  SchemaFactory.createForClass(PainEntry);

@Schema({ _id: false })
export class HabitEntry {
  @Prop({
    required: true,
    trim: true,
  })
  key: string;

  @Prop({
    required: true,
    trim: true,
  })
  label: string;

  @Prop({ default: false })
  completed: boolean;
}

export const HabitEntrySchema =
  SchemaFactory.createForClass(HabitEntry);

@Schema({
  timestamps: true,
  collection: 'health_entries',
})
export class HealthEntry {
  @Prop({
    required: true,
    index: true,
  })
  date: Date;

  @Prop({
    required: true,
    trim: true,
  })
  dateKey: string;

  @Prop({
    required: true,
    trim: true,
  })
  slug: string;

  @Prop({
    type: BodyMeasurementSchema,
    default: undefined,
  })
  bodyMeasurement?: BodyMeasurement;

  @Prop({
    type: SleepDataSchema,
    default: undefined,
  })
  sleep?: SleepData;

  @Prop({
    type: RecoveryDataSchema,
    default: undefined,
  })
  recovery?: RecoveryData;

  @Prop({
    type: [WorkoutDataSchema],
    default: [],
  })
  workouts: WorkoutData[];

  @Prop({
    type: NutritionDataSchema,
    default: undefined,
  })
  nutrition?: NutritionData;

  @Prop({
    type: [HabitEntrySchema],
    default: [],
  })
  habits: HabitEntry[];

  @Prop({
    type: [PainEntrySchema],
    default: [],
  })
  painEntries: PainEntry[];

  @Prop({
    type: [String],
    enum: HealthDataSource,
    default: [],
  })
  sources: HealthDataSource[];

  @Prop({ min: 0 })
  steps?: number;

  @Prop({ min: 0 })
  activeMinutes?: number;

  @Prop({ min: 0 })
  standingHours?: number;

  @Prop({ min: 0 })
  totalCaloriesBurned?: number;

  @Prop({ min: 0 })
  restingCaloriesBurned?: number;

  @Prop({ min: 0, max: 21 })
  strainScore?: number;

  @Prop({ min: 0, max: 10 })
  energyScore?: number;

  @Prop({ min: 0, max: 10 })
  motivationScore?: number;

  @Prop({
    type: String,
    enum: HealthMood,
    default: HealthMood.NEUTRAL,
  })
  mood: HealthMood;

  @Prop({
    type: [String],
    default: [],
  })
  symptoms: string[];

  @Prop({
    type: [String],
    default: [],
  })
  achievements: string[];

  @Prop({
    type: [String],
    default: [],
  })
  goals: string[];

  @Prop({ trim: true })
  notes?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  wearableData: Record<string, unknown>;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const HealthEntrySchema =
  SchemaFactory.createForClass(HealthEntry);

HealthEntrySchema.index(
  {
    dateKey: 1,
  },
  {
    unique: true,
  },
);

HealthEntrySchema.index(
  {
    slug: 1,
  },
  {
    unique: true,
  },
);

HealthEntrySchema.index({
  isActive: 1,
  date: -1,
});

HealthEntrySchema.index({
  'workouts.type': 1,
  date: -1,
});

HealthEntrySchema.index({
  'workouts.source': 1,
  'workouts.externalId': 1,
});

HealthEntrySchema.index({
  'painEntries.bodyPart': 1,
  date: -1,
});

HealthEntrySchema.index({
  sources: 1,
  date: -1,
});

HealthEntrySchema.index({
  'recovery.recoveryScore': 1,
  date: -1,
});

HealthEntrySchema.index({
  strainScore: 1,
  date: -1,
});