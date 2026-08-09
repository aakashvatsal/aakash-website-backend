import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  IntimateCareLogStatus,
  IntimateCareReactionType,
} from '../schemas/daily-intimate-care-log.schema';

export class UpdateIntimateCareLogItemDto {
  @IsEnum(IntimateCareLogStatus)
  status: IntimateCareLogStatus;

  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountUsed?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(IntimateCareReactionType, {
    each: true,
  })
  reactions?: IntimateCareReactionType[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  reactionSeverity?: number;

  @IsOptional()
  @IsString()
  reactionNotes?: string;

  @IsOptional()
  @IsString()
  skipReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}