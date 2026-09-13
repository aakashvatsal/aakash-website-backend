import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { HobbiesCoachingService } from './hobbies-coaching.service';
import { HobbiesService } from './hobbies.service';
import { HobbyReviewPeriod } from './schemas/hobby-review.schema';

@Injectable()
export class HobbiesScheduler {
  private readonly logger = new Logger(HobbiesScheduler.name);

  constructor(
    private readonly hobbiesService: HobbiesService,
    private readonly hobbiesCoachingService: HobbiesCoachingService,
  ) {}

  @Cron('0 0 8 * * *', { timeZone: 'Asia/Kolkata' })
  async syncPracticeTasks() {
    try {
      const result = await this.hobbiesService.syncPracticeTasks();
      this.logger.log(
        `Hobby practice-task sync completed: ${result.created} created, ${result.skipped} skipped.`,
      );
    } catch (error) {
      this.logger.error(
        `Hobby practice-task sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron('0 10 7 * * 1', { timeZone: 'Asia/Kolkata' })
  async generateWeeklyReviews() {
    try {
      const anchor = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await this.hobbiesCoachingService.generateAutomaticReviews(
        HobbyReviewPeriod.WEEKLY,
        anchor,
      );
      this.logger.log(
        `Hobby weekly reviews completed: ${result.generated} generated, ${result.failures.length} failed.`,
      );
    } catch (error) {
      this.logger.error(
        `Hobby weekly reviews failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron('0 20 7 1 * *', { timeZone: 'Asia/Kolkata' })
  async generateMonthlyReviews() {
    try {
      const anchor = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await this.hobbiesCoachingService.generateAutomaticReviews(
        HobbyReviewPeriod.MONTHLY,
        anchor,
      );
      this.logger.log(
        `Hobby monthly reviews completed: ${result.generated} generated, ${result.failures.length} failed.`,
      );
    } catch (error) {
      this.logger.error(
        `Hobby monthly reviews failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
