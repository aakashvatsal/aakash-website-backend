import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { HsakaaVoiceService } from './hsakaa-voice.service';

@Injectable()
export class HsakaaVoiceScheduler {
  private readonly logger = new Logger(HsakaaVoiceScheduler.name);

  constructor(private readonly voiceService: HsakaaVoiceService) {}

  @Cron('0 20 2 * * *', {
    name: 'hsakaa-voice-learning',
    timeZone: 'Asia/Kolkata',
  })
  async refreshVoiceProfile() {
    try {
      await this.voiceService.refreshIfNeeded();
    } catch (error) {
      this.logger.error(
        `Scheduled Aakash voice learning failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
