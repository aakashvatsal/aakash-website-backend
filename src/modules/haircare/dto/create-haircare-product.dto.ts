import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  HairApplicationArea,
  HaircareFrequency,
  HaircareProductCategory,
  HaircareProductStatus,
  HaircareTimeOfDay,
} from '../schemas/haircare-product.schema';

class HaircareScheduleDto {
  @IsOptional()
  @IsEnum(HaircareFrequency)
  frequency?: HaircareFrequency;

  @IsOptional()
  @IsArray()
  @IsEnum(HaircareTimeOfDay, { each: true })
  timesOfDay?: HaircareTimeOfDay[];

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalDays?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreateHaircareProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsEnum(HaircareProductCategory)
  category: HaircareProductCategory;

  @IsOptional()
  @IsEnum(HaircareProductStatus)
  status?: HaircareProductStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(HairApplicationArea, { each: true })
  applicationAreas?: HairApplicationArea[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  activeIngredients?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  purposes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetedConcerns?: string[];

  @ValidateNested()
  @Type(() => HaircareScheduleDto)
  schedule: HaircareScheduleDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPerUse?: number;

  @IsOptional()
  @IsString()
  amountUnit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  concentrationPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leaveOnMinutes?: number;

  @IsOptional()
  @IsBoolean()
  requiresRinsing?: boolean;

  @IsOptional()
  @IsBoolean()
  patchTestRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  patchTestCompleted?: boolean;

  @IsOptional()
  @IsDateString()
  patchTestAt?: string;

  @IsOptional()
  @IsString()
  patchTestResult?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownInteractions?: string[];

  @IsOptional()
  @IsBoolean()
  medicallyPrescribed?: boolean;

  @IsOptional()
  @IsString()
  prescribedBy?: string;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
