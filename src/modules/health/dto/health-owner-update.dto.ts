import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum HealthOwnerUpdateDomain {
  GENERAL = 'general',
  GYM = 'gym',
  DIET = 'diet',
  SUPPLEMENTS = 'supplements',
  MEDITATION = 'meditation',
  SKINCARE = 'skincare',
  HAIRCARE = 'haircare',
  INTIMATE_CARE = 'intimate_care',
  SLEEP_RECOVERY = 'sleep_recovery',
}

export class CreateHealthOwnerUpdateDto {
  @IsEnum(HealthOwnerUpdateDomain)
  domain: HealthOwnerUpdateDomain;

  @IsString()
  @MaxLength(4000)
  update: string;

  @IsOptional()
  @IsBoolean()
  refreshPlan?: boolean;
}

export class HealthOwnerUpdatesQueryDto {
  @IsOptional()
  @IsEnum(HealthOwnerUpdateDomain)
  domain?: HealthOwnerUpdateDomain;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
