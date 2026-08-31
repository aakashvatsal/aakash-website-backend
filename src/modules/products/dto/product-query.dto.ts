import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

import {
  ProductCategory,
  ProductStatus,
  ProductType,
  RepurchaseStatus,
} from '../schemas/product.schema';

const transformBoolean = ({ value }: { value: unknown }) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return value;
};

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsString()
  subCategory?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsEnum(RepurchaseStatus)
  repurchaseStatus?: RepurchaseStatus;

  @IsOptional()
  @IsString()
  tag?: string;

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
  endingSoon?: boolean;

  @IsOptional()
  @Transform(transformBoolean)
  @IsBoolean()
  expiringSoon?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
