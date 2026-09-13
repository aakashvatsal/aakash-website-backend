import {
  HsakaaDailyContextPrivacy,
  HsakaaDailyContextSource,
} from '../../hsakaa/schemas/hsakaa-daily-context.schema';
import { MediaWorldContextService } from './media-world-context.service';

function chain(value: unknown) {
  const api: Record<string, jest.Mock> = {};
  for (const key of ['sort', 'limit', 'select']) api[key] = jest.fn(() => api);
  api.lean = jest.fn().mockResolvedValue(value);
  return api;
}

describe('MediaWorldContextService', () => {
  it('treats every Personal OS source except People and Memory as public-safe Media evidence', async () => {
    const now = new Date().toISOString();
    const dailyContextModel = {
      find: jest.fn(() =>
        chain([
          {
            items: [
              {
                id: 'public-1',
                source: HsakaaDailyContextSource.COMPANY,
                sourceId: 'company-1',
                kind: 'update',
                title: 'Public launch lesson',
                summary: 'A public-safe builder lesson.',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
                defaultPrivacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
                significantChange: true,
                metadata: {},
              },
              {
                id: 'internal-1',
                source: HsakaaDailyContextSource.TASK,
                sourceId: 'task-1',
                kind: 'priority',
                title: 'Internal priority',
                summary: 'Useful for strategy, not a public fact.',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.INTERNAL_SAFE,
                defaultPrivacy: HsakaaDailyContextPrivacy.INTERNAL_SAFE,
                significantChange: true,
                metadata: {},
              },
              {
                id: 'review-1',
                source: HsakaaDailyContextSource.JOURNAL,
                sourceId: 'journal-1',
                kind: 'reflection',
                title: 'Needs review',
                summary: 'Potential story that requires approval.',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.NEEDS_REVIEW,
                defaultPrivacy: HsakaaDailyContextPrivacy.NEEDS_REVIEW,
                significantChange: false,
                metadata: {},
              },
              {
                id: 'private-1',
                source: HsakaaDailyContextSource.PEOPLE,
                sourceId: 'person-1',
                kind: 'private',
                title: 'Private relationship detail',
                summary: 'This must never reach Media generation context.',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.PRIVATE_ONLY,
                defaultPrivacy: HsakaaDailyContextPrivacy.PRIVATE_ONLY,
                significantChange: true,
                metadata: {},
              },
              {
                id: 'memory-private-1',
                source: HsakaaDailyContextSource.MEMORY,
                sourceId: 'memory-1',
                kind: 'memory',
                title: 'Private memory detail',
                summary:
                  'This memory must never reach Media generation context.',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
                defaultPrivacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
                significantChange: true,
                metadata: {},
              },
              {
                id: 'health-private-1',
                source: HsakaaDailyContextSource.HEALTH,
                sourceId: 'health-1',
                kind: 'health_activity',
                title: 'Health',
                summary: 'sleep 5.8h · recovery 41',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.PRIVATE_ONLY,
                defaultPrivacy: HsakaaDailyContextPrivacy.PRIVATE_ONLY,
                significantChange: false,
                metadata: {
                  workoutCompleted: true,
                  workoutType: 'strength',
                  recoveryScore: 41,
                  sleepDurationHours: 5.8,
                },
              },
              {
                id: 'hobby-1',
                source: HsakaaDailyContextSource.TASK,
                sourceId: 'task-hobby-1',
                kind: 'practice',
                title: 'Guitar practice',
                summary: 'Practice chord transitions',
                occurredAt: now,
                privacy: HsakaaDailyContextPrivacy.INTERNAL_SAFE,
                defaultPrivacy: HsakaaDailyContextPrivacy.INTERNAL_SAFE,
                significantChange: false,
                metadata: {},
              },
            ],
          },
        ]),
      ),
    };
    const companyModel = {
      find: jest.fn(() =>
        chain([
          {
            _id: 'company-id',
            name: '8lete',
            roles: ['Co-Founder'],
            industries: ['Sports technology'],
            products: ['Academy OS'],
            markets: ['India'],
            currentFocus: 'Product rebuild',
            currentPriorities: ['Universal sports'],
            principles: ['Operator-led product'],
            targetCustomer: 'Sports academies',
            status: 'active',
            stage: 'growth',
          },
        ]),
      ),
    };
    const briefModel = { findOne: jest.fn(() => chain(null)) };
    const weeklyReviewModel = { findOne: jest.fn(() => chain(null)) };
    const contentModel = { find: jest.fn(() => chain([])) };
    const hobbiesService = {
      getOverview: jest.fn().mockResolvedValue({
        active: [
          {
            _id: 'guitar-1',
            name: 'Guitar',
            status: 'active',
            intensity: 'primary',
            currentStageKey: 'foundations',
            currentStage: { title: 'Foundations' },
            latestReview: { nextFocus: 'Clean chord transitions' },
            weeklyTargetMinutes: 120,
            weeklyMinutes: 45,
            sessionsThisWeek: 2,
            pace: 'on_track',
            recommendedTodayMinutes: 20,
            updatedAt: now,
          },
        ],
      }),
    };

    const service = new MediaWorldContextService(
      dailyContextModel as never,
      weeklyReviewModel as never,
      briefModel as never,
      companyModel as never,
      contentModel as never,
      hobbiesService as never,
    );

    const result = await service.build(30);

    expect(result.publicSafe.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'public-1',
        'internal-1',
        'review-1',
        'health-private-1',
        'hobby-1',
      ]),
    );
    expect(result.publicSafe.map((item) => item.id)).not.toEqual(
      expect.arrayContaining(['private-1', 'memory-private-1']),
    );
    expect(result.internalSafe).toEqual([]);
    expect(result.needsReview).toEqual([]);
    expect(result.privateOnlyCount).toBe(2);
    expect(result.coverage.privateOnly).toBe(2);
    expect(JSON.stringify(result.publicSafe)).not.toContain(
      'This must never reach Media generation context.',
    );
    expect(JSON.stringify(result.publicSafe)).not.toContain(
      'This memory must never reach Media generation context.',
    );
    expect(result.companies[0]).toMatchObject({
      name: '8lete',
      currentFocus: 'Product rebuild',
      products: ['Academy OS'],
      targetCustomer: 'Sports academies',
    });
    expect(result.policy.privateOnlyDetailsExposedToMedia).toBe(false);
    expect(result.policy.peopleAndMemoryExcludedFromMedia).toBe(true);
    expect(result.policy.allOtherPersonalOsSourcesTreatedPublicSafe).toBe(true);
    expect(result.policy.companyContextIsPublicSafe).toBe(true);
    expect(result.policy.healthContextIsPublicSafe).toBe(true);
    expect(result.publicSafe).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'health-private-1',
          source: HsakaaDailyContextSource.HEALTH,
          privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
          publishable: true,
          summary: 'sleep 5.8h · recovery 41',
        }),
      ]),
    );
    expect(result.wholeLifeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'routine',
          privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
        }),
        expect.objectContaining({
          category: 'hobby',
          title: 'Guitar practice',
          privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
        }),
      ]),
    );
    expect(result.policy.wholeLifeSignalsAreSanitizedInternalSafeCues).toBe(
      false,
    );
    expect(result.policy.wholeLifeSignalsArePublicSafe).toBe(true);
    expect(result.hobbies).toEqual([
      expect.objectContaining({
        id: 'guitar-1',
        name: 'Guitar',
        currentStageTitle: 'Foundations',
        nextFocus: 'Clean chord transitions',
        weeklyTargetMinutes: 120,
        weeklyMinutes: 45,
        sessionsThisWeek: 2,
      }),
    ]);
    expect(result.wholeLifeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'hobby:guitar-1',
          category: 'hobby',
          title: 'Guitar · active practice',
          source: HsakaaDailyContextSource.HOBBY,
          privacy: HsakaaDailyContextPrivacy.PUBLIC_SAFE,
        }),
      ]),
    );
    expect(result.personalOsSections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: HsakaaDailyContextSource.TASK,
          totalItems: 2,
          publicSafe: 2,
        }),
        expect.objectContaining({
          source: HsakaaDailyContextSource.JOURNAL,
          publicSafe: 1,
          needsReview: 0,
        }),
        expect.objectContaining({
          source: HsakaaDailyContextSource.PEOPLE,
          publicSafe: 0,
          latestSafeItems: [],
        }),
        expect.objectContaining({
          source: HsakaaDailyContextSource.MEMORY,
          publicSafe: 0,
          latestSafeItems: [],
        }),
      ]),
    );
    expect(result.policy.directHobbiesAreFirstClassContext).toBe(true);
    expect(
      result.policy.personalOsSectionsAreInspectedWithoutPrivateDetails,
    ).toBe(true);
  });
});
