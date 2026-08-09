import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
    Model,
    Types,
} from 'mongoose';

import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductRecommendationDto } from './dto/create-product-recommendation.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateProductUsageDto } from './dto/update-product-usage.dto';
import {
    Product,
    ProductDocument,
    ProductStatus,
    ProductType,
    RepurchaseStatus,
} from './schemas/product.schema';
import {
    ProductRecommendation,
    ProductRecommendationDocument,
    RecommendationStatus,
    RecommendationType,
} from './schemas/product-recommendation.schema';

@Injectable()
export class ProductsService {
    constructor(
        @InjectModel(Product.name)
        private readonly productModel:
            Model<ProductDocument>,

        @InjectModel(ProductRecommendation.name)
        private readonly recommendationModel:
            Model<ProductRecommendationDocument>,
    ) { }

    async create(dto: CreateProductDto) {
        this.validateObjectId(dto.userId, 'user ID');

        const userId = new Types.ObjectId(dto.userId);

        const duplicate = await this.productModel.exists({
            userId,
            name: {
                $regex: `^${this.escapeRegex(
                    dto.name.trim(),
                )}$`,
                $options: 'i',
            },
            brand: dto.brand?.trim(),
            status: {
                $nin: [
                    ProductStatus.FINISHED,
                    ProductStatus.REPLACED,
                    ProductStatus.DISCONTINUED,
                ],
            },
            isActive: true,
        });

        if (duplicate) {
            throw new ConflictException(
                'An active product with this name already exists.',
            );
        }

        const productType =
            dto.productType ??
            ProductType.CONSUMABLE;

        const initialQuantity =
            dto.usage?.initialQuantity ??
            (productType === ProductType.DURABLE
                ? 1
                : 0);

        const remainingQuantity =
            dto.usage?.remainingQuantity ??
            initialQuantity;

        const remainingPercentage =
            this.calculateRemainingPercentage(
                initialQuantity,
                remainingQuantity,
            );

        const status =
            dto.status ??
            this.calculateAutomaticStatus(
                productType,
                remainingPercentage,
                Boolean(dto.openedAt),
            );

        const usagePerDay =
            this.calculateUsagePerDay({
                quantityPerUse:
                    dto.usage?.quantityPerUse,
                usesPerDay: dto.usage?.usesPerDay,
                usesPerWeek:
                    dto.usage?.usesPerWeek,
            });

        const estimatedFinishAt =
            productType === ProductType.CONSUMABLE
                ? this.calculateEstimatedFinishDate(
                    remainingQuantity,
                    usagePerDay,
                )
                : undefined;

        return this.productModel.create({
            userId,
            name: dto.name.trim(),
            brand: dto.brand?.trim(),
            variant: dto.variant?.trim(),
            modelNumber: dto.modelNumber?.trim(),
            category: dto.category,
            subCategory:
                dto.subCategory?.trim(),
            productType,
            status,
            repurchaseStatus:
                dto.repurchaseStatus ??
                RepurchaseStatus.UNDECIDED,

            usage: {
                initialQuantity,
                remainingQuantity,
                unit: dto.usage?.unit,
                frequency: dto.usage?.frequency,
                quantityPerUse:
                    dto.usage?.quantityPerUse,
                usesPerDay: dto.usage?.usesPerDay,
                usesPerWeek:
                    dto.usage?.usesPerWeek,
                remainingPercentage,
                estimatedFinishAt,
                lastUpdatedAt: new Date(),
            },

            purchase: dto.purchase
                ? {
                    purchasedAt:
                        this.optionalDate(
                            dto.purchase.purchasedAt,
                            'purchasedAt',
                        ),
                    orderedAt: this.optionalDate(
                        dto.purchase.orderedAt,
                        'orderedAt',
                    ),
                    deliveredAt:
                        this.optionalDate(
                            dto.purchase.deliveredAt,
                            'deliveredAt',
                        ),
                    price: dto.purchase.price,
                    currency:
                        dto.purchase.currency
                            ?.trim()
                            .toUpperCase() ?? 'INR',
                    retailer:
                        dto.purchase.retailer?.trim(),
                    orderId:
                        dto.purchase.orderId?.trim(),
                    purchaseUrl:
                        dto.purchase.purchaseUrl?.trim(),
                    invoiceUrl:
                        dto.purchase.invoiceUrl?.trim(),
                }
                : undefined,

            imageUrl: dto.imageUrl?.trim(),
            productUrl: dto.productUrl?.trim(),
            barcode: dto.barcode?.trim(),

            ingredients: this.cleanStringArray(
                dto.ingredients,
            ),
            purposes: this.cleanStringArray(
                dto.purposes,
            ),
            suitableFor: this.cleanStringArray(
                dto.suitableFor,
            ),
            usageInstructions:
                this.cleanStringArray(
                    dto.usageInstructions,
                ),
            benefitsObserved:
                this.cleanStringArray(
                    dto.benefitsObserved,
                ),
            sideEffectsObserved:
                this.cleanStringArray(
                    dto.sideEffectsObserved,
                ),

            rating: dto.rating,
            effectivenessScore:
                dto.effectivenessScore,
            valueForMoneyScore:
                dto.valueForMoneyScore,

            openedAt: this.optionalDate(
                dto.openedAt,
                'openedAt',
            ),
            expiresAt: this.optionalDate(
                dto.expiresAt,
                'expiresAt',
            ),
            finishedAt: this.optionalDate(
                dto.finishedAt,
                'finishedAt',
            ),

            replacedByProductId:
                dto.replacedByProductId
                    ? new Types.ObjectId(
                        dto.replacedByProductId,
                    )
                    : null,

            replacementForProductId:
                dto.replacementForProductId
                    ? new Types.ObjectId(
                        dto.replacementForProductId,
                    )
                    : null,

            replacementReason:
                dto.replacementReason?.trim(),

            tags: this.normalizeTags(dto.tags),
            notes: dto.notes?.trim(),

            memoryIds: (dto.memoryIds ?? []).map(
                (id) => new Types.ObjectId(id),
            ),

            isFavourite:
                dto.isFavourite ?? false,
            isArchived:
                dto.isArchived ?? false,
        });
    }

