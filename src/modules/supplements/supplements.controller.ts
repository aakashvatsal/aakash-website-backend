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
  constructor(
    private readonly supplementsService: SupplementsService,
  ) {}

  @Post()
  create(@Body() dto: CreateSupplementDto) {
    return this.supplementsService.create(dto);
  }

  @Get()
  findAll(
    @Query('userId') userId: string,
    @Query('status') status?: SupplementStatus,
  ) {
    return this.supplementsService.findAll(userId, status);
  }

  @Get('logs')
  getLogs(
    @Query('userId') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.supplementsService.getLogs(
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
    return this.supplementsService.getDailyLog(
      userId,
      date,
    );
  }

  @Post('logs/generate')
  generateDailyLog(
    @Body() dto: GenerateDailySupplementLogDto,
  ) {
    return this.supplementsService.generateDailyLog(
      dto.userId,
      dto.date,
    );
  }

  @Patch('logs/:logId/items/:itemIndex')
  updateSupplementLogItem(
    @Param('logId') logId: string,
    @Param('itemIndex') itemIndex: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateSupplementLogItemDto,
  ) {
    return this.supplementsService.updateSupplementLogItem(
      userId,
      logId,
      Number(itemIndex),
      dto,
    );
  }

  @Patch('logs/mark-missed')
  markPendingAsMissed(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    return this.supplementsService.markPendingAsMissed(
      userId,
      date,
    );
  }

  @Get(':supplementId')
  findOne(
    @Param('supplementId') supplementId: string,
    @Query('userId') userId: string,
  ) {
    return this.supplementsService.findOne(
      supplementId,
      userId,
    );
  }

  @Patch(':supplementId')
  update(
    @Param('supplementId') supplementId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateSupplementDto,
  ) {
    return this.supplementsService.update(
      supplementId,
      userId,
      dto,
    );
  }

  @Delete(':supplementId')
  remove(
    @Param('supplementId') supplementId: string,
    @Query('userId') userId: string,
  ) {
    return this.supplementsService.remove(
      supplementId,
      userId,
    );
  }
}