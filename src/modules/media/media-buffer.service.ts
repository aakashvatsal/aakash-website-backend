import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  MediaAccount,
  MediaAccountConnectionStatus,
  MediaAccountDocument,
  MediaDeliveryProvider,
} from './schemas/media-account.schema';
import {
  MediaAsset,
  MediaAssetDocument,
  MediaAssetStatus,
  MediaAssetType,
} from './schemas/media-asset.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaPublicationDocument } from './schemas/media-publication.schema';

export interface BufferOrganization {
  id: string;
  name?: string | null;
}

export interface BufferChannel {
  id: string;
  organizationId: string;
  name: string;
  displayName?: string | null;
  service: string;
  avatar?: string | null;
  externalLink?: string | null;
  isQueuePaused?: boolean;
  isDisconnected?: boolean;
  isLocked?: boolean;
}

export interface BufferPostState {
  id: string;
  channelId: string;
  status:
    'draft' | 'error' | 'needs_approval' | 'scheduled' | 'sending' | 'sent';
  dueAt?: string | null;
  sentAt?: string | null;
  externalLink?: string | null;
  error?: {
    message?: string | null;
    rawError?: string | null;
    supportUrl?: string | null;
  } | null;
}

interface BufferCreatePostResult {
  id: string;
  status: BufferPostState['status'];
  dueAt?: string | null;
  sentAt?: string | null;
  externalLink?: string | null;
}

interface BufferGraphqlEnvelope<T> {
  data?: T;
  errors?: Array<{ message?: string }>;
}

interface BufferPostActionPayload {
  __typename?: string;
  message?: string;
  post?: BufferCreatePostResult;
}

const BUFFER_ENDPOINT = 'https://api.buffer.com';

