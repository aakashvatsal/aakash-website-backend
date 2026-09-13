import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MediaLearningService } from './media-learning.service';

@Injectable()
export class MediaLearningScheduler {
  private readonly logger = new Logger(MediaLearningScheduler.name);

  constructor(private readonly learningService: MediaLearningService) {}

  @Cron('0 50 5 * * *', { timeZone: 'Asia/Kolkata' })
  async refreshLearning() {
    try {
      await this.learningService.rebuildAll(90);
    } catch (error) {
      this.logger.error(
        error instanceof Error
          ? error.message
          : 'Media V3.3 learning refresh failed.',
      );
    }
  }
}
