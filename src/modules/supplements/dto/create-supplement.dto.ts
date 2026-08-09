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
  DayOfWeek,
  SupplementFrequency,
  SupplementStatus,
  SupplementTimingRelation,
} from '../schemas/supplement.schema';

class SupplementDoseDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  unit: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;
}

class SupplementScheduleDto {
  @IsOptional()
  @IsEnum(SupplementFrequency)
  frequency?: SupplementFrequency;

  @IsOptional()
  @IsArray()
  @IsEnum(DayOfWeek, { each: true })
  daysOfWeek?: DayOfWeek[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  times?: string[];

  @IsOptional()
  @IsEnum(SupplementTimingRelation)
  timingRelation?: SupplementTimingRelation;

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
  customInstructions?: string;
}

export class CreateSupplementDto {
  @IsString()
  userId: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  form?: string;

  @ValidateNested()
  @Type(() => SupplementDoseDto)
  dose: SupplementDoseDto;

  @ValidateNested()
  @Type(() => SupplementScheduleDto)
  schedule: SupplementScheduleDto;

  @IsOptional()
  @IsEnum(SupplementStatus)
  status?: SupplementStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  purposes?: string[];

  @IsOptional()
  @IsString()
  prescribedBy?: string;

  @IsOptional()
  @IsBoolean()
  medicallyPrescribed?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedHealthGoals?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownInteractions?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  stockUnit?: string;
}