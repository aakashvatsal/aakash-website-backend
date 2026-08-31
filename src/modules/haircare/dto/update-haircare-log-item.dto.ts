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
  HaircareLogStatus,
  HairReactionType,
} from '../schemas/daily-haircare-log.schema';

export class UpdateHaircareLogItemDto {
  @IsEnum(HaircareLogStatus)
  status: HaircareLogStatus;

  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountUsed?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(HairReactionType, { each: true })
  reactions?: HairReactionType[];

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
