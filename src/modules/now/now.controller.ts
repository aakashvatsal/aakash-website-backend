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

import { Public } from '../../common/decorators/public.decorator';

import { CreateNowStatusDto } from './dto/create-now-status.dto';

import { NowHistoryQueryDto } from './dto/now-history-query.dto';

import { UpdateNowStatusDto } from './dto/update-now-status.dto';

import { NowService } from './now.service';

@Controller('now')
export class NowController {
  constructor(private readonly nowService: NowService) {}

  @Post()
  create(
    @Body()
    dto: CreateNowStatusDto,
  ) {
    return this.nowService.create(dto);
  }

  @Get('current')
  getCurrent() {
    return this.nowService.getCurrent();
  }

  @Get('public')
  @Public()
  getPublicCurrent() {
    return this.nowService.getPublicCurrent();
  }

  @Get('public/history')
  @Public()
  getPublicHistory(
    @Query()
    query: NowHistoryQueryDto,
  ) {
    return this.nowService.getPublicHistory(query.page, query.limit);
  }

  @Get('history')
  getHistory(
    @Query()
    query: NowHistoryQueryDto,
  ) {
    return this.nowService.getHistory(query.page, query.limit);
  }

  @Get()
  findAll(
    @Query()
    query: NowHistoryQueryDto,
  ) {
    return this.nowService.findAll(query);
  }

  @Patch('current')
  async updateCurrent(
    @Body()
    dto: UpdateNowStatusDto,
  ) {
    const current = await this.nowService.getCurrent();

    if (!current) {
      return null;
    }

    return this.nowService.update(current._id.toString(), dto);
  }

  @Patch('current/touch')
  touchCurrent() {
    return this.nowService.touchCurrent();
  }

  @Patch('current/end')
  endCurrent() {
    return this.nowService.endCurrent();
  }

  @Patch(':statusId/current')
  setCurrent(
    @Param('statusId')
    statusId: string,
  ) {
    return this.nowService.setCurrent(statusId);
  }

  @Patch(':statusId/archive')
  archive(
    @Param('statusId')
    statusId: string,
  ) {
    return this.nowService.archive(statusId);
  }

  @Patch(':statusId/restore')
  restore(
    @Param('statusId')
    statusId: string,
  ) {
    return this.nowService.restore(statusId);
  }

  @Patch(':statusId')
  update(
    @Param('statusId')
    statusId: string,

    @Body()
    dto: UpdateNowStatusDto,
  ) {
    return this.nowService.update(statusId, dto);
  }

  @Get(':statusId')
  findById(
    @Param('statusId')
    statusId: string,
  ) {
    return this.nowService.findById(statusId);
  }

  @Delete(':statusId')
  remove(
    @Param('statusId')
    statusId: string,
  ) {
    return this.nowService.remove(statusId);
  }
}
