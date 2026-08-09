import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type ProductDocument =
  HydratedDocument<Product>;

export enum ProductCategory {
  SKINCARE = 'skincare',
  HAIRCARE = 'haircare',
  SUPPLEMENT = 'supplement',
  MEDICINE = 'medicine',
  FITNESS = 'fitness',
  MEDITATION = 'meditation',
  PERSONAL_CARE = 'personal_care',
  FOOD = 'food',
  ELECTRONICS = 'electronics',
  OFFICE = 'office',
  CONTENT_CREATION = 'content_creation',
  CLOTHING = 'clothing',
  FOOTWEAR = 'footwear',
  HOME = 'home',
  OTHER = 'other',
}

export enum ProductType {
  CONSUMABLE = 'consumable',
  DURABLE = 'durable',
  SUBSCRIPTION = 'subscription',
  DIGITAL = 'digital',
}

export enum ProductStatus {
  WANT_TO_BUY = 'want_to_buy',
  ORDERED = 'ordered',
  AVAILABLE = 'available',
  IN_USE = 'in_use',
  LOW = 'low',
  FINISHED = 'finished',
  EXPIRED = 'expired',
  DISCONTINUED = 'discontinued',
  REPLACED = 'replaced',
  NOT_SUITABLE = 'not_suitable',
  LOST = 'lost',
  DAMAGED = 'damaged',
}

export enum RepurchaseStatus {
  UNDECIDED = 'undecided',
  REPURCHASE = 'repurchase',
  DO_NOT_REPURCHASE = 'do_not_repurchase',
  FIND_ALTERNATIVE = 'find_alternative',
}

export enum ProductUnit {
  ML = 'ml',
  LITRE = 'litre',
  GRAM = 'gram',
  KG = 'kg',
  TABLET = 'tablet',
  CAPSULE = 'capsule',
  SCOOP = 'scoop',
  SERVING = 'serving',
  PIECE = 'piece',
  PACK = 'pack',
  BOTTLE = 'bottle',
  TUBE = 'tube',
  SACHET = 'sachet',
  UNIT = 'unit',
}

export enum UsageFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  OCCASIONAL = 'occasional',
  AS_NEEDED = 'as_needed',
}

@Schema({ _id: false })
export class ProductUsage {
  @Prop({
    min: 0,
    default: 0,
  })
  initialQuantity: number;

  @Prop({
    min: 0,
    default: 0,
  })
  remainingQuantity: number;

  @Prop({
    type: String,
    enum: ProductUnit,
    default: ProductUnit.UNIT,
  })
  unit: ProductUnit;

  @Prop({
    type: String,
    enum: UsageFrequency,
  })
  frequency?: UsageFrequency;

  /**
   * Quantity consumed during one usage.
   * Example: 1 capsule, 5 ml, 1 scoop.
   */
  @Prop({
    min: 0,
  })
  quantityPerUse?: number;

  @Prop({
    min: 0,
  })
  usesPerDay?: number;

  @Prop({
    min: 0,
  })
  usesPerWeek?: number;

  @Prop({
    min: 0,
    max: 100,
    default: 100,
  })
  remainingPercentage: number;

  @Prop()
  estimatedFinishAt?: Date;

  @Prop()
  lastUpdatedAt?: Date;
}

export const ProductUsageSchema =
  SchemaFactory.createForClass(ProductUsage);

@Schema({ _id: false })
export class ProductPurchase {
  @Prop()
  purchasedAt?: Date;

  @Prop()
  orderedAt?: Date;

  @Prop()
  deliveredAt?: Date;

  @Prop({
    min: 0,
  })
  price?: number;

  @Prop({
    trim: true,
    uppercase: true,
    default: 'INR',
  })
  currency: string;

  @Prop({
    trim: true,
  })
  retailer?: string;

  @Prop({
    trim: true,
  })
  orderId?: string;

  @Prop({
    trim: true,
  })
  purchaseUrl?: string;

  @Prop({
    trim: true,
  })
  invoiceUrl?: string;
}

export const ProductPurchaseSchema =
  SchemaFactory.createForClass(ProductPurchase);

@Schema({
  timestamps: true,
  collection: 'products',
})
export class Product {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name: string;

  @Prop({
    trim: true,
  })
  brand?: string;

  @Prop({
    trim: true,
  })
  variant?: string;

  @Prop({
    trim: true,
  })
  modelNumber?: string;

  @Prop({
    type: String,
    enum: ProductCategory,
    required: true,
    index: true,
  })
  category: ProductCategory;

  @Prop({
    trim: true,
  })
  subCategory?: string;

  @Prop({
    type: String,
    enum: ProductType,
    default: ProductType.CONSUMABLE,
    index: true,
  })
  productType: ProductType;

  @Prop({
    type: String,
    enum: ProductStatus,
    default: ProductStatus.AVAILABLE,
    index: true,
  })
  status: ProductStatus;

  @Prop({
    type: String,
    enum: RepurchaseStatus,
    default: RepurchaseStatus.UNDECIDED,
    index: true,
  })
  repurchaseStatus: RepurchaseStatus;

  @Prop({
    type: ProductUsageSchema,
    default: {},
  })
  usage: ProductUsage;

  @Prop({
    type: ProductPurchaseSchema,
    default: undefined,
  })
  purchase?: ProductPurchase;

  @Prop({
    trim: true,
  })
  imageUrl?: string;

  @Prop({
    trim: true,
  })
  productUrl?: string;

  @Prop({
    trim: true,
  })
  barcode?: string;

  @Prop({
    type: [String],
    default: [],
  })
  ingredients: string[];

  @Prop({
    type: [String],
    default: [],
  })
  purposes: string[];

  @Prop({
    type: [String],
    default: [],
  })
  suitableFor: string[];

  @Prop({
    type: [String],
    default: [],
  })
  usageInstructions: string[];

  @Prop({
    type: [String],
    default: [],
  })
  benefitsObserved: string[];

  @Prop({
    type: [String],
    default: [],
  })
  sideEffectsObserved: string[];

  @Prop({
    min: 0,
    max: 5,
  })
  rating?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  effectivenessScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  valueForMoneyScore?: number;

  @Prop()
  openedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop()
  finishedAt?: Date;

  @Prop()
  discontinuedAt?: Date;

  @Prop()
  replacedAt?: Date;

  @Prop({
    trim: true,
  })
  replacementReason?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Product',
    default: null,
  })
  replacedByProductId?: Types.ObjectId | null;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Product',
    default: null,
  })
  replacementForProductId?: Types.ObjectId | null;

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

  @Prop({
    default: false,
  })
  isFavourite: boolean;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const ProductSchema =
  SchemaFactory.createForClass(Product);

ProductSchema.index({
  userId: 1,
  category: 1,
  status: 1,
  isActive: 1,
});

ProductSchema.index({
  userId: 1,
  productType: 1,
  status: 1,
});

ProductSchema.index({
  userId: 1,
  'usage.estimatedFinishAt': 1,
  status: 1,
});

ProductSchema.index({
  userId: 1,
  repurchaseStatus: 1,
  status: 1,
});

ProductSchema.index({
  userId: 1,
  expiresAt: 1,
  status: 1,
});

ProductSchema.index({
  userId: 1,
  isFavourite: 1,
  isArchived: 1,
});

ProductSchema.index({
  name: 'text',
  brand: 'text',
  variant: 'text',
  modelNumber: 'text',
  subCategory: 'text',
  purposes: 'text',
  tags: 'text',
  notes: 'text',
});