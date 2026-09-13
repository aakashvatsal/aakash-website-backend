import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaGrowthService } from './media-growth.service';

@Injectable()
export class MediaGrowthScheduler {
  private readonly logger = new Logger(MediaGrowthScheduler.name);

  constructor(private readonly growthService: MediaGrowthService) {}

  @Cron('0 10 * * * *', { timeZone: 'Asia/Kolkata' })
  async refreshLifecycleMetrics() {
    try {
      await this.growthService.syncLifecycle(150);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media lifecycle analytics sync failed.',
      );
    }
  }

  @Cron('0 20 */6 * * *', { timeZone: 'Asia/Kolkata' })
  async refreshPublishedMetrics() {
    try {
      await Promise.all([
        this.growthService.syncPublished(100),
        this.growthService.syncAccounts(50),
      ]);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media growth analytics sync failed.',
      );
    }
  }

  @Cron('0 35 5 * * *', { timeZone: 'Asia/Kolkata' })
  async refreshGrowthLearnings() {
    try {
      await this.growthService.rebuildLearnings({ days: 90, minSampleSize: 3 });
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media growth learning refresh failed.',
      );
    }
  }
}
