import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { NowService } from './now.service';

@Injectable()
export class NowFreshnessScheduler {
  private readonly logger = new Logger(NowFreshnessScheduler.name);

  constructor(private readonly nowService: NowService) {}

  @Cron('0 */5 * * * *', { timeZone: 'Asia/Kolkata' })
  async refreshCurrentState() {
    try {
      await this.nowService.refreshCurrentState();
    } catch (error) {
      this.logger.warn(
        `Unable to refresh Now freshness: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
