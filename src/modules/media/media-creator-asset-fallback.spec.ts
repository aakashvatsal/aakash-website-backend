import { MediaPlanningService } from './media-planning.service';
import { completeCreatorCopy } from './media-creator-asset-fallback';
import { evaluateMediaCreatorQuota } from './media-creator-quota';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

describe('17 fully authored offline creator assets, without model calls', () => {
  const service = Object.create(MediaPlanningService.prototype) as MediaPlanningService;
  const internal = service as unknown as {
    recoverCreatorCalendar: (start: string, end: string, stage: string, prior?: unknown) => any;
    emptyCreatorDay: (date: string, index: number) => any;
    reconcileCreatorPlan: (plan: any) => any;
    creatorQuotaReadiness: (days: any[]) => any;
  };

  it('writes all 17 complete scripts/captions/slides with no API or evidence dependency', () => {
    const week = internal.recoverCreatorCalendar('2026-10-08', '2026-10-14', 'starting');
    const posts = week.days.flatMap((day: any) => day.executions).filter((item: any) => item.action === 'post');
    expect(week.days).toHaveLength(7);
    expect(posts).toHaveLength(17);
    expect(posts.every(completeCreatorCopy)).toBe(true);
    expect(new Set(posts.map((post: any) => post.title)).size).toBe(17);
    expect(evaluateMediaCreatorQuota(posts).complete).toBe(true);
    expect(internal.creatorQuotaReadiness(week.days).authored.complete).toBe(true);
    expect(posts.every((post: any) => post.requiresApproval)).toBe(true);
    // No provenance means *written* does not mean approved or published.
    expect(posts.every((post: any) => !post.executionReady)).toBe(true);
    const long = posts.find((post: any) => post.platform === MediaPlatform.YOUTUBE && post.format === MediaPostType.VIDEO);
    expect(long.videoPack.fullScript.split(/\s+/).length).toBeGreaterThanOrEqual(550);
    const carousel = posts.find((post: any) => post.format === MediaPostType.CAROUSEL);
    expect(carousel.carouselSlides).toHaveLength(7);
  });

  it('is idempotent and preserves complete assets when repairing missing formats', () => {
    const first = internal.recoverCreatorCalendar('2026-10-08', '2026-10-14', 'starting');
    const original = first.days[0].executions.find((p: any) => p.action === 'post');
    const repeat = internal.reconcileCreatorPlan(first);
    expect(repeat.days[0].executions.find((p: any) => p.platform === original.platform)).toEqual(original);
    expect(repeat.days.flatMap((day: any) => day.executions).filter((p: any) => p.action === 'post')).toHaveLength(17);
  });

  it('appends a carousel without deleting seven existing complete Reels', () => {
    const week = internal.recoverCreatorCalendar('2026-10-08', '2026-10-14', 'starting');
    const reel = week.days.flatMap((day: any) => day.executions).find((p: any) => p.format === MediaPostType.REEL && p.action === 'post');
    for (const day of week.days) {
      const instagram = day.executions.find((p: any) => p.platform === MediaPlatform.INSTAGRAM);
      Object.assign(instagram, { ...reel, time: '18:00' });
    }
    const fixed = internal.reconcileCreatorPlan(week);
    const posts = fixed.days.flatMap((day: any) => day.executions).filter((p: any) => p.action === 'post');
    const reels = posts.filter((p: any) => p.platform === MediaPlatform.INSTAGRAM && p.format === MediaPostType.REEL);
    const carousels = posts.filter((p: any) => p.platform === MediaPlatform.INSTAGRAM && p.format === MediaPostType.CAROUSEL);
    expect(reels).toHaveLength(7);
    expect(carousels.length).toBeGreaterThanOrEqual(1);
    expect(completeCreatorCopy(carousels[0])).toBe(true);
  });
});
