import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaCalendarService } from './media-calendar.service';

@Injectable()
export class MediaCalendarScheduler {
  private readonly logger = new Logger(MediaCalendarScheduler.name);

  constructor(private readonly calendarService: MediaCalendarService) {}

  @Cron('0 */5 * * * *', { timeZone: 'Asia/Kolkata' })
  async publishDueMedia() {
    try {
      await this.calendarService.reconcileBufferPublications();
      await this.calendarService.runDuePublications();
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media publishing scheduler failed.',
      );
    }
  }

  @Cron('0 15 0 * * *', { timeZone: 'Asia/Kolkata' })
  async maintainPlanningHorizon() {
    try {
      await this.calendarService.ensureHorizon();
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media calendar horizon maintenance failed.',
      );
    }
  }
}
