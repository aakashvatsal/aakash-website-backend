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

import { CreateHaircareProductDto } from './dto/create-haircare-product.dto';
import { GenerateDailyHaircareLogDto } from './dto/generate-daily-haircare-log.dto';
import { UpdateHairObservationDto } from './dto/update-hair-observation.dto';
import { UpdateHaircareLogItemDto } from './dto/update-haircare-log-item.dto';
import { UpdateHaircareProductDto } from './dto/update-haircare-product.dto';
import { HaircareProductStatus } from './schemas/haircare-product.schema';
import { HaircareService } from './haircare.service';

@Controller('haircare')
export class HaircareController {
  constructor(private readonly haircareService: HaircareService) {}

  @Post('products')
  createProduct(@Body() dto: CreateHaircareProductDto) {
    return this.haircareService.createProduct(dto);
  }

  @Get('products')
  findProducts(
    @Query('status')
    status?: HaircareProductStatus,
  ) {
    return this.haircareService.findProducts(status);
  }

  @Get('products/:productId')
  findProduct(@Param('productId') productId: string) {
    return this.haircareService.findProduct(productId);
  }

  @Patch('products/:productId')
  updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateHaircareProductDto,
  ) {
    return this.haircareService.updateProduct(productId, dto);
  }

  @Delete('products/:productId')
  removeProduct(@Param('productId') productId: string) {
    return this.haircareService.removeProduct(productId);
  }

  @Post('logs/generate')
  generateDailyLog(@Body() dto: GenerateDailyHaircareLogDto) {
    return this.haircareService.generateDailyLog(dto.date);
  }

  @Get('logs')
  getLogs(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.haircareService.getLogs(startDate, endDate);
  }

  @Get('logs/daily')
  getDailyLog(@Query('date') date: string) {
    return this.haircareService.getDailyLog(date);
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateRoutineItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Body() dto: UpdateHaircareLogItemDto,
  ) {
    return this.haircareService.updateRoutineItem(
      logId,
      Number(itemIndex),
      dto,
    );
  }

  @Patch('logs/:logId/observation')
  updateObservation(
    @Param('logId') logId: string,
    @Body() dto: UpdateHairObservationDto,
  ) {
    return this.haircareService.updateObservation(logId, dto);
  }

  @Patch('logs/mark-missed')
  markPendingAsMissed(@Query('date') date: string) {
    return this.haircareService.markPendingAsMissed(date);
  }
}
