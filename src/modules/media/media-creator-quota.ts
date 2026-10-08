import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

/** Hard floors for every seven-local-day creator planning window. */
export const MEDIA_CREATOR_WEEKLY_MINIMUMS = Object.freeze({
  instagramReels: 3,
  instagramCarousels: 1,
  youtubeLong: 1,
  youtubeShorts: 3,
  linkedin: 5,
  x: 4,
});

export type MediaCreatorQuotaKey = keyof typeof MEDIA_CREATOR_WEEKLY_MINIMUMS;
export type MediaCreatorQuotaCounts = Record<MediaCreatorQuotaKey, number>;
export type MediaCreatorQuotaEntry = {
  platform: MediaPlatform;
  format?: MediaPostType;
  action?: string;
};

export function evaluateMediaCreatorQuota(entries: Iterable<MediaCreatorQuotaEntry>) {
  const totals: MediaCreatorQuotaCounts = {
    instagramReels: 0, instagramCarousels: 0, youtubeLong: 0,
    youtubeShorts: 0, linkedin: 0, x: 0,
  };
  for (const post of entries) {
    if (post.action !== undefined && post.action !== 'post') continue;
    if (post.platform === MediaPlatform.INSTAGRAM) {
      if (post.format === MediaPostType.REEL) totals.instagramReels++;
      if (post.format === MediaPostType.CAROUSEL) totals.instagramCarousels++;
    } else if (post.platform === MediaPlatform.YOUTUBE) {
      if (post.format === MediaPostType.VIDEO) totals.youtubeLong++;
      if (post.format === MediaPostType.SHORT) totals.youtubeShorts++;
    } else if (post.platform === MediaPlatform.LINKEDIN) {
      totals.linkedin++;
    } else if (post.platform === MediaPlatform.X) {
      totals.x++;
    }
  }
  const minimums = { ...MEDIA_CREATOR_WEEKLY_MINIMUMS };
  const deficits = {} as MediaCreatorQuotaCounts;
  for (const key of Object.keys(minimums) as MediaCreatorQuotaKey[]) {
    deficits[key] = Math.max(0, minimums[key] - totals[key]);
  }
  return { totals, minimums, deficits, complete: Object.values(deficits).every(value => value === 0) };
}
