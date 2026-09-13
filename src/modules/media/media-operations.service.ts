import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { MediaAnalyticsService } from './services/media-analytics.service';
import { MediaBufferService } from './media-buffer.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaGrowthService } from './media-growth.service';
import {
  MediaAccount,
  MediaAccountConnectionStatus,
  MediaAccountDocument,
  MediaDeliveryProvider,
} from './schemas/media-account.schema';
import { MediaPlatform, MediaPostStatus } from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

const GROWTH_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
] as const;

const MAX_PUBLISH_ATTEMPTS = 3;
const STUCK_PUBLISHING_MINUTES = 30;

@Injectable()
export class MediaOperationsService {
  constructor(
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    private readonly configService: ConfigService,
    private readonly analyticsService: MediaAnalyticsService,
    private readonly bufferService: MediaBufferService,
    private readonly calendarService: MediaCalendarService,
    private readonly growthService: MediaGrowthService,
  ) {}

  async overview() {
    const [accounts, buffer, queue, lifecycle] = await Promise.all([
      this.accountModel
        .find({ isActive: true })
        .sort({ platform: 1, isPrimary: -1 })
        .lean(),
      this.bufferService.status(),
      this.queueHealth(),
      this.growthService.lifecycleOverview(150),
    ]);
    const analytics = this.analyticsService.getProviderStatus();
    const platforms = GROWTH_PLATFORMS.map((platform) =>
      this.platformHealth(platform, accounts, analytics, buffer),
    );
    const blockingPlatforms = platforms.filter(
      (item) => item.status === 'blocked',
    ).length;
    const partialPlatforms = platforms.filter(
      (item) => item.status === 'partial',
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      status:
        blockingPlatforms > 0
          ? 'blocked'
          : partialPlatforms > 0 || queue.requiresAttention > 0
            ? 'attention'
            : 'ready',
      platforms,
      queue,
      lifecycle: {
        measuredPublications: lifecycle.publications,
        dueSnapshots: lifecycle.dueSnapshots,
        coverage: lifecycle.coverage,
      },
      buffer: {
        configured: buffer.configured,
        reachable: buffer.reachable,
        error: 'error' in buffer ? buffer.error : undefined,
        supportedPlatforms: buffer.supportedPlatforms,
      },
      policy: {
        approvalRequiredBeforePublishing: true,
        approvalRequiredBeforeEngagementReply: true,
        automaticRetriesAreBounded: true,
        ambiguousDirectDeliveryNeverAutoRetries: true,
        bufferHandoffUsesAuthoritativeReconciliation: true,
        manualFallbackIsAllowed: true,
        whatsappStatusRemainsManual: true,
        operationsHealthNeverExposesCredentialValues: true,
      },
    };
  }

  async repairSafeState() {
    const [stuck, buffer] = await Promise.all([
      this.calendarService.recoverStuckPublishing(),
      this.calendarService.reconcileBufferPublications(),
    ]);
    return {
      ranAt: new Date().toISOString(),
      stuck,
      buffer,
      policy: {
        doesNotPublishNewContent: true,
        doesNotSendEngagementReplies: true,
        doesNotBlindlyRetryAmbiguousDirectPublishes: true,
      },
    };
  }

