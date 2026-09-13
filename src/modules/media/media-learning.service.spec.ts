import { MediaLearningService } from './media-learning.service';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MetricSnapshotPeriod } from './schemas/media-metric-snapshot.schema';
import {
  MediaEngagementIntent,
  MediaEngagementSentiment,
} from './schemas/media-engagement-item.schema';

function queryResult<T>(value: T) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
      lean: jest.fn().mockResolvedValue(value),
    })),
    limit: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe('MediaLearningService', () => {
  const publicationId = '64b000000000000000000001';
  const contentItemId = '64b000000000000000000002';
  const engagementId = '64b000000000000000000003';

  function makeService() {
    const publicationModel = {
      find: jest.fn(() =>
        queryResult([
          {
            _id: { toString: () => publicationId },
            contentItemId: { toString: () => contentItemId },
            platform: MediaPlatform.LINKEDIN,
            format: MediaPostType.TEXT,
            status: MediaPostStatus.POSTED,
            deliveryStatus: MediaDeliveryStatus.PUBLISHED,
            title: 'Founder decision',
            hook: 'A specific hook',
            caption: 'A specific caption',
            publishedAt: new Date('2026-08-30T05:00:00Z'),
          },
        ]),
      ),
    };
    const contentModel = {
      find: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([
          {
            _id: { toString: () => contentItemId },
            title: 'Founder decision',
            thesis: 'Specific builder lesson',
            contentPillars: ['building'],
            audiences: ['founders'],
            origin: 'company',
          },
        ]),
      })),
    };
    const metricModel = {
      find: jest.fn(() =>
        queryResult([
          {
            mediaPublicationId: { toString: () => publicationId },
            period: MetricSnapshotPeriod.SEVENTY_TWO_HOURS,
            capturedAt: new Date(),
            performanceScore: 80,
            impressions: 1000,
            reach: 900,
            views: 0,
            engagementRate: 5,
            shareSaveRate: 2,
            followerConversionRate: 1,
            profileVisits: 30,
            followersGained: 5,
          },
        ]),
      ),
    };
    const engagementModel = {
      find: jest.fn(() =>
        queryResult([
          {
            _id: { toString: () => engagementId },
            platform: MediaPlatform.LINKEDIN,
            intent: MediaEngagementIntent.QUESTION,
            sentiment: MediaEngagementSentiment.NEUTRAL,
            text: 'How do you decide which feature not to build?',
          },
        ]),
      ),
    };
    const performanceInsightModel = {
      find: jest.fn(() => queryResult([])),
      findOneAndUpdate: jest.fn(
        (_filter: unknown, update: { $set: Record<string, unknown> }) => ({
          lean: jest.fn().mockResolvedValue(update.$set),
        }),
      ),
    };
    const audienceInsightModel = {
      find: jest.fn(() => queryResult([])),
      updateMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockResolvedValue([]),
    };
    const aiService = {
      generateStructuredResponse: jest
        .fn()
        .mockImplementation((request: { name: string }) => {
          if (request.name === 'hsakaa_media_audience_intelligence_v33') {
            return Promise.resolve({
              data: {
                insights: [
                  {
                    key: 'feature-prioritisation',
                    type: 'question',
                    topic: 'feature prioritisation',
                    summary: 'Audience wants the decision framework.',
                    engagementIds: [engagementId],
                    recommendedContentAngle:
                      'Show one real tradeoff without revealing private company data.',
                    recommendedPlatforms: ['linkedin', 'youtube'],
                    highIntent: false,
                  },
                ],
              },
              model: 'test',
              responseId: 'resp-audience',
            });
          }
          return Promise.resolve({
            data: {
              insights: [
                {
                  publicationId,
                  summary: 'Strong relative performance.',
                  whyItWorked: 'Specific founder decision created relevance.',
                  whatLimitedIt: 'Conversation was weaker than discovery.',
                  doMore: ['Specific operator decisions'],
                  doLess: ['Generic advice'],
                  nextExperiment: 'Test a sharper question ending.',
                  mechanisms: ['specificity', 'operator evidence'],
                },
              ],
            },
            model: 'test',
            responseId: 'resp-performance',
          });
        }),
    };
    const growthService = {
      lifecycleOverview: jest.fn().mockResolvedValue({
        publications: 1,
        dueSnapshots: 0,
        due: [],
        coverage: {},
      }),
      syncLifecycle: jest
        .fn()
        .mockResolvedValue({ attempted: 0, synced: [], failures: [] }),
    };

    const service = new MediaLearningService(
      publicationModel as never,
      contentModel as never,
      metricModel as never,
      engagementModel as never,
      performanceInsightModel as never,
      audienceInsightModel as never,
      aiService as never,
      growthService as never,
    );
    return { service, aiService, audienceInsightModel };
  }

  it('turns measured publication performance into mechanism-level learning', async () => {
    const { service } = makeService();
    const result = await service.rebuildPerformance(90);
    expect(result.analyzed).toBe(1);
    expect(result.insights[0].mechanisms).toContain('specificity');
    expect(result.insights[0].identityPillar).toBe('builder_operator');
    expect(typeof result.insights[0].publicFigureSignals.reach).toBe('number');
    expect(typeof result.insights[0].publicFigureSignals.authority).toBe(
      'number',
    );
    expect(typeof result.insights[0].publicFigureSignals.affinity).toBe(
      'number',
    );
    expect(typeof result.insights[0].publicFigureSignals.engagement).toBe(
      'number',
    );
  });

  it('clusters audience questions into content opportunities without requiring auto-replies', async () => {
    const { service, audienceInsightModel } = makeService();
    const result = await service.rebuildAudience(60);
    expect(result.analyzed).toBe(1);
    expect(audienceInsightModel.insertMany).toHaveBeenCalled();
  });
});