    async findAll(query: ProductQueryDto) {
        this.validateObjectId(query.userId, 'user ID');

        const page = Math.max(query.page ?? 1, 1);
        const limit = Math.min(
            Math.max(query.limit ?? 20, 1),
            100,
        );

        const filter: Record<string, any> = {
            userId: new Types.ObjectId(query.userId),
            isActive: true,
        };

        if (query.category) {
            filter.category = query.category;
        }

        if (query.subCategory?.trim()) {
            filter.subCategory =
                query.subCategory.trim();
        }

        if (query.productType) {
            filter.productType = query.productType;
        }

        if (query.status) {
            filter.status = query.status;
        }

        if (query.repurchaseStatus) {
            filter.repurchaseStatus =
                query.repurchaseStatus;
        }

        if (query.tag?.trim()) {
            filter.tags = this.normalizeTag(query.tag);
        }

        if (query.isFavourite !== undefined) {
            filter.isFavourite = query.isFavourite;
        }

        if (query.isArchived !== undefined) {
            filter.isArchived = query.isArchived;
        }

        if (query.endingSoon) {
            filter.productType =
                ProductType.CONSUMABLE;

            filter['usage.estimatedFinishAt'] = {
                $gte: new Date(),
                $lte: new Date(
                    Date.now() +
                    30 * 24 * 60 * 60 * 1000,
                ),
            };

            filter.status = {
                $in: [
                    ProductStatus.IN_USE,
                    ProductStatus.LOW,
                ],
            };
        }

        if (query.expiringSoon) {
            filter.expiresAt = {
                $gte: new Date(),
                $lte: new Date(
                    Date.now() +
                    60 * 24 * 60 * 60 * 1000,
                ),
            };
        }

        if (query.search?.trim()) {
            filter.$text = {
                $search: query.search.trim(),
            };
        }

        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.productModel
                .find(filter)
                .sort({
                    status: 1,
                    'usage.remainingPercentage': 1,
                    createdAt: -1,
                })
                .skip(skip)
                .limit(limit)
                .lean(),

            this.productModel.countDocuments(filter),
        ]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findCurrentProducts(userId: string) {
        this.validateObjectId(userId, 'user ID');

        const products = await this.productModel
            .find({
                userId: new Types.ObjectId(userId),
                status: {
                    $in: [
                        ProductStatus.AVAILABLE,
                        ProductStatus.IN_USE,
                        ProductStatus.LOW,
                        ProductStatus.ORDERED,
                    ],
                },
                isActive: true,
                isArchived: false,
            })
            .sort({
                category: 1,
                status: 1,
                name: 1,
            })
            .lean();

        const grouped = products.reduce<
            Record<string, Product[]>
        >((result, product) => {
            const category = product.category;

            if (!result[category]) {
                result[category] = [];
            }

            result[category].push(product);

            return result;
        }, {});

        return {
            total: products.length,
            products,
            grouped,
        };
    }

