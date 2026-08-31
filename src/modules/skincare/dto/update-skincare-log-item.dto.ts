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
  SkinReactionType,
  SkincareLogStatus,
} from '../schemas/daily-skincare-log.schema';

export class UpdateSkincareLogItemDto {
  @IsEnum(SkincareLogStatus)
  status: SkincareLogStatus;

  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountUsed?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(SkinReactionType, { each: true })
  reactions?: SkinReactionType[];

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
