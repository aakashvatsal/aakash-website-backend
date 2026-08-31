import { MediaPlatform } from '../schemas/media-post.schema';

export interface GetMediaMetricsParams {
  platform: MediaPlatform;
  platformPostId: string;
  platformAccountId?: string;
  platformMediaId?: string;
}

export interface GetMediaAccountMetricsParams {
  platform: MediaPlatform;
  platformAccountId?: string;
}

export interface NormalizedMediaAccountMetrics {
  followers?: number;
  subscribers?: number;
  profileViews?: number;
  impressions?: number;
  reach?: number;
  views?: number;
  websiteClicks?: number;
  leads?: number;
}

export interface MediaAccountMetricsResponse {
  normalized: NormalizedMediaAccountMetrics;
  raw: Record<string, unknown>;
}

export interface NormalizedMediaMetrics {
  impressions?: number;
  reach?: number;
  views?: number;
  engagedViews?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  sends?: number;
  clicks?: number;
  profileVisits?: number;
  followersGained?: number;
  followersLost?: number;
  leadsGenerated?: number;
  conversions?: number;
  watchTimeSeconds?: number;
  averageViewDurationSeconds?: number;
  averageWatchPercentage?: number;
  engagementRate?: number;
}

export interface MediaMetricsResponse {
  normalized: NormalizedMediaMetrics;
  raw: Record<string, unknown>;
}

export interface MediaAnalyticsProvider {
  supports(platform: MediaPlatform): boolean;

  getPostMetrics(params: GetMediaMetricsParams): Promise<MediaMetricsResponse>;
}