    async findOne(
        productId: string,
        userId: string,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        return product.toObject();
    }

    async update(
        productId: string,
        userId: string,
        dto: UpdateProductDto,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        if (dto.name !== undefined) {
            product.name = dto.name.trim();
        }

        if (dto.brand !== undefined) {
            product.brand = dto.brand?.trim();
        }

        if (dto.variant !== undefined) {
            product.variant = dto.variant?.trim();
        }

        if (dto.modelNumber !== undefined) {
            product.modelNumber =
                dto.modelNumber?.trim();
        }

        if (dto.category !== undefined) {
            product.category = dto.category;
        }

        if (dto.subCategory !== undefined) {
            product.subCategory =
                dto.subCategory?.trim();
        }

        if (dto.productType !== undefined) {
            product.productType = dto.productType;
        }

        if (dto.status !== undefined) {
            product.status = dto.status;
        }

        if (dto.repurchaseStatus !== undefined) {
            product.repurchaseStatus =
                dto.repurchaseStatus;
        }

        if (dto.usage !== undefined) {
            this.applyUsageUpdate(
                product,
                dto.usage,
            );
        }

        if (dto.purchase !== undefined) {
            product.purchase = {
                purchasedAt: this.optionalDate(
                    dto.purchase.purchasedAt,
                    'purchasedAt',
                ),
                orderedAt: this.optionalDate(
                    dto.purchase.orderedAt,
                    'orderedAt',
                ),
                deliveredAt: this.optionalDate(
                    dto.purchase.deliveredAt,
                    'deliveredAt',
                ),
                price: dto.purchase.price,
                currency:
                    dto.purchase.currency
                        ?.trim()
                        .toUpperCase() ?? 'INR',
                retailer:
                    dto.purchase.retailer?.trim(),
                orderId: dto.purchase.orderId?.trim(),
                purchaseUrl:
                    dto.purchase.purchaseUrl?.trim(),
                invoiceUrl:
                    dto.purchase.invoiceUrl?.trim(),
            };
        }

        if (dto.imageUrl !== undefined) {
            product.imageUrl = dto.imageUrl?.trim();
        }

        if (dto.productUrl !== undefined) {
            product.productUrl =
                dto.productUrl?.trim();
        }

        if (dto.barcode !== undefined) {
            product.barcode = dto.barcode?.trim();
        }

        if (dto.ingredients !== undefined) {
            product.ingredients =
                this.cleanStringArray(dto.ingredients);
        }

        if (dto.purposes !== undefined) {
            product.purposes =
                this.cleanStringArray(dto.purposes);
        }

        if (dto.suitableFor !== undefined) {
            product.suitableFor =
                this.cleanStringArray(dto.suitableFor);
        }

        if (dto.usageInstructions !== undefined) {
            product.usageInstructions =
                this.cleanStringArray(
                    dto.usageInstructions,
                );
        }

        if (dto.benefitsObserved !== undefined) {
            product.benefitsObserved =
                this.cleanStringArray(
                    dto.benefitsObserved,
                );
        }

        if (
            dto.sideEffectsObserved !== undefined
        ) {
            product.sideEffectsObserved =
                this.cleanStringArray(
                    dto.sideEffectsObserved,
                );
        }

        if (dto.rating !== undefined) {
            product.rating = dto.rating;
        }

        if (dto.effectivenessScore !== undefined) {
            product.effectivenessScore =
                dto.effectivenessScore;
        }

        if (
            dto.valueForMoneyScore !== undefined
        ) {
            product.valueForMoneyScore =
                dto.valueForMoneyScore;
        }

        if (dto.openedAt !== undefined) {
            product.openedAt = this.optionalDate(
                dto.openedAt,
                'openedAt',
            );

            if (
                product.status ===
                ProductStatus.AVAILABLE
            ) {
                product.status =
                    ProductStatus.IN_USE;
            }
        }

        if (dto.expiresAt !== undefined) {
            product.expiresAt = this.optionalDate(
                dto.expiresAt,
                'expiresAt',
            );
        }

        if (dto.finishedAt !== undefined) {
            product.finishedAt =
                this.optionalDate(
                    dto.finishedAt,
                    'finishedAt',
                );
        }

        if (
            dto.replacedByProductId !== undefined
        ) {
            product.replacedByProductId =
                dto.replacedByProductId
                    ? new Types.ObjectId(
                        dto.replacedByProductId,
                    )
                    : null;
        }

        if (
            dto.replacementForProductId !==
            undefined
        ) {
            product.replacementForProductId =
                dto.replacementForProductId
                    ? new Types.ObjectId(
                        dto.replacementForProductId,
                    )
                    : null;
        }

        if (dto.replacementReason !== undefined) {
            product.replacementReason =
                dto.replacementReason?.trim();
        }

        if (dto.tags !== undefined) {
            product.tags = this.normalizeTags(dto.tags);
        }

        if (dto.notes !== undefined) {
            product.notes = dto.notes?.trim();
        }

        if (dto.memoryIds !== undefined) {
            product.memoryIds = dto.memoryIds.map(
                (id) => new Types.ObjectId(id),
            );
        }

        if (dto.isFavourite !== undefined) {
            product.isFavourite = dto.isFavourite;
        }

        if (dto.isArchived !== undefined) {
            product.isArchived = dto.isArchived;
        }

        await product.save();

        return product;
    }

