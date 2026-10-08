import { MediaPlatform } from './schemas/media-post.schema';

export type CreatorSeries = { key: string; name: string; channels: readonly string[] };
export type VerifiedCreatorTrend = { title: string; publishedAt: string; source: string; url: string };

const LABELS: Record<string, string> = {
  'me-vs-me': 'Me vs Me', 'learning-at-30': 'Learning at 30',
  'life-without-work': 'My Life Without Work', 'dogs-and-me': 'Dogs & Me',
  'founder-unfiltered': 'Founder, Unfiltered',
  'things-i-changed-my-mind-about': 'I Changed My Mind',
};
export const DEFAULT_CREATOR_SERIES: CreatorSeries[] = [
  { key: 'me-vs-me', name: LABELS['me-vs-me'], channels: ['instagram','youtube'] },
  { key: 'learning-at-30', name: LABELS['learning-at-30'], channels: ['instagram','youtube','linkedin'] },
  { key: 'life-without-work', name: LABELS['life-without-work'], channels: ['instagram','youtube'] },
  { key: 'dogs-and-me', name: LABELS['dogs-and-me'], channels: ['instagram','youtube'] },
  { key: 'founder-unfiltered', name: LABELS['founder-unfiltered'], channels: ['linkedin','x','youtube','instagram'] },
  { key: 'things-i-changed-my-mind-about', name: LABELS['things-i-changed-my-mind-about'], channels: ['linkedin','x','instagram','youtube'] },
];

// Editorial categories are not a claim that an unverified personal event happened.
const TITLES: Record<string, string[]> = {
  'me-vs-me': ['the second version is allowed to be smaller', 'the honest version of discipline', 'my brain wants seventeen tabs', 'the false comfort of being busy', 'the two-minute reset', 'confidence without pretending'],
  'learning-at-30': ['being a beginner in public', 'the awkward middle of learning', 'a reading habit without book theatre', 'an imperfect guitar note', 'chess and the move after the mistake', 'speaking slower can say more', 'a tiny spanish conversation', 'one idea, three versions'],
  'life-without-work': ['a life is not a dashboard', 'serious work needs an unserious hour', 'not everything needs a life lesson', 'a quiet kind of ambition', 'the small joy audit', 'a joke is allowed to stay a joke', 'stop making rest earn its place'],
  'dogs-and-me': ['dogs have terrible linkedin strategies'],
  'founder-unfiltered': ['the meeting that could be a decision', 'learning to listen before fixing', 'the courage to delete a feature', 'building a system for actual humans', 'questions make better experiments', 'the difference between a goal and a promise', 'good stories need the inconvenient detail', 'when the exception becomes the product', 'a dashboard cannot answer why', 'who owns the next step', 'the feature nobody requested', 'a useful no to a customer', 'software meets a monday morning', 'two people saw two different workflows', 'the launch checklist nobody sees', 'the cost of a silent status', 'a powerful tool with one confusing button', 'the handoff is the real workflow'],
  'things-i-changed-my-mind-about': ['the price of a vague maybe', 'the useful part of changing your mind'],
};

export const editorialTextKey = (value: string): string => value.toLowerCase()
  .normalize('NFKC').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

/** Lightweight zero-token idea cooldown; conservative to avoid blocking
 * distinct episodes merely because they share one popular word. */
export function creatorConceptIsRepeated(title: string, history: Iterable<string>): boolean {
  const normalize = (s: string) => editorialTextKey(s).split(' ')
    .filter(w => w.length > 3 && !['this','that','with','from','when','what','your','about','have','gets','there','really','could','would','after','before','without','into','more','less','just','thing','things'].includes(w));
  const current = new Set(normalize(title));
  const exact = editorialTextKey(title);
  for (const previous of history) {
    const old = editorialTextKey(previous);
    if (exact === old) return true;
    const other = new Set(normalize(previous));
    if (current.size < 3 || other.size < 3) continue;
    const common = [...current].filter(w => other.has(w)).length;
    if (common >= 3 && common / Math.max(current.size, other.size) >= 0.72) return true;
  }
  return false;
}

export function selectCreatorSeries(
  title: string, platform: MediaPlatform, active: readonly CreatorSeries[] = DEFAULT_CREATOR_SERIES,
  requested?: string, body = '',
): CreatorSeries | null {
  const eligible = active.filter(series => series.channels.includes(platform));
  if (requested) return eligible.find(series => series.key === requested) ?? null;
  const key = editorialTextKey(title);
  const classified = Object.entries(TITLES).find(([, titles]) => titles.includes(key))?.[0];
  if (classified) return eligible.find(series => series.key === classified) ?? null;
  const content = editorialTextKey(`${title} ${body.slice(0, 250)}`);
  const signals: Array<[string, RegExp]> = [
    ['dogs-and-me', /\b(dog|dogs|puppy|pixel|cosmo|happy|pet)\b/],
    ['learning-at-30', /\b(guitar|chess|spanish|learning|beginner|voice practice|book|reading)\b/],
    ['life-without-work', /\b(holiday|weekend|travel|trip|outside work|joy|fun afternoon|life without work)\b/],
    ['things-i-changed-my-mind-about', /\b(changed my mind|i used to think|i was wrong|reconsidered)\b/],
    ['me-vs-me', /\b(me vs me|yesterday me|today me|two versions of me|inner dialogue)\b/],
    ['founder-unfiltered', /\b(8lete|frayto|hsakaa|customer|startup|company|product|founder|shipping|academy|freight)\b/],
  ];
  const matches = signals.map(([seriesKey, pattern]) => pattern.test(content) ? seriesKey : null).filter(Boolean);
  return matches.length === 1 ? eligible.find(series => series.key === matches[0]) ?? null : null;
}

/** Search interest is NOT itself a creator/platform trend. Only attach verifiable, fresh, directly related signals. */
export function matchVerifiedCreatorTrend(title: string, body: string, raw: unknown, now = new Date()): VerifiedCreatorTrend | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { available?: boolean; entries?: unknown[] };
  if (!value.available || !Array.isArray(value.entries)) return null;
  const candidate = editorialTextKey(`${title} ${body}`);
  for (const entry of value.entries) {
    if (!entry || typeof entry !== 'object') continue;
    const trend = entry as Record<string, unknown>;
    if (!['title','publishedAt','source','url'].every(key => typeof trend[key] === 'string' && String(trend[key]).trim())) continue;
    if (trend.source !== 'Google Trends India RSS') continue;
    const published = Date.parse(String(trend.publishedAt));
    if (!Number.isFinite(published) || published > now.getTime() + 60000 || now.getTime() - published > 72 * 3600000) continue;
    const terms = editorialTextKey(String(trend.title)).split(' ').filter(part => part.length >= 4);
    if (terms.length < 2 || !terms.every(part => candidate.split(' ').includes(part))) continue;
    if (!String(trend.url).startsWith('https://')) continue;
    return { title: String(trend.title), publishedAt: new Date(published).toISOString(), source: String(trend.source), url: String(trend.url) };
  }
  return null;
}
