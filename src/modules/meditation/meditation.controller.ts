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

import { CreateMeditationEntryDto } from './dto/create-meditation-entry.dto';
import { MeditationQueryDto } from './dto/meditation-query.dto';
import { UpdateMeditationEntryDto } from './dto/update-meditation-entry.dto';
import { UpdateMeditationReflectionDto } from './dto/update-meditation-reflection.dto';
import { UpdateMeditationStatusDto } from './dto/update-meditation-status.dto';
import { MeditationService } from './meditation.service';

@Controller('meditation')
export class MeditationController {
  constructor(
    private readonly meditationService:
      MeditationService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateMeditationEntryDto,
  ) {
    return this.meditationService.create(dto);
  }

  @Get()
  findAll(
    @Query() query: MeditationQueryDto,
  ) {
    return this.meditationService.findAll(query);
  }

  @Get('summary')
  getSummary(
    @Query('userId') userId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.meditationService.getSummary(
      userId,
      startDate,
      endDate,
    );
  }

  @Get(':meditationEntryId')
  findOne(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.findOne(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId')
  update(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateMeditationEntryDto,
  ) {
    return this.meditationService.update(
      meditationEntryId,
      userId,
      dto,
    );
  }

  @Patch(':meditationEntryId/status')
  updateStatus(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateMeditationStatusDto,
  ) {
    return this.meditationService.updateStatus(
      meditationEntryId,
      userId,
      dto,
    );
  }

  @Patch(':meditationEntryId/start')
  start(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.start(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId/pause')
  pause(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.pause(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId/resume')
  resume(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.resume(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId/complete')
  complete(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      actualDurationMinutes?: number;
    },
  ) {
    return this.meditationService.complete(
      meditationEntryId,
      userId,
      body.actualDurationMinutes,
    );
  }

  @Patch(':meditationEntryId/skip')
  skip(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      reason?: string;
    },
  ) {
    return this.meditationService.skip(
      meditationEntryId,
      userId,
      body.reason,
    );
  }

  @Patch(':meditationEntryId/abandon')
  abandon(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body()
    body: {
      reason?: string;
    },
  ) {
    return this.meditationService.abandon(
      meditationEntryId,
      userId,
      body.reason,
    );
  }

  @Patch(':meditationEntryId/reflection')
  updateReflection(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
    @Body()
    dto: UpdateMeditationReflectionDto,
  ) {
    return this.meditationService.updateReflection(
      meditationEntryId,
      userId,
      dto,
    );
  }

  @Patch(':meditationEntryId/favourite/toggle')
  toggleFavourite(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.toggleFavourite(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId/archive')
  archive(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.archive(
      meditationEntryId,
      userId,
    );
  }

  @Patch(':meditationEntryId/restore')
  restore(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.restore(
      meditationEntryId,
      userId,
    );
  }

  @Delete(':meditationEntryId')
  remove(
    @Param('meditationEntryId')
    meditationEntryId: string,
    @Query('userId') userId: string,
  ) {
    return this.meditationService.remove(
      meditationEntryId,
      userId,
    );
  }
}