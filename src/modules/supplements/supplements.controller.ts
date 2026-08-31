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

import { CreateSupplementDto } from './dto/create-supplement.dto';
import { GenerateDailySupplementLogDto } from './dto/generate-daily-supplement-log.dto';
import { UpdateSupplementDto } from './dto/update-supplement.dto';
import { UpdateSupplementLogItemDto } from './dto/update-supplement-log-item.dto';
import { SupplementStatus } from './schemas/supplement.schema';
import { SupplementsService } from './supplements.service';

@Controller('supplements')
export class SupplementsController {
  constructor(private readonly supplementsService: SupplementsService) {}

  @Post()
  create(@Body() dto: CreateSupplementDto) {
    return this.supplementsService.create(dto);
  }

  @Get()
  findAll(@Query('status') status?: SupplementStatus) {
    return this.supplementsService.findAll(status);
  }

  @Get('logs')
  getLogs(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.supplementsService.getLogs(startDate, endDate);
  }

  @Get('logs/daily')
  getDailyLog(@Query('date') date: string) {
    return this.supplementsService.getDailyLog(date);
  }

  @Post('logs/generate')
  generateDailyLog(@Body() dto: GenerateDailySupplementLogDto) {
    return this.supplementsService.generateDailyLog(dto.date);
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateSupplementLogItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Body() dto: UpdateSupplementLogItemDto,
  ) {
    return this.supplementsService.updateSupplementLogItem(
      logId,
      Number(itemIndex),
      dto,
    );
  }

  @Patch('logs/mark-missed')
  markPendingAsMissed(@Query('date') date: string) {
    return this.supplementsService.markPendingAsMissed(date);
  }

  @Get(':supplementId')
  findOne(@Param('supplementId') supplementId: string) {
    return this.supplementsService.findOne(supplementId);
  }

  @Patch(':supplementId')
  update(
    @Param('supplementId') supplementId: string,
    @Body() dto: UpdateSupplementDto,
  ) {
    return this.supplementsService.update(supplementId, dto);
  }

  @Delete(':supplementId')
  remove(@Param('supplementId') supplementId: string) {
    return this.supplementsService.remove(supplementId);
  }
}
