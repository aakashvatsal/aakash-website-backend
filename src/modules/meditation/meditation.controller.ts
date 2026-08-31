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
  constructor(private readonly meditationService: MeditationService) {}
  @Post() create(@Body() dto: CreateMeditationEntryDto) {
    return this.meditationService.create(dto);
  }
  @Get() findAll(@Query() query: MeditationQueryDto) {
    return this.meditationService.findAll(query);
  }
  @Get('summary') getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.meditationService.getSummary(startDate, endDate);
  }
  @Get(':meditationEntryId') findOne(@Param('meditationEntryId') id: string) {
    return this.meditationService.findOne(id);
  }
  @Patch(':meditationEntryId') update(
    @Param('meditationEntryId') id: string,
    @Body() dto: UpdateMeditationEntryDto,
  ) {
    return this.meditationService.update(id, dto);
  }
  @Patch(':meditationEntryId/status') updateStatus(
    @Param('meditationEntryId') id: string,
    @Body() dto: UpdateMeditationStatusDto,
  ) {
    return this.meditationService.updateStatus(id, dto);
  }
  @Patch(':meditationEntryId/start') start(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.start(id);
  }
  @Patch(':meditationEntryId/pause') pause(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.pause(id);
  }
  @Patch(':meditationEntryId/resume') resume(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.resume(id);
  }
  @Patch(':meditationEntryId/complete') complete(
    @Param('meditationEntryId') id: string,
    @Body() body: { actualDurationMinutes?: number },
  ) {
    return this.meditationService.complete(id, body.actualDurationMinutes);
  }
  @Patch(':meditationEntryId/skip') skip(
    @Param('meditationEntryId') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.meditationService.skip(id, body.reason);
  }
  @Patch(':meditationEntryId/abandon') abandon(
    @Param('meditationEntryId') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.meditationService.abandon(id, body.reason);
  }
  @Patch(':meditationEntryId/reflection') updateReflection(
    @Param('meditationEntryId') id: string,
    @Body() dto: UpdateMeditationReflectionDto,
  ) {
    return this.meditationService.updateReflection(id, dto);
  }
  @Patch(':meditationEntryId/favourite/toggle') toggleFavourite(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.toggleFavourite(id);
  }
  @Patch(':meditationEntryId/archive') archive(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.archive(id);
  }
  @Patch(':meditationEntryId/restore') restore(
    @Param('meditationEntryId') id: string,
  ) {
    return this.meditationService.restore(id);
  }
  @Delete(':meditationEntryId') remove(@Param('meditationEntryId') id: string) {
    return this.meditationService.remove(id);
  }
}
