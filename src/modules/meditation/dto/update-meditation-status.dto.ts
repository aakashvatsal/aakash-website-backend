import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

import { MeditationStatus } from '../schemas/meditation-entry.schema';

export class UpdateMeditationStatusDto {
  @IsEnum(MeditationStatus)
  status: MeditationStatus;

  @IsOptional()
  @IsDateString()
  statusAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualDurationMinutes?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