    async updateUsage(
        productId: string,
        userId: string,
        dto: UpdateProductUsageDto,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        this.applyUsageUpdate(product, dto);

        await product.save();

        return product;
    }

    async consumeProduct(
        productId: string,
        userId: string,
        quantityUsed: number,
    ) {
        if (
            !Number.isFinite(quantityUsed) ||
            quantityUsed <= 0
        ) {
            throw new BadRequestException(
                'Quantity used must be greater than zero.',
            );
        }

        const product = await this.getProductDocument(
            productId,
            userId,
        );

        if (
            product.productType !==
            ProductType.CONSUMABLE
        ) {
            throw new BadRequestException(
                'Usage consumption is only supported for consumable products.',
            );
        }

        const currentRemaining =
            product.usage?.remainingQuantity ?? 0;

        const nextRemaining = Math.max(
            currentRemaining - quantityUsed,
            0,
        );

        this.applyUsageUpdate(product, {
            remainingQuantity: nextRemaining,
        });

        await product.save();

        return product;
    }

    async updateStatus(
        productId: string,
        userId: string,
        dto: UpdateProductStatusDto,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        const statusAt = dto.statusAt
            ? this.parseDate(dto.statusAt, 'statusAt')
            : new Date();

        product.status = dto.status;

        if (dto.repurchaseStatus !== undefined) {
            product.repurchaseStatus =
                dto.repurchaseStatus;
        }

        switch (dto.status) {
            case ProductStatus.ORDERED:
                product.purchase = {
                    ...(product.purchase ?? {}),
                    orderedAt: statusAt,
                    currency:
                        product.purchase?.currency ?? 'INR',
                };
                break;

            case ProductStatus.IN_USE:
                product.openedAt =
                    product.openedAt ?? statusAt;
                product.finishedAt = undefined;
                break;

            case ProductStatus.LOW:
                product.usage.remainingPercentage =
                    Math.min(
                        product.usage
                            .remainingPercentage ?? 20,
                        20,
                    );
                break;

            case ProductStatus.FINISHED:
                product.finishedAt = statusAt;
                product.usage.remainingQuantity = 0;
                product.usage.remainingPercentage = 0;
                product.usage.estimatedFinishAt =
                    statusAt;
                break;

            case ProductStatus.EXPIRED:
                product.expiresAt =
                    product.expiresAt ?? statusAt;
                break;

            case ProductStatus.REPLACED:
                product.replacedAt = statusAt;
                product.replacementReason =
                    dto.reason?.trim() ??
                    product.replacementReason;

                if (dto.replacedByProductId) {
                    this.validateObjectId(
                        dto.replacedByProductId,
                        'replacement product ID',
                    );

                    product.replacedByProductId =
                        new Types.ObjectId(
                            dto.replacedByProductId,
                        );
                }

                break;

            case ProductStatus.DISCONTINUED:
                product.discontinuedAt = statusAt;
                product.repurchaseStatus =
                    RepurchaseStatus.FIND_ALTERNATIVE;
                break;

            case ProductStatus.NOT_SUITABLE:
                product.repurchaseStatus =
                    RepurchaseStatus.DO_NOT_REPURCHASE;

                if (dto.reason?.trim()) {
                    product.notes = [
                        product.notes,
                        dto.reason.trim(),
                    ]
                        .filter(Boolean)
                        .join('\n');
                }

                break;
        }

        await product.save();

        return product;
    }

    async markLow(
        productId: string,
        userId: string,
    ) {
        return this.updateStatus(
            productId,
            userId,
            {
                status: ProductStatus.LOW,
            },
        );
    }

