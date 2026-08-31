import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

import { MemoryType } from '../schemas/memory.schema';

const transformBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
};

export enum MemoryRecallIntent {
  RELEVANT = 'relevant',
  RECENT = 'recent',
  CURRENT_STATE = 'current_state',
  IMPORTANT = 'important',
  HISTORICAL = 'historical',
}

export class MemoryRecallQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsEnum(MemoryRecallIntent)
  intent?: MemoryRecallIntent;

  @IsOptional()
  @IsEnum(MemoryType)
  type?: MemoryType;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  includeHistorical?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  limit?: number;
}
