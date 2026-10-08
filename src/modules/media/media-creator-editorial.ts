import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaPlanningExecution } from './schemas/media-planning-cycle.schema';

/** A conservative, deterministic editorial preflight, NOT a prediction of social reach.
 * An 8/10 is a structural pass, never a guarantee of low skip rate or high watch time.
 * Without public-safe evidence, even a clearly illustrative story is capped at 8/10.
 * Purely generic filler without a scene is capped at 6/10.
 */
export type CreatorEditorialReview = {
  score: number;
  hookScore: number;
  storyScore: number;
  issues: string[];
};
const words = (value: string) => (value || '').trim().split(/\s+/).filter(Boolean);
const META_SPEECH = /\b(?:pick one real practice moment|let the imperfect attempt speak|without a fake progress report|nobody needs a fake|this is not a motivational speech|this isn't a motivational speech|my practical suggestion|imagine facing this choice|here is something i am thinking about|put the two competing versions|deliver every line|begin with the contrasting thought|show the audience|camera at eye level)\b/i;
const TIRED_OPEN = /^(?:hello|hey guys|today i want to talk|here is a small thought experiment|in this video|a small thing about|one question i would ask|i want to share|let me start with)/i;
const TIRED_CTA = /^(?:what do you think\??|thoughts\??|follow for more|let me know in the comments)$/i;

export function reviewCreatorEditorial(item: MediaPlanningExecution): CreatorEditorialReview {
  if (item.action !== 'post') return { score: 0, hookScore: 0, storyScore: 0, issues: ['Not a publication'] };
  const issues: string[] = [];
  const isVideo = [MediaPostType.REEL, MediaPostType.SHORT, MediaPostType.VIDEO].includes(item.format);
  const isLong = item.format === MediaPostType.VIDEO;
  const script = isVideo ? (item.videoPack?.fullScript || item.script || '') :
    item.format === MediaPostType.CAROUSEL ? (item.carouselSlides || []).map(s => `${s.headline}. ${s.bodyCopy}`).join('\n') : (item.publishCopy || '');
  const first = script.trim().split(/[.!?]\s|\n/).find(Boolean)?.trim() || '';
  const hook = (item.hook || first).trim();
  let score = 0;
  let hookScore = 0;
  let storyScore = 0;
  const hookLength = words(hook).length;
  if (hookLength >= 4 && hookLength <= 23 && !TIRED_OPEN.test(hook)) hookScore += 1;
  else issues.push('Open with a specific, short tension or surprising visual instead of a generic introduction');
  if (first && words(first).length <= 24 && !TIRED_OPEN.test(first) && !META_SPEECH.test(first)) hookScore += 1;
  else issues.push('First spoken or written line does not immediately earn attention');
  score += hookScore;

  const totalWords = words(script).length;
  const wordRangeOk = isLong ? totalWords >= 550 && totalWords <= 1400 :
    isVideo ? totalWords >= 65 && totalWords <= 150 :
    item.format === MediaPostType.CAROUSEL ? (item.carouselSlides?.length || 0) >= 6 :
    item.platform === MediaPlatform.X ? totalWords >= 9 && totalWords <= 65 : totalWords >= 65 && totalWords <= 300;
  if (wordRangeOk) score += 1;
  else issues.push('Length is unsuitable for this format');
  if (script.trim() && !META_SPEECH.test(script) && !/\b(tbd|placeholder|write a post about|insert your|caption idea)\b/i.test(script)) score += 1;
  else issues.push('Spoken copy contains production instructions, filler, or placeholders');

  const beats = (item.storyBeats || []).map(s => s.trim()).filter(Boolean);
  if (beats.length >= (isLong ? 5 : item.platform === MediaPlatform.X ? 2 : 3) && new Set(beats.map(s => s.toLowerCase())).size === beats.length) storyScore += 1;
  else issues.push('Missing distinct beginning, tension, turn and payoff beats');
  const hasRealDetail = (item.evidenceIds || []).length > 0;
  if (hasRealDetail || (item.productionNotes || '').includes('Illustrative scene:')) storyScore += 1;
  else issues.push('No grounded event or clearly labeled specific illustrative scene');
  if (item.storyPayoff && words(item.storyPayoff).length >= 5 && !TIRED_CTA.test(item.storyPayoff)) storyScore += 1;
  else issues.push('No specific payoff; do not end with a vague question alone');
  score += storyScore;

  if (item.seriesKey && item.seriesKey !== 'unassigned' && item.seriesName) score += 1;
  else issues.push('Missing active series assignment');
  if (isVideo ? Boolean(item.videoPack?.openingFrame && item.videoPack?.shotList?.length >= 3 && item.videoPack?.onScreenText?.length >= 2) :
      item.format === MediaPostType.CAROUSEL ? (item.carouselSlides?.length || 0) >= 6 && new Set((item.carouselSlides || []).map(s => s.bodyCopy.toLowerCase())).size >= 6 : Boolean(item.publishCopy && item.publishCopy.trim().length > 0)) score += 1;
  else issues.push('Visual/format execution lacks progression or final copy');
  if (item.cta && !TIRED_CTA.test(item.cta.trim()) && words(item.cta).length >= 3) score += 1;
  else issues.push('Weak ending or audience action');
  // A clearly labeled illustrative sketch can earn at most 8 structural points.
  // Without a scene or factual evidence, generic filler is capped at 6.
  if (!hasRealDetail) score = Math.min(score, (item.productionNotes || '').includes('Illustrative scene:') ? 8 : 6);
  return { score: Math.max(0, Math.min(10, score)), hookScore, storyScore, issues };
}
