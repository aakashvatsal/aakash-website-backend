import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MediaOutcomeStatus } from '../schemas/media-post.schema';

export class UpdateMediaOutcomeDto {
  @IsEnum(MediaOutcomeStatus)
  status: MediaOutcomeStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string;

  @IsOptional()
  @IsString()
  expectationResult?: string;

  @IsOptional()
  @IsString()
  whatWorked?: string;

  @IsOptional()
  @IsString()
  whatDidNotWork?: string;

  @IsOptional()
  @IsString()
  lessonLearned?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  contentScore?: number;

  @IsOptional()
  @IsDateString()
  evaluatedAt?: string;
}