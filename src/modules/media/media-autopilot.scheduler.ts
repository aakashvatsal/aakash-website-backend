import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaAutopilotService } from './media-autopilot.service';
import { MediaAutopilotRunType } from './schemas/media-autopilot.schema';

@Injectable()
export class MediaAutopilotScheduler {
  private readonly logger = new Logger(MediaAutopilotScheduler.name);

  constructor(private readonly autopilotService: MediaAutopilotService) {}

  @Cron('0 5 6 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyAutopilot() {
    try {
      const settings = await this.autopilotService.getSettings();
      if (!settings.enabled || !settings.dailyEnabled) return;
      await this.autopilotService.run({
        type: MediaAutopilotRunType.DAILY,
        generateDrafts: settings.autoDraftCalendarGaps,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Daily Media Growth Autopilot failed.',
      );
    }
  }

  @Cron('0 35 6 * * 0', { timeZone: 'Asia/Kolkata' })
  async runWeeklyStrategyReview() {
    try {
      const settings = await this.autopilotService.getSettings();
      if (!settings.enabled || !settings.weeklyEnabled) return;
      await this.autopilotService.run({
        type: MediaAutopilotRunType.WEEKLY,
        generateDrafts: false,
      });
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Weekly Media Growth Autopilot review failed.',
      );
    }
  }
}
