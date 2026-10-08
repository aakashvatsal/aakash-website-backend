import { MediaPlanningExecution } from './schemas/media-planning-cycle.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

/** Independent critic: reads finished public copy, not the author's self-rated storyBeats.
 * A score is an editorial estimate, never a prediction of retention or virality.
 */
export type EditorialCriticResult = {
  score: number;
  verdict: 'pass' | 'revise' | 'evidence_needed';
  dimensions: {
    hook: number;
    storytelling: number;
    specificity: number;
    originality: number;
    platformFit: number;
    entertainment: number;
  };
  issues: string[];
};

const words = (text: string): string[] =>
  (text || '').match(/[\p{L}\p{N}']+/gu) || [];
const normalized = (text: string): string =>
  (text || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const META =
  /\b(?:pick one real practice moment|put the two competing versions|my practical suggestion|in this (?:video|reel)|start with a hook|no fake progress report|the first instinct is|the practical difference is|that is not a victory speech|this is not a motivational speech|let the imperfect attempt speak|imagine facing this choice|repeat after me|cut to b.roll|camera at eye level)\b/i;
const EMPTY =
  /\b(?:tbd|placeholder|insert your|write a post about|caption idea|here is something i am thinking about)\b/i;
const GENERIC =
  /^(?:today (?:i want to|we will)|hey (?:guys|everyone)|here is a small thought experiment|let me start by|a quick reminder|i want to share)/i;
const ANCHOR =
  /\b(?:coach|academy|player|parent|freight|shipment|container|customer|app|login|screen|button|guitar|chord|finger|chess|bishop|book|page|spanish|sentence|dog|walk|camera|microphone|desk|phone|meeting|ticket|invoice|release|note|test|user|journal|coffee|city|guitar|audience)\b/i;
const TURN =
  /\b(?:but|until|except|instead|however|then|suddenly|only to|actually|the catch|turns out|because|yet)\b/i;
const FILLER =
  /\b(?:small step|what do you think|learning journey|follow for more|isn't about|it is not about|one thing i learned|the answer is simple|start here|no grand reveal|the next real attempt)\b/gi;
const STOP = new Set([
  'this',
  'that',
  'there',
  'their',
  'with',
  'from',
  'have',
  'will',
  'your',
  'about',
  'because',
  'should',
  'would',
  'could',
  'thing',
  'these',
  'those',
  'after',
  'before',
  'where',
  'which',
  'what',
  'when',
  'then',
  'into',
  'also',
  'only',
  'they',
  'them',
  'more',
  'less',
  'just',
  'know',
  'need',
  'make',
  'some',
  'over',
  'another',
  'every',
]);
const score = (n: number) => Math.max(0, Math.min(10, Math.round(n * 10) / 10));
const keyWords = (value: string) =>
  new Set(
    normalized(value)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
export function copySimilarity(left: string, right: string): number {
  const a = keyWords(left),
    b = keyWords(right);
  if (a.size < 5 || b.size < 5)
    return normalized(left) === normalized(right) ? 1 : 0;
  const common = [...a].filter((w) => b.has(w)).length;
  return common / Math.max(1, a.size + b.size - common);
}
export function creatorPublicBody(item: MediaPlanningExecution): string {
  if (
    [MediaPostType.REEL, MediaPostType.SHORT, MediaPostType.VIDEO].includes(
      item.format,
    )
  )
    return item.videoPack?.fullScript || item.script || '';
  if (item.format === MediaPostType.CAROUSEL)
    return (item.carouselSlides || [])
      .map((s) => `${s.headline}. ${s.bodyCopy}`)
      .join('\n');
  return item.publishCopy || '';
}

export function reviewCreatorQuality(
  item: MediaPlanningExecution,
  otherCopy: readonly string[] = [],
): EditorialCriticResult {
  if (item.action !== 'post')
    return {
      score: 0,
      verdict: 'revise',
      dimensions: {
        hook: 0,
        storytelling: 0,
        specificity: 0,
        originality: 0,
        platformFit: 0,
        entertainment: 0,
      },
      issues: ['Not a publishable asset'],
    };
  const issues: string[] = [];
  const body = creatorPublicBody(item).trim();
  const hook = (item.hook || body.split(/[.!?\n]/)[0] || '').trim();
  const intro =
    body
      .split(/[.!?\n]/)
      .find((s) => s.trim())
      ?.trim() || '';
  const hookWords = words(hook).length;
  const video = [
    MediaPostType.REEL,
    MediaPostType.SHORT,
    MediaPostType.VIDEO,
  ].includes(item.format);
  const longVideo = item.format === MediaPostType.VIDEO;
  const textWords = words(body).length;
  const isSpecific = ANCHOR.test(body);
  const isScene =
    /\b(?:imagine|picture|when|while|at the|on the|yesterday|last week|one day|i opened|i tried|i asked|the coach|the customer|my dog|my guitar)\b/i.test(
      body,
    ) && isSpecific;
  const badMeta = META.test(body) || EMPTY.test(body);
  const hasEvidence = Boolean(item.evidenceIds?.length);
  const duplicates = otherCopy.some(
    (old) =>
      copySimilarity(body, old) >= 0.68 ||
      (normalized(body) && normalized(body) === normalized(old)),
  );
  const repetitiveFiller = [...body.matchAll(FILLER)].length;
  const templatePhrases = [
    /\bimagine this particular scene\b/gi,
    /\bthe meaningful ending is\b/gi,
    /\bthat is the tension\b/gi,
    /\bthe part i would actually test is concrete\b/gi,
    /\bin this clearly illustrative scene\b/gi,
  ];
  const templateHits = templatePhrases.reduce(
    (total, pattern) => total + [...body.matchAll(pattern)].length,
    0,
  );
  const paragraphs = body.split(/\n\s*\n/).filter(Boolean);

  const openingShort = hookWords >= 4 && hookWords <= (video ? 16 : 24);
  const immediate =
    intro.length > 0 &&
    words(intro).length <= (video ? 18 : 27) &&
    !GENERIC.test(intro);
  let hookScore = score(
    2.8 +
      (openingShort ? 2.2 : 0) +
      (immediate ? 1.5 : 0) +
      (ANCHOR.test(hook) ? 1.6 : 0) +
      (TURN.test(hook) || /[?!:-]/.test(hook) ? 1.2 : 0) +
      (!GENERIC.test(hook) && !META.test(hook) ? 0.7 : 0),
  );
  if (
    video &&
    normalized(intro) !== normalized(hook) &&
    !normalized(intro).includes(normalized(hook))
  )
    hookScore = Math.min(hookScore, 7);
  if (hookScore < 8)
    issues.push(
      'Replace the opening with a short, concrete first-line hook that is also spoken first',
    );

  // Word count does not create a story: independently look for a situation, change and consequence.
  const separateBeats = paragraphs.length >= (longVideo ? 6 : video ? 3 : 2);
  const hasTurn = TURN.test(body);
  const last = body.slice(-Math.min(260, body.length));
  const payoff = Boolean(
    item.storyPayoff &&
    words(item.storyPayoff).length >= 5 &&
    !/^(?:what do you think|thoughts)/i.test(item.storyPayoff) &&
    (normalized(last).includes(normalized(item.storyPayoff).slice(0, 32)) ||
      copySimilarity(last, item.storyPayoff) >= 0.25),
  );
  let storytelling = score(
    2 +
      (isScene ? 2.5 : 0) +
      (hasTurn ? 2 : 0) +
      (payoff ? 1.5 : 0) +
      (separateBeats ? 1 : 0) +
      (isSpecific && ANCHOR.test(last) ? 1 : 0),
  );
  if (longVideo && paragraphs.length < 7)
    storytelling = Math.min(storytelling, 6.5);
  if (storytelling < 8)
    issues.push(
      'Build a scene with stakes, a genuine turn, and a specific resolution rather than general advice',
    );

  let specificity = score(
    2.5 + (isSpecific ? 2.3 : 0) + (isScene ? 1.7 : 0) + (hasEvidence ? 3 : 0),
  );
  if (!hasEvidence) specificity = Math.min(specificity, 6.5);
  if (specificity < 7)
    issues.push(
      'Ground the story in current public-safe source evidence; hypothetical scenes are not lived experience',
    );

  const originality = score(
    9.5 -
      Math.min(4, repetitiveFiller * 1.5) -
      Math.min(5, templateHits * 1.5) -
      (badMeta ? 5 : 0) -
      (duplicates ? 5.5 : 0) -
      (normalized(hook) === normalized(item.title) ? 0.4 : 0),
  );
  if (duplicates)
    issues.push(
      'Similar finished copy already exists in this plan; use a materially different story or angle',
    );
  if (badMeta)
    issues.push(
      'Production directions or generic model instructions leaked into final audience copy',
    );
  if (repetitiveFiller > 0)
    issues.push(
      'Replace repeated motivational formula with authentic voice and specific detail',
    );
  if (templateHits > 0)
    issues.push(
      'Remove recurring story-template language such as Imagine / tension / meaningful-ending scaffolding; use a different native opening and structure',
    );

  const wordRange = longVideo
    ? textWords >= 650 && textWords <= 1700
    : video
      ? textWords >= 48 && textWords <= 125
      : item.format === MediaPostType.CAROUSEL
        ? (item.carouselSlides || []).length >= 6
        : item.platform === MediaPlatform.X
          ? textWords >= 12 && textWords <= 60
          : textWords >= 55 && textWords <= 300;
  const properShots =
    !video ||
    Boolean(
      item.videoPack?.openingFrame &&
      (item.videoPack.shotList || []).length >= 3,
    );
  const platformFit = score(
    4.5 +
      (wordRange ? 3 : 0) +
      (properShots ? 1.5 : 0) +
      (video && !badMeta ? 1 : 0),
  );
  if (!wordRange)
    issues.push('Rework length/slides for the native platform format');
  const entertainment = score(
    3 +
      (isScene ? 2 : 0) +
      (hasTurn ? 2 : 0) +
      (/[?!]/.test(hook) ? 0.8 : 0) +
      (isSpecific ? 1 : 0) +
      (/\b(?:funny|laugh|absurd|ridiculous|surprise|awkward|unexpected)\b/i.test(
        body,
      )
        ? 1.2
        : 0),
  );
  if (entertainment < 7)
    issues.push(
      'Add visual contrast, surprise, warmth or playful specificity—without forcing jokes',
    );

  // Strict caps stop short structured filler being marketed as creative 8+.
  let overall = score(
    hookScore * 0.22 +
      storytelling * 0.25 +
      specificity * 0.18 +
      originality * 0.15 +
      platformFit * 0.12 +
      entertainment * 0.08,
  );
  if (!hasEvidence) overall = Math.min(overall, 7.5);
  if (badMeta || duplicates) overall = Math.min(overall, 5.9);
  if (templateHits >= 2) overall = Math.min(overall, 6.4);
  if (hookScore < 7 || storytelling < 7) overall = Math.min(overall, 7.4);
  if (!item.seriesKey || item.seriesKey === 'unassigned') {
    overall = Math.min(overall, 6.9);
    issues.push('Active series association required');
  }
  const verdict = !hasEvidence
    ? 'evidence_needed'
    : overall >= 8.5 && hookScore >= 8 && storytelling >= 8 && originality >= 8
      ? 'pass'
      : 'revise';
  return {
    score: overall,
    verdict,
    dimensions: {
      hook: hookScore,
      storytelling,
      specificity,
      originality,
      platformFit,
      entertainment,
    },
    issues: [...new Set(issues)].slice(0, 6),
  };
}

/** Evaluate a whole week without allowing author-supplied quality scores to influence review. */
export function auditCreatorWeek(
  items: MediaPlanningExecution[],
): Array<{ item: MediaPlanningExecution; result: EditorialCriticResult }> {
  const posts = items.filter((item) => item.action === 'post');
  return posts.map((item, i) => ({
    item,
    result: reviewCreatorQuality(
      item,
      posts.filter((_, n) => n !== i).map(creatorPublicBody),
    ),
  }));
}
