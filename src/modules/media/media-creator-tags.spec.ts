import { MediaPlatform } from './schemas/media-post.schema';
import { editorialTextKey, matchVerifiedCreatorTrend, selectCreatorSeries } from './media-creator-tags';
import { authoredCreatorFallback } from './media-creator-asset-fallback';
import { MediaPlanningService } from './media-planning.service';

const stub = () => ({ action: 'skip', title: '', hook: '', publishCopy: '',
  videoPack: {}, imageBrief: {}, carouselSlides: [], platform: MediaPlatform.INSTAGRAM });

describe('Creator editorial provenance & anti-repetition', () => {
  it('maps a factual category to a compatible series, never a guessed unrelated one', () => {
    expect(selectCreatorSeries('An imperfect guitar note', MediaPlatform.INSTAGRAM)?.key).toBe('learning-at-30');
    expect(selectCreatorSeries('The meeting that could be a decision', MediaPlatform.X)?.key).toBe('founder-unfiltered');
    expect(selectCreatorSeries('Dogs have terrible LinkedIn strategies', MediaPlatform.X)).toBeNull();
    expect(selectCreatorSeries('Anything vaguely inspirational', MediaPlatform.X)).toBeNull();
  });
  it('never invents trend provenance when absent, stale, unlinked, or unrelated', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    const feed = { available: true, entries: [
      { title: 'chess world', source: 'Google Trends India RSS', url: 'https://trends.google.com/trending/rss?geo=IN', publishedAt: '2026-10-08T06:00:00Z' },
    ] };
    expect(matchVerifiedCreatorTrend('My guitar practice', 'just a guitar', feed, now)).toBeNull();
    expect(matchVerifiedCreatorTrend('chess world', 'about chess world', { ...feed, entries: [{ ...feed.entries[0], publishedAt: '2026-09-27' }] }, now)).toBeNull();
    expect(matchVerifiedCreatorTrend('chess world', 'about chess world', feed, now)?.title).toBe('chess world');
  });
  it('writes a complete series-tagged pack with different editorial phrasing from the retired template', () => {
    const used = new Set<string>();
    const output = authoredCreatorFallback(stub() as never, '2026-10-08', 1, 'reel' as never, MediaPlatform.INSTAGRAM, undefined, used);
    expect(output.seriesKey).toBeTruthy();
    expect(output.seriesName).toBeTruthy();
    expect(output.trendStatus).toBe('not_verified');
    expect(output.videoPack.fullScript).not.toMatch(/That is not a victory speech|I do not think the answer is to pretend everything is simple/);
    expect(used.has(editorialTextKey(output.title))).toBe(true);
  });
  it('creates a distinct review-required episode instead of failing the plan save when topics run out', () => {
    const used = new Set<string>();
    const generated = Array.from({length:75}, (_, ordinal) => authoredCreatorFallback(
      stub() as never,'2026-10-08',ordinal,'text' as never,MediaPlatform.X,undefined,used));
    expect(new Set(generated.map(post => editorialTextKey(post.title))).size).toBe(75);
    expect(generated.every(post => post.requiresApproval)).toBe(true);
  });
  it('legacy copy with the repeated template is reauthored when generating missing days', () => {
    const service = Object.create(MediaPlanningService.prototype) as any;
    const plan = service.recoverCreatorCalendar('2026-10-08', '2026-10-14', 'starting');
    const original = plan.days.flatMap((day: any) => day.executions).find((post: any) => post.action === 'post');
    original.reason = 'Deterministic offline editorial completion: complete script/copy with no model retry.';
    original.videoPack.fullScript = 'That is not a victory speech. ' + original.videoPack.fullScript;
    const repaired = service.reconcileCreatorPlan(plan);
    const titles = repaired.days.flatMap((day: any) => day.executions).filter((post: any) => post.action === 'post').map((post: any) => post.title);
    expect(titles).toHaveLength(17);
    expect(new Set(titles).size).toBe(17);
  });
});
