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
  constructor(
    private readonly haircareService:
      HaircareService,
  ) {}

  @Post('products')
  createProduct(
    @Body() dto: CreateHaircareProductDto,
  ) {
    return this.haircareService.createProduct(
      dto,
    );
  }

  @Get('products')
  findProducts(
    @Query('userId') userId: string,
    @Query('status')
    status?: HaircareProductStatus,
  ) {
    return this.haircareService.findProducts(
      userId,
      status,
    );
  }

  @Get('products/:productId')
  findProduct(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.haircareService.findProduct(
      productId,
      userId,
    );
  }

  @Patch('products/:productId')
  updateProduct(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateHaircareProductDto,
  ) {
    return this.haircareService.updateProduct(
      productId,
      userId,
      dto,
    );
  }

  @Delete('products/:productId')
  removeProduct(
    @Param('productId') productId: string,
    @Query('userId') userId: string,
  ) {
    return this.haircareService.removeProduct(
      productId,
      userId,
    );
  }

  @Post('logs/generate')
  generateDailyLog(
    @Body() dto: GenerateDailyHaircareLogDto,
  ) {
    return this.haircareService.generateDailyLog(
      dto.userId,
      dto.date,
    );
  }

  @Get('logs')
  getLogs(
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.haircareService.getLogs(
      userId,
      startDate,
      endDate,
    );
  }

  @Get('logs/daily')
  getDailyLog(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    return this.haircareService.getDailyLog(
      userId,
      date,
    );
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateRoutineItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateHaircareLogItemDto,
  ) {
    return this.haircareService.updateRoutineItem(
      logId,
      userId,
      Number(itemIndex),
      dto,
    );
  }

  @Patch('logs/:logId/observation')
  updateObservation(
    @Param('logId') logId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateHairObservationDto,
  ) {
    return this.haircareService.updateObservation(
      logId,
      userId,
      dto,
    );
  }

  @Patch('logs/mark-missed')
  markPendingAsMissed(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    return this.haircareService.markPendingAsMissed(
      userId,
      date,
    );
  }
}