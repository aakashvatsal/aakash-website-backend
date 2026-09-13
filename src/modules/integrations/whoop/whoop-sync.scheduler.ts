import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { HealthProgressService } from '../../health/health-progress.service';
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

  constructor(
    private readonly whoopService: WhoopService,
    private readonly healthProgressService: HealthProgressService,
  ) {}

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

      const todayKey = this.getIstDateKey();
      let todayProgressRefreshed = false;

      try {
        await this.healthProgressService.refreshDaily(todayKey);
        todayProgressRefreshed = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `WHOOP data synced, but today's Health execution refresh was skipped: ${message}`,
        );
      }

      this.logger.log(
        `WHOOP sync completed in ${Date.now() - startedAt}ms. ${JSON.stringify({
          ...(result?.data ?? result),
          todayKey,
          todayProgressRefreshed,
        })}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error(`Automatic WHOOP sync failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }

  private getIstDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }
}