    async markFinished(
        productId: string,
        userId: string,
    ) {
        return this.updateStatus(
            productId,
            userId,
            {
                status: ProductStatus.FINISHED,
            },
        );
    }

    async toggleFavourite(
        productId: string,
        userId: string,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        product.isFavourite = !product.isFavourite;

        await product.save();

        return product;
    }

    async archive(
        productId: string,
        userId: string,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        product.isArchived = true;

        await product.save();

        return product;
    }

    async restore(
        productId: string,
        userId: string,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        product.isArchived = false;

        await product.save();

        return product;
    }

    async remove(
        productId: string,
        userId: string,
    ) {
        const product = await this.getProductDocument(
            productId,
            userId,
        );

        product.isActive = false;
        product.isArchived = true;

        await product.save();

        return {
            message: 'Product deleted successfully.',
        };
    }

    async createRecommendation(
        dto: CreateProductRecommendationDto,
    ) {
        this.validateObjectId(dto.userId, 'user ID');

        if (dto.currentProductId) {
            await this.getProductDocument(
                dto.currentProductId,
                dto.userId,
            );
        }

        if (dto.suggestedProductId) {
            await this.getProductDocument(
                dto.suggestedProductId,
                dto.userId,
            );
        }

        return this.recommendationModel.create({
            userId: new Types.ObjectId(dto.userId),

            currentProductId:
                dto.currentProductId
                    ? new Types.ObjectId(
                        dto.currentProductId,
                    )
                    : null,

            suggestedProductId:
                dto.suggestedProductId
                    ? new Types.ObjectId(
                        dto.suggestedProductId,
                    )
                    : null,

            recommendationType:
                dto.recommendationType,

            status:
                dto.status ??
                RecommendationStatus.SUGGESTED,

            category: dto.category,

            suggestedProductName:
                dto.suggestedProductName.trim(),

            suggestedBrand:
                dto.suggestedBrand?.trim(),

            suggestedVariant:
                dto.suggestedVariant?.trim(),

            reason: dto.reason.trim(),

            requirements: this.cleanStringArray(
                dto.requirements,
            ),

            advantages: this.cleanStringArray(
                dto.advantages,
            ),

            concerns: this.cleanStringArray(
                dto.concerns,
            ),

            confidence: dto.confidence ?? 0.5,
            priority: dto.priority ?? 0,
            estimatedPrice: dto.estimatedPrice,

            currency:
                dto.currency?.trim().toUpperCase() ??
                'INR',

            productUrl: dto.productUrl?.trim(),

            suggestedBuyAt: this.optionalDate(
                dto.suggestedBuyAt,
                'suggestedBuyAt',
            ),

            expiresAt: this.optionalDate(
                dto.expiresAt,
                'expiresAt',
            ),

            notes: dto.notes?.trim(),
        });
    }

    async getRecommendations(
        userId: string,
        status?: RecommendationStatus,
    ) {
        this.validateObjectId(userId, 'user ID');

        const filter: Record<string, any> = {
            userId: new Types.ObjectId(userId),
            isActive: true,
        };

        if (status) {
            filter.status = status;
        }

        return this.recommendationModel
            .find(filter)
            .populate(
                'currentProductId',
                'name brand variant status usage category',
            )
            .populate(
                'suggestedProductId',
                'name brand variant status productUrl category',
            )
            .sort({
                priority: -1,
                confidence: -1,
                suggestedBuyAt: 1,
                createdAt: -1,
            })
            .lean();
    }