@Injectable()
export class MediaBufferService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
  ) {}

  isConfigured() {
    return Boolean(this.apiKey());
  }

  async status() {
    const accounts = await this.accountModel.find({ isActive: true }).lean();
    if (!this.isConfigured()) {
      return {
        configured: false,
        reachable: false,
        endpoint: BUFFER_ENDPOINT,
        requiredEnvironmentVariable: 'BUFFER_API_KEY',
        organizations: [] as BufferOrganization[],
        channels: [] as BufferChannel[],
        accounts,
        supportedPlatforms: this.supportedPlatforms(),
        policy: this.policy(),
      };
    }

    try {
      const organizations = await this.organizations();
      const channels = (
        await Promise.all(
          organizations.map((organization) => this.channels(organization.id)),
        )
      ).flat();
      return {
        configured: true,
        reachable: true,
        endpoint: BUFFER_ENDPOINT,
        requiredEnvironmentVariable: 'BUFFER_API_KEY',
        organizations,
        channels,
        accounts,
        supportedPlatforms: this.supportedPlatforms(),
        policy: this.policy(),
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        error: this.errorMessage(error),
        endpoint: BUFFER_ENDPOINT,
        requiredEnvironmentVariable: 'BUFFER_API_KEY',
        organizations: [] as BufferOrganization[],
        channels: [] as BufferChannel[],
        accounts,
        supportedPlatforms: this.supportedPlatforms(),
        policy: this.policy(),
      };
    }
  }

  async syncAccounts() {
    this.requireConfigured();
    const organizations = await this.organizations();
    const channels = (
      await Promise.all(
        organizations.map((organization) => this.channels(organization.id)),
      )
    ).flat();
    let connected = 0;
    let created = 0;
    const needsMapping: Array<{
      channelId: string;
      platform: MediaPlatform;
      accountIds: string[];
    }> = [];

    for (const channel of channels) {
      const platform = this.platformForService(channel.service);
      if (!platform) continue;

      const already = await this.accountModel.findOne({
        isActive: true,
        'buffer.channelId': channel.id,
      });
      if (already) {
        await this.applyBufferConnection(already, channel);
        connected += 1;
        continue;
      }

      const candidates = await this.accountModel.find({
        isActive: true,
        platform,
        $or: [
          { buffer: { $exists: false } },
          { 'buffer.channelId': { $exists: false } },
        ],
      });

      if (candidates.length === 1) {
        await this.applyBufferConnection(candidates[0], channel);
        connected += 1;
        continue;
      }

      if (candidates.length > 1) {
        needsMapping.push({
          channelId: channel.id,
          platform,
          accountIds: candidates.map((item) => item._id.toString()),
        });
        continue;
      }

      const hasPrimary = await this.accountModel.exists({
        platform,
        isActive: true,
        isPrimary: true,
      });
      const account = new this.accountModel({
        platform,
        displayName: channel.displayName || channel.name || platform,
        username: channel.name || undefined,
        connectionStatus:
          channel.isDisconnected || channel.isLocked
            ? MediaAccountConnectionStatus.ERROR
            : MediaAccountConnectionStatus.CONNECTED,
        deliveryProvider: MediaDeliveryProvider.BUFFER,
        buffer: this.bufferConnection(channel),
        capabilities: this.bufferCapabilities(channel),
        strategy: {
          planningHorizonDays: 7,
          timezone: 'Asia/Kolkata',
          preferredPublishTimes: ['09:00'],
          preferredDaysOfWeek: [],
          desiredPublicationsPerWeek: 0,
          goals: [],
          contentPillars: [],
          audiences: [],
        },
        isPrimary: !hasPrimary,
        isActive: true,
        metadata: { createdFrom: 'buffer_sync' },
      });
      await account.save();
      created += 1;
      connected += 1;
    }

    return {
      connected,
      created,
      needsMapping,
      status: await this.status(),
    };
  }

  async connectAccount(
    accountId: string,
    input: { organizationId: string; channelId: string },
  ) {
    const account = await this.requireAccount(accountId);
    const channel = (await this.channels(input.organizationId)).find(
      (item) => item.id === input.channelId,
    );
    if (!channel) {
      throw new NotFoundException('Buffer channel was not found.');
    }
    const platform = this.platformForService(channel.service);
    if (!platform) {
      throw new BadRequestException(
        `Buffer service ${channel.service} is not supported by Media Core.`,
      );
    }
    if (platform !== account.platform) {
      throw new BadRequestException(
        `This Buffer channel is ${platform}, but the Media account is ${account.platform}.`,
      );
    }
    const existing = await this.accountModel.findOne({
      _id: { $ne: account._id },
      isActive: true,
      'buffer.channelId': channel.id,
    });
    if (existing) {
      throw new BadRequestException(
        'This Buffer channel is already connected to another Media account.',
      );
    }
    await this.applyBufferConnection(account, channel);
    return account;
  }

  async disconnectAccount(accountId: string) {
    const account = await this.requireAccount(accountId);
    account.buffer = undefined;
    if (account.deliveryProvider === MediaDeliveryProvider.BUFFER) {
      account.deliveryProvider = MediaDeliveryProvider.AUTO;
    }
    await account.save();
    return account;
  }

  canHandle(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ) {
    if (!this.isConfigured()) return false;
    if (!account.buffer?.channelId) return false;
    if (
      account.buffer.isDisconnected ||
      account.buffer.isLocked ||
      account.buffer.isQueuePaused
    )
      return false;
    if (
      this.platformForService(account.buffer.service) !== publication.platform
    )
      return false;
    return this.supportsPublication(publication);
  }

  async schedule(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    dueAt: Date,
  ) {
    if (!this.canHandle(publication, account)) {
      throw new BadRequestException(
        'This publication cannot be scheduled through the connected Buffer channel.',
      );
    }
    return this.createPost(publication, account, 'customScheduled', dueAt);
  }

  async publishNow(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ) {
    if (!this.canHandle(publication, account)) {
      throw new BadRequestException(
        'This publication cannot be published through the connected Buffer channel.',
      );
    }
    return this.createPost(publication, account, 'shareNow');
  }

  async getPost(postId: string): Promise<BufferPostState> {
    this.requireConfigured();
    const data = await this.graphql<{ post: BufferPostState }>(
      `query GetBufferPost($input: PostInput!) {
        post(input: $input) {
          id
          channelId
          status
          dueAt
          sentAt
          externalLink
          error { message rawError supportUrl }
        }
      }`,
      { input: { id: postId } },
    );
    if (!data.post) throw new NotFoundException('Buffer post was not found.');
    return data.post;
  }

  private async createPost(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    mode: 'customScheduled' | 'shareNow',
    dueAt?: Date,
  ): Promise<BufferCreatePostResult> {
    const input: Record<string, unknown> = {
      text: this.publicationText(publication),
      channelId: account.buffer?.channelId,
      schedulingType: 'automatic',
      mode,
      aiAssisted: Boolean(publication.generationRunId),
      source: 'aakash-personal-os',
    };
    if (dueAt) input.dueAt = dueAt.toISOString();

    const assets = await this.bufferAssets(publication);
    // Buffer's current CreatePostInput declares assets as a non-null list.
    // Send an empty list for text-only posts rather than omitting the field.
    input.assets = assets;
    const metadata = this.bufferMetadata(publication, assets);
    if (Object.keys(metadata).length) input.metadata = metadata;

    const data = await this.graphql<{ createPost: BufferPostActionPayload }>(
      `mutation CreateBufferPost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess {
            post { id status dueAt sentAt externalLink }
          }
          ... on MutationError { message }
        }
      }`,
      { input },
    );
    const result = data.createPost;
    if (!result?.post) {
      throw new BadRequestException(
        result?.message || 'Buffer rejected the publication.',
      );
    }
    return result.post;
  }

  private async organizations() {
    const data = await this.graphql<{
      account?: { organizations?: BufferOrganization[] };
    }>(`query BufferOrganizations {
      account { organizations { id name } }
    }`);
    return (data.account?.organizations ?? []).filter((item) =>
      Boolean(item.id),
    );
  }

  private async channels(organizationId: string): Promise<BufferChannel[]> {
    const data = await this.graphql<{
      channels?: Array<Omit<BufferChannel, 'organizationId'>>;
    }>(
      `query BufferChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) {
          id
          name
          displayName
          service
          avatar
          externalLink
          isQueuePaused
          isDisconnected
          isLocked
        }
      }`,
      { organizationId },
    );
    return (data.channels ?? []).map((channel) => ({
      ...channel,
      organizationId,
    }));
  }

  private async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const apiKey = this.requireConfigured();
    const response = await fetch(BUFFER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Buffer API request failed with HTTP ${response.status}.`,
      );
    }
    const payload = (await response.json()) as BufferGraphqlEnvelope<T>;
    const message = payload.errors?.find((item) => item.message)?.message;
    if (message) throw new BadRequestException(`Buffer API: ${message}`);
    if (!payload.data) {
      throw new ServiceUnavailableException('Buffer API returned no data.');
    }
    return payload.data;
  }

  private async bufferAssets(publication: MediaPublicationDocument) {
    const records = await this.assetModel
      .find({
        publicationId: publication._id,
        isActive: true,
        status: MediaAssetStatus.READY,
        url: { $type: 'string' },
        type: {
          $in: [
            MediaAssetType.IMAGE,
            MediaAssetType.VIDEO,
            MediaAssetType.DOCUMENT,
          ],
        },
      })
      .sort({ required: -1, updatedAt: 1 })
      .lean();

    const assets = records
      .filter((asset) => this.isStablePublicUrl(asset.url))
      .map((asset) => {
        const payload = { url: asset.url };
        if (asset.type === MediaAssetType.IMAGE) return { image: payload };
        if (asset.type === MediaAssetType.VIDEO) return { video: payload };

        const metadata = asset.metadata ?? {};
        const title =
          this.stringValue(metadata.title) ||
          asset.role?.trim() ||
          publication.title?.trim();
        const thumbnailUrl = this.stringValue(metadata.thumbnailUrl);
        if (!title || !thumbnailUrl || !this.isStablePublicUrl(thumbnailUrl)) {
          throw new BadRequestException(
            'Buffer document assets require metadata.title and a stable public metadata.thumbnailUrl.',
          );
        }
        return { document: { ...payload, title, thumbnailUrl } };
      });

    if (assets.length === 0 && this.formatNeedsAsset(publication.format)) {
      throw new BadRequestException(
        'Buffer requires a stable, publicly accessible HTTPS media URL that remains available until publishing.',
      );
    }

    if (publication.platform === MediaPlatform.YOUTUBE) {
      return assets.filter((item) => 'video' in item).slice(0, 1);
    }
    if (
      [MediaPostType.REEL, MediaPostType.SHORT, MediaPostType.VIDEO].includes(
        publication.format,
      )
    ) {
      const video = assets.find((item) => 'video' in item);
      return video ? [video] : assets.slice(0, 1);
    }
    if (publication.format === MediaPostType.IMAGE) return assets.slice(0, 1);
    return assets;
  }

  private bufferMetadata(
    publication: MediaPublicationDocument,
    assets: Array<Record<string, unknown>>,
  ) {
    const aiGenerated = Boolean(publication.generationRunId);
    const metadata = publication.metadata ?? {};
    switch (publication.platform) {
      case MediaPlatform.INSTAGRAM:
        return {
          instagram: {
            type: this.bufferPostType(publication),
            shouldShareToFeed:
              publication.format !== MediaPostType.STORY &&
              this.booleanValue(metadata.instagramShareToFeed, true),
            isAiGenerated: aiGenerated,
            ...(this.stringValue(metadata.instagramFirstComment)
              ? {
                  firstComment: this.stringValue(
                    metadata.instagramFirstComment,
                  ),
                }
              : {}),
          },
        };
      case MediaPlatform.X: {
        const parts =
          publication.format === MediaPostType.THREAD &&
          publication.slides?.length
            ? publication.slides.filter((item) => Boolean(item?.trim()))
            : [];
        return {
          twitter: {
            isAiGenerated: aiGenerated,
            ...(parts.length
              ? {
                  thread: parts.map((text, index) => ({
                    text,
                    assets: index === 0 ? assets : [],
                  })),
                }
              : {}),
          },
        };
      }
      case MediaPlatform.YOUTUBE:
        return {
          youtube: {
            title:
              publication.title?.trim() ||
              this.publicationText(publication).slice(0, 100) ||
              'Untitled Short',
            categoryId: this.stringValue(metadata.youtubeCategoryId) ?? '22',
            privacy:
              this.stringValue(metadata.youtubePrivacyStatus) ?? 'public',
            madeForKids: this.booleanValue(metadata.youtubeMadeForKids, false),
            notifySubscribers: this.booleanValue(
              metadata.youtubeNotifySubscribers,
              true,
            ),
            embeddable: this.booleanValue(metadata.youtubeEmbeddable, true),
            isAiGenerated: aiGenerated,
          },
        };
      case MediaPlatform.LINKEDIN:
        return this.stringValue(metadata.linkedinFirstComment)
          ? {
              linkedin: {
                firstComment: this.stringValue(metadata.linkedinFirstComment),
              },
            }
          : {};
      default:
        return {};
    }
  }

  private bufferPostType(publication: MediaPublicationDocument) {
    if (publication.format === MediaPostType.REEL) return 'reel';
    if (publication.format === MediaPostType.STORY) return 'story';
    if (publication.format === MediaPostType.SHORT) return 'short';
    if (publication.format === MediaPostType.THREAD) return 'thread';
    if (publication.format === MediaPostType.CAROUSEL) return 'carousel';
    return 'post';
  }

  private supportsPublication(publication: MediaPublicationDocument) {
    switch (publication.platform) {
      case MediaPlatform.LINKEDIN:
        return ![
          MediaPostType.REEL,
          MediaPostType.STORY,
          MediaPostType.SHORT,
          MediaPostType.WHATSAPP_MESSAGE,
          MediaPostType.WHATSAPP_STATUS,
          MediaPostType.WHATSAPP_TEMPLATE,
        ].includes(publication.format);
      case MediaPlatform.INSTAGRAM:
        return [
          MediaPostType.IMAGE,
          MediaPostType.CAROUSEL,
          MediaPostType.REEL,
          MediaPostType.VIDEO,
          MediaPostType.STORY,
        ].includes(publication.format);
      case MediaPlatform.X:
        return [
          MediaPostType.TEXT,
          MediaPostType.IMAGE,
          MediaPostType.VIDEO,
          MediaPostType.THREAD,
        ].includes(publication.format);
      case MediaPlatform.YOUTUBE:
        return publication.format === MediaPostType.SHORT;
      default:
        return false;
    }
  }

  private formatNeedsAsset(format: MediaPostType) {
    return [
      MediaPostType.IMAGE,
      MediaPostType.CAROUSEL,
      MediaPostType.REEL,
      MediaPostType.VIDEO,
      MediaPostType.SHORT,
      MediaPostType.STORY,
    ].includes(format);
  }

  private isStablePublicUrl(value?: string) {
    if (!value?.trim()) return false;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return false;
      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.local')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  private publicationText(publication: MediaPublicationDocument) {
    if (
      publication.platform === MediaPlatform.X &&
      publication.format === MediaPostType.THREAD
    ) {
      const firstThreadPost = publication.slides?.find((item) => item?.trim());
      if (firstThreadPost) return firstThreadPost.trim();
    }

    if (publication.platform === MediaPlatform.YOUTUBE) {
      return (
        publication.description ||
        publication.caption ||
        publication.hook ||
        publication.title ||
        ''
      ).trim();
    }

    return (
      publication.caption ||
      publication.description ||
      publication.hook ||
      publication.title ||
      ''
    ).trim();
  }

  private platformForService(service: string): MediaPlatform | undefined {
    const key = service.trim().toLowerCase();
    if (key === 'linkedin') return MediaPlatform.LINKEDIN;
    if (key === 'instagram') return MediaPlatform.INSTAGRAM;
    if (key === 'twitter') return MediaPlatform.X;
    if (key === 'youtube') return MediaPlatform.YOUTUBE;
    return undefined;
  }

  private supportedPlatforms() {
    return [
      MediaPlatform.LINKEDIN,
      MediaPlatform.INSTAGRAM,
      MediaPlatform.X,
      MediaPlatform.YOUTUBE,
    ];
  }

  private policy() {
    return {
      personalOsRemainsCalendarSourceOfTruth: true,
      bufferOwnsTimedDeliveryAfterApprovedHandoff: true,
      directProviderFallbackRetained: true,
      whatsappUsesDirectOrManualDelivery: true,
      youtubeBufferSupportIsShortsOnly: true,
      stablePublicAssetUrlsRequired: true,
    };
  }

  private async applyBufferConnection(
    account: MediaAccountDocument,
    channel: BufferChannel,
  ) {
    account.buffer = this.bufferConnection(channel);
    account.deliveryProvider = MediaDeliveryProvider.BUFFER;
    account.connectionStatus =
      channel.isDisconnected || channel.isLocked
        ? MediaAccountConnectionStatus.ERROR
        : MediaAccountConnectionStatus.CONNECTED;
    account.capabilities = this.bufferCapabilities(channel);
    await account.save();
  }

  private bufferConnection(channel: BufferChannel) {
    return {
      organizationId: channel.organizationId,
      channelId: channel.id,
      service: channel.service,
      name: channel.name || undefined,
      displayName: channel.displayName || undefined,
      externalLink: channel.externalLink || undefined,
      isDisconnected: Boolean(channel.isDisconnected),
      isLocked: Boolean(channel.isLocked),
      isQueuePaused: Boolean(channel.isQueuePaused),
      lastSyncedAt: new Date(),
    };
  }

  private bufferCapabilities(channel: BufferChannel) {
    const unavailable = Boolean(
      channel.isDisconnected || channel.isLocked || channel.isQueuePaused,
    );
    return {
      canPublish: !unavailable,
      canSchedule: !unavailable,
      canReadAnalytics: false,
      canReadEngagement: false,
      canUploadAssets: false,
      requiresManualPublish: unavailable,
    };
  }

  private async requireAccount(accountId: string) {
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('Invalid Media account identifier.');
    }
    const account = await this.accountModel.findOne({
      _id: accountId,
      isActive: true,
    });
    if (!account) throw new NotFoundException('Media account was not found.');
    return account;
  }

  private apiKey() {
    return this.configService.get<string>('BUFFER_API_KEY')?.trim();
  }

  private requireConfigured() {
    const key = this.apiKey();
    if (!key) {
      throw new ServiceUnavailableException(
        'BUFFER_API_KEY is not configured on the backend.',
      );
    }
    return key;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private booleanValue(value: unknown, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown Buffer API error.';
  }
}
