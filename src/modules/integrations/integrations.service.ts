import { Injectable } from '@nestjs/common';

import { MediaAnalyticsService } from '../media/services/media-analytics.service';

import { WhoopService } from './whoop/whoop.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly whoopService: WhoopService,

    private readonly mediaAnalyticsService: MediaAnalyticsService,
  ) {}

  async getOverview() {
    const [whoop] = await Promise.all([this.whoopService.getStatus()]);

    return {
      generatedAt: new Date(),
      health: {
        whoop,
      },
      mediaAnalytics: this.mediaAnalyticsService.getProviderStatus(),
    };
  }

  getMediaAnalyticsStatus() {
    return this.mediaAnalyticsService.getProviderStatus();
  }
}