  private async queueHealth() {
    const now = new Date();
    const stuckCutoff = new Date(
      now.getTime() - STUCK_PUBLISHING_MINUTES * 60_000,
    );
    const [
      scheduled,
      publishing,
      manualRequired,
      failed,
      overdue,
      retryScheduled,
      exhausted,
      stuckPublishing,
    ] = await Promise.all([
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.SCHEDULED,
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.PUBLISHING,
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.MANUAL_REQUIRED,
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.FAILED,
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        scheduledAt: { $lte: now },
        status: MediaPostStatus.SCHEDULED,
        deliveryStatus: {
          $in: [
            MediaDeliveryStatus.SCHEDULED,
            MediaDeliveryStatus.FAILED,
            MediaDeliveryStatus.MANUAL_REQUIRED,
          ],
        },
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        status: MediaPostStatus.SCHEDULED,
        deliveryStatus: MediaDeliveryStatus.FAILED,
        publishAttempts: { $lt: MAX_PUBLISH_ATTEMPTS },
        nextPublishAttemptAt: { $type: 'date' },
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.FAILED,
        publishAttempts: { $gte: MAX_PUBLISH_ATTEMPTS },
      }),
      this.publicationModel.countDocuments({
        isActive: true,
        deliveryStatus: MediaDeliveryStatus.PUBLISHING,
        lastPublishAttemptAt: { $lte: stuckCutoff },
      }),
    ]);
    const requiresAttention =
      manualRequired + exhausted + stuckPublishing + overdue;
    return {
      scheduled,
      publishing,
      manualRequired,
      failed,
      overdue,
      retryScheduled,
      exhausted,
      stuckPublishing,
      requiresAttention,
      retryPolicy: {
        maxAttempts: MAX_PUBLISH_ATTEMPTS,
        delayMinutes: 15,
        stuckPublishingMinutes: STUCK_PUBLISHING_MINUTES,
      },
    };
  }

  private platformHealth(
    platform: MediaPlatform,
    accounts: Array<MediaAccount & { _id?: { toString(): string } }>,
    analytics: ReturnType<MediaAnalyticsService['getProviderStatus']>,
    buffer: Awaited<ReturnType<MediaBufferService['status']>>,
  ) {
    const account =
      accounts.find((item) => item.platform === platform && item.isPrimary) ??
      accounts.find((item) => item.platform === platform);
    const issues: string[] = [];
    const actions: string[] = [];
    const directCredentialConfigured = this.hasDirectCredential(
      platform,
      account,
    );
    const engagementReadConfigured = this.hasEngagementCredential(
      platform,
      account,
      'read',
    );
    const engagementWriteConfigured = this.hasEngagementCredential(
      platform,
      account,
      'write',
    );
    const analyticsProvider = analytics[platform as keyof typeof analytics] as
      { configured: boolean; mode: string } | undefined;
    const analyticsApplicable = platform !== MediaPlatform.WHATSAPP;
    const analyticsConfigured = analyticsApplicable
      ? Boolean(analyticsProvider?.configured)
      : true;
    const bufferSupported = buffer.supportedPlatforms.includes(platform);
    const bufferHealthy = Boolean(
      account?.buffer?.channelId &&
      !account.buffer.isDisconnected &&
      !account.buffer.isLocked &&
      !account.buffer.isQueuePaused &&
      buffer.configured &&
      buffer.reachable,
    );
    const manualConfigured =
      account?.deliveryProvider === MediaDeliveryProvider.MANUAL ||
      account?.capabilities?.requiresManualPublish === true ||
      platform === MediaPlatform.WHATSAPP;
    const directReady = Boolean(
      account?.capabilities?.canPublish && directCredentialConfigured,
    );
    const automaticDeliveryReady = account
      ? account.deliveryProvider === MediaDeliveryProvider.BUFFER
        ? bufferHealthy
        : account.deliveryProvider === MediaDeliveryProvider.DIRECT
          ? directReady
          : account.deliveryProvider === MediaDeliveryProvider.MANUAL
            ? false
            : bufferHealthy || directReady
      : false;
    const anyDeliveryPath = automaticDeliveryReady || manualConfigured;

    if (!account) {
      issues.push('No active Media account exists for this platform.');
      actions.push(`Create and configure the ${platform} Media account.`);
    } else {
      if (
        account.connectionStatus === MediaAccountConnectionStatus.NEEDS_REAUTH
      ) {
        issues.push('The account requires re-authentication.');
        actions.push('Refresh the platform credential before relying on sync.');
      }
      if (account.connectionStatus === MediaAccountConnectionStatus.ERROR) {
        issues.push('The Media account is marked as an error state.');
      }
      if (!anyDeliveryPath) {
        issues.push(
          'No automatic or intentional manual delivery path is ready.',
        );
        actions.push(
          bufferSupported
            ? 'Connect Buffer, configure a direct credential, or choose Manual delivery.'
            : 'Configure a direct credential or choose Manual delivery.',
        );
      }
      if (
        account.deliveryProvider === MediaDeliveryProvider.BUFFER &&
        !bufferHealthy
      ) {
        issues.push(
          'Buffer is selected but its connected channel is not healthy.',
        );
        actions.push(
          'Reconnect/unpause the Buffer channel or switch delivery provider.',
        );
      }
    }
    if (!analyticsConfigured) {
      issues.push('Analytics access is not configured.');
      actions.push('Configure the platform analytics credential/scopes.');
    }
    if (account?.capabilities?.canReadEngagement && !engagementReadConfigured) {
      issues.push(
        'Engagement reading is enabled on the account but no read credential is configured.',
      );
      actions.push('Configure the engagement read credential/scopes.');
    }
    if (!engagementWriteConfigured && platform !== MediaPlatform.WHATSAPP) {
      actions.push(
        'Configure write access before expecting HSAKAA-approved replies to send automatically.',
      );
    }

    const blocked = !account || !anyDeliveryPath;
    const partial =
      !blocked &&
      (!analyticsConfigured ||
        (account?.capabilities?.canReadEngagement &&
          !engagementReadConfigured) ||
        (account?.connectionStatus !== MediaAccountConnectionStatus.CONNECTED &&
          !manualConfigured));

    return {
      platform,
      status: blocked ? 'blocked' : partial ? 'partial' : 'ready',
      accountId: account?._id?.toString(),
      accountName: account?.displayName,
      username: account?.username,
      connectionStatus: account?.connectionStatus ?? 'not_connected',
      deliveryProvider: account?.deliveryProvider ?? 'auto',
      capabilities: account?.capabilities ?? null,
      automaticDeliveryReady,
      manualFallbackReady: manualConfigured,
      directCredentialConfigured,
      buffer: {
        supported: bufferSupported,
        connected: Boolean(account?.buffer?.channelId),
        healthy: bufferHealthy,
      },
      analytics: {
        applicable: analyticsApplicable,
        configured: analyticsConfigured,
        mode: analyticsProvider?.mode ?? 'not_applicable',
      },
      engagement: {
        readConfigured: engagementReadConfigured,
        writeConfigured: engagementWriteConfigured,
      },
      issues,
      actions: [...new Set(actions)],
    };
  }

  private hasDirectCredential(
    platform: MediaPlatform,
    account?: Pick<MediaAccount, 'credentialRef'>,
  ) {
    if (this.explicitCredentialConfigured(account?.credentialRef)) return true;
    const key: Partial<Record<MediaPlatform, string>> = {
      [MediaPlatform.LINKEDIN]: 'LINKEDIN_ACCESS_TOKEN',
      [MediaPlatform.INSTAGRAM]: 'INSTAGRAM_ACCESS_TOKEN',
      [MediaPlatform.YOUTUBE]: 'YOUTUBE_ACCESS_TOKEN',
      [MediaPlatform.X]: 'X_ACCESS_TOKEN',
      [MediaPlatform.WHATSAPP]: 'WHATSAPP_ACCESS_TOKEN',
    };
    return this.configured(key[platform]);
  }

  private hasEngagementCredential(
    platform: MediaPlatform,
    account: Pick<MediaAccount, 'credentialRef'> | undefined,
    mode: 'read' | 'write',
  ) {
    if (this.explicitCredentialConfigured(account?.credentialRef)) return true;
    const read: Partial<Record<MediaPlatform, string[]>> = {
      [MediaPlatform.LINKEDIN]: ['LINKEDIN_ACCESS_TOKEN'],
      [MediaPlatform.INSTAGRAM]: ['INSTAGRAM_ACCESS_TOKEN'],
      [MediaPlatform.YOUTUBE]: [
        'YOUTUBE_OAUTH_ACCESS_TOKEN',
        'YOUTUBE_ACCESS_TOKEN',
        'YOUTUBE_API_KEY',
      ],
      [MediaPlatform.X]: ['X_BEARER_TOKEN', 'X_ACCESS_TOKEN'],
      [MediaPlatform.WHATSAPP]: ['WHATSAPP_ACCESS_TOKEN'],
    };
    const write: Partial<Record<MediaPlatform, string[]>> = {
      [MediaPlatform.LINKEDIN]: ['LINKEDIN_ACCESS_TOKEN'],
      [MediaPlatform.INSTAGRAM]: ['INSTAGRAM_ACCESS_TOKEN'],
      [MediaPlatform.YOUTUBE]: [
        'YOUTUBE_OAUTH_ACCESS_TOKEN',
        'YOUTUBE_ACCESS_TOKEN',
      ],
      [MediaPlatform.X]: ['X_ACCESS_TOKEN'],
      [MediaPlatform.WHATSAPP]: ['WHATSAPP_ACCESS_TOKEN'],
    };
    const keys = (mode === 'read' ? read[platform] : write[platform]) ?? [];
    return keys.some((key) => this.configured(key));
  }

  private explicitCredentialConfigured(reference?: string) {
    const ref = reference?.trim();
    if (!ref) return false;
    const key = ref.startsWith('env:') ? ref.slice(4) : ref;
    return this.configured(key);
  }

  private configured(key?: string) {
    return Boolean(key && this.configService.get<string>(key)?.trim());
  }
}
