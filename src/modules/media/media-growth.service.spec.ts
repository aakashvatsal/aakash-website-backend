import { Model, Types } from 'mongoose';

import { MediaAnalyticsService } from './services/media-analytics.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaAccountDocument } from './schemas/media-account.schema';
import { MediaAccountMetricSnapshotDocument } from './schemas/media-account-metric-snapshot.schema';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import { MediaContentMemoryDocument } from './schemas/media-content-memory.schema';
import { MediaGrowthExperimentDocument } from './schemas/media-growth-experiment.schema';
import { MediaGrowthLearningDocument } from './schemas/media-growth-learning.schema';
import { MediaMetricSnapshotDocument } from './schemas/media-metric-snapshot.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

describe('MediaGrowthService', () => {
  function chain<T>(value: T) {
    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(value),
    };
  }

  function createService() {
    const publicationId = new Types.ObjectId();
    const accountId = new Types.ObjectId();
    const publication = {
      _id: publicationId,
      contentItemId: new Types.ObjectId(),
      accountId,
      platform: MediaPlatform.YOUTUBE,
      format: MediaPostType.SHORT,
      status: MediaPostStatus.POSTED,
      deliveryStatus: MediaDeliveryStatus.PUBLISHED,
      platformPostId: 'video-1',
      isActive: true,
    } as unknown as MediaPublicationDocument;
    const account = {
      _id: accountId,
      platform: MediaPlatform.YOUTUBE,
      displayName: 'YouTube',
      externalAccountId: 'channel-1',
      isActive: true,
      isPrimary: true,
      capabilities: { canReadAnalytics: true },
    } as unknown as MediaAccountDocument;

    let capturedMetricUpdate: { $set: Record<string, number> } | undefined;
    let capturedAccountMetricUpdate:
      { $set: Record<string, number | string> } | undefined;
    const metricUpdate = jest
      .fn()
      .mockImplementation(
        (_filter: unknown, update: { $set: Record<string, number> }) => {
          capturedMetricUpdate = update;
          return { lean: jest.fn().mockResolvedValue({}) };
        },
      );
    const accountMetricUpdate = jest
      .fn()
      .mockImplementation(
        (
          _filter: unknown,
          update: { $set: Record<string, number | string> },
        ) => {
          capturedAccountMetricUpdate = update;
          return { lean: jest.fn().mockResolvedValue({}) };
        },
      );
    const learningFind = jest.fn().mockReturnValue(chain([]));

    const publicationModel = {
      findOne: jest.fn().mockResolvedValue(publication),
      find: jest.fn().mockReturnValue(chain([])),
    } as unknown as Model<MediaPublicationDocument>;
    const accountModel = {
      findOne: jest.fn().mockResolvedValue(account),
      find: jest.fn().mockReturnValue(chain([])),
    } as unknown as Model<MediaAccountDocument>;
    const contentModel = {
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as unknown as Model<MediaContentItemDocument>;
    const memoryModel = {
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as unknown as Model<MediaContentMemoryDocument>;
    const metricModel = {
      findOneAndUpdate: metricUpdate,
      find: jest.fn().mockReturnValue(chain([])),
    } as unknown as Model<MediaMetricSnapshotDocument>;
    const accountMetricModel = {
      findOneAndUpdate: accountMetricUpdate,
      find: jest.fn().mockReturnValue(chain([])),
    } as unknown as Model<MediaAccountMetricSnapshotDocument>;
    const learningModel = {
      find: learningFind,
      updateMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockResolvedValue([]),
    } as unknown as Model<MediaGrowthLearningDocument>;
    const experimentModel = {
      find: jest.fn().mockReturnValue(chain([])),
      create: jest.fn(),
    } as unknown as Model<MediaGrowthExperimentDocument>;
    const getPostMetrics = jest.fn().mockResolvedValue({
      normalized: {
        views: 1000,
        likes: 80,
        comments: 20,
        shares: 25,
        followersGained: 10,
        averageWatchPercentage: 70,
      },
      raw: { source: 'youtube-owner' },
    });
    const getAccountMetrics = jest.fn().mockResolvedValue({
      normalized: { subscribers: 1250, views: 50000 },
      raw: { source: 'youtube-channel' },
    });
    const analyticsService = {
      getPostMetrics,
      getAccountMetrics,
      getProviderStatus: jest.fn().mockReturnValue({}),
    } as unknown as MediaAnalyticsService;

    return {
      service: new MediaGrowthService(
        publicationModel,
        accountModel,
        contentModel,
        memoryModel,
        metricModel,
        accountMetricModel,
        learningModel,
        experimentModel,
        analyticsService,
      ),
      publicationId,
      accountId,
      getCapturedMetricUpdate: () => capturedMetricUpdate,
      getCapturedAccountMetricUpdate: () => capturedAccountMetricUpdate,
      getAccountMetrics,
      learningFind,
    };
  }

  it('normalizes publication performance before storing the snapshot', async () => {
    const { service, publicationId, getCapturedMetricUpdate } = createService();

    await service.syncPublicationMetrics(publicationId.toString());

    const update = getCapturedMetricUpdate();
    expect(update).toBeDefined();
    if (!update) throw new Error('Expected publication metric update.');
    expect(update.$set.views).toBe(1000);
    expect(update.$set.followersGained).toBe(10);
    expect(update.$set.engagementRate).toBeGreaterThan(0);
    expect(update.$set.performanceScore).toBeGreaterThan(0);
    expect(update.$set.performanceScore).toBeLessThanOrEqual(100);
  });

  it('captures account audience growth from the platform connector', async () => {
    const {
      service,
      accountId,
      getCapturedAccountMetricUpdate,
      getAccountMetrics,
    } = createService();

    await service.syncAccountMetrics(accountId.toString());

    expect(getAccountMetrics).toHaveBeenCalledWith({
      platform: MediaPlatform.YOUTUBE,
      platformAccountId: 'channel-1',
    });
    const update = getCapturedAccountMetricUpdate();
    expect(update).toBeDefined();
    if (!update) throw new Error('Expected account metric update.');
    expect(update.$set.subscribers).toBe(1250);
    expect(update.$set.views).toBe(50000);
    expect(update.$set.source).toBe('direct_platform');
  });

  it('only feeds high-confidence growth evidence into Content Director', async () => {
    const { service, learningFind } = createService();
    const learnings = [
      {
        platform: MediaPlatform.LINKEDIN,
        dimension: 'hook_archetype',
        value: 'specific founder mistake',
        direction: 'positive',
        liftPercent: 32,
        confidence: 84,
        sampleSize: 6,
        summary: 'Specific founder mistakes outperform the LinkedIn baseline.',
        recommendedAction:
          'Use more specific founder mistakes with fresh stories.',
      },
    ];
    learningFind.mockReturnValue(chain(learnings));

    await expect(
      service.directorLearningContext([MediaPlatform.LINKEDIN]),
    ).resolves.toEqual(learnings);
    expect(learningFind).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: { $gte: 60 } }),
    );
  });

  it('creates experiments in the same growth learning system', async () => {
    const { service } = createService();
    const experimentModel = Reflect.get(service, 'experimentModel') as {
      create: jest.Mock;
    };
    experimentModel.create.mockResolvedValue({ _id: new Types.ObjectId() });

    await service.createExperiment({
      title: 'Hook test',
      hypothesis: 'Specific hooks outperform generic hooks.',
      variable: 'hook',
      control: 'Generic founder lesson',
      variant: 'A specific mistake I made this week',
    });

    expect(experimentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hook test',
        variable: 'hook',
        isActive: true,
      }),
    );
  });
});
