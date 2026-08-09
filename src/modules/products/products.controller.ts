import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductRecommendationDto } from './dto/create-product-recommendation.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductStatusDto } from './dto/update-product-status.dto';
import { UpdateProductUsageDto } from './dto/update-product-usage.dto';
import {
  RecommendationStatus,
} from './schemas/product-recommendation.schema';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService:
      ProductsService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.findAll(query);
  }

  @Get('current')
  findCurrentProducts(
    @Query('userId') userId: string,
  ) {
    return this.productsService.findCurrentProducts(
      userId,
    );
  }

  @Get('what-to-buy-next')
  getWhatToBuyNext(
    @Query('userId') userId: string,
  ) {
    return this.productsService.getWhatToBuyNext(
      userId,
    );
  }

  @Patch('refresh-statuses')
  refreshAutomaticStatuses(
    @Query('userId') userId: string,
  ) {
    return this.productsService.refreshAutomaticStatuses(
      userId,
    );
  }

  @Post('recommendations')
  createRecommendation(
    @Body()
    dto: CreateProductRecommendationDto,
  ) {
    return this.productsService.createRecommendation(
      dto,
    );
  }

  @Get('recommendations')
  getRecommendations(
    @Query('userId') userId: string,
    @Query('status')
    status?: RecommendationStatus,
  ) {
    return this.productsService.getRecommendations(
      userId,
      status,
    );
  }

  @Patch(
    'recommendations/:recommendationId/status',
  )
  updateRecommendationStatus(
    @Param('recommendationId')
    recommendationId: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      status: RecommendationStatus;
      reason?: string;
    },
  ) {
    return this.productsService.updateRecommendationStatus(
      recommendationId,
      userId,
      body.status,
      body.reason,
    );
  }

  @Get(':productId')
  findOne(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.findOne(
      productId,
      userId,
    );
  }

  @Patch(':productId')
  update(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(
      productId,
      userId,
      dto,
    );
  }

  @Patch(':productId/usage')
  updateUsage(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateProductUsageDto,
  ) {
    return this.productsService.updateUsage(
      productId,
      userId,
      dto,
    );
  }

  @Patch(':productId/consume')
  consumeProduct(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      quantityUsed: number;
    },
  ) {
    return this.productsService.consumeProduct(
      productId,
      userId,
      body.quantityUsed,
    );
  }

  @Patch(':productId/status')
  updateStatus(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatus(
      productId,
      userId,
      dto,
    );
  }

  @Patch(':productId/low')
  markLow(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.markLow(
      productId,
      userId,
    );
  }

  @Patch(':productId/finished')
  markFinished(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.markFinished(
      productId,
      userId,
    );
  }

  @Patch(':productId/favourite/toggle')
  toggleFavourite(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.toggleFavourite(
      productId,
      userId,
    );
  }

  @Patch(':productId/archive')
  archive(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.archive(
      productId,
      userId,
    );
  }

  @Patch(':productId/restore')
  restore(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.restore(
      productId,
      userId,
    );
  }

  @Delete(':productId')
  remove(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.productsService.remove(
      productId,
      userId,
    );
  }
}