import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import { MeditationMood } from '../schemas/meditation-entry.schema';

export class UpdateMeditationReflectionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  focusScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  calmnessBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  calmnessAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  stressAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyBefore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  energyAfter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  satisfactionScore?: number;

  @IsOptional()
  @IsEnum(MeditationMood)
  moodBefore?: MeditationMood;

  @IsOptional()
  @IsEnum(MeditationMood)
  moodAfter?: MeditationMood;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distractionsCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  distractions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  insights?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefits?: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
