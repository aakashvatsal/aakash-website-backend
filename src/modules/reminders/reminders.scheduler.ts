import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(private readonly remindersService: RemindersService) {}

  @Cron('0 */5 * * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async syncReminderWindow() {
    try {
      await this.remindersService.syncUpcoming(2);
    } catch (error) {
      this.logger.error(
        'Failed to materialize reminders.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
