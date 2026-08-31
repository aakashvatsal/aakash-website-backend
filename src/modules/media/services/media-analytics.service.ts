import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import axios, { AxiosError } from 'axios';

import {
  GetMediaAccountMetricsParams,
  GetMediaMetricsParams,
  MediaAccountMetricsResponse,
  MediaMetricsResponse,
  NormalizedMediaMetrics,
} from '../interfaces/media-analytics.interface';

import { MediaPlatform } from '../schemas/media-post.schema';

interface LinkedInMetricResponse {
  elements?: Array<{
    count?: number | string;
    metricType?: string;
  }>;
}

interface InstagramInsightItem {
  name?: string;
  values?: Array<{
    value?: number | string;
  }>;
  total_value?: {
    value?: number | string;
  };
}

interface InstagramInsightResponse {
  data?: InstagramInsightItem[];
}

interface YouTubeVideoResponse {
  items?: Array<{
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
}

interface YouTubeAnalyticsResponse {
  columnHeaders?: Array<{ name?: string }>;
  rows?: Array<Array<number | string>>;
}

interface YouTubeChannelResponse {
  items?: Array<{
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
  }>;
}

interface InstagramAccountResponse {
  followers_count?: number;
  media_count?: number;
}

interface XAccountResponse {
  data?: {
    public_metrics?: {
      followers_count?: number;
      following_count?: number;
      tweet_count?: number;
      listed_count?: number;
      like_count?: number;
      media_count?: number;
    };
  };
}

interface XPostResponse {
  data?: {
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
      bookmark_count?: number;
      impression_count?: number;
    };
  };
  includes?: {
    media?: Array<{
      public_metrics?: {
        view_count?: number;
      };
    }>;
  };
}

@Injectable()
export class MediaAnalyticsService {
  constructor(private readonly configService: ConfigService) {}

  async getPostMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    if (!params.platformPostId?.trim()) {
      throw new BadRequestException(
        'Platform post ID is required to fetch media metrics.',
      );
    }

