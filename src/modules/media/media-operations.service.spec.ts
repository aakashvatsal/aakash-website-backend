import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';

import { MediaAnalyticsService } from './services/media-analytics.service';
import { MediaBufferService } from './media-buffer.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaOperationsService } from './media-operations.service';
import {
  MediaAccountConnectionStatus,
  MediaAccountDocument,
  MediaDeliveryProvider,
} from './schemas/media-account.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import { MediaPublicationDocument } from './schemas/media-publication.schema';

describe('MediaOperationsService', () => {
  function createService(options?: { manualLinkedIn?: boolean }) {
    const accounts = [
      {
        _id: { toString: () => 'linkedin-account' },
        platform: MediaPlatform.LINKEDIN,
        displayName: 'Aakash LinkedIn',
        connectionStatus: MediaAccountConnectionStatus.CONNECTED,
        deliveryProvider: options?.manualLinkedIn
          ? MediaDeliveryProvider.MANUAL
          : MediaDeliveryProvider.DIRECT,
        isPrimary: true,
        isActive: true,
        credentialRef: 'env:LINKEDIN_ACCESS_TOKEN',
        capabilities: {
          canPublish: true,
          canSchedule: true,
          canReadAnalytics: true,
          canReadEngagement: true,
          canUploadAssets: true,
          requiresManualPublish: Boolean(options?.manualLinkedIn),
        },
      },
    ] as unknown as MediaAccountDocument[];
    const accountModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(accounts),
        }),
      }),
    } as unknown as Model<MediaAccountDocument>;
    const publicationModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
    } as unknown as Model<MediaPublicationDocument>;
    const values: Record<string, string> = {
      LINKEDIN_ACCESS_TOKEN: 'secret-linkedin-token',
    };
    const configService = {
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;
    const analyticsService = {
      getProviderStatus: jest.fn().mockReturnValue({
        linkedin: { configured: true, mode: 'member_post_analytics' },
        instagram: { configured: false, mode: 'instagram_media_insights' },
        youtube: { configured: false, mode: 'public_video_statistics' },
        x: { configured: false, mode: 'public_post_metrics' },
        whatsapp: {
          configured: false,
          mode: 'business_messaging_or_manual_status',
        },
      }),
    } as unknown as MediaAnalyticsService;
    const bufferService = {
      status: jest.fn().mockResolvedValue({
        configured: false,
        reachable: false,
        supportedPlatforms: [
          MediaPlatform.LINKEDIN,
          MediaPlatform.INSTAGRAM,
          MediaPlatform.X,
        ],
      }),
    } as unknown as MediaBufferService;
    const recoverStuckPublishing = jest
      .fn()
      .mockResolvedValue({ checked: 1, manualReview: 1 });
    const reconcileBufferPublications = jest
      .fn()
      .mockResolvedValue({ checked: 2, pending: 1 });
    const calendarService = {
      recoverStuckPublishing,
      reconcileBufferPublications,
    } as unknown as MediaCalendarService;
    const growthService = {
      lifecycleOverview: jest.fn().mockResolvedValue({
        publications: 4,
        dueSnapshots: 2,
        due: [],
        coverage: { '1_hour': 75 },
      }),
    } as unknown as MediaGrowthService;

    return {
      service: new MediaOperationsService(
        accountModel,
        publicationModel,
        configService,
        analyticsService,
        bufferService,
        calendarService,
        growthService,
      ),
      calendarService,
      recoverStuckPublishing,
      reconcileBufferPublications,
    };
  }

  it('reports all five growth platforms without exposing credential values', async () => {
    const { service } = createService();

    const overview = await service.overview();

    expect(overview.platforms).toHaveLength(5);
    const linkedin = overview.platforms.find(
      (item) => item.platform === MediaPlatform.LINKEDIN,
    );
    expect(linkedin?.automaticDeliveryReady).toBe(true);
    expect(linkedin?.directCredentialConfigured).toBe(true);
    expect(JSON.stringify(overview)).not.toContain('secret-linkedin-token');
    expect(overview.lifecycle.dueSnapshots).toBe(2);
  });

  it('does not report a Manual account as automatic-delivery ready just because a credential exists', async () => {
    const { service } = createService({ manualLinkedIn: true });

    const overview = await service.overview();
    const linkedin = overview.platforms.find(
      (item) => item.platform === MediaPlatform.LINKEDIN,
    );

    expect(linkedin?.automaticDeliveryReady).toBe(false);
    expect(linkedin?.manualFallbackReady).toBe(true);
  });

  it('repairs only safe operational state and delegates ambiguous delivery recovery', async () => {
    const { service, recoverStuckPublishing, reconcileBufferPublications } =
      createService();

    const result = await service.repairSafeState();

    expect(recoverStuckPublishing).toHaveBeenCalledTimes(1);
    expect(reconcileBufferPublications).toHaveBeenCalledTimes(1);
    expect(result.policy.doesNotPublishNewContent).toBe(true);
    expect(result.policy.doesNotBlindlyRetryAmbiguousDirectPublishes).toBe(
      true,
    );
  });
});
