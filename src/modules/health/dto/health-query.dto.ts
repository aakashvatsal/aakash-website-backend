import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import {
  HealthMood,
  WorkoutType,
} from '../schemas/health-entry.schema';

const stringToBoolean = ({
  value,
}: {
  value: unknown;
}) => {
  if (value === 'true' || value === true) {
    return true;
  }

  if (value === 'false' || value === false) {
    return false;
  }

  return value;
};

export class HealthQueryDto {
  // @IsMongoId()
  // userId: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(WorkoutType)
  workoutType?: WorkoutType;

  @IsOptional()
  @IsEnum(HealthMood)
  mood?: HealthMood;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  hasPain?: boolean;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  workoutCompleted?: boolean;

  @IsOptional()
  @Transform(stringToBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}