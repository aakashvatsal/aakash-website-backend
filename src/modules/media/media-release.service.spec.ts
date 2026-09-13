import { MediaReleaseService } from './media-release.service';
import { MediaPlatform, MediaPostStatus } from './schemas/media-post.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';

function chain<T>(value: T) {
  const result = {
    sort: jest.fn(),
    select: jest.fn(),
    limit: jest.fn(),
    lean: jest.fn().mockResolvedValue(value),
  };
  result.sort.mockReturnValue(result);
  result.select.mockReturnValue(result);
  result.limit.mockReturnValue(result);
  return result;
}

const primaryPlatforms = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
];

function plan() {
  return {
    _id: { toString: () => 'plan-1' },
    startDate: '2026-09-03',
    endDate: '2026-09-09',
    days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-09-0${index + 3}`,
      executions: primaryPlatforms.map((platform) => ({
        platform,
        action: 'skip',
        time: '10:30',
      })),
    })),
  };
}

describe('MediaReleaseService', () => {
  function makeService(options?: {
    missingPlatform?: boolean;
    stale?: boolean;
  }) {
    const currentPlan = plan();
    if (options?.missingPlatform) currentPlan.days[0].executions.pop();
    const scheduled = [
      {
        _id: { toString: () => 'pub-1' },
        contentItemId: { toString: () => 'content-1' },
        status: MediaPostStatus.SCHEDULED,
        deliveryStatus: MediaDeliveryStatus.SCHEDULED,
      },
    ];
    let publicationFindCalls = 0;
    const publicationModel = {
      find: jest.fn((filter: Record<string, unknown>) => {
        publicationFindCalls += 1;
        if ('status' in filter) return chain(scheduled);
        return chain(scheduled);
      }),
    };
    void publicationFindCalls;
    const contentModel = {
      find: jest
        .fn()
        .mockImplementation(() =>
          chain([{ _id: { toString: () => 'content-1' } }]),
        ),
    };
    const assetModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    const planningModel = {
      findOne: jest.fn().mockReturnValue(chain(currentPlan)),
    };
    const presenceService = {
      getStrategy: jest.fn().mockResolvedValue({ version: 1 }),
      getVoiceProfile: jest.fn().mockResolvedValue({ version: 1 }),
    };
    const launchService = {
      overview: jest.fn().mockResolvedValue({
        state: { status: 'active' },
        dayNumber: 1,
        phase: 'days_1_30_exploration',
        readiness: {
          profilePlanReady: true,
          profilesApplied: 5,
          totalProfiles: 5,
        },
      }),
    };
    const operationsService = {
      overview: jest.fn().mockResolvedValue({
        status: 'ready',
        platforms: primaryPlatforms.map((platform) => ({
          platform,
          status: 'ready',
        })),
        queue: {
          stuckPublishing: 0,
          exhausted: 0,
          overdue: 0,
          manualRequired: 0,
          requiresAttention: 0,
        },
        lifecycle: { dueSnapshots: 0 },
      }),
      repairSafeState: jest.fn().mockResolvedValue({ repaired: true }),
    };
    const assetLibraryService = {
      storageStatus: jest.fn().mockReturnValue({
        configured: true,
        provider: 's3',
        serverSideEncryption: 'AES256',
      }),
    };
    const preflightService = {
      overview: jest.fn().mockResolvedValue({
        summary: {
          changesRequired: 0,
          stale: 0,
          total: 1,
          notReviewed: 0,
          needsReview: 0,
          approved: 1,
        },
      }),
      get: jest.fn().mockResolvedValue({
        review: { status: options?.stale ? 'stale' : 'approved' },
        stale: Boolean(options?.stale),
      }),
    };
    return {
      service: new MediaReleaseService(
        publicationModel as never,
        contentModel as never,
        assetModel as never,
        planningModel as never,
        presenceService as never,
        launchService as never,
        operationsService as never,
        assetLibraryService as never,
        preflightService as never,
      ),
      operationsService,
    };
  }

  it('reports release-ready when the complete Media chain is healthy', async () => {
    const { service } = makeService();
    const result = await service.overview();
    expect(result.releaseCandidateReady).toBe(true);
    expect(result.status).toBe('ready');
    expect(result.policy.thisAuditNeverPublishesContent).toBe(true);
    expect(
      result.checks.find((item) => item.key === 'five_platform_decisions')
        ?.status,
    ).toBe('pass');
  });

  it('blocks release when a day omits a channel or scheduled approval is stale', async () => {
    const { service } = makeService({ missingPlatform: true, stale: true });
    const result = await service.overview();
    expect(result.releaseCandidateReady).toBe(false);
    expect(result.status).toBe('blocked');
    expect(
      result.blockers.some((item) => item.key === 'five_platform_decisions'),
    ).toBe(true);
    expect(
      result.blockers.some((item) => item.key === 'fresh_owner_approval'),
    ).toBe(true);
  });

  it('safe repair only reconciles existing delivery state', async () => {
    const { service, operationsService } = makeService();
    const result = await service.repairSafeState();
    expect(operationsService.repairSafeState).toHaveBeenCalledTimes(1);
    expect(result.policy.doesNotPublishNewContent).toBe(true);
    expect(result.policy.doesNotApprovePreflight).toBe(true);
  });
});
