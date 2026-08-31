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

import { CreateSkincareProductDto } from './dto/create-skincare-product.dto';
import { GenerateDailySkincareLogDto } from './dto/generate-daily-skincare-log.dto';
import { UpdateSkincareLogItemDto } from './dto/update-skincare-log-item.dto';
import { UpdateSkincareProductDto } from './dto/update-skincare-product.dto';
import { SkincareProductStatus } from './schemas/skincare-product.schema';
import { SkincareService } from './skincare.service';

@Controller('skincare')
export class SkincareController {
  constructor(private readonly skincareService: SkincareService) {}

  @Post('products')
  createProduct(@Body() dto: CreateSkincareProductDto) {
    return this.skincareService.createProduct(dto);
  }

  @Get('products')
  findProducts(@Query('status') status?: SkincareProductStatus) {
    return this.skincareService.findProducts(status);
  }

  @Patch('products/:productId')
  updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateSkincareProductDto,
  ) {
    return this.skincareService.updateProduct(productId, dto);
  }

  @Delete('products/:productId')
  removeProduct(@Param('productId') productId: string) {
    return this.skincareService.removeProduct(productId);
  }

  @Post('logs/generate')
  generateDailyLog(@Body() dto: GenerateDailySkincareLogDto) {
    return this.skincareService.generateDailyLog(dto.date);
  }

  @Get('logs/daily')
  getDailyLog(@Query('date') date: string) {
    return this.skincareService.getDailyLog(date);
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateRoutineItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Body() dto: UpdateSkincareLogItemDto,
  ) {
    return this.skincareService.updateRoutineItem(
      logId,
      Number(itemIndex),
      dto,
    );
  }

  @Patch('logs/:logId/observation')
  updateObservation(
    @Param('logId') logId: string,
    @Body()
    body: {
      observation?: Record<string, unknown>;
      environment?: Record<string, unknown>;
      progressPhotoUrls?: string[];
      notes?: string;
    },
  ) {
    return this.skincareService.updateObservation(logId, body);
  }
}
