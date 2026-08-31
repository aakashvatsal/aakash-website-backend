import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  DietGoal,
  DietPreference,
  MealStatus,
  MealType,
} from '../schemas/diet-entry.schema';

class NutritionValuesDto {
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
  sodiumMg?: number;
}

class FoodItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  preparationMethod?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionValuesDto)
  nutrition?: NutritionValuesDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredients?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

class MealDto {
  @IsEnum(MealType)
  type: MealType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @IsDateString()
  consumedAt?: string;

  @IsOptional()
  @IsEnum(MealStatus)
  status?: MealStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodItemDto)
  plannedItems?: FoodItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodItemDto)
  consumedItems?: FoodItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  completionPercentage?: number;

  @IsOptional()
  @IsString()
  replacementReason?: string;

  @IsOptional()
  @IsString()
  skipReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class DietTargetsDto {
  @IsOptional()
  @IsEnum(DietGoal)
  goal?: DietGoal;

  @IsOptional()
  @ValidateNested()
  @Type(() => NutritionValuesDto)
  nutrition?: NutritionValuesDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waterLitres?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  mealsCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fruitServings?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vegetableServings?: number;
}

class SupplementEntryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dosage?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @IsOptional()
  @IsBoolean()
  taken?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

class DietPreparationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groceriesRequired?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groceriesPurchased?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentRequired?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mealPrepTasks?: string[];

  @IsOptional()
  @IsBoolean()
  mealPrepCompleted?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualCost?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateDietEntryDto {
  @IsDateString()
  date: string;

  @IsOptional()
  @IsEnum(DietPreference)
  preference?: DietPreference;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DietTargetsDto)
  targets?: DietTargetsDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  meals?: MealDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplementEntryDto)
  supplements?: SupplementEntryDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DietPreparationDto)
  preparation?: DietPreparationDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietaryRestrictions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cravings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
