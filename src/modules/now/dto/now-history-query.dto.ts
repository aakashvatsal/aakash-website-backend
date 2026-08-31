import { Transform, Type } from 'class-transformer';

import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

import {
  NowActivityType,
  NowSource,
  NowVisibility,
} from '../schemas/now-status.schema';

const transformBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class NowHistoryQueryDto {
  @IsOptional()
  @IsEnum(NowActivityType)
  activityType?: NowActivityType;

  @IsOptional()
  @IsEnum(NowVisibility)
  visibility?: NowVisibility;

  @IsOptional()
  @IsEnum(NowSource)
  source?: NowSource;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isCurrent?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit = 20;
}
