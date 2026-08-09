import { MediaPlatform } from '../schemas/media-post.schema';

export interface GetMediaMetricsParams {
  platform: MediaPlatform;
  platformPostId: string;
  platformAccountId?: string;
  platformMediaId?: string;
}

export interface NormalizedMediaMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  profileVisits?: number;
  followersGained?: number;
  leadsGenerated?: number;
  conversions?: number;
  watchTimeSeconds?: number;
  averageWatchPercentage?: number;
  engagementRate?: number;
}

export interface MediaMetricsResponse {
  normalized: NormalizedMediaMetrics;
  raw: Record<string, unknown>;
}

export interface MediaAnalyticsProvider {
  supports(platform: MediaPlatform): boolean;

  getPostMetrics(
    params: GetMediaMetricsParams,
  ): Promise<MediaMetricsResponse>;
}