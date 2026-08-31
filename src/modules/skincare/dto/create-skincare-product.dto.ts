import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  SkincareApplicationArea,
  SkincareFrequency,
  SkincareProductCategory,
  SkincareProductStatus,
  SkincareTimeOfDay,
} from '../schemas/skincare-product.schema';

class SkincareScheduleDto {
  @IsOptional()
  @IsEnum(SkincareFrequency)
  frequency?: SkincareFrequency;

  @IsOptional()
  @IsArray()
  @IsEnum(SkincareTimeOfDay, { each: true })
  timesOfDay?: SkincareTimeOfDay[];

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

export class CreateSkincareProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsEnum(SkincareProductCategory)
  category: SkincareProductCategory;

  @IsOptional()
  @IsEnum(SkincareProductStatus)
  status?: SkincareProductStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(SkincareApplicationArea, { each: true })
  applicationAreas?: SkincareApplicationArea[];

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
  @Type(() => SkincareScheduleDto)
  schedule: SkincareScheduleDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  spf?: number;

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
  incompatibleIngredients?: string[];

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
