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

import { BrainDumpQueryDto } from './dto/brain-dump-query.dto';
import { CreateBrainDumpDto } from './dto/create-brain-dump.dto';
import { ProcessBrainDumpDto } from './dto/process-brain-dump.dto';
import { UpdateBrainDumpDto } from './dto/update-brain-dump.dto';
import { BrainDumpService } from './brain-dump.service';

@Controller('brain-dump')
export class BrainDumpController {
  constructor(private readonly brainDumpService: BrainDumpService) {}

  @Post()
  create(@Body() dto: CreateBrainDumpDto) {
    return this.brainDumpService.create(dto);
  }

  @Get()
  findAll(@Query() query: BrainDumpQueryDto) {
    return this.brainDumpService.findAll(query);
  }

  @Get('summary')
  getSummary() {
    return this.brainDumpService.getSummary();
  }

  @Get(':brainDumpId')
  findOne(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.findOne(brainDumpId);
  }

  @Patch(':brainDumpId')
  update(
    @Param('brainDumpId') brainDumpId: string,
    @Body() dto: UpdateBrainDumpDto,
  ) {
    return this.brainDumpService.update(brainDumpId, dto);
  }

  @Post(':brainDumpId/process')
  process(
    @Param('brainDumpId') brainDumpId: string,
    @Body() dto: ProcessBrainDumpDto,
  ) {
    return this.brainDumpService.process(brainDumpId, dto);
  }

  @Patch(':brainDumpId/discard')
  discard(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.discard(brainDumpId);
  }

  @Patch(':brainDumpId/reopen')
  reopen(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.reopen(brainDumpId);
  }

  @Patch(':brainDumpId/archive')
  archive(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.archive(brainDumpId);
  }

  @Patch(':brainDumpId/restore')
  restore(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.restore(brainDumpId);
  }

  @Delete(':brainDumpId')
  remove(@Param('brainDumpId') brainDumpId: string) {
    return this.brainDumpService.remove(brainDumpId);
  }
}
