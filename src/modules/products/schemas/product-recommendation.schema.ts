import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { ProductCategory } from './product.schema';

export type ProductRecommendationDocument =
  HydratedDocument<ProductRecommendation>;

export enum RecommendationType {
  REPURCHASE = 'repurchase',
  ALTERNATIVE = 'alternative',
  UPGRADE = 'upgrade',
  NEW_PRODUCT = 'new_product',
  REPLACEMENT = 'replacement',
}

export enum RecommendationStatus {
  SUGGESTED = 'suggested',
  SAVED = 'saved',
  ACCEPTED = 'accepted',
  ORDERED = 'ordered',
  PURCHASED = 'purchased',
  DISMISSED = 'dismissed',
  EXPIRED = 'expired',
}

@Schema({
  timestamps: true,
  collection: 'product_recommendations',
})
export class ProductRecommendation {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Product',
    default: null,
    index: true,
  })
  currentProductId?: Types.ObjectId | null;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Product',
    default: null,
  })
  suggestedProductId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: RecommendationType,
    required: true,
    index: true,
  })
  recommendationType: RecommendationType;

  @Prop({
    type: String,
    enum: RecommendationStatus,
    default: RecommendationStatus.SUGGESTED,
    index: true,
  })
  status: RecommendationStatus;

  @Prop({
    type: String,
    enum: ProductCategory,
    required: true,
    index: true,
  })
  category: ProductCategory;

  @Prop({
    required: true,
    trim: true,
  })
  suggestedProductName: string;

  @Prop({
    trim: true,
  })
  suggestedBrand?: string;

  @Prop({
    trim: true,
  })
  suggestedVariant?: string;

  @Prop({
    required: true,
    trim: true,
  })
  reason: string;

  @Prop({
    type: [String],
    default: [],
  })
  requirements: string[];

  @Prop({
    type: [String],
    default: [],
  })
  advantages: string[];

  @Prop({
    type: [String],
    default: [],
  })
  concerns: string[];

  @Prop({
    min: 0,
    max: 1,
    default: 0.5,
  })
  confidence: number;

  @Prop({
    min: 0,
    default: 0,
  })
  priority: number;

  @Prop({
    min: 0,
  })
  estimatedPrice?: number;

  @Prop({
    trim: true,
    uppercase: true,
    default: 'INR',
  })
  currency: string;

  @Prop({
    trim: true,
  })
  productUrl?: string;

  @Prop()
  suggestedBuyAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({
    trim: true,
  })
  dismissedReason?: string;

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const ProductRecommendationSchema = SchemaFactory.createForClass(
  ProductRecommendation,
);

ProductRecommendationSchema.index({
  status: 1,
  priority: -1,
  createdAt: -1,
});

ProductRecommendationSchema.index({
  category: 1,
  status: 1,
});

ProductRecommendationSchema.index({
  currentProductId: 1,
  status: 1,
});

ProductRecommendationSchema.index({
  suggestedBuyAt: 1,
  status: 1,
});
