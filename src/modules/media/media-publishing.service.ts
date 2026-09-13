import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { MediaBufferService } from './media-buffer.service';
import { MediaAssetStorageService } from './media-asset-storage.service';
import {
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

export interface MediaPublishResult {
  mode: 'published' | 'buffer_handed_off' | 'manual_required';
  provider: 'buffer' | 'direct' | 'manual';
  platformPostId?: string;
  bufferPostId?: string;
  bufferPostStatus?: string;
  externalPostUrl?: string;
  reason?: string;
}

@Injectable()
export class MediaPublishingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly bufferService: MediaBufferService,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    private readonly assetStorage: MediaAssetStorageService,
  ) {}

  async publish(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ): Promise<MediaPublishResult> {
    if (account.deliveryProvider === MediaDeliveryProvider.MANUAL) {
      return this.manual(
        'This Media account is configured for manual publishing.',
      );
    }

    if (
      account.capabilities?.requiresManualPublish ||
      !account.capabilities?.canPublish
    ) {
      return this.manual('This account is configured for manual publishing.');
    }

    if (
      publication.platform === MediaPlatform.WHATSAPP &&
      publication.format === MediaPostType.WHATSAPP_STATUS
    ) {
      return this.manual('WhatsApp Status requires a manual publish step.');
    }

    if (this.shouldUseBuffer(publication, account)) {
      const result = await this.bufferService.publishNow(publication, account);
      return {
        mode: result.status === 'sent' ? 'published' : 'buffer_handed_off',
        provider: 'buffer',
        bufferPostId: result.id,
        bufferPostStatus: result.status,
        externalPostUrl: result.externalLink ?? undefined,
      };
    }

    if (account.deliveryProvider === MediaDeliveryProvider.BUFFER) {
      return this.manual(
        'This execution is not supported by the connected Buffer channel. Switch the account to Auto/Direct or publish it manually.',
      );
    }

    const token = this.resolveCredential(account);
    if (!token) {
      return this.manual(
        'No direct server-side credential is configured and Buffer cannot handle this execution.',
      );
    }

    return this.publishDirect(publication, account, token);
  }

  shouldUseBuffer(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
  ) {
    if (publication.deliveryProviderUsed === MediaDeliveryProvider.DIRECT) {
      return false;
    }
    if (publication.deliveryProviderUsed === MediaDeliveryProvider.BUFFER) {
      return this.bufferService.canHandle(publication, account);
    }
    if (
      account.deliveryProvider === MediaDeliveryProvider.DIRECT ||
      account.deliveryProvider === MediaDeliveryProvider.MANUAL
    ) {
      return false;
    }
    return this.bufferService.canHandle(publication, account);
  }

  private publishDirect(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    switch (publication.platform) {
      case MediaPlatform.LINKEDIN:
        return this.publishLinkedIn(publication, account, token);
      case MediaPlatform.INSTAGRAM:
        return this.publishInstagram(publication, account, token);
      case MediaPlatform.YOUTUBE:
        return this.publishYouTube(publication, account, token);
      case MediaPlatform.X:
        return this.publishX(publication, account, token);
      case MediaPlatform.WHATSAPP:
        return this.publishWhatsApp(publication, account, token);
      default:
        return Promise.resolve(
          this.manual(
            `Automatic publishing is not configured for ${publication.platform}.`,
          ),
        );
    }
  }

  private resolveCredential(account: MediaAccountDocument) {
    const ref = account.credentialRef?.trim();
    if (ref) {
      const key = ref.startsWith('env:') ? ref.slice(4) : ref;
      const value = this.configService.get<string>(key);
      if (value?.trim()) return value.trim();
    }

    const fallback: Partial<Record<MediaPlatform, string>> = {
      [MediaPlatform.LINKEDIN]: 'LINKEDIN_ACCESS_TOKEN',
      [MediaPlatform.INSTAGRAM]: 'INSTAGRAM_ACCESS_TOKEN',
      [MediaPlatform.YOUTUBE]: 'YOUTUBE_ACCESS_TOKEN',
      [MediaPlatform.X]: 'X_ACCESS_TOKEN',
      [MediaPlatform.WHATSAPP]: 'WHATSAPP_ACCESS_TOKEN',
    };
    const key = fallback[account.platform];
    return key ? this.configService.get<string>(key)?.trim() : undefined;
  }

  private async publishLinkedIn(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    if (
      [
        MediaPostType.IMAGE,
        MediaPostType.CAROUSEL,
        MediaPostType.VIDEO,
      ].includes(publication.format)
    ) {
      const urns = this.stringArray(publication.metadata?.linkedinMediaUrns);
      if (!urns.length) {
        return this.manual(
          'LinkedIn media publishing needs prepared media URNs. Add them to publication metadata or publish this execution manually.',
        );
      }
    }

    const author = account.externalAccountId?.trim();
    if (!author) return this.manual('LinkedIn account URN is missing.');

    const text = this.publicationText(publication);
    const mediaUrns = this.stringArray(publication.metadata?.linkedinMediaUrns);
    const body: Record<string, unknown> = {
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (mediaUrns.length) {
      body.content = {
        multiImage: {
          images: mediaUrns.map((id) => ({ id })),
        },
      };
    }

    const response = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version':
          this.configService.get<string>('LINKEDIN_API_VERSION') ?? '202508',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });
    await this.assertOk(response, 'LinkedIn publish');
    const id = response.headers.get('x-restli-id') ?? undefined;
    return { mode: 'published', provider: 'direct', platformPostId: id };
  }

  private async publishInstagram(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    const instagramUserId = account.externalAccountId?.trim();
    if (!instagramUserId)
      return this.manual('Instagram account ID is missing.');
    if (publication.format === MediaPostType.CAROUSEL) {
      return this.manual(
        'Instagram carousel container preparation is not configured for this account yet.',
      );
    }

    const asset = await this.findPrimaryAsset(publication, [
      MediaAssetType.VIDEO,
      MediaAssetType.IMAGE,
    ]);
    const assetUrl = asset
      ? this.assetStorage.resolveAssetUrl(asset)
      : undefined;
    if (!asset || !assetUrl) {
      return this.manual(
        'Instagram publishing requires a ready image or video asset in Media Library/S3 or a public URL.',
      );
    }

    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    const createUrl = new URL(
      `https://graph.facebook.com/${version}/${encodeURIComponent(instagramUserId)}/media`,
    );
    createUrl.searchParams.set('access_token', token);
    createUrl.searchParams.set('caption', this.publicationText(publication));

    const isVideo = asset.type === MediaAssetType.VIDEO;
    if (publication.format === MediaPostType.STORY) {
      createUrl.searchParams.set('media_type', 'STORIES');
    } else if (
      isVideo ||
      publication.format === MediaPostType.REEL ||
      publication.format === MediaPostType.SHORT ||
      publication.format === MediaPostType.VIDEO
    ) {
      createUrl.searchParams.set('media_type', 'REELS');
    }
    createUrl.searchParams.set(isVideo ? 'video_url' : 'image_url', assetUrl);

    const createResponse = await fetch(createUrl, { method: 'POST' });
    const createPayload = await this.jsonObject(createResponse);
    await this.assertOk(
      createResponse,
      'Instagram media container creation',
      createPayload,
    );
    const creationId = this.stringValue(createPayload.id);
    if (!creationId) throw new Error('Instagram did not return a creation ID.');

    const publishUrl = new URL(
      `https://graph.facebook.com/${version}/${encodeURIComponent(instagramUserId)}/media_publish`,
    );
    publishUrl.searchParams.set('access_token', token);
    publishUrl.searchParams.set('creation_id', creationId);
    const publishResponse = await fetch(publishUrl, { method: 'POST' });
    const publishPayload = await this.jsonObject(publishResponse);
    await this.assertOk(publishResponse, 'Instagram publish', publishPayload);
    const id = this.stringValue(publishPayload.id);
    return {
      mode: 'published',
      provider: 'direct',
      platformPostId: id,
      externalPostUrl: id ? `https://www.instagram.com/p/${id}/` : undefined,
    };
  }

  private async publishYouTube(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    const asset = await this.findPrimaryAsset(publication, [
      MediaAssetType.VIDEO,
    ]);
    const assetUrl = asset
      ? this.assetStorage.resolveAssetUrl(asset)
      : undefined;
    if (!assetUrl) {
      return this.manual(
        'YouTube publishing requires a ready video asset in Media Library/S3 or a public URL.',
      );
    }

    const assetResponse = await fetch(assetUrl);
    if (!assetResponse.ok) {
      throw new Error(
        `YouTube source video could not be loaded (${assetResponse.status}).`,
      );
    }
    const contentType =
      assetResponse.headers.get('content-type') ?? 'video/mp4';
    const bytes = await assetResponse.arrayBuffer();
    const metadata = publication.metadata ?? {};
    const privacyStatus =
      this.stringValue(metadata.youtubePrivacyStatus) ?? 'public';
    const init = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': contentType,
          'X-Upload-Content-Length': String(bytes.byteLength),
        },
        body: JSON.stringify({
          snippet: {
            title: publication.title || 'Untitled video',
            description: publication.description || publication.caption || '',
          },
          status: { privacyStatus },
        }),
      },
    );
    await this.assertOk(init, 'YouTube resumable upload initialization');
    const location = init.headers.get('location');
    if (!location) throw new Error('YouTube did not return an upload URL.');
    const upload = await fetch(location, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
      },
      body: bytes,
    });
    const payload = await this.jsonObject(upload);
    await this.assertOk(upload, 'YouTube video upload', payload);
    const id = this.stringValue(payload.id);
    return {
      mode: 'published',
      provider: 'direct',
      platformPostId: id,
      externalPostUrl: id ? `https://www.youtube.com/watch?v=${id}` : undefined,
    };
  }

  private async publishX(
    publication: MediaPublicationDocument,
    _account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    const mediaIds = this.stringArray(publication.metadata?.xMediaIds);
    const hasReadyVisual = Boolean(
      await this.assetModel.exists({
        publicationId: publication._id,
        isActive: true,
        status: MediaAssetStatus.READY,
        type: { $in: [MediaAssetType.IMAGE, MediaAssetType.VIDEO] },
      }),
    );
    if (hasReadyVisual && !mediaIds.length) {
      return this.manual(
        'X media upload IDs are missing. Text can auto-publish, but this visual execution requires media upload preparation or manual publishing.',
      );
    }

    const parts =
      publication.format === MediaPostType.THREAD && publication.slides?.length
        ? publication.slides.filter(Boolean)
        : [this.publicationText(publication)];
    let previousId: string | undefined;
    for (const [index, part] of parts.entries()) {
      const body: Record<string, unknown> = { text: part };
      if (index === 0 && mediaIds.length) body.media = { media_ids: mediaIds };
      if (previousId) body.reply = { in_reply_to_tweet_id: previousId };
      const response = await fetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const payload = await this.jsonObject(response);
      await this.assertOk(response, 'X publish', payload);
      const data = this.objectValue(payload.data);
      previousId = this.stringValue(data?.id);
      if (!previousId) throw new Error('X did not return a post ID.');
    }
    return {
      mode: 'published',
      provider: 'direct',
      platformPostId: previousId,
      externalPostUrl: previousId
        ? `https://x.com/i/web/status/${previousId}`
        : undefined,
    };
  }

  private async publishWhatsApp(
    publication: MediaPublicationDocument,
    account: MediaAccountDocument,
    token: string,
  ): Promise<MediaPublishResult> {
    if (publication.format === MediaPostType.WHATSAPP_STATUS) {
      return this.manual('WhatsApp Status must be published manually.');
    }
    const metadata = {
      ...(account.metadata ?? {}),
      ...(publication.metadata ?? {}),
    };
    const phoneNumberId =
      this.stringValue(metadata.phoneNumberId) ??
      account.externalAccountId?.trim();
    const recipient = this.stringValue(metadata.recipientPhoneNumber);
    if (!phoneNumberId || !recipient) {
      return this.manual(
        'WhatsApp Business publishing requires phoneNumberId and recipientPhoneNumber metadata.',
      );
    }
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: recipient,
    };
    if (publication.format === MediaPostType.WHATSAPP_TEMPLATE) {
      const templateName = this.stringValue(metadata.templateName);
      if (!templateName) {
        return this.manual('WhatsApp templateName metadata is missing.');
      }
      body.type = 'template';
      body.template = {
        name: templateName,
        language: { code: this.stringValue(metadata.templateLanguage) ?? 'en' },
      };
    } else {
      body.type = 'text';
      body.text = {
        preview_url: true,
        body: this.publicationText(publication),
      };
    }
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'WhatsApp publish', payload);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const first = this.objectValue(messages[0]);
    return {
      mode: 'published',
      provider: 'direct',
      platformPostId: this.stringValue(first?.id),
    };
  }

  private async findPrimaryAsset(
    publication: MediaPublicationDocument,
    types: MediaAssetType[],
  ) {
    return this.assetModel
      .findOne({
        publicationId: publication._id,
        isActive: true,
        status: MediaAssetStatus.READY,
        type: { $in: types },
        $or: [
          { url: { $type: 'string' } },
          { storageKey: { $type: 'string' } },
        ],
      })
      .sort({ required: -1, updatedAt: -1 });
  }

  private publicationText(publication: MediaPublicationDocument) {
    const value =
      publication.caption ||
      publication.script ||
      publication.description ||
      publication.hook ||
      publication.title ||
      '';
    return value.trim();
  }

  private manual(reason: string): MediaPublishResult {
    return { mode: 'manual_required', provider: 'manual', reason };
  }

  private async jsonObject(
    response: Response,
  ): Promise<Record<string, unknown>> {
    const text = await response.text();
    if (!text) return {};
    try {
      const parsed: unknown = JSON.parse(text);
      return this.objectValue(parsed) ?? {};
    } catch {
      return { raw: text.slice(0, 2000) };
    }
  }

  private async assertOk(
    response: Response,
    label: string,
    payload?: Record<string, unknown>,
  ) {
    if (response.ok) return;
    const body = payload ?? (await this.jsonObject(response));
    const error = this.objectValue(body.error);
    const message =
      this.stringValue(error?.message) ??
      this.stringValue(body.message) ??
      this.stringValue(body.raw) ??
      `${response.status} ${response.statusText}`;
    throw new Error(`${label} failed: ${message}`);
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter(
          (item): item is string =>
            typeof item === 'string' && Boolean(item.trim()),
        )
      : [];
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
