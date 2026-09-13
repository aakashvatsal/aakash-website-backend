import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaSocialPresenceService } from './media-social-presence.service';

@Injectable()
export class MediaSocialPresenceScheduler {
  private readonly logger = new Logger(MediaSocialPresenceScheduler.name);

  constructor(private readonly service: MediaSocialPresenceService) {}

  @Cron('0 5 7 * * 0', { timeZone: 'Asia/Kolkata' })
  async runSundaySocialPresenceReview() {
    try {
      await this.service.runWeeklyReview(true);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Sunday Social Presence review failed.',
      );
    }
  }
}
