import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { MediaExecutionStatus } from '../schemas/media-daily-execution.schema';

export class UpdateMediaExecutionDto {
  @IsEnum(MediaExecutionStatus)
  status: MediaExecutionStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  completedCount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  blockedReason?: string;

  @IsOptional()
  @IsDateString()
  rescheduledTo?: string;
}
