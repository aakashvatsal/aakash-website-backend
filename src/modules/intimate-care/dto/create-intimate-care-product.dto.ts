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
  IntimateCareApplicationArea,
  IntimateCareFrequency,
  IntimateCareProductCategory,
  IntimateCareProductStatus,
  IntimateCareTimeOfDay,
} from '../schemas/intimate-care-product.schema';

class IntimateCareScheduleDto {
  @IsOptional()
  @IsEnum(IntimateCareFrequency)
  frequency?: IntimateCareFrequency;

  @IsOptional()
  @IsArray()
  @IsEnum(IntimateCareTimeOfDay, { each: true })
  timesOfDay?: IntimateCareTimeOfDay[];

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

export class CreateIntimateCareProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsEnum(IntimateCareProductCategory)
  category: IntimateCareProductCategory;

  @IsOptional()
  @IsEnum(IntimateCareProductStatus)
  status?: IntimateCareProductStatus;

  @IsOptional()
  @IsArray()
  @IsEnum(IntimateCareApplicationArea, {
    each: true,
  })
  applicationAreas?: IntimateCareApplicationArea[];

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
  @Type(() => IntimateCareScheduleDto)
  schedule: IntimateCareScheduleDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPerUse?: number;

  @IsOptional()
  @IsString()
  amountUnit?: string;

  @IsOptional()
  @IsBoolean()
  externalUseOnly?: boolean;

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
