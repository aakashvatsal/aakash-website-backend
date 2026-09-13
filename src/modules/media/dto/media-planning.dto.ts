import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';

export class GenerateMediaPlanningCycleDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsIn(['week', 'day', 'roll', 'ensure'])
  mode?: 'week' | 'day' | 'roll' | 'ensure';

  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @IsOptional()
  @IsIn(['yes', 'no', 'maybe', 'unknown'])
  outingStatus?: 'yes' | 'no' | 'maybe' | 'unknown';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  outingDetails?: string;
}
