import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MediaSeriesService } from './media-series.service';

/** Weekly data review is advisory. Only an explicit owner action may rotate a series. */
@Injectable()
export class MediaSeriesScheduler {
  private readonly logger = new Logger(MediaSeriesScheduler.name);

  constructor(private readonly service: MediaSeriesService) {}

  @Cron('0 20 6 * * 1', { timeZone: 'Asia/Kolkata' })
  async weeklyReview() {
    try {
      const result = await this.service.reviewPortfolio(false);
      this.logger.log(result.applied
        ? `Series portfolio: retired ${result.proposed?.retire}, activated ${result.proposed?.activate}`
        : `Series portfolio recommendation only: ${result.reason}`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.stack : String(error));
    }
  }
}
