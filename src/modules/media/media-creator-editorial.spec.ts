import { MediaPlanningService } from './media-planning.service';
import { reviewCreatorEditorial } from './media-creator-editorial';
import { MediaPostType } from './schemas/media-post.schema';

describe('conservative creator editorial preflight', () => {
  const service = Object.create(MediaPlanningService.prototype) as MediaPlanningService;
  const recover = (service as unknown as { recoverCreatorCalendar: (start: string, end: string, stage: string) => any }).recoverCreatorCalendar.bind(service);
  it('produces distinct hooks, scene-based written packs and explicit editorial review scores', () => {
    const week = recover('2026-10-08', '2026-10-14', 'starting');
    const posts = week.days.flatMap((d: any) => d.executions).filter((p: any) => p.action === 'post');
    expect(posts).toHaveLength(17);
    expect(new Set(posts.map((p: any) => p.hook)).size).toBe(17);
    expect(posts.every((p: any) => p.storyBeats?.length >= 5 && p.storyPayoff && p.editorialVersion === 'narrative-v1')).toBe(true);
    expect(posts.every((p: any) => p.productionNotes.includes('Illustrative scene:'))).toBe(true);
    for (const p of posts.filter((p: any) => [MediaPostType.REEL,MediaPostType.SHORT,MediaPostType.VIDEO].includes(p.format))) {
      expect(p.videoPack.fullScript).not.toMatch(/pick one real practice moment|put the two competing versions|deliver every line as written|my practical suggestion/i);
    }
    const results = posts.map((p: any) => ({title:p.title,format:p.format,score:reviewCreatorEditorial(p).score, issues:reviewCreatorEditorial(p).issues}));
    expect(results.every((r: any) => r.score >= 8)).toBe(true);
  });
  it('keeps world evidence when input is too large, rather than sending only a voice profile', () => {
    const compact = (service as unknown as { compactMediaRequestInput: (s: string, n: number) => string }).compactMediaRequestInput.bind(service);
    const source = {
      startDate: '2026-10-08', endDate:'2026-10-14',
      voiceProfile:{summary:'voice only'.repeat(500)},
      worldContext:{publicSafe:[{id:'E001',summary:'An approved 8lete academy workflow update',source:'companies'}],wholeLifeSignals:[{id:'E002',summary:'Real public-safe guitar practice context'}],companies:[{name:'8lete',currentFocus:'grassroots academies'}],hobbies:[{name:'Guitar'}]},
      activeSeries:[{key:'learning-at-30'}], archivedPlanFingerprints:['long'.repeat(15000)],
    };
    const result = JSON.parse(compact(JSON.stringify(source), 2000));
    expect(result.worldContext?.publicSafe?.[0]?.id).toBe('E001');
    expect(result.worldContext?.wholeLifeSignals?.[0]?.id).toBe('E002');
    expect(result.worldContext?.companies?.[0]?.name).toBe('8lete');
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(2000);
  });
  it('does not pass ungrounded filler as editorial quality', () => {
    const week = recover('2026-10-08', '2026-10-14', 'starting');
    const post = week.days.flatMap((d: any) => d.executions).find((p: any) => p.action === 'post' && p.format === MediaPostType.REEL);
    const degraded = {...post, productionNotes:'',storyBeats:[],storyPayoff:'', videoPack:{...post.videoPack,fullScript:'Today I want to talk about success. Keep trying. What do you think?'}};
    expect(reviewCreatorEditorial(degraded).score).toBeLessThan(8);
  });
});
