import { MediaPresenceService } from './media-presence.service';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';

function contentQuery(value: unknown) {
  const api: Record<string, jest.Mock> = {};
  for (const key of ['sort', 'limit', 'select']) api[key] = jest.fn(() => api);
  api.lean = jest.fn().mockResolvedValue(value);
  return api;
}

const worldContext = {
  generatedAt: new Date().toISOString(),
  windowDays: 30,
  fingerprint: 'world-fingerprint',
  coverage: {
    capturedDays: 2,
    totalItems: 3,
    publicSafe: 1,
    internalSafe: 1,
    needsReview: 1,
    privateOnly: 1,
    sourceCounts: {},
    missingSources: [],
  },
  companies: [
    {
      id: 'company-1',
      name: '8lete',
      roles: ['Co-Founder'],
      industries: ['Sports technology'],
      products: ['Academy OS'],
      markets: ['India'],
      currentPriorities: ['Universal sports'],
      principles: ['Build from operator problems'],
    },
  ],
  publicSafe: [],
  internalSafe: [],
  needsReview: [],
  privateOnlyCount: 1,
  hsakaa: {},
  recentMedia: [],
  policy: {
    privateOnlyDetailsExposedToMedia: false as const,
    internalSafeMayInspireButNotBePublishedAsFact: true as const,
    needsReviewRequiresOwnerApprovalBeforePublicUse: true as const,
    publicSafeMayBeUsedAsEvidence: true as const,
    companyMetricsExcludedUnlessSeparatelyVerifiedPublicSafe: true as const,
  },
};

function validPlatformRoles() {
  return [
    MediaPlatform.LINKEDIN,
    MediaPlatform.INSTAGRAM,
    MediaPlatform.YOUTUBE,
    MediaPlatform.X,
    MediaPlatform.WHATSAPP,
  ].map((platform) => ({
    platform,
    role: `${platform} role`,
    purpose: `${platform} purpose`,
    primaryFormats: [MediaPostType.TEXT],
    minPostsPerWeek: 0,
    preferredPostsPerWeek: 3,
    maxPostsPerWeek: 5,
    allowSkipDays: true,
  }));
}

describe('MediaPresenceService', () => {
  function createService(options?: {
    samples?: Array<Record<string, unknown>>;
  }) {
    type UpdatePayload = { $set: Record<string, unknown> };
    const strategyModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn((_filter: unknown, update: UpdatePayload) =>
        Promise.resolve(update.$set),
      ),
    };
    const voiceModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn((_filter: unknown, update: UpdatePayload) =>
        Promise.resolve(update.$set),
      ),
    };
    const contentModel = {
      find: jest.fn(() => contentQuery(options?.samples ?? [])),
    };
    const generateStructuredResponse = jest.fn((request: { name: string }) => {
      if (request.name === 'hsakaa_media_presence_strategy_v31') {
        return Promise.resolve({
          data: {
            northStar:
              'Make the real Aakash visible as a builder and operator.',
            positioning: 'Builder/operator/technologist learning in public.',
            knownFor: ['building products', 'operator thinking'],
            audiences: [
              {
                name: 'Founders',
                need: 'specific lessons',
                desiredPerception: 'credible builder',
              },
              {
                name: 'Operators',
                need: 'practical decisions',
                desiredPerception: 'thoughtful operator',
              },
            ],
            narratives: [
              {
                key: 'builder',
                title: 'Building',
                role: 'authority',
                targetSharePercent: 40,
                companyName: '',
                guardrails: [],
              },
              {
                key: 'learning',
                title: 'Learning',
                role: 'humanity',
                targetSharePercent: 30,
                companyName: '',
                guardrails: [],
              },
              {
                key: 'companies',
                title: 'Companies',
                role: 'evidence',
                targetSharePercent: 30,
                companyName: '8lete',
                guardrails: [],
              },
            ],
            platformRoles: validPlatformRoles(),
            companyBalance: [
              {
                companyName: '8lete',
                narrativeRole: 'evidence of building',
                targetSharePercent: 30,
                guardrails: [],
              },
            ],
            thirtyDayObjectives: [
              'Explore formats without pretending the winners are known.',
            ],
            ninetyDayObjectives: ['Build recognisable builder authority.'],
            reputationGoals: ['Specific, thoughtful builder.'],
            neverBecome: ['generic creator'],
            claimsRequiringReview: ['company metrics'],
            privacyRules: ['private-only never becomes content'],
          },
          model: 'gpt-test',
          responseId: 'strategy-response',
          usage: {},
        });
      }
      return Promise.resolve({
        data: {
          summary: 'A working hypothesis: direct, reflective and specific.',
          principles: ['Say what is actually known.'],
          sentenceRhythm: 'Short mixed with reflective longer sentences.',
          vocabulary: 'Plain English with technical detail when useful.',
          humour: 'Light and natural.',
          profanity: 'Occasional when genuinely emphatic.',
          technicalDepth: 'Concrete but accessible.',
          emotionalOpenness: 'Open without manufacturing vulnerability.',
          storytelling: 'Use real events and decisions.',
          doMore: ['specific examples'],
          doNot: ['generic guru language'],
          avoidPhrases: ['game changer'],
          authenticityChecks: ['Would Aakash say this?'],
          confidence: 92,
        },
        model: 'gpt-test',
        responseId: 'voice-response',
        usage: {},
      });
    });
    const aiService = { generateStructuredResponse };
    const worldContextService = {
      build: jest.fn().mockResolvedValue(worldContext),
    };
    const coreService = { listAccounts: jest.fn().mockResolvedValue([]) };
    const growthService = {
      directorLearningContext: jest
        .fn()
        .mockResolvedValue({ platforms: [], learnings: [] }),
    };

    const service = new MediaPresenceService(
      strategyModel as never,
      voiceModel as never,
      contentModel as never,
      aiService as never,
      worldContextService as never,
      coreService as never,
      growthService as never,
    );
    return { service, strategyModel, voiceModel, generateStructuredResponse };
  }

  it('requires strategy coverage for all five primary growth platforms and supports skip days', async () => {
    const { service, strategyModel } = createService();
    const result = await service.generateStrategy(
      { force: true },
      worldContext,
    );

    expect(result.platformRoles).toHaveLength(5);
    expect(
      result.platformRoles.map((role: { platform: string }) => role.platform),
    ).toEqual(
      expect.arrayContaining([
        MediaPlatform.LINKEDIN,
        MediaPlatform.INSTAGRAM,
        MediaPlatform.YOUTUBE,
        MediaPlatform.X,
        MediaPlatform.WHATSAPP,
      ]),
    );
    expect(
      result.platformRoles.every(
        (role: { allowSkipDays: boolean }) => role.allowSkipDays,
      ),
    ).toBe(true);
    expect(strategyModel.findOneAndUpdate).toHaveBeenCalled();
  });

  it('caps day-one voice confidence while evidence is still thin', async () => {
    const { service } = createService({
      samples: [
        {
          title: 'One sample',
          thesis: 'Builder lesson',
          canonicalBody:
            'This is a sufficiently long real writing sample that gives HSAKAA some evidence but not enough to claim high confidence.',
          story: '',
          origin: 'manual',
        },
      ],
    });

    const result = await service.generateVoiceProfile(
      { force: true },
      worldContext,
    );

    expect(result.sourceSampleCount).toBe(1);
    expect(result.confidence).toBe(45);
    expect(result.authenticityChecks).toEqual(
      expect.arrayContaining([
        'Would Aakash genuinely say this aloud or write it himself?',
      ]),
    );
  });
});
