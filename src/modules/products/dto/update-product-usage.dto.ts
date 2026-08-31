import { IsEnum, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { ProductUnit, UsageFrequency } from '../schemas/product.schema';

export class UpdateProductUsageDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  initialQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  remainingQuantity?: number;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @IsOptional()
  @IsEnum(UsageFrequency)
  frequency?: UsageFrequency;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityPerUse?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  usesPerDay?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  usesPerWeek?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  remainingPercentage?: number;
}
