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
import { RecommendationStatus } from './schemas/product-recommendation.schema';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('current')
  findCurrentProducts() {
    return this.productsService.findCurrentProducts();
  }

  @Get('what-to-buy-next')
  getWhatToBuyNext() {
    return this.productsService.getWhatToBuyNext();
  }

  @Patch('refresh-statuses')
  refreshAutomaticStatuses() {
    return this.productsService.refreshAutomaticStatuses();
  }

  @Post('recommendations')
  createRecommendation(
    @Body()
    dto: CreateProductRecommendationDto,
  ) {
    return this.productsService.createRecommendation(dto);
  }

  @Get('recommendations')
  getRecommendations(
    @Query('status')
    status?: RecommendationStatus,
  ) {
    return this.productsService.getRecommendations(status);
  }

  @Patch('recommendations/:recommendationId/status')
  updateRecommendationStatus(
    @Param('recommendationId')
    recommendationId: string,
    @Body()
    body: {
      status: RecommendationStatus;
      reason?: string;
    },
  ) {
    return this.productsService.updateRecommendationStatus(
      recommendationId,
      body.status,
      body.reason,
    );
  }

  @Get(':productId')
  findOne(@Param('productId') productId: string) {
    return this.productsService.findOne(productId);
  }

  @Patch(':productId')
  update(@Param('productId') productId: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(productId, dto);
  }

  @Patch(':productId/usage')
  updateUsage(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductUsageDto,
  ) {
    return this.productsService.updateUsage(productId, dto);
  }

  @Patch(':productId/consume')
  consumeProduct(
    @Param('productId') productId: string,
    @Body()
    body: {
      quantityUsed: number;
    },
  ) {
    return this.productsService.consumeProduct(productId, body.quantityUsed);
  }

  @Patch(':productId/status')
  updateStatus(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductStatusDto,
  ) {
    return this.productsService.updateStatus(productId, dto);
  }

  @Patch(':productId/low')
  markLow(@Param('productId') productId: string) {
    return this.productsService.markLow(productId);
  }

  @Patch(':productId/finished')
  markFinished(@Param('productId') productId: string) {
    return this.productsService.markFinished(productId);
  }

  @Patch(':productId/favourite/toggle')
  toggleFavourite(@Param('productId') productId: string) {
    return this.productsService.toggleFavourite(productId);
  }

  @Patch(':productId/archive')
  archive(@Param('productId') productId: string) {
    return this.productsService.archive(productId);
  }

  @Patch(':productId/restore')
  restore(@Param('productId') productId: string) {
    return this.productsService.restore(productId);
  }

  @Delete(':productId')
  remove(@Param('productId') productId: string) {
    return this.productsService.remove(productId);
  }
}