    switch (params.platform) {
      case MediaPlatform.LINKEDIN:
        return this.getLinkedInMetrics(params);

      case MediaPlatform.INSTAGRAM:
        return this.getInstagramMetrics(params);

      case MediaPlatform.YOUTUBE:
        return this.getYouTubeMetrics(params);

      case MediaPlatform.X:
        return this.getXMetrics(params);

      case MediaPlatform.FACEBOOK:
        throw new ServiceUnavailableException(
          'Facebook post analytics is not enabled. Use Instagram media analytics for Instagram content or configure a dedicated Facebook Page insights flow before syncing Facebook metrics.',
        );

      case MediaPlatform.THREADS:
        throw new ServiceUnavailableException(
          'Threads post analytics is not enabled for this Personal OS yet.',
        );

      case MediaPlatform.WHATSAPP:
        throw new ServiceUnavailableException(
          'WhatsApp is managed as business messaging/manual Status content; public post analytics do not apply.',
        );

      default:
        throw new BadRequestException(
          `Unsupported media platform: ${String(params.platform)}.`,
        );
    }
  }

  async getAccountMetrics(
    params: GetMediaAccountMetricsParams,
  ): Promise<MediaAccountMetricsResponse> {
    switch (params.platform) {
      case MediaPlatform.INSTAGRAM:
        return this.getInstagramAccountMetrics(params);
      case MediaPlatform.YOUTUBE:
        return this.getYouTubeAccountMetrics(params);
      case MediaPlatform.X:
        return this.getXAccountMetrics(params);
      default:
        throw new ServiceUnavailableException(
          `${String(params.platform)} account-level growth analytics is not enabled yet.`,
        );
    }
  }

  getProviderStatus() {
    return {
      linkedin: {
        configured: Boolean(
          this.configService.get<string>('LINKEDIN_ACCESS_TOKEN'),
        ),
        mode: 'member_post_analytics',
      },
      instagram: {
        configured: Boolean(
          this.configService.get<string>('INSTAGRAM_ACCESS_TOKEN'),
        ),
        mode: 'instagram_media_insights',
      },
      youtube: {
        configured: Boolean(
          this.configService.get<string>('YOUTUBE_OAUTH_ACCESS_TOKEN') ||
          this.configService.get<string>('YOUTUBE_API_KEY'),
        ),
        mode: this.configService.get<string>('YOUTUBE_OAUTH_ACCESS_TOKEN')
          ? 'owner_analytics_plus_public_statistics'
          : 'public_video_statistics',
      },
      x: {
        configured: Boolean(this.configService.get<string>('X_BEARER_TOKEN')),
        mode: 'public_post_metrics',
      },
      facebook: {
        configured: false,
        mode: 'not_enabled',
      },
      threads: {
        configured: false,
        mode: 'not_enabled',
      },
      whatsapp: {
        configured: false,
        mode: 'business_messaging_or_manual_status',
      },
    };
  }

  private async getLinkedInMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    const token = this.getRequiredConfig(
      'LINKEDIN_ACCESS_TOKEN',
      'LinkedIn analytics is not configured. Set LINKEDIN_ACCESS_TOKEN with r_member_postAnalytics access.',
    );

    const version =
      this.configService.get<string>('LINKEDIN_VERSION') || '202607';

    const entity = this.getLinkedInEntity(params.platformPostId);

    const metricMap: Record<string, keyof NormalizedMediaMetrics> = {
      IMPRESSION: 'impressions',
      MEMBERS_REACHED: 'reach',
      RESHARE: 'shares',
      REACTION: 'likes',
      COMMENT: 'comments',
      POST_SAVE: 'saves',
      LINK_CLICKS: 'clicks',
      FOLLOWER_GAINED_FROM_CONTENT: 'followersGained',
      PROFILE_VIEW_FROM_CONTENT: 'profileVisits',
    };

    const raw: Record<string, unknown> = {};
    const normalized: NormalizedMediaMetrics = {};

    await Promise.all(
      Object.entries(metricMap).map(async ([queryType, target]) => {
        try {
          const response = await axios.get<LinkedInMetricResponse>(
            'https://api.linkedin.com/rest/memberCreatorPostAnalytics',
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'LinkedIn-Version': version,
                'X-Restli-Protocol-Version': '2.0.0',
              },
              params: {
                q: 'entity',
                entity,
                queryType,
                aggregation: 'TOTAL',
              },
              timeout: 15000,
            },
          );

          raw[queryType] = response.data;

          const count = this.extractLinkedInCount(response.data);

          if (count !== undefined) {
            normalized[target] = count;
          }
        } catch (error) {
          if (this.isProviderMetricUnavailable(error)) {
            raw[queryType] = {
              unavailable: true,
              status: this.getAxiosStatus(error),
            };
            return;
          }

          throw error;
        }
      }),
    ).catch((error) => {
      throw this.mapProviderError('LinkedIn', error);
    });

    normalized.engagementRate = this.calculateEngagementRate(normalized);

    return {
      normalized,
      raw,
    };
  }

  private async getInstagramMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    const token = this.getRequiredConfig(
      'INSTAGRAM_ACCESS_TOKEN',
      'Instagram analytics is not configured. Set INSTAGRAM_ACCESS_TOKEN for an Instagram professional account with insights permission.',
    );

    const mediaId =
      params.platformMediaId?.trim() || params.platformPostId.trim();

    const version =
      this.configService.get<string>('INSTAGRAM_GRAPH_VERSION') || 'v25.0';

    const host =
      this.configService.get<string>('INSTAGRAM_GRAPH_HOST') ||
      'https://graph.instagram.com';

    const primaryMetrics = [
      'views',
      'reach',
      'likes',
      'comments',
      'shares',
      'saved',
      'total_interactions',
    ];

    let response: InstagramInsightResponse;

    try {
      const result = await axios.get<InstagramInsightResponse>(
        `${host}/${version}/${encodeURIComponent(mediaId)}/insights`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            metric: primaryMetrics.join(','),
          },
          timeout: 15000,
        },
      );

      response = result.data;
    } catch {
      // Instagram metric availability varies by media type.
      // Retry with the cross-media core if one metric caused the first request to fail.
      try {
        const fallback = await axios.get<InstagramInsightResponse>(
          `${host}/${version}/${encodeURIComponent(mediaId)}/insights`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            params: {
              metric: 'views,likes,comments,shares,saved',
            },
            timeout: 15000,
          },
        );

        response = fallback.data;
      } catch (fallbackError) {
        throw this.mapProviderError('Instagram', fallbackError);
      }
    }

    const values = this.flattenInstagramInsights(response);

    const normalized: NormalizedMediaMetrics = {
      views: values.views,
      reach: values.reach,
      likes: values.likes,
      comments: values.comments,
      shares: values.shares,
      saves: values.saved ?? values.saves,
    };

    normalized.engagementRate = this.calculateEngagementRate(normalized);

    return {
      normalized: this.removeUndefinedMetrics(normalized),
      raw: response as unknown as Record<string, unknown>,
    };
  }

  private async getYouTubeMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY')?.trim();
    const oauthToken = this.configService
      .get<string>('YOUTUBE_OAUTH_ACCESS_TOKEN')
      ?.trim();

    if (!apiKey && !oauthToken) {
      throw new ServiceUnavailableException(
        'YouTube analytics is not configured. Set YOUTUBE_OAUTH_ACCESS_TOKEN for owner analytics or YOUTUBE_API_KEY for public statistics.',
      );
    }

    try {
      const response = await axios.get<YouTubeVideoResponse>(
        'https://www.googleapis.com/youtube/v3/videos',
        {
          headers: oauthToken
            ? { Authorization: `Bearer ${oauthToken}` }
            : undefined,
          params: {
            part: 'statistics',
            id: params.platformPostId,
            ...(apiKey ? { key: apiKey } : {}),
          },
          timeout: 15000,
        },
      );

      const statistics = response.data.items?.[0]?.statistics;
      if (!statistics) {
        throw new BadRequestException(
          'YouTube video was not found or its statistics are unavailable.',
        );
      }

      const normalized: NormalizedMediaMetrics = {
        views: this.toNumber(statistics.viewCount),
        likes: this.toNumber(statistics.likeCount),
        comments: this.toNumber(statistics.commentCount),
      };
      const raw: Record<string, unknown> = {
        publicStatistics: response.data,
      };

      if (oauthToken) {
        try {
          const endDate = new Date().toISOString().slice(0, 10);
          const ownerResponse = await axios.get<YouTubeAnalyticsResponse>(
            'https://youtubeanalytics.googleapis.com/v2/reports',
            {
              headers: { Authorization: `Bearer ${oauthToken}` },
              params: {
                ids: 'channel==MINE',
                startDate: '2000-01-01',
                endDate,
                filters: `video==${params.platformPostId}`,
                metrics:
                  'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost',
              },
              timeout: 15000,
            },
          );
          const values = this.youtubeAnalyticsValues(ownerResponse.data);
          normalized.views = values.views ?? normalized.views;
          normalized.watchTimeSeconds =
            values.estimatedMinutesWatched !== undefined
              ? values.estimatedMinutesWatched * 60
              : undefined;
          normalized.averageViewDurationSeconds = values.averageViewDuration;
          normalized.averageWatchPercentage = values.averageViewPercentage;
          normalized.likes = values.likes ?? normalized.likes;
          normalized.comments = values.comments ?? normalized.comments;
          normalized.shares = values.shares;
          normalized.followersGained = values.subscribersGained;
          normalized.followersLost = values.subscribersLost;
          raw.ownerAnalytics = ownerResponse.data;
        } catch (error) {
          raw.ownerAnalytics = {
            unavailable: true,
            status: this.getAxiosStatus(error),
          };
        }
      }

      normalized.engagementRate = this.calculateEngagementRate(normalized);
      return {
        normalized: this.removeUndefinedMetrics(normalized),
        raw,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw this.mapProviderError('YouTube', error);
    }
  }

  private async getInstagramAccountMetrics(
    params: GetMediaAccountMetricsParams,
  ): Promise<MediaAccountMetricsResponse> {
    const accountId = params.platformAccountId?.trim();
    if (!accountId) {
      throw new BadRequestException(
        'Instagram external account ID is required for account growth analytics.',
      );
    }
    const token = this.getRequiredConfig(
      'INSTAGRAM_ACCESS_TOKEN',
      'Instagram analytics is not configured. Set INSTAGRAM_ACCESS_TOKEN.',
    );
    const version =
      this.configService.get<string>('INSTAGRAM_GRAPH_VERSION') || 'v25.0';
    const host =
      this.configService.get<string>('INSTAGRAM_GRAPH_HOST') ||
      'https://graph.instagram.com';
    try {
      const response = await axios.get<InstagramAccountResponse>(
        `${host}/${version}/${encodeURIComponent(accountId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { fields: 'followers_count,media_count' },
          timeout: 15000,
        },
      );
      return {
        normalized: {
          followers: response.data.followers_count,
        },
        raw: response.data as unknown as Record<string, unknown>,
      };
    } catch (error) {
      throw this.mapProviderError('Instagram', error);
    }
  }

  private async getYouTubeAccountMetrics(
    params: GetMediaAccountMetricsParams,
  ): Promise<MediaAccountMetricsResponse> {
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY')?.trim();
    const oauthToken = this.configService
      .get<string>('YOUTUBE_OAUTH_ACCESS_TOKEN')
      ?.trim();
    if (!apiKey && !oauthToken) {
      throw new ServiceUnavailableException(
        'YouTube account analytics is not configured.',
      );
    }
    const accountId = params.platformAccountId?.trim();
    try {
      const response = await axios.get<YouTubeChannelResponse>(
        'https://www.googleapis.com/youtube/v3/channels',
        {
          headers: oauthToken
            ? { Authorization: `Bearer ${oauthToken}` }
            : undefined,
          params: {
            part: 'statistics',
            ...(accountId
              ? { id: accountId }
              : oauthToken
                ? { mine: true }
                : {}),
            ...(apiKey ? { key: apiKey } : {}),
          },
          timeout: 15000,
        },
      );
      const statistics = response.data.items?.[0]?.statistics;
      if (!statistics) {
        throw new BadRequestException(
          'YouTube channel statistics are unavailable. Configure an external account ID or OAuth owner token.',
        );
      }
      return {
        normalized: {
          subscribers: this.toNumber(statistics.subscriberCount),
          views: this.toNumber(statistics.viewCount),
        },
        raw: response.data as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.mapProviderError('YouTube', error);
    }
  }

  private async getXAccountMetrics(
    params: GetMediaAccountMetricsParams,
  ): Promise<MediaAccountMetricsResponse> {
    const accountId = params.platformAccountId?.trim();
    if (!accountId) {
      throw new BadRequestException(
        'X external account ID is required for account growth analytics.',
      );
    }
    const token = this.getRequiredConfig(
      'X_BEARER_TOKEN',
      'X analytics is not configured. Set X_BEARER_TOKEN.',
    );
    try {
      const response = await axios.get<XAccountResponse>(
        `https://api.x.com/2/users/${encodeURIComponent(accountId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { 'user.fields': 'public_metrics' },
          timeout: 15000,
        },
      );
      return {
        normalized: {
          followers: response.data.data?.public_metrics?.followers_count,
        },
        raw: response.data as unknown as Record<string, unknown>,
      };
    } catch (error) {
      throw this.mapProviderError('X', error);
    }
  }

  private async getXMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse> {
    const token = this.getRequiredConfig(
      'X_BEARER_TOKEN',
      'X analytics is not configured. Set X_BEARER_TOKEN.',
    );

    try {
      const response = await axios.get<XPostResponse>(
        `https://api.x.com/2/tweets/${encodeURIComponent(params.platformPostId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          params: {
            'tweet.fields': 'public_metrics,attachments',
            expansions: 'attachments.media_keys',
            'media.fields': 'public_metrics',
          },
          timeout: 15000,
        },
      );

      const metrics = response.data.data?.public_metrics;

      if (!metrics) {
        throw new BadRequestException('X post metrics are unavailable.');
      }

      const videoViews = response.data.includes?.media?.reduce(
        (sum, media) => sum + (media.public_metrics?.view_count || 0),
        0,
      );

      const normalized: NormalizedMediaMetrics = {
        impressions: metrics.impression_count,
        views: videoViews || undefined,
        likes: metrics.like_count,
        comments: metrics.reply_count,
        shares: (metrics.retweet_count || 0) + (metrics.quote_count || 0),
        saves: metrics.bookmark_count,
      };

      normalized.engagementRate = this.calculateEngagementRate(normalized);

      return {
        normalized: this.removeUndefinedMetrics(normalized),
        raw: response.data as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw this.mapProviderError('X', error);
    }
  }

  private getLinkedInEntity(platformPostId: string) {
    const value = platformPostId.trim();

    if (value.startsWith('urn:li:ugcPost:')) {
      return `(ugc:${value})`;
    }

    if (value.startsWith('urn:li:share:')) {
      return `(share:${value})`;
    }

    throw new BadRequestException(
      'LinkedIn platformPostId must be a LinkedIn share or UGC post URN.',
    );
  }

  private extractLinkedInCount(response: LinkedInMetricResponse) {
    const element = response.elements?.[0];

    return this.toNumber(element?.count);
  }

  private flattenInstagramInsights(response: InstagramInsightResponse) {
    const result: Record<string, number | undefined> = {};

    for (const item of response.data || []) {
      if (!item.name) {
        continue;
      }

      const rawValue = item.total_value?.value ?? item.values?.[0]?.value;

      result[item.name] = this.toNumber(rawValue);
    }

    return result;
  }

  private calculateEngagementRate(metrics: NormalizedMediaMetrics) {
    const engagements =
      (metrics.likes || 0) +
      (metrics.comments || 0) +
      (metrics.shares || 0) +
      (metrics.saves || 0) +
      (metrics.clicks || 0);

    const denominator = metrics.impressions || metrics.reach || metrics.views;

    if (!denominator) {
      return undefined;
    }

    return Number(((engagements / denominator) * 100).toFixed(4));
  }

  private removeUndefinedMetrics(metrics: NormalizedMediaMetrics) {
    return Object.fromEntries(
      Object.entries(metrics).filter(([, value]) => value !== undefined),
    ) as NormalizedMediaMetrics;
  }

  private toNumber(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return undefined;
    }

    return parsed;
  }

  private youtubeAnalyticsValues(response: YouTubeAnalyticsResponse) {
    const headers = response.columnHeaders ?? [];
    const row = response.rows?.[0] ?? [];
    const result: Record<string, number> = {};
    headers.forEach((header, index) => {
      const name = header.name;
      const value = row[index];
      if (!name) return;
      const numeric = this.toNumber(value);
      if (numeric !== undefined) result[name] = numeric;
    });
    return result;
  }

  private getRequiredConfig(key: string, message: string) {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new ServiceUnavailableException(message);
    }

    return value;
  }

  private isProviderMetricUnavailable(error: unknown) {
    const status = this.getAxiosStatus(error);

    return status === 400 || status === 403 || status === 404;
  }

  private getAxiosStatus(error: unknown) {
    return axios.isAxiosError(error) ? error.response?.status : undefined;
  }

  private mapProviderError(provider: string, error: unknown) {
    if (
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException
    ) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<unknown>;

      const status = axiosError.response?.status;

      return new BadGatewayException(
        `${provider} analytics request failed${status ? ` with status ${status}` : ''}.`,
      );
    }

    return new BadGatewayException(`${provider} analytics request failed.`);
  }
}
