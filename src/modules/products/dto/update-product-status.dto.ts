import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';

import { ProductStatus, RepurchaseStatus } from '../schemas/product.schema';

export class UpdateProductStatusDto {
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @IsOptional()
  @IsEnum(RepurchaseStatus)
  repurchaseStatus?: RepurchaseStatus;

  @IsOptional()
  @IsDateString()
  statusAt?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsMongoId()
  replacedByProductId?: string;
}
