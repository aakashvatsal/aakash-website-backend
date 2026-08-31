import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { HsakaaBriefService } from './hsakaa-brief.service';

@Injectable()
export class HsakaaBriefScheduler {
  private readonly logger = new Logger(HsakaaBriefScheduler.name);

  constructor(
    private readonly briefService: HsakaaBriefService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 30 6 * * *', {
    name: 'hsakaa-daily-brief',
    timeZone: 'Asia/Kolkata',
  })
  async generateMorningBrief() {
    if (!this.isEnabled()) return;

    try {
      const result = await this.briefService.ensureScheduledToday();
      if (result) {
        this.logger.log('Generated scheduled HSAKAA Daily Brief.');
      }
    } catch (error) {
      this.logger.error(
        `Scheduled HSAKAA Daily Brief failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private isEnabled() {
    return (
      this.configService
        .get<string>('HSAKAA_DAILY_BRIEF_ENABLED')
        ?.trim()
        .toLowerCase() === 'true'
    );
  }
}
