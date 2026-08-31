import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { WhoopService } from './whoop.service';

@Injectable()
export class WhoopSyncScheduler {
  private readonly logger = new Logger(WhoopSyncScheduler.name);

  /**
   * Prevent another sync from starting
   * while the previous one is still running.
   *
   * This protects a single NestJS instance.
   */
  private isRunning = false;

  constructor(private readonly whoopService: WhoopService) {}

  /**
   * Every 2 hours:
   *
   * 00:00
   * 02:00
   * 04:00
   * ...
   *
   * Asia/Kolkata
   */
  @Cron(
    // '0 0 */2 * * *',
    '0 */30 * * * *',
    {
      name: 'whoop-health-sync',

      timeZone: 'Asia/Kolkata',
    },
  )
  async syncWhoopHealth() {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping WHOOP sync because previous sync is still running.',
      );

      return;
    }

    this.isRunning = true;

    const startedAt = Date.now();

    try {
      this.logger.log('Starting automatic WHOOP health sync.');

      const result = await this.whoopService.syncRecentHealth(3);

      this.logger.log(
        `WHOOP sync completed in ${Date.now() - startedAt}ms. ${JSON.stringify(
          result?.data ?? result,
        )}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Automatic WHOOP sync failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}
