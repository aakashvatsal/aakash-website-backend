import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

import { ProductCategory } from '../schemas/product.schema';
import {
  RecommendationStatus,
  RecommendationType,
} from '../schemas/product-recommendation.schema';

export class CreateProductRecommendationDto {
  @IsOptional()
  @IsMongoId()
  currentProductId?: string;

  @IsOptional()
  @IsMongoId()
  suggestedProductId?: string;

  @IsEnum(RecommendationType)
  recommendationType: RecommendationType;

  @IsOptional()
  @IsEnum(RecommendationStatus)
  status?: RecommendationStatus;

  @IsEnum(ProductCategory)
  category: ProductCategory;

  @IsString()
  suggestedProductName: string;

  @IsOptional()
  @IsString()
  suggestedBrand?: string;

  @IsOptional()
  @IsString()
  suggestedVariant?: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requirements?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  advantages?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  concerns?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  productUrl?: string;

  @IsOptional()
  @IsDateString()
  suggestedBuyAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