    async getWhatToBuyNext(userId: string) {
        this.validateObjectId(userId, 'user ID');

        const userObjectId =
            new Types.ObjectId(userId);

        const now = new Date();

        await this.refreshAutomaticStatuses(userId);

        const [
            savedRecommendations,
            lowProducts,
            finishedProducts,
            alternativeProducts,
            expiringProducts,
            wishlistProducts,
        ] = await Promise.all([
            this.recommendationModel
                .find({
                    userId: userObjectId,
                    status: {
                        $in: [
                            RecommendationStatus.SUGGESTED,
                            RecommendationStatus.SAVED,
                            RecommendationStatus.ACCEPTED,
                        ],
                    },
                    isActive: true,
                    $or: [
                        {
                            expiresAt: {
                                $exists: false,
                            },
                        },
                        {
                            expiresAt: null,
                        },
                        {
                            expiresAt: {
                                $gt: now,
                            },
                        },
                    ],
                })
                .sort({
                    priority: -1,
                    confidence: -1,
                    suggestedBuyAt: 1,
                })
                .lean(),

            this.productModel
                .find({
                    userId: userObjectId,
                    status: ProductStatus.LOW,
                    isActive: true,
                    isArchived: false,
                })
                .sort({
                    'usage.remainingPercentage': 1,
                })
                .lean(),

            this.productModel
                .find({
                    userId: userObjectId,
                    status: ProductStatus.FINISHED,
                    repurchaseStatus:
                        RepurchaseStatus.REPURCHASE,
                    isActive: true,
                    isArchived: false,
                })
                .sort({
                    finishedAt: -1,
                })
                .lean(),

            this.productModel
                .find({
                    userId: userObjectId,
                    $or: [
                        {
                            repurchaseStatus:
                                RepurchaseStatus.FIND_ALTERNATIVE,
                        },
                        {
                            status:
                                ProductStatus.NOT_SUITABLE,
                        },
                        {
                            effectivenessScore: {
                                $lte: 4,
                            },
                        },
                    ],
                    isActive: true,
                    isArchived: false,
                })
                .sort({
                    effectivenessScore: 1,
                })
                .lean(),

            this.productModel
                .find({
                    userId: userObjectId,
                    expiresAt: {
                        $gte: now,
                        $lte: new Date(
                            now.getTime() +
                            30 * 24 * 60 * 60 * 1000,
                        ),
                    },
                    status: {
                        $nin: [
                            ProductStatus.FINISHED,
                            ProductStatus.EXPIRED,
                            ProductStatus.REPLACED,
                        ],
                    },
                    isActive: true,
                    isArchived: false,
                })
                .sort({
                    expiresAt: 1,
                })
                .lean(),

            this.productModel
                .find({
                    userId: userObjectId,
                    status:
                        ProductStatus.WANT_TO_BUY,
                    isActive: true,
                    isArchived: false,
                })
                .sort({
                    isFavourite: -1,
                    createdAt: -1,
                })
                .lean(),
        ]);

        const generatedSuggestions: Array<{
            priority: number;
            action:
            | 'repurchase'
            | 'find_alternative'
            | 'use_before_expiry'
            | 'buy_wishlist';
            currentProductId?: Types.ObjectId;
            suggestedProductId?: Types.ObjectId;
            productName: string;
            brand?: string;
            category: string;
            reason: string;
            suggestedBuyAt?: Date;
        }> = [];

        for (const product of lowProducts) {
            generatedSuggestions.push({
                priority: 90,
                action:
                    product.repurchaseStatus ===
                        RepurchaseStatus.FIND_ALTERNATIVE
                        ? 'find_alternative'
                        : 'repurchase',
                currentProductId: product._id,
                productName: product.name,
                brand: product.brand,
                category: product.category,
                reason:
                    product.usage?.estimatedFinishAt
                        ? `${product.name} is low and is estimated to finish by ${product.usage.estimatedFinishAt.toISOString()}.`
                        : `${product.name} is running low.`,
                suggestedBuyAt:
                    product.usage?.estimatedFinishAt,
            });
        }

        for (const product of finishedProducts) {
            generatedSuggestions.push({
                priority: 85,
                action: 'repurchase',
                currentProductId: product._id,
                productName: product.name,
                brand: product.brand,
                category: product.category,
                reason:
                    `${product.name} is finished and marked for repurchase.`,
            });
        }

        for (const product of alternativeProducts) {
            generatedSuggestions.push({
                priority: 80,
                action: 'find_alternative',
                currentProductId: product._id,
                productName: product.name,
                brand: product.brand,
                category: product.category,
                reason:
                    product.sideEffectsObserved?.length
                        ? `${product.name} should be replaced because of: ${product.sideEffectsObserved.join(', ')}.`
                        : `${product.name} is marked for replacement or has a low effectiveness score.`,
            });
        }

        for (const product of expiringProducts) {
            generatedSuggestions.push({
                priority: 70,
                action: 'use_before_expiry',
                currentProductId: product._id,
                productName: product.name,
                brand: product.brand,
                category: product.category,
                reason:
                    `${product.name} expires on ${product.expiresAt?.toISOString()}.`,
            });
        }

        for (const product of wishlistProducts) {
            generatedSuggestions.push({
                priority:
                    product.isFavourite ? 65 : 50,
                action: 'buy_wishlist',
                suggestedProductId: product._id,
                productName: product.name,
                brand: product.brand,
                category: product.category,
                reason:
                    `${product.name} is in your want-to-buy list.`,
            });
        }

        generatedSuggestions.sort(
            (a, b) => b.priority - a.priority,
        );

        return {
            summary: {
                savedRecommendations:
                    savedRecommendations.length,
                lowProducts: lowProducts.length,
                finishedForRepurchase:
                    finishedProducts.length,
                alternativesNeeded:
                    alternativeProducts.length,
                expiringSoon:
                    expiringProducts.length,
                wishlistProducts:
                    wishlistProducts.length,
            },

            savedRecommendations,

            generatedSuggestions,

            nextRecommendedAction:
                savedRecommendations[0] ??
                generatedSuggestions[0] ??
                null,
        };
    }

