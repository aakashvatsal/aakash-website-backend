import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type DietEntryDocument = HydratedDocument<DietEntry>;

export enum MealType {
  EARLY_MORNING = 'early_morning',
  BREAKFAST = 'breakfast',
  MID_MORNING = 'mid_morning',
  LUNCH = 'lunch',
  EVENING_SNACK = 'evening_snack',
  PRE_WORKOUT = 'pre_workout',
  POST_WORKOUT = 'post_workout',
  DINNER = 'dinner',
  BEDTIME = 'bedtime',
  OTHER = 'other',
}

export enum MealStatus {
  PLANNED = 'planned',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  SKIPPED = 'skipped',
  REPLACED = 'replaced',
}

export enum DietGoal {
  FAT_LOSS = 'fat_loss',
  MUSCLE_GAIN = 'muscle_gain',
  MAINTENANCE = 'maintenance',
  PERFORMANCE = 'performance',
  RECOVERY = 'recovery',
  GENERAL_HEALTH = 'general_health',
}

export enum DietPreference {
  VEGETARIAN = 'vegetarian',
  NON_VEGETARIAN = 'non_vegetarian',
  VEGAN = 'vegan',
  EGGETARIAN = 'eggetarian',
  PESCATARIAN = 'pescatarian',
  FLEXITARIAN = 'flexitarian',
}

export enum DietOutcomeStatus {
  NOT_EVALUATED = 'not_evaluated',
  BELOW_TARGET = 'below_target',
  MET_TARGET = 'met_target',
  ABOVE_TARGET = 'above_target',
}

@Schema({ _id: false })
export class NutritionValues {
  @Prop({ min: 0, default: 0 })
  calories: number;

  @Prop({ min: 0, default: 0 })
  proteinGrams: number;

  @Prop({ min: 0, default: 0 })
  carbohydratesGrams: number;

  @Prop({ min: 0, default: 0 })
  fatGrams: number;

  @Prop({ min: 0, default: 0 })
  fibreGrams: number;

  @Prop({ min: 0, default: 0 })
  sugarGrams: number;

  @Prop({ min: 0, default: 0 })
  sodiumMg: number;
}

export const NutritionValuesSchema =
  SchemaFactory.createForClass(NutritionValues);

@Schema({ _id: false })
export class FoodItem {
  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    min: 0,
    required: true,
  })
  quantity: number;

  @Prop({
    required: true,
    trim: true,
  })
  unit: string;

  @Prop({
    trim: true,
  })
  brand?: string;

  @Prop({
    trim: true,
  })
  preparationMethod?: string;

  @Prop({
    type: NutritionValuesSchema,
    default: () => ({}),
  })
  nutrition: NutritionValues;

  @Prop({
    type: [String],
    default: [],
  })
  ingredients: string[];

  @Prop({
    type: [String],
    default: [],
  })
  allergens: string[];

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const FoodItemSchema =
  SchemaFactory.createForClass(FoodItem);

@Schema({ _id: false })
export class Meal {
  @Prop({
    type: String,
    enum: MealType,
    required: true,
  })
  type: MealType;

  @Prop({
    trim: true,
  })
  title?: string;

  @Prop()
  plannedAt?: Date;

  @Prop()
  consumedAt?: Date;

  @Prop({
    type: String,
    enum: MealStatus,
    default: MealStatus.PLANNED,
  })
  status: MealStatus;

  @Prop({
    type: [FoodItemSchema],
    default: [],
  })
  plannedItems: FoodItem[];

  @Prop({
    type: [FoodItemSchema],
    default: [],
  })
  consumedItems: FoodItem[];

  @Prop({
    type: NutritionValuesSchema,
    default: () => ({}),
  })
  plannedNutrition: NutritionValues;

  @Prop({
    type: NutritionValuesSchema,
    default: () => ({}),
  })
  actualNutrition: NutritionValues;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  completionPercentage: number;

  @Prop({
    trim: true,
  })
  replacementReason?: string;

  @Prop({
    trim: true,
  })
  skipReason?: string;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const MealSchema =
  SchemaFactory.createForClass(Meal);

@Schema({ _id: false })
export class DietTargets {
  @Prop({
    type: String,
    enum: DietGoal,
    default: DietGoal.GENERAL_HEALTH,
  })
  goal: DietGoal;

  @Prop({
    type: NutritionValuesSchema,
    default: () => ({}),
  })
  nutrition: NutritionValues;

  @Prop({
    min: 0,
    default: 0,
  })
  waterLitres: number;

  @Prop({
    min: 0,
    default: 0,
  })
  mealsCount: number;

  @Prop({
    min: 0,
    default: 0,
  })
  fruitServings: number;

  @Prop({
    min: 0,
    default: 0,
  })
  vegetableServings: number;
}

export const DietTargetsSchema =
  SchemaFactory.createForClass(DietTargets);

@Schema({ _id: false })
export class DietActuals {
  @Prop({
    type: NutritionValuesSchema,
    default: () => ({}),
  })
  nutrition: NutritionValues;

  @Prop({
    min: 0,
    default: 0,
  })
  waterLitres: number;

  @Prop({
    min: 0,
    default: 0,
  })
  mealsCompleted: number;

  @Prop({
    min: 0,
    default: 0,
  })
  mealsSkipped: number;

  @Prop({
    min: 0,
    default: 0,
  })
  fruitServings: number;

