import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  PersonInteractionChannel,
  PersonInteractionDirection,
  PersonInteractionType,
} from '../schemas/person-interaction.schema';

export class CreatePersonInteractionDto {
  @IsEnum(PersonInteractionType)
  type: PersonInteractionType;

  @IsOptional()
  @IsEnum(PersonInteractionChannel)
  channel?: PersonInteractionChannel;

  @IsOptional()
  @IsEnum(PersonInteractionDirection)
  direction?: PersonInteractionDirection;

  @IsDateString()
  occurredAt: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  durationMinutes?: number;

  @IsString()
  @MaxLength(5000)
  summary: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  participantIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsMongoId()
  linkedMemoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceLabel?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class PersonTimelineQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(
    [
      'interaction',
      'memory',
      'commitment',
      'journal',
      'task',
      'media',
      'decision',
    ],
    { each: true },
  )
  types?: Array<
    | 'interaction'
    | 'memory'
    | 'commitment'
    | 'journal'
    | 'task'
    | 'media'
    | 'decision'
  >;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
