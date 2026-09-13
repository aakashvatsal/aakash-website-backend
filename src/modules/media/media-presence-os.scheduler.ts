import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaPlanningService } from './media-planning.service';
import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';

@Injectable()
export class MediaPresenceOsScheduler {
  private readonly logger = new Logger(MediaPresenceOsScheduler.name);

  constructor(
    private readonly adaptationService: MediaStrategyAdaptationService,
    private readonly planningService: MediaPlanningService,
  ) {}

  @Cron('0 25 6 * * *', { timeZone: 'Asia/Kolkata' })
  async rollSevenDayPlan() {
    try {
      await this.planningService.rollForward({ mode: 'roll' });
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Daily Media Presence plan roll failed.',
      );
    }
  }

  @Cron('0 50 6 * * 0', { timeZone: 'Asia/Kolkata' })
  async adaptWeeklyPresence() {
    try {
      await this.adaptationService.generate({ force: true });
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Weekly Media Presence adaptation failed.',
      );
    }
  }
}
