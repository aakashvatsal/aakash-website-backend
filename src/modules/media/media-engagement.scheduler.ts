import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaEngagementService } from './media-engagement.service';

@Injectable()
export class MediaEngagementScheduler {
  private readonly logger = new Logger(MediaEngagementScheduler.name);

  constructor(private readonly engagementService: MediaEngagementService) {}

  @Cron('0 */10 * * * *', { timeZone: 'Asia/Kolkata' })
  async syncEngagement() {
    try {
      await this.engagementService.syncAll(100);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media engagement sync failed.',
      );
    }
  }
}
