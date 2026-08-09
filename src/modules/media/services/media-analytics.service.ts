import {
  BadRequestException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';

import {
  GetMediaMetricsParams,
  MediaMetricsResponse,
} from '../interfaces/media-analytics.interface';
import { MediaPlatform } from '../schemas/media-post.schema';

@Injectable()
export class MediaAnalyticsService {
  async getPostMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    if (!params.platformPostId) {
      throw new BadRequestException(
        'Platform post ID is required to fetch media metrics.',
      );
    }

    switch (params.platform) {
      case MediaPlatform.LINKEDIN:
        return this.getLinkedInMetrics(params);

      case MediaPlatform.INSTAGRAM:
      case MediaPlatform.FACEBOOK:
        return this.getMetaMetrics(params);

      case MediaPlatform.YOUTUBE:
        return this.getYouTubeMetrics(params);

      case MediaPlatform.X:
        return this.getXMetrics(params);

      default:
        throw new NotImplementedException(
          `Analytics integration is not implemented for ${params.platform}.`,
        );
    }
  }

  private async getLinkedInMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    /*
     * Call LinkedIn analytics API here.
     *
     * Use:
     * params.platformPostId
     * params.platformAccountId
     */

    throw new NotImplementedException(
      'LinkedIn analytics provider is not implemented yet.',
    );
  }

  private async getMetaMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    /*
     * Call Instagram Graph API or Facebook Graph API here.
     *
     * Use:
     * params.platformMediaId
     * params.platformAccountId
     */

    throw new NotImplementedException(
      'Meta analytics provider is not implemented yet.',
    );
  }

  private async getYouTubeMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    /*
     * Call YouTube Analytics API here.
     *
     * Use:
     * params.platformPostId as video ID
     */

    throw new NotImplementedException(
      'YouTube analytics provider is not implemented yet.',
    );
  }

  private async getXMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    /*
     * Call X analytics API here.
     */

    throw new NotImplementedException(
      'X analytics provider is not implemented yet.',
    );
  }
}