import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';
import { MediaPlatform } from './schemas/media-post.schema';

function sortedLean<T>(value: T) {
  return {
    sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('MediaStrategyAdaptationService', () => {
  function makeService() {
    const reviewModel = {
      findOne: jest
        .fn()
        .mockImplementationOnce(() => sortedLean(null))
        .mockImplementationOnce(() => sortedLean(null)),
      findOneAndUpdate: jest.fn(
        (_filter: unknown, update: { $set: Record<string, unknown> }) =>
          Promise.resolve(update.$set),
      ),
    };
    const planningModel = {
      findOne: jest.fn(() => sortedLean({ key: 'plan-1' })),
    };
    const adaptationRequests: Array<{
      name: string;
      instructions: string;
      input: string;
    }> = [];
    const aiService = {
      generateStructuredResponse: jest.fn(
        (request: { name: string; instructions: string; input: string }) => {
          adaptationRequests.push(request);
          return Promise.resolve({
            data: {
              summary: 'Keep exploring with more builder specificity.',
              wins: ['Specific operator content'],
              risks: ['Too little measured data'],
              focusThisWeek: ['Real decisions'],
              avoidThisWeek: ['Generic advice'],
              experiments: ['Test one carousel'],
              planningGuidance: ['Preserve platform-native jobs'],
              cadenceAdjustments: [
                MediaPlatform.LINKEDIN,
                MediaPlatform.INSTAGRAM,
                MediaPlatform.YOUTUBE,
                MediaPlatform.X,
                MediaPlatform.WHATSAPP,
              ].map((platform) => ({
                platform,
                direction: 'hold',
                reason: 'Keep exploration stable.',
              })),
              narrativeAdjustments: [
                {
                  narrative: 'builder',
                  direction: 'increase',
                  reason: 'Early signal is useful.',
                },
              ],
              strategyChangeCandidates: [
                {
                  field: 'positioning',
                  proposedChange: 'Potential future refinement',
                  reason: 'Needs more evidence first.',
                  requiresApproval: true,
                },
              ],
            },
            model: 'test-model',
            responseId: 'resp-review',
          });
        },
      ),
    };
    const presenceService = {
      overview: jest.fn().mockResolvedValue({
        strategy: {
          sourceFingerprint: 'strategy-fp',
          platformRoles: [
            { platform: MediaPlatform.LINKEDIN },
            { platform: MediaPlatform.INSTAGRAM },
            { platform: MediaPlatform.YOUTUBE },
            { platform: MediaPlatform.X },
            { platform: MediaPlatform.WHATSAPP },
          ],
        },
        voice: { confidence: 35 },
      }),
    };
    const growthService = {
      overview: jest.fn().mockResolvedValue({
        platformSummaries: [
          {
            platform: MediaPlatform.LINKEDIN,
            publications: 4,
            averagePerformanceScore: 72,
          },
        ],
        accountGrowth: [
          {
            platform: MediaPlatform.LINKEDIN,
            snapshots: 4,
            growthPercent: 2,
          },
        ],
      }),
    };
    const learningService = {
      overview: jest.fn().mockResolvedValue({
        performance: [
          {
            publicationId: 'p1',
            platform: MediaPlatform.LINKEDIN,
            percentile: 80,
            period: '72_hours',
          },
        ],
        audience: [],
        pillarSignals: [
          {
            pillar: 'human_unfiltered',
            samples: 3,
            confidence: 58,
            reach: 62,
            authority: 38,
            affinity: 84,
            engagement: 73,
          },
        ],
      }),
    };
    const engagementService = {
      overview: jest.fn().mockResolvedValue({
        total: 3,
        needsResponse: 1,
        replied: 2,
        byPlatform: [
          {
            platform: MediaPlatform.LINKEDIN,
            total: 3,
            needsResponse: 1,
            replied: 2,
          },
        ],
      }),
    };
    const calendarService = {
      overview: jest.fn().mockResolvedValue({
        coverage: [
          {
            platform: MediaPlatform.LINKEDIN,
            coveragePercent: 85,
          },
        ],
      }),
    };

    const service = new MediaStrategyAdaptationService(
      reviewModel as never,
      planningModel as never,
      aiService as never,
      presenceService as never,
      growthService as never,
      learningService as never,
      engagementService as never,
      calendarService as never,
    );
    return { service, aiService, reviewModel, adaptationRequests };
  }

  it('builds a weekly overlay and keeps permanent strategy changes approval-only', async () => {
    const { service, aiService, adaptationRequests } = makeService();
    const result = await service.generate({ force: true });
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.platformScores).toHaveLength(5);
    expect(result.strategyChangeCandidates[0].requiresApproval).toBe(true);
    expect(aiService.generateStructuredResponse).toHaveBeenCalledTimes(1);
    const request = adaptationRequests[0];
    expect(request).toBeDefined();
    expect(request.name).toBe('hsakaa_media_presence_weekly_adaptation_v34');
    expect(request.instructions).toContain(
      'Do not let raw impressions become the sole optimization target',
    );
    expect(request.input).toContain('publicFigurePillarSignals');
  });
});