    async updateRecommendationStatus(
        recommendationId: string,
        userId: string,
        status: RecommendationStatus,
        reason?: string,
    ) {
        this.validateObjectId(
            recommendationId,
            'recommendation ID',
        );

        this.validateObjectId(userId, 'user ID');

        const recommendation =
            await this.recommendationModel.findOne({
                _id: new Types.ObjectId(
                    recommendationId,
                ),
                userId: new Types.ObjectId(userId),
                isActive: true,
            });

        if (!recommendation) {
            throw new NotFoundException(
                'Product recommendation not found.',
            );
        }

        recommendation.status = status;

        if (
            status ===
            RecommendationStatus.DISMISSED
        ) {
            recommendation.dismissedReason =
                reason?.trim();
        }

        await recommendation.save();

        return recommendation;
    }

    async refreshAutomaticStatuses(
        userId: string,
    ) {
        this.validateObjectId(userId, 'user ID');

        const products = await this.productModel.find({
            userId: new Types.ObjectId(userId),
            isActive: true,
            isArchived: false,
            status: {
                $nin: [
                    ProductStatus.FINISHED,
                    ProductStatus.REPLACED,
                    ProductStatus.DISCONTINUED,
                    ProductStatus.NOT_SUITABLE,
                    ProductStatus.LOST,
                    ProductStatus.DAMAGED,
                ],
            },
        });

        let updatedCount = 0;

        for (const product of products) {
            const previousStatus = product.status;

            if (
                product.expiresAt &&
                product.expiresAt.getTime() <
                Date.now()
            ) {
                product.status =
                    ProductStatus.EXPIRED;
            } else if (
                product.productType ===
                ProductType.CONSUMABLE
            ) {
                const percentage =
                    product.usage
                        ?.remainingPercentage ?? 0;

                product.status =
                    this.calculateAutomaticStatus(
                        product.productType,
                        percentage,
                        Boolean(product.openedAt),
                    );

                if (
                    percentage <= 0 &&
                    !product.finishedAt
                ) {
                    product.finishedAt = new Date();
                }
            }

            if (product.status !== previousStatus) {
                updatedCount += 1;
                await product.save();
            }
        }

        return {
            totalChecked: products.length,
            updatedCount,
        };
    }

    private applyUsageUpdate(
        product: ProductDocument,
        dto: UpdateProductUsageDto,
    ) {
        const initialQuantity =
            dto.initialQuantity ??
            product.usage?.initialQuantity ??
            0;

        const remainingQuantity =
            dto.remainingQuantity ??
            product.usage?.remainingQuantity ??
            initialQuantity;

        if (remainingQuantity > initialQuantity) {
            throw new BadRequestException(
                'Remaining quantity cannot exceed initial quantity.',
            );
        }

        const remainingPercentage =
            dto.remainingPercentage ??
            this.calculateRemainingPercentage(
                initialQuantity,
                remainingQuantity,
            );

        const quantityPerUse =
            dto.quantityPerUse ??
            product.usage?.quantityPerUse;

        const usesPerDay =
            dto.usesPerDay ??
            product.usage?.usesPerDay;

        const usesPerWeek =
            dto.usesPerWeek ??
            product.usage?.usesPerWeek;

        const usagePerDay =
            this.calculateUsagePerDay({
                quantityPerUse,
                usesPerDay,
                usesPerWeek,
            });

        product.usage.initialQuantity =
            initialQuantity;

        product.usage.remainingQuantity =
            remainingQuantity;

        if (dto.unit !== undefined) {
            product.usage.unit = dto.unit;
        }

        if (dto.frequency !== undefined) {
            product.usage.frequency =
                dto.frequency;
        }

        product.usage.quantityPerUse =
            quantityPerUse;

        product.usage.usesPerDay = usesPerDay;

        product.usage.usesPerWeek =
            usesPerWeek;

        product.usage.remainingPercentage =
            Number(
                remainingPercentage.toFixed(2),
            );

        product.usage.estimatedFinishAt =
            product.productType ===
                ProductType.CONSUMABLE
                ? this.calculateEstimatedFinishDate(
                    remainingQuantity,
                    usagePerDay,
                )
                : undefined;

        product.usage.lastUpdatedAt =
            new Date();

        if (
            product.productType ===
            ProductType.CONSUMABLE
        ) {
            product.status =
                this.calculateAutomaticStatus(
                    product.productType,
                    remainingPercentage,
                    Boolean(product.openedAt),
                );

            if (remainingPercentage <= 0) {
                product.finishedAt =
                    product.finishedAt ?? new Date();
            } else {
                product.finishedAt = undefined;
            }
        }
    }

