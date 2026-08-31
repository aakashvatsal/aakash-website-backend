import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  ProductCategory,
  ProductStatus,
  ProductType,
  ProductUnit,
  RepurchaseStatus,
  UsageFrequency,
} from '../schemas/product.schema';

export class ProductUsageDto {
  @IsOptional() @IsNumber() @Min(0) initialQuantity?: number;
  @IsOptional() @IsNumber() @Min(0) remainingQuantity?: number;
  @IsOptional() @IsEnum(ProductUnit) unit?: ProductUnit;
  @IsOptional() @IsEnum(UsageFrequency) frequency?: UsageFrequency;
  @IsOptional() @IsNumber() @Min(0) quantityPerUse?: number;
  @IsOptional() @IsNumber() @Min(0) usesPerDay?: number;
  @IsOptional() @IsNumber() @Min(0) usesPerWeek?: number;
}

export class ProductPurchaseDto {
  @IsOptional() @IsDateString() purchasedAt?: string;
  @IsOptional() @IsDateString() orderedAt?: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() retailer?: string;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) purchaseUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) invoiceUrl?: string;
}

export class CreateProductDto {
  @IsString() name: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() variant?: string;
  @IsOptional() @IsString() modelNumber?: string;
  @IsEnum(ProductCategory) category: ProductCategory;
  @IsOptional() @IsString() subCategory?: string;
  @IsOptional() @IsEnum(ProductType) productType?: ProductType;
  @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @IsOptional() @IsEnum(RepurchaseStatus) repurchaseStatus?: RepurchaseStatus;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductUsageDto)
  usage?: ProductUsageDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductPurchaseDto)
  purchase?: ProductPurchaseDto;
  @IsOptional() @IsUrl({ require_protocol: true }) imageUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) productUrl?: string;
  @IsOptional() @IsString() barcode?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) ingredients?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) purposes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) suitableFor?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  usageInstructions?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  benefitsObserved?: string[];
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sideEffectsObserved?: string[];
  @IsOptional() @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) effectivenessScore?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(10) valueForMoneyScore?: number;
  @IsOptional() @IsDateString() openedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsDateString() finishedAt?: string;
  @IsOptional() @IsMongoId() replacedByProductId?: string;
  @IsOptional() @IsMongoId() replacementForProductId?: string;
  @IsOptional() @IsString() replacementReason?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) memoryIds?: string[];
  @IsOptional() @IsBoolean() isFavourite?: boolean;
  @IsOptional() @IsBoolean() isArchived?: boolean;
}
