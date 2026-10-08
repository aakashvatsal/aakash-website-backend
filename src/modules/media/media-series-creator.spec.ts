import { localSeriesDesign, normalizePitch } from './media-series-design';
import { authoredCreatorFallback, completeCreatorCopy } from './media-creator-asset-fallback';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { editorialTextKey, DEFAULT_CREATOR_SERIES } from './media-creator-tags';

const skeleton = () => ({ action: 'skip', title: '', hook: '', publishCopy: '',
  videoPack: {}, imageBrief: {}, carouselSlides: [], platform: MediaPlatform.YOUTUBE });

describe('series creator and exhausted topic catalogue', () => {
  it('can propose a complete, zero-cost visual identity without making outcome claims', () => {
    const pitch = {name:'Weekend Field Notes', angle:'Every weekend I try a small outdoor activity, show an awkward problem and what I actually saw.', channels:['instagram','youtube']};
    const review = localSeriesDesign(pitch);
    expect(review.creativeKit.hookPatterns.length).toBeGreaterThanOrEqual(3);
    expect(review.creativeKit.episodeIdeas).toHaveLength(3);
    expect(review.aiAssisted).toBe(false);
    expect(review.risks.join(' ')).toMatch(/no actual audience/i);
  });
  it('rejects unsupported or empty channel pitches', () => {
    expect(() => normalizePitch({name:'Okay', angle:'x', channels:['tiktok']})).toThrow();
    expect(normalizePitch({name:'Reading in public', angle:'An ongoing series showing a reading disagreement and test every week.', channels:['x','linkedin','x']}).channels).toEqual(['x','linkedin']);
  });
  it('never throws merely because every old YouTube topic is archived', () => {
    const history = new Set<string>();
    // Exhaust the full library by reserving at least 100 variants.
    const episodes = [];
    for (let i=0; i<105; i++) {
      const output = authoredCreatorFallback(skeleton() as never, '2026-10-15', i, MediaPostType.SHORT,
        MediaPlatform.YOUTUBE, undefined, history);
      expect(completeCreatorCopy(output)).toBe(true);
      expect(DEFAULT_CREATOR_SERIES.some(s => s.key === output.seriesKey)).toBe(true);
      expect(output.requiresApproval).toBe(true);
      episodes.push(output.title);
    }
    expect(new Set(episodes.map(editorialTextKey)).size).toBe(105);
    expect(episodes.some(x => x.includes('—'))).toBe(true);
  });
  it('uses custom active series for overflow episodes instead of a fixed default portfolio', () => {
    const custom = [{key:'learning-experiments',name:'Learning Experiments',channels:['youtube']}];
    const history = new Set<string>();
    for (let i=0; i<12; i++) {
      const output = authoredCreatorFallback(skeleton() as never, '2026-10-15',i,MediaPostType.SHORT,
        MediaPlatform.YOUTUBE, undefined,history,custom);
      expect(output.seriesKey).toBe('learning-experiments');
    }
  });
  it('keeps an unassigned review-required draft if all compatible series are paused', () => {
    const result = authoredCreatorFallback(skeleton() as never,'2026-10-15',0,MediaPostType.SHORT,
      MediaPlatform.YOUTUBE,undefined,new Set(),[]);
    expect(result.seriesKey).toBe('unassigned');
    expect(result.executionReady).toBe(false);
  });
});
