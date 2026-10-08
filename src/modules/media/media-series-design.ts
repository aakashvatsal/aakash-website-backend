/** A series pitch is not a published experience. Evaluate/show production identity
 * without pretending metrics or an AI call have verified commercial success. */
export type SeriesPitch = { name: string; angle: string; channels: string[]; audience?: string };
export type SeriesCreativeKit = {
  premise: string; targetAudience: string; voice: string; visualIdentity: string;
  episodeStructure: string[]; hookPatterns: string[]; episodeIdeas: string[];
  productionGuidance: string; suggestedCadence: string;
};
export type SeriesDesignReview = {
  score: number; verdict: 'strong' | 'refine' | 'weak';
  strengths: string[]; risks: string[]; improvements: string[];
  creativeKit: SeriesCreativeKit; aiAssisted: boolean; warning?: string;
};
export const CREATOR_CHANNELS = ['instagram', 'youtube', 'linkedin', 'x'] as const;
const short = (input: unknown, max: number) => typeof input === 'string' ? input.trim().slice(0,max) : '';
export function normalizePitch(raw: SeriesPitch): SeriesPitch {
  const name = short(raw?.name, 70);
  const angle = short(raw?.angle, 500);
  const audience = short(raw?.audience, 150);
  const channels = Array.isArray(raw?.channels) ? [...new Set(raw.channels.filter(x => typeof x === 'string' && CREATOR_CHANNELS.includes(x as typeof CREATOR_CHANNELS[number])))] : [];
  if (name.length < 4 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{P}\p{Zs}]*$/u.test(name)) throw new Error('Series name must be 4–70 readable characters');
  if (angle.length < 25) throw new Error('Describe the recurring angle in at least 25 characters');
  if (!channels.length) throw new Error('Choose at least one supported channel');
  return { name, angle, channels, audience };
}
export function localSeriesDesign(raw: SeriesPitch, peers: Array<{ name: string; angle?: string }> = []): SeriesDesignReview {
  const pitch = normalizePitch(raw);
  const lower = `${pitch.name} ${pitch.angle}`.toLowerCase();
  const signals = [/\b(episode|weekly|every|series|part|day|challenge|experiment)\b/i,/\b(story|show|record|film|try|test|practice|learn|reflect|change|behind)\b/i,/\b(dog|guitar|spanish|chess|book|founder|8lete|frayto|hsakaa|travel|life)\b/i];
  const duplicate = peers.some(x => x.name.toLowerCase() === pitch.name.toLowerCase() ||
    (x.angle && x.angle.length > 25 && x.angle.toLowerCase() === pitch.angle.toLowerCase()));
  const score = Math.max(2, Math.min(9, 5 + signals.filter(x => x.test(lower)).length +
    (pitch.angle.length > 85 ? 1 : 0) - (duplicate ? 4 : 0) - (pitch.channels.length === 4 && pitch.angle.length < 100 ? 1 : 0)));
  const verdict = score >= 8 ? 'strong' : score >= 5 ? 'refine' : 'weak';
  const story = pitch.angle.replace(/[.!?]+$/, '');
  return { score, verdict,
    strengths: ['A named repeatable identity', `${pitch.channels.join(', ')} distribution opportunity`],
    risks: [...(duplicate ? ['Overlaps an existing series; refine the premise before saving'] : []),
      'Potential repetition unless every episode has fresh real evidence',
      'No actual audience retention data yet; this is a concept review'],
    improvements: [ 'Open each episode on one specific real or clearly hypothetical scene',
      'Develop a new conflict, change and payoff for every episode',
      'Measure 28-day retention and saves against series peers on the same platform' ],
    creativeKit: {
      premise: `${pitch.name}: ${story}`,
      targetAudience: pitch.audience || 'People curious about learning, building and a life beyond work',
      voice: 'Curious, lively and specific; modest humour, no invented achievements',
      visualIdentity: 'Natural candid footage, consistent simple cover title, distinct episode number and series name; restrained captions',
      episodeStructure: ['0–2s: striking scene or question', '3–8s: specific setup', '8–22s: obstacle/tension', '22–35s: turn or attempt', 'Final: earned payoff or open loop'],
      hookPatterns: [`The part of ${pitch.name} nobody shows is…`, 'I thought this would be simple. Then…', 'Two versions of this decision, one surprising consequence…'],
      episodeIdeas: [`First attempt: ${story}`, `The awkward middle: ${story}`, `One thing I changed after testing: ${story}`],
      productionGuidance: 'Record only public-safe real scenes. A hypothetical scene must be explicitly labeled. Vertical for Reels/Shorts; clear dialogue separate from camera directions.',
      suggestedCadence: pitch.channels.includes('instagram') ? 'One episode per week initially; review after eight episodes' : 'One strong episode weekly; reuse only genuinely distinct platform-native derivatives',
    }, aiAssisted: false,
  };
}
