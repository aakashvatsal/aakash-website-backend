import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { RunPersonalOsMorningDto } from './dto/run-personal-os-morning.dto';
import { RunPersonalOsDto } from './dto/run-personal-os.dto';
import { PersonalOsMorningService } from './personal-os-morning.service';
import { PersonalOsRuntimeService } from './personal-os-runtime.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/runtime-activation')
export class PersonalOsRuntimeController {
  constructor(
    private readonly runtime: PersonalOsRuntimeService,
    private readonly morning: PersonalOsMorningService,
  ) {}

  @Get('status')
  getStatus() {
    return this.runtime.getStatus();
  }

  @Get('runs')
  listRuns(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.runtime.listRuns(Number.isFinite(parsed) ? parsed : 10);
  }

  @Post('run')
  run(@Body() dto: RunPersonalOsDto) {
    return this.runtime.run(dto);
  }

  @Get('morning/status')
  getMorningStatus() {
    return this.morning.getStatus();
  }

  @Get('morning/runs')
  listMorningRuns(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.morning.listRuns(Number.isFinite(parsed) ? parsed : 10);
  }

  @Post('morning/run')
  runMorning(@Body() dto: RunPersonalOsMorningDto) {
    return this.morning.run(dto);
  }
}