  @Prop({
    min: 0,
    default: 0,
  })
  vegetableServings: number;

  @Prop({
    default: false,
  })
  hadAlcohol: boolean;

  @Prop({
    default: false,
  })
  hadJunkFood: boolean;

  @Prop({
    default: false,
  })
  smoked: boolean;
}

export const DietActualsSchema =
  SchemaFactory.createForClass(DietActuals);

@Schema({ _id: false })
export class SupplementEntry {
  @Prop({
    required: true,
    trim: true,
  })
  name: string;

  @Prop({
    min: 0,
  })
  dosage?: number;

  @Prop({
    trim: true,
  })
  unit?: string;

  @Prop()
  plannedAt?: Date;

  @Prop()
  takenAt?: Date;

  @Prop({
    default: false,
  })
  taken: boolean;

  @Prop({
    trim: true,
  })
  notes?: string;
}

export const SupplementEntrySchema =
  SchemaFactory.createForClass(SupplementEntry);

@Schema({ _id: false })
export class DietPreparation {
  @Prop({
    type: [String],
    default: [],
  })
  groceriesRequired: string[];

  @Prop({
    type: [String],
    default: [],
  })
  groceriesPurchased: string[];

  @Prop({
    type: [String],
    default: [],
  })
  equipmentRequired: string[];

  @Prop({
    type: [String],
    default: [],
  })
  mealPrepTasks: string[];

  @Prop({
    default: false,
  })
  mealPrepCompleted: boolean;

  @Prop({
    min: 0,
    default: 0,
  })
  estimatedCost: number;

  @Prop({
    min: 0,
    default: 0,
  })
  actualCost: number;

  @Prop({
    trim: true,
    default: 'INR',
  })
  currency: string;
}

export const DietPreparationSchema =
  SchemaFactory.createForClass(DietPreparation);

@Schema({ _id: false })
export class DietAdherence {
  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  calorieTargetPercentage: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  proteinTargetPercentage: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  hydrationTargetPercentage: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  mealPlanCompletionPercentage: number;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  overallPercentage: number;

  @Prop({
    default: false,
  })
  followedMealPlan: boolean;
}

export const DietAdherenceSchema =
  SchemaFactory.createForClass(DietAdherence);

@Schema({ _id: false })
export class DietOutcome {
  @Prop({
    type: String,
    enum: DietOutcomeStatus,
    default: DietOutcomeStatus.NOT_EVALUATED,
  })
  status: DietOutcomeStatus;

  @Prop({
    trim: true,
  })
  expectation?: string;

  @Prop({
    trim: true,
  })
  expectationResult?: string;

  @Prop({
    trim: true,
  })
  resultSummary?: string;

  @Prop({
    trim: true,
  })
  whatWorked?: string;

  @Prop({
    trim: true,
  })
  whatDidNotWork?: string;

  @Prop({
    trim: true,
  })
  hungerObservation?: string;

  @Prop({
    trim: true,
  })
  digestionObservation?: string;

  @Prop({
    trim: true,
  })
  energyObservation?: string;

  @Prop({
    trim: true,
  })
  lessonLearned?: string;

  @Prop({
    trim: true,
  })
  nextDayAdjustment?: string;

  @Prop({
    min: 0,
    max: 10,
  })
  dietScore?: number;

  @Prop()
  evaluatedAt?: Date;
}

export const DietOutcomeSchema =
  SchemaFactory.createForClass(DietOutcome);

@Schema({
  timestamps: true,
  collection: 'diet_entries',
})
export class DietEntry {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    index: true,
  })
  date: Date;

  @Prop({
    type: String,
    enum: DietPreference,
    default: DietPreference.NON_VEGETARIAN,
  })
  preference: DietPreference;

  @Prop({
    type: DietTargetsSchema,
    default: () => ({}),
  })
  targets: DietTargets;

  @Prop({
    type: [MealSchema],
    default: [],
  })
  meals: Meal[];

  @Prop({
    type: [SupplementEntrySchema],
    default: [],
  })
  supplements: SupplementEntry[];

  @Prop({
    type: DietActualsSchema,
    default: () => ({}),
  })
  actuals: DietActuals;

  @Prop({
    type: DietPreparationSchema,
    default: () => ({}),
  })
  preparation: DietPreparation;

  @Prop({
    type: DietAdherenceSchema,
    default: () => ({}),
  })
  adherence: DietAdherence;

  @Prop({
    type: DietOutcomeSchema,
    default: () => ({}),
  })
  outcome: DietOutcome;

  @Prop({
    type: [String],
    default: [],
  })
  dietaryRestrictions: string[];

  @Prop({
    type: [String],
    default: [],
  })
  allergies: string[];

  @Prop({
    type: [String],
    default: [],
  })
  cravings: string[];

  @Prop({
    type: [String],
    default: [],
  })
  symptoms: string[];

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const DietEntrySchema =
  SchemaFactory.createForClass(DietEntry);

DietEntrySchema.index(
  {
    userId: 1,
    date: 1,
  },
  {
    unique: true,
  },
);

DietEntrySchema.index({
  userId: 1,
  isActive: 1,
  date: -1,
});

DietEntrySchema.index({
  userId: 1,
  'targets.goal': 1,
  date: -1,
});

DietEntrySchema.index({
  userId: 1,
  'meals.status': 1,
  date: -1,
});