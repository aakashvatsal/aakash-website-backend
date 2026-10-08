/**
 * Conservative, format-agnostic series health signal. Evaluate comparable series
 * on the SAME platform in TWO independent 28-day publication windows.
 * Missing analytics are unknown, never zero. Do not rotate on a single spike.
 */
export type SeriesPerformancePost = {
  seriesKey: string;
  platform: string;
  publishedAt: Date;
  impressions: number;
  saves: number;
  shares: number;
  followersGained: number;
};
export type SeriesHealth = {
  key: string;
  recommendation: 'collect_more_data' | 'keep' | 'consider_rotation';
  peerComparablePlatforms: number;
  underperformingPlatforms: string[];
  note: string;
};

const WINDOW_MS = 28 * 86400000;
const MIN_POSTS_PER_WINDOW = 4;
const MIN_IMPRESSIONS_PER_WINDOW = 500;
const WEAK_RATIO = 0.60;

export function assessSeriesHealth(
  active: Array<{ key: string; channels: string[]; activatedAt?: Date }>,
  posts: SeriesPerformancePost[],
  now = new Date(),
): SeriesHealth[] {
  const nowMs = now.getTime();
  const groups = new Map<string, { posts: number; impressions: number; actions: number }>();
  for (const post of posts) {
    const ago = nowMs - new Date(post.publishedAt).getTime();
    if (!Number.isFinite(ago) || ago < 0 || ago >= WINDOW_MS * 2) continue;
    if (!Number.isFinite(post.impressions) || post.impressions <= 0) continue;
    const window = ago < WINDOW_MS ? 0 : 1;
    const key = `${post.seriesKey}|${post.platform}|${window}`;
    const row = groups.get(key) ?? { posts: 0, impressions: 0, actions: 0 };
    row.posts += 1;
    row.impressions += post.impressions;
    row.actions += Math.max(0, post.saves || 0) + Math.max(0, post.shares || 0) + Math.max(0, post.followersGained || 0);
    groups.set(key, row);
  }
  const score = (key: string, platform: string, window: number) => {
    const row = groups.get(`${key}|${platform}|${window}`);
    return row && row.posts >= MIN_POSTS_PER_WINDOW && row.impressions >= MIN_IMPRESSIONS_PER_WINDOW
      ? (row.actions / row.impressions) * 1000 : null;
  };

  return active.map(series => {
    if (!series.activatedAt || nowMs - new Date(series.activatedAt).getTime() < WINDOW_MS * 2) {
      return { key: series.key, recommendation: 'collect_more_data', peerComparablePlatforms: 0,
        underperformingPlatforms: [], note: 'Wait for two complete 28-day review windows.' };
    }
    let comparable = 0;
    const weaker: string[] = [];
    let stronger = false;
    for (const platform of series.channels) {
      const own = [score(series.key, platform, 0), score(series.key, platform, 1)];
      if (own.some(value => value === null)) continue;
      const baselines = [0, 1].map(window => {
        const peers = active.filter(peer => peer.key !== series.key && peer.channels.includes(platform))
          .map(peer => score(peer.key, platform, window))
          .filter((value): value is number => value !== null).sort((a,b) => a-b);
        return peers.length >= 2 ? peers[Math.floor(peers.length / 2)] : null;
      });
      if (baselines.some(baseline => baseline === null || baseline <= 0)) continue;
      comparable++;
      if (own[0]! < baselines[0]! * WEAK_RATIO && own[1]! < baselines[1]! * WEAK_RATIO) weaker.push(platform);
      else stronger = true;
    }
    if (!comparable) return { key: series.key, recommendation: 'collect_more_data', peerComparablePlatforms: 0,
      underperformingPlatforms: [], note: 'Not enough measured posts and comparable peers on the same platform.' };
    if (weaker.length && !stronger) return { key: series.key, recommendation: 'consider_rotation',
      peerComparablePlatforms: comparable, underperformingPlatforms: weaker,
      note: 'Below 60% of the same-platform peer median for two consecutive 28-day windows; require editorial suitability before replacement.' };
    return { key: series.key, recommendation: 'keep', peerComparablePlatforms: comparable,
      underperformingPlatforms: weaker, note: 'Not consistently underperforming across comparable platforms.' };
  });
}
