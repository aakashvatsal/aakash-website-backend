import { evaluateMediaCreatorQuota } from './media-creator-quota';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

const post = (platform: MediaPlatform, format: MediaPostType, action = 'post') => ({platform, format, action});

describe('seven-day media creator quotas', () => {
  const mandatory = [
    ...Array.from({ length: 3 }, () => post(MediaPlatform.INSTAGRAM, MediaPostType.REEL)),
    post(MediaPlatform.INSTAGRAM, MediaPostType.CAROUSEL),
    post(MediaPlatform.YOUTUBE, MediaPostType.VIDEO),
    ...Array.from({ length: 3 }, () => post(MediaPlatform.YOUTUBE, MediaPostType.SHORT)),
    ...Array.from({ length: 5 }, () => post(MediaPlatform.LINKEDIN, MediaPostType.TEXT)),
    ...Array.from({ length: 4 }, () => post(MediaPlatform.X, MediaPostType.TEXT)),
  ];
  it('accepts exactly the minimum mix on every platform', () => {
    const result = evaluateMediaCreatorQuota(mandatory);
    expect(result.complete).toBe(true);
    expect(Object.values(result.deficits)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('fails an existing seven-day grid when just one format is absent', () => {
    const result = evaluateMediaCreatorQuota(mandatory.filter((_, i) => i !== 0));
    expect(result.complete).toBe(false);
    expect(result.deficits.instagramReels).toBe(1);
  });
  it('does not let an extra Reel substitute for the carousel', () => {
    const result = evaluateMediaCreatorQuota(mandatory.map(p =>
      p.platform === MediaPlatform.INSTAGRAM && p.format === MediaPostType.CAROUSEL
        ? post(MediaPlatform.INSTAGRAM, MediaPostType.REEL) : p));
    expect(result.deficits.instagramCarousels).toBe(1);
  });
  it('does not count intentional skips as posts', () => {
    const result = evaluateMediaCreatorQuota([...mandatory.slice(1), mandatory[0] && { ...mandatory[0], action: 'skip' }]);
    expect(result.deficits.instagramReels).toBe(1);
  });
});
