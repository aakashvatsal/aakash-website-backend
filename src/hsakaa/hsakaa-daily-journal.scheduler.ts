import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { HsakaaDailyJournalService } from './hsakaa-daily-journal.service';

@Injectable()
export class HsakaaDailyJournalScheduler {
  private readonly logger = new Logger(HsakaaDailyJournalScheduler.name);

  constructor(
    private readonly dailyJournalService: HsakaaDailyJournalService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 10 0 * * *', {
    name: 'hsakaa-private-daily-journal',
    timeZone: 'Asia/Kolkata',
  })
  async generatePreviousDayDraft() {
    if (!this.isEnabled()) return null;
    try {
      const result =
        await this.dailyJournalService.ensureScheduledPreviousDay();
      this.logger.log(
        'Prepared private HSAKAA daily journal draft for approval.',
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Scheduled HSAKAA daily journal failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  private isEnabled() {
    return (
      this.configService
        .get<string>('HSAKAA_DAILY_JOURNAL_ENABLED')
        ?.trim()
        .toLowerCase() !== 'false'
    );
  }
}
