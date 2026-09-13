export const MEDIA_PUBLIC_IDENTITY_PILLARS = [
  'builder_operator',
  'ideas_thinking',
  'learning_experiments',
  'building_aakash',
  'human_unfiltered',
] as const;

export type MediaPublicIdentityPillar =
  (typeof MEDIA_PUBLIC_IDENTITY_PILLARS)[number];

const PILLAR_KEYWORDS: Record<MediaPublicIdentityPillar, string[]> = {
  builder_operator: [
    'builder',
    'operator',
    'founder',
    'startup',
    'company',
    'operations',
    'sales',
    'leadership',
    'shipping',
    'execution',
  ],
  ideas_thinking: [
    'idea',
    'thinking',
    'ai',
    'technology',
    'systems',
    'strategy',
    'decision',
    'product',
    'design',
  ],
  learning_experiments: [
    'learning',
    'learn',
    'book',
    'reading',
    'experiment',
    'course',
    'study',
    'practice',
  ],
  building_aakash: [
    'health',
    'fitness',
    'gym',
    'running',
    'voice',
    'singing',
    'guitar',
    'routine',
    'habit',
    'self',
    'growth',
  ],
  human_unfiltered: [
    'human',
    'personal',
    'personality',
    'life',
    'travel',
    'chess',
    'humour',
    'humor',
    'food',
    'photo',
    'moment',
  ],
};

export function resolveMediaPublicIdentityPillar(
  values: Array<string | null | undefined>,
): MediaPublicIdentityPillar {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  for (const pillar of MEDIA_PUBLIC_IDENTITY_PILLARS) {
    if (text.includes(pillar)) return pillar;
  }
  let best: { pillar: MediaPublicIdentityPillar; score: number } = {
    pillar: 'ideas_thinking',
    score: 0,
  };
  for (const pillar of MEDIA_PUBLIC_IDENTITY_PILLARS) {
    const score = PILLAR_KEYWORDS[pillar].reduce(
      (sum, keyword) => sum + (text.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > best.score) best = { pillar, score };
  }
  return best.pillar;
}
