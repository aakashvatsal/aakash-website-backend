import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { BrainDumpSource } from '../schemas/brain-dump.schema';

export class CreateBrainDumpDto {
  @IsString()
  @MaxLength(12000)
  content: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  title?: string;

  @IsOptional()
  @IsEnum(BrainDumpSource)
  source?: BrainDumpSource;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
