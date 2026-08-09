import { Transform, Type } from 'class-transformer';

import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  JournalEntryType,
  JournalMood,
  JournalSource,
  JournalVisibility,
} from '../schemas/journal-entry.schema';

const transformBoolean = ({
  value,
}: {
  value: unknown;
}) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class JournalQueryDto {
  @IsOptional()
  @IsEnum(JournalEntryType)
  type?: JournalEntryType;

  @IsOptional()
  @IsEnum(JournalMood)
  mood?: JournalMood;

  @IsOptional()
  @IsEnum(JournalVisibility)
  visibility?: JournalVisibility;

  @IsOptional()
  @IsEnum(JournalSource)
  source?: JournalSource;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isFavourite?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}