    private calculateAutomaticStatus(
        productType: ProductType,
        remainingPercentage: number,
        isOpened: boolean,
    ) {
        if (
            productType !== ProductType.CONSUMABLE
        ) {
            return isOpened
                ? ProductStatus.IN_USE
                : ProductStatus.AVAILABLE;
        }

        if (remainingPercentage <= 0) {
            return ProductStatus.FINISHED;
        }

        if (remainingPercentage <= 20) {
            return ProductStatus.LOW;
        }

        return isOpened
            ? ProductStatus.IN_USE
            : ProductStatus.AVAILABLE;
    }

    private calculateRemainingPercentage(
        initialQuantity: number,
        remainingQuantity: number,
    ) {
        if (initialQuantity <= 0) {
            return remainingQuantity > 0 ? 100 : 0;
        }

        return Math.max(
            Math.min(
                (remainingQuantity /
                    initialQuantity) *
                100,
                100,
            ),
            0,
        );
    }

    private calculateUsagePerDay(input: {
        quantityPerUse?: number;
        usesPerDay?: number;
        usesPerWeek?: number;
    }) {
        const quantityPerUse =
            input.quantityPerUse ?? 0;

        if (
            quantityPerUse <= 0
        ) {
            return 0;
        }

        if (
            input.usesPerDay !== undefined &&
            input.usesPerDay > 0
        ) {
            return (
                quantityPerUse * input.usesPerDay
            );
        }

        if (
            input.usesPerWeek !== undefined &&
            input.usesPerWeek > 0
        ) {
            return (
                quantityPerUse *
                (input.usesPerWeek / 7)
            );
        }

        return 0;
    }

    private calculateEstimatedFinishDate(
        remainingQuantity: number,
        usagePerDay: number,
    ) {
        if (
            remainingQuantity <= 0 ||
            usagePerDay <= 0
        ) {
            return undefined;
        }

        const daysRemaining = Math.ceil(
            remainingQuantity / usagePerDay,
        );

        return new Date(
            Date.now() +
            daysRemaining *
            24 *
            60 *
            60 *
            1000,
        );
    }

    private async getProductDocument(
        productId: string,
        userId: string,
    ) {
        this.validateObjectId(
            productId,
            'product ID',
        );

        this.validateObjectId(userId, 'user ID');

        const product =
            await this.productModel.findOne({
                _id: new Types.ObjectId(productId),
                userId: new Types.ObjectId(userId),
                isActive: true,
            });

        if (!product) {
            throw new NotFoundException(
                'Product not found.',
            );
        }

        return product;
    }

    private optionalDate(
        value: string | undefined,
        fieldName: string,
    ) {
        if (!value) {
            return undefined;
        }

        return this.parseDate(value, fieldName);
    }

    private parseDate(
        value: string,
        fieldName: string,
    ) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(
                `Invalid ${fieldName}.`,
            );
        }

        return date;
    }

    private cleanStringArray(
        values?: string[],
    ) {
        return [
            ...new Set(
                (values ?? [])
                    .map((value) => value.trim())
                    .filter(Boolean),
            ),
        ];
    }

    private normalizeTags(tags?: string[]) {
        return [
            ...new Set(
                (tags ?? [])
                    .map((tag) =>
                        this.normalizeTag(tag),
                    )
                    .filter(Boolean),
            ),
        ];
    }

    private normalizeTag(tag: string) {
        return tag
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-');
    }

    private escapeRegex(value: string) {
        return value.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&',
        );
    }

    private validateObjectId(
        value: string,
        fieldName: string,
    ) {
        if (!Types.ObjectId.isValid(value)) {
            throw new BadRequestException(
                `Invalid ${fieldName}.`,
            );
        }
    }
}