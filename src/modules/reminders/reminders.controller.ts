import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { ReminderQueryDto } from './dto/reminder-query.dto';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto';
import { RemindersService } from './reminders.service';

@Controller('reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  findAll(
    @Query()
    query: ReminderQueryDto,
  ) {
    return this.remindersService.findAll(query);
  }

  @Get('today')
  getToday() {
    return this.remindersService.getToday();
  }

  @Get('summary')
  getSummary() {
    return this.remindersService.getSummary();
  }

  @Post('sync')
  sync(
    @Query('days')
    days?: string,
  ) {
    const parsed = days ? Number(days) : 2;

    return this.remindersService.syncUpcoming(
      Number.isFinite(parsed) ? parsed : 2,
    );
  }

  @Patch(':reminderId/acknowledge')
  acknowledge(
    @Param('reminderId')
    reminderId: string,
  ) {
    return this.remindersService.acknowledge(reminderId);
  }

  @Patch(':reminderId/snooze')
  snooze(
    @Param('reminderId')
    reminderId: string,

    @Body()
    dto: SnoozeReminderDto,
  ) {
    return this.remindersService.snooze(reminderId, dto);
  }

  @Patch(':reminderId/dismiss')
  dismiss(
    @Param('reminderId')
    reminderId: string,
  ) {
    return this.remindersService.dismiss(reminderId);
  }

  @Patch(':reminderId/reopen')
  reopen(
    @Param('reminderId')
    reminderId: string,
  ) {
    return this.remindersService.reopen(reminderId);
  }
}
