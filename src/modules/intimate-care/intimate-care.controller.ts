import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CreateIntimateCareProductDto } from './dto/create-intimate-care-product.dto';
import { GenerateDailyIntimateCareLogDto } from './dto/generate-daily-intimate-care-log.dto';
import { UpdateIntimateCareLogItemDto } from './dto/update-intimate-care-log-item.dto';
import { UpdateIntimateCareProductDto } from './dto/update-intimate-care-product.dto';
import { IntimateCareProductStatus } from './schemas/intimate-care-product.schema';
import { IntimateCareService } from './intimate-care.service';

@Controller('intimate-care')
export class IntimateCareController {
  constructor(private readonly intimateCareService: IntimateCareService) {}

  @Post('products')
  createProduct(@Body() dto: CreateIntimateCareProductDto) {
    return this.intimateCareService.createProduct(dto);
  }

  @Get('products')
  findProducts(
    @Query('status')
    status?: IntimateCareProductStatus,
  ) {
    return this.intimateCareService.findProducts(status);
  }

  @Patch('products/:productId')
  updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateIntimateCareProductDto,
  ) {
    return this.intimateCareService.updateProduct(productId, dto);
  }

  @Post('logs/generate')
  generateDailyLog(@Body() dto: GenerateDailyIntimateCareLogDto) {
    return this.intimateCareService.generateDailyLog(dto.date);
  }

  @Get('logs/daily')
  getDailyLog(@Query('date') date: string) {
    return this.intimateCareService.getDailyLog(date);
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateRoutineItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Body() dto: UpdateIntimateCareLogItemDto,
  ) {
    return this.intimateCareService.updateRoutineItem(
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
      hygiene?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    return this.intimateCareService.updateObservation(logId, body);
  }
}
