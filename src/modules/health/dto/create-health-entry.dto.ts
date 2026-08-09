import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  HealthDataSource,
  HealthMood,
  PainSeverity,
  WorkoutIntensity,
  WorkoutType,
} from '../schemas/health-entry.schema';

export class BodyMeasurementDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bodyFatPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  muscleMassKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waistCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  chestCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hipsCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leftArmCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rightArmCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leftThighCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rightThighCm?: number;
}

export class SleepDataDto {
  @IsOptional()
  @IsDateString()
  sleepAt?: string;

  @IsOptional()
  @IsDateString()
  wakeAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  durationHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(24)
  timeInBedHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sleepScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  sleepQuality?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lightSleepMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deepSleepMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remSleepMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  awakeMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  disturbances?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sleepNeedMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sleepDebtMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sleepPerformancePercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sleepEfficiencyPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sleepConsistencyPercentage?: number;

  @IsOptional()
  @IsBoolean()
  napTaken?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  napMinutes?: number;
}

export class RecoveryDataDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  recoveryScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  restingHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heartRateVariabilityMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  respiratoryRateBreathsPerMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bloodOxygenPercentage?: number;

  @IsOptional()
  @IsNumber()
  skinTemperatureCelsius?: number;

  @IsOptional()
  @IsNumber()
  skinTemperatureDeviationCelsius?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vo2Max?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  fatigueScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  sorenessScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressScore?: number;
}

export class CardioDataDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageSpeedKmph?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averagePaceMinutesPerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  caloriesBurned?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  elevationGainMetres?: number;
}

export class ExerciseSetDto {
  @IsNumber()
  @Min(1)
  setNumber: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  repetitions?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceMetres?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  perceivedExertion?: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class ExerciseDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  muscleGroup?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseSetDto)
  sets?: ExerciseSetDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class WorkoutDataDto {
  @IsEnum(WorkoutType)
  type: WorkoutType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(WorkoutIntensity)
  intensity?: WorkoutIntensity;

  @IsOptional()
  @IsEnum(HealthDataSource)
  source?: HealthDataSource;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  caloriesBurned?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  averageHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maximumHeartRateBpm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(21)
  strainScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  perceivedExertion?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises?: ExerciseDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CardioDataDto)
  cardio?: CardioDataDto;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class NutritionDataDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  calories?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  proteinGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  carbohydratesGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fatGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fibreGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sugarGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waterLitres?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  caffeineMg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mealsCount?: number;

  @IsOptional()
  @IsBoolean()
  followedMealPlan?: boolean;

  @IsOptional()
  @IsBoolean()
  hadAlcohol?: boolean;

  @IsOptional()
  @IsBoolean()
  smoked?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  supplements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  meals?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PainEntryDto {
  @IsString()
  bodyPart: string;

  @IsOptional()
  @IsEnum(PainSeverity)
  severity?: PainSeverity;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  painScore?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  trigger?: string;

  @IsOptional()
  @IsString()
  treatment?: string;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  resolvedAt?: string;

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;
}

export class HabitEntryDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateHealthEntryDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BodyMeasurementDto)
  bodyMeasurement?: BodyMeasurementDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SleepDataDto)
  sleep?: SleepDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecoveryDataDto)
  recovery?: RecoveryDataDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkoutDataDto)
  workouts?: WorkoutDataDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionDataDto)
  nutrition?: NutritionDataDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HabitEntryDto)
  habits?: HabitEntryDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PainEntryDto)
  painEntries?: PainEntryDto[];

  @IsOptional()
  @IsArray()
  @IsEnum(HealthDataSource, {
    each: true,
  })
  sources?: HealthDataSource[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  steps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  activeMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  standingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalCaloriesBurned?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  restingCaloriesBurned?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(21)
  strainScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  motivationScore?: number;

  @IsOptional()
  @IsEnum(HealthMood)
  mood?: HealthMood;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  achievements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  wearableData?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  memoryIds?: string[];

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}