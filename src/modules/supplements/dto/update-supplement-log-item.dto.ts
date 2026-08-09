import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { SupplementLogStatus } from '../schemas/daily-supplement-log.schema';

export class UpdateSupplementLogItemDto {
  @IsEnum(SupplementLogStatus)
  status: SupplementLogStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualAmount?: number;

  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @IsOptional()
  @IsString()
  skipReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptomsAfterTaking?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sideEffects?: string[];
}