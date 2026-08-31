import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import {
  MediaAccount,
  MediaAccountDocument,
} from './schemas/media-account.schema';
import {
  MediaEngagementIntent,
  MediaEngagementItem,
  MediaEngagementItemDocument,
  MediaEngagementPriority,
  MediaEngagementReplyMode,
  MediaEngagementSentiment,
  MediaEngagementSource,
  MediaEngagementStatus,
  MediaEngagementType,
} from './schemas/media-engagement-item.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import {
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

interface EngagementListQuery {
  platform?: MediaPlatform;
  status?: MediaEngagementStatus;
  priority?: MediaEngagementPriority;
  intent?: MediaEngagementIntent;
  needsResponse?: boolean;
  search?: string;
  limit?: number;
}

interface UpsertEngagementInput {
  accountId: Types.ObjectId;
  publicationId?: Types.ObjectId;
  platform: MediaPlatform;
  type: MediaEngagementType;
  source: MediaEngagementSource;
  platformEngagementId: string;
  platformParentId?: string;
  platformThreadId?: string;
  platformConversationId?: string;
  platformAuthorId?: string;
  authorUsername?: string;
  authorDisplayName?: string;
  authorProfileUrl?: string;
  text: string;
  receivedAt: Date;
  permalink?: string;
  canReply: boolean;
  replyMode: MediaEngagementReplyMode;
  replyRestriction?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  accountId: string;
  platform: MediaPlatform;
  fetched: number;
  upserted: number;
  note?: string;
}

interface AiEngagementDraft {
  summary: string;
  priority: MediaEngagementPriority;
  sentiment: MediaEngagementSentiment;
  intent: MediaEngagementIntent;
  needsResponse: boolean;
  suggestedReply: string;
}

@Injectable()
export class MediaEngagementService {
  constructor(
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccount>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublication>,
    @InjectModel(MediaEngagementItem.name)
    private readonly engagementModel: Model<MediaEngagementItem>,
  ) {}

  async overview(days = 30) {
    const normalizedDays = Math.min(Math.max(Math.trunc(days || 30), 1), 365);
    const since = new Date(Date.now() - normalizedDays * 86_400_000);
    const [items, accounts] = await Promise.all([
      this.engagementModel
        .find({ isActive: true, receivedAt: { $gte: since } })
        .sort({ receivedAt: -1 })
        .limit(500)
        .lean(),
      this.accountModel.find({ isActive: true }).sort({ platform: 1 }).lean(),
    ]);

    const actionable = items.filter((item) =>
      [
        MediaEngagementStatus.NEW,
        MediaEngagementStatus.OPEN,
        MediaEngagementStatus.DRAFTED,
        MediaEngagementStatus.FAILED,
      ].includes(item.status),
    );

    const byPlatform = Object.values(MediaPlatform).map((platform) => {
      const platformItems = items.filter((item) => item.platform === platform);
      return {
        platform,
        total: platformItems.length,
        needsResponse: platformItems.filter(
          (item) =>
            item.needsResponse && item.status !== MediaEngagementStatus.REPLIED,
        ).length,
        replied: platformItems.filter(
          (item) => item.status === MediaEngagementStatus.REPLIED,
        ).length,
      };
    });

    return {
      rangeDays: normalizedDays,
      total: items.length,
      new: items.filter((item) => item.status === MediaEngagementStatus.NEW)
        .length,
      open: items.filter((item) => item.status === MediaEngagementStatus.OPEN)
        .length,
      drafted: items.filter(
        (item) => item.status === MediaEngagementStatus.DRAFTED,
      ).length,
      replied: items.filter(
        (item) => item.status === MediaEngagementStatus.REPLIED,
      ).length,
      urgent: actionable.filter(
        (item) => item.priority === MediaEngagementPriority.URGENT,
      ).length,
      needsResponse: actionable.filter((item) => item.needsResponse).length,
      byPlatform,
      recent: actionable.slice(0, 40),
      accounts: accounts.map((account) => ({
        _id: account._id,
        platform: account.platform,
        displayName: account.displayName,
        canReadEngagement: Boolean(account.capabilities?.canReadEngagement),
        credentialConfigured: Boolean(
          this.resolveReadCredentialFromLean(account),
        ),
        readCredentialConfigured: Boolean(
          this.resolveReadCredentialFromLean(account),
        ),
        writeCredentialConfigured: Boolean(
          this.resolveWriteCredentialFromLean(account),
        ),
        syncMode:
          account.platform === MediaPlatform.WHATSAPP
            ? 'webhook'
            : 'polling_and_webhook',
      })),
    };
  }

  async list(query: EngagementListQuery = {}) {
    const filter: Record<string, unknown> = { isActive: true };
    if (query.platform) filter.platform = query.platform;
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.intent) filter.intent = query.intent;
    if (query.needsResponse !== undefined) {
      filter.needsResponse = query.needsResponse;
    }
    if (query.search?.trim()) {
      filter.$text = { $search: query.search.trim() };
    }

    const limit = Math.min(Math.max(Math.trunc(query.limit ?? 100), 1), 300);
    return this.engagementModel
      .find(filter)
      .sort({ priority: -1, receivedAt: -1 })
      .limit(limit)
      .lean();
  }

  async getItem(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid Media engagement item ID.');
    }
    const item = await this.engagementModel.findById(id).lean();
    if (!item || !item.isActive) {
      throw new NotFoundException('Media engagement item not found.');
    }
    return item;
  }

  async syncAll(limitPerAccount = 100) {
    const accounts = await this.accountModel
      .find({
        isActive: true,
        platform: {
          $in: [
            MediaPlatform.LINKEDIN,
            MediaPlatform.INSTAGRAM,
            MediaPlatform.YOUTUBE,
            MediaPlatform.X,
            MediaPlatform.WHATSAPP,
          ],
        },
      })
      .sort({ platform: 1 });

    const results: SyncResult[] = [];
    const failures: Array<{
      accountId: string;
      platform: MediaPlatform;
      error: string;
    }> = [];
    for (const account of accounts) {
      try {
        results.push(await this.syncAccountDocument(account, limitPerAccount));
      } catch (error) {
        failures.push({
          accountId: account._id.toString(),
          platform: account.platform,
          error:
            error instanceof Error ? error.message : 'Engagement sync failed.',
        });
      }
    }

    return {
      attempted: accounts.length,
      synced: results,
      failures,
    };
  }

  async syncAccount(accountId: string, limit = 100) {
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('Invalid Media account ID.');
    }
    const account = await this.accountModel.findById(accountId);
    if (!account || !account.isActive) {
      throw new NotFoundException('Media account not found.');
    }
    return this.syncAccountDocument(account, limit);
  }

  async draftReply(
    id: string,
    options: { force?: boolean; instructions?: string } = {},
  ) {
    const item = await this.requireItem(id);
    if (item.suggestedReply?.trim() && !options.force) {
      return item;
    }

    const publication = item.publicationId
      ? await this.publicationModel.findById(item.publicationId).lean()
      : null;

    const fallback = this.fallbackAnalysis(item.text);
    let analysis = fallback;
    let model: string | undefined;
    let responseId: string | undefined;

    try {
      const response =
        await this.aiService.generateStructuredResponse<AiEngagementDraft>({
          name: 'hsakaa_media_engagement_reply',
          instructions: [
            'You are HSAKAA managing Aakash’s social engagement inbox.',
            'Classify the inbound engagement and draft a concise, human, platform-native response.',
            'Never invent facts, promises, availability, prices, metrics or personal knowledge.',
            'Do not sound like a generic AI assistant or overuse gratitude/exclamation marks.',
            'For criticism, be calm and non-defensive. For genuine questions, answer only what is supported by the provided context.',
            'For leads or collaboration interest, acknowledge the intent without committing to a deal or meeting that has not been approved.',
            'Mark spam as not needing a response. Keep suggestedReply empty when no response is appropriate.',
          ].join('\n'),
          input: JSON.stringify({
            platform: item.platform,
            type: item.type,
            author: item.authorUsername ?? item.authorDisplayName ?? null,
            text: item.text,
            publication: publication
              ? {
                  title: publication.title,
                  caption: publication.caption,
                  description: publication.description,
                }
              : null,
            instructions: options.instructions?.trim() || null,
          }),
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              priority: {
                type: 'string',
                enum: Object.values(MediaEngagementPriority),
              },
              sentiment: {
                type: 'string',
                enum: Object.values(MediaEngagementSentiment),
              },
              intent: {
                type: 'string',
                enum: Object.values(MediaEngagementIntent),
              },
              needsResponse: { type: 'boolean' },
              suggestedReply: { type: 'string' },
            },
            required: [
              'summary',
              'priority',
              'sentiment',
              'intent',
              'needsResponse',
              'suggestedReply',
            ],
            additionalProperties: false,
          },
          verbosity: 'low',
        });
      analysis = response.data;
      model = response.model;
      responseId = response.responseId;
    } catch {
      analysis = fallback;
    }

    item.aiSummary = analysis.summary.trim();
    item.priority = analysis.priority;
    item.sentiment = analysis.sentiment;
    item.intent = analysis.intent;
    item.needsResponse = analysis.needsResponse;
    item.suggestedReply = analysis.suggestedReply.trim();
    item.suggestedReplyGeneratedAt = new Date();
    item.aiModel = model;
    item.aiResponseId = responseId;
    if (
      item.status === MediaEngagementStatus.NEW ||
      item.status === MediaEngagementStatus.OPEN
    ) {
      item.status = item.suggestedReply
        ? MediaEngagementStatus.DRAFTED
        : MediaEngagementStatus.OPEN;
    }
    await item.save();
    return item;
  }

  async sendReply(id: string, text: string) {
    const item = await this.requireItem(id);
    const normalizedText = text.trim();
    if (!normalizedText) {
      throw new BadRequestException('Reply text is required.');
    }
    if (
      !item.canReply ||
      item.replyMode === MediaEngagementReplyMode.UNAVAILABLE
    ) {
      throw new BadRequestException(
        item.replyRestriction ||
          'This engagement cannot be replied to automatically.',
      );
    }

    const account = await this.accountModel.findById(item.accountId);
    if (!account || !account.isActive) {
      throw new NotFoundException('Media account not found.');
    }
    const token = this.resolveWriteCredential(account);
    if (!token) {
      throw new BadRequestException(
        'No server-side write credential is configured for this Media account.',
      );
    }

    try {
      const result = await this.sendPlatformReply(
        item,
        account,
        token,
        normalizedText,
      );
      item.status = MediaEngagementStatus.REPLIED;
      item.replyText = normalizedText;
      item.repliedAt = new Date();
      item.replyExternalId = result.id;
      item.replyProvider = 'direct';
      item.lastError = undefined;
      await item.save();
      return item;
    } catch (error) {
      item.status = MediaEngagementStatus.FAILED;
      item.lastError =
        error instanceof Error ? error.message : 'Engagement reply failed.';
      await item.save();
      throw error;
    }
  }

  async updateStatus(id: string, status: MediaEngagementStatus) {
    const item = await this.requireItem(id);
    item.status = status;
    if (
      status === MediaEngagementStatus.IGNORED ||
      status === MediaEngagementStatus.ARCHIVED
    ) {
      item.needsResponse = false;
    }
    await item.save();
    return item;
  }

  async ingestWebhook(platform: MediaPlatform, payload: unknown) {
    if (platform === MediaPlatform.INSTAGRAM) {
      return this.ingestInstagramWebhook(payload);
    }
    if (platform === MediaPlatform.WHATSAPP) {
      return this.ingestWhatsAppWebhook(payload);
    }
    throw new BadRequestException(
      `Webhook ingestion is not configured for ${platform}.`,
    );
  }

  verifyWebhook(mode?: string, token?: string, challenge?: string) {
    const expected = this.configService
      .get<string>('MEDIA_ENGAGEMENT_WEBHOOK_VERIFY_TOKEN')
      ?.trim();
    if (!expected) {
      throw new BadRequestException(
        'MEDIA_ENGAGEMENT_WEBHOOK_VERIFY_TOKEN is not configured.',
      );
    }
    if (mode !== 'subscribe' || token !== expected || !challenge) {
      throw new BadRequestException('Invalid webhook verification request.');
    }
    return challenge;
  }

  private async syncAccountDocument(
    account: MediaAccountDocument,
    limit: number,
  ): Promise<SyncResult> {
    const normalizedLimit = Math.min(
      Math.max(Math.trunc(limit || 100), 1),
      100,
    );
    switch (account.platform) {
      case MediaPlatform.LINKEDIN:
        return this.syncLinkedIn(account, normalizedLimit);
      case MediaPlatform.INSTAGRAM:
        return this.syncInstagram(account, normalizedLimit);
      case MediaPlatform.YOUTUBE:
        return this.syncYouTube(account, normalizedLimit);
      case MediaPlatform.X:
        return this.syncX(account, normalizedLimit);
      case MediaPlatform.WHATSAPP:
        return {
          accountId: account._id.toString(),
          platform: account.platform,
          fetched: 0,
          upserted: 0,
          note: 'WhatsApp engagement is received through Cloud API webhooks.',
        };
      default:
        return {
          accountId: account._id.toString(),
          platform: account.platform,
          fetched: 0,
          upserted: 0,
          note: 'Engagement sync is not configured for this platform.',
        };
    }
  }

  private async syncLinkedIn(
    account: MediaAccountDocument,
    limit: number,
  ): Promise<SyncResult> {
    const token = this.resolveReadCredential(account);
    if (!token) {
      return this.notConfigured(account, 'LinkedIn access token is missing.');
    }
    const publications = await this.recentPublications(account, 20);
    let fetched = 0;
    let upserted = 0;
    const version =
      this.configService.get<string>('LINKEDIN_API_VERSION') ?? '202604';

    for (const publication of publications) {
      if (!publication.platformPostId) continue;
      const target = encodeURIComponent(publication.platformPostId);
      const response = await fetch(
        `https://api.linkedin.com/rest/socialActions/${target}/comments`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'LinkedIn-Version': version,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        },
      );
      if (!response.ok) continue;
      const payload = await this.jsonObject(response);
      const elements = Array.isArray(payload.elements) ? payload.elements : [];
      for (const raw of elements.slice(0, limit)) {
        const comment = this.objectValue(raw);
        if (!comment) continue;
        const message = this.objectValue(comment.message);
        const created = this.objectValue(comment.created);
        const id =
          this.stringValue(comment.commentUrn) ?? this.stringValue(comment.id);
        const text = this.stringValue(message?.text);
        if (!id || !text) continue;
        fetched += 1;
        const actor = this.stringValue(comment.actor);
        const result = await this.upsertEngagement({
          accountId: account._id,
          publicationId: publication._id,
          platform: MediaPlatform.LINKEDIN,
          type: comment.parentComment
            ? MediaEngagementType.COMMENT_REPLY
            : MediaEngagementType.COMMENT,
          source: MediaEngagementSource.API,
          platformEngagementId: id,
          platformParentId: publication.platformPostId,
          platformThreadId: publication.platformPostId,
          platformAuthorId: actor,
          text,
          receivedAt: new Date(this.numberValue(created?.time) ?? Date.now()),
          canReply: true,
          replyMode: MediaEngagementReplyMode.PUBLIC,
          metadata: {
            commentId: this.stringValue(comment.id),
            parentComment: this.stringValue(comment.parentComment),
          },
        });
        if (result) upserted += 1;
      }
    }

    return {
      accountId: account._id.toString(),
      platform: account.platform,
      fetched,
      upserted,
      note: 'LinkedIn member comment retrieval requires the relevant Community Management feed permissions.',
    };
  }

  private async syncInstagram(
    account: MediaAccountDocument,
    limit: number,
  ): Promise<SyncResult> {
    const token = this.resolveReadCredential(account);
    if (!token) {
      return this.notConfigured(account, 'Instagram access token is missing.');
    }
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    const publications = await this.recentPublications(account, 25);
    let fetched = 0;
    let upserted = 0;

    for (const publication of publications) {
      if (!publication.platformPostId) continue;
      const url = new URL(
        `https://graph.instagram.com/${version}/${encodeURIComponent(publication.platformPostId)}/comments`,
      );
      url.searchParams.set(
        'fields',
        'id,text,timestamp,from,parent_id,username',
      );
      url.searchParams.set('limit', String(limit));
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) continue;
      const payload = await this.jsonObject(response);
      const data = Array.isArray(payload.data) ? payload.data : [];
      for (const raw of data) {
        const comment = this.objectValue(raw);
        if (!comment) continue;
        const id = this.stringValue(comment.id);
        const text = this.stringValue(comment.text);
        if (!id || !text) continue;
        const from = this.objectValue(comment.from);
        fetched += 1;
        const result = await this.upsertEngagement({
          accountId: account._id,
          publicationId: publication._id,
          platform: MediaPlatform.INSTAGRAM,
          type: comment.parent_id
            ? MediaEngagementType.COMMENT_REPLY
            : MediaEngagementType.COMMENT,
          source: MediaEngagementSource.API,
          platformEngagementId: id,
          platformParentId: publication.platformPostId,
          platformThreadId: publication.platformPostId,
          platformAuthorId: this.stringValue(from?.id),
          authorUsername:
            this.stringValue(from?.username) ??
            this.stringValue(comment.username),
          text,
          receivedAt: this.dateValue(comment.timestamp) ?? new Date(),
          canReply: true,
          replyMode: MediaEngagementReplyMode.PUBLIC,
        });
        if (result) upserted += 1;
      }
    }

    return {
      accountId: account._id.toString(),
      platform: account.platform,
      fetched,
      upserted,
    };
  }

  private async syncYouTube(
    account: MediaAccountDocument,
    limit: number,
  ): Promise<SyncResult> {
    const channelId = account.externalAccountId?.trim();
    if (!channelId) {
      return this.notConfigured(account, 'YouTube channel ID is missing.');
    }
    const token = this.resolveReadCredential(account);
    const writeToken = this.resolveWriteCredential(account);
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY')?.trim();
    if (!token && !apiKey) {
      return this.notConfigured(
        account,
        'YouTube OAuth token or API key is missing.',
      );
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads');
    url.searchParams.set('part', 'snippet,replies');
    url.searchParams.set('allThreadsRelatedToChannelId', channelId);
    url.searchParams.set('order', 'time');
    url.searchParams.set('textFormat', 'plainText');
    url.searchParams.set('maxResults', String(limit));
    if (!token && apiKey) url.searchParams.set('key', apiKey);
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    await this.assertOk(response, 'YouTube engagement sync');
    const payload = await this.jsonObject(response);
    const items = Array.isArray(payload.items) ? payload.items : [];
    let fetched = 0;
    let upserted = 0;

    for (const raw of items) {
      const thread = this.objectValue(raw);
      const snippet = this.objectValue(thread?.snippet);
      const topLevel = this.objectValue(snippet?.topLevelComment);
      const commentSnippet = this.objectValue(topLevel?.snippet);
      const authorChannel = this.objectValue(commentSnippet?.authorChannelId);
      const authorChannelId = this.stringValue(authorChannel?.value);
      const id = this.stringValue(topLevel?.id);
      const text =
        this.stringValue(commentSnippet?.textOriginal) ??
        this.stringValue(commentSnippet?.textDisplay);
      const videoId = this.stringValue(snippet?.videoId);
      if (
        id &&
        text &&
        (!authorChannelId || authorChannelId !== account.externalAccountId)
      ) {
        fetched += 1;
        const publication = videoId
          ? await this.findPublicationByPlatformId(account._id, videoId)
          : null;
        const result = await this.upsertEngagement({
          accountId: account._id,
          publicationId: publication?._id,
          platform: MediaPlatform.YOUTUBE,
          type: MediaEngagementType.COMMENT,
          source: MediaEngagementSource.API,
          platformEngagementId: id,
          platformParentId: videoId,
          platformThreadId: this.stringValue(thread?.id),
          platformAuthorId: authorChannelId,
          authorDisplayName: this.stringValue(
            commentSnippet?.authorDisplayName,
          ),
          authorProfileUrl: this.stringValue(commentSnippet?.authorChannelUrl),
          text,
          receivedAt: this.dateValue(commentSnippet?.publishedAt) ?? new Date(),
          permalink: videoId
            ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&lc=${encodeURIComponent(id)}`
            : undefined,
          canReply: Boolean(writeToken),
          replyMode: writeToken
            ? MediaEngagementReplyMode.PUBLIC
            : MediaEngagementReplyMode.UNAVAILABLE,
          replyRestriction: writeToken
            ? undefined
            : 'YouTube replies require an OAuth token with youtube.force-ssl scope.',
        });
        if (result) upserted += 1;
      }

      const replies = this.objectValue(thread?.replies);
      const replyComments = Array.isArray(replies?.comments)
        ? replies.comments
        : [];
      for (const replyRaw of replyComments) {
        const reply = this.objectValue(replyRaw);
        const replySnippet = this.objectValue(reply?.snippet);
        const replyAuthorChannel = this.objectValue(
          replySnippet?.authorChannelId,
        );
        const replyAuthorId = this.stringValue(replyAuthorChannel?.value);
        const replyId = this.stringValue(reply?.id);
        const replyText =
          this.stringValue(replySnippet?.textOriginal) ??
          this.stringValue(replySnippet?.textDisplay);
        if (
          !replyId ||
          !replyText ||
          (replyAuthorId && replyAuthorId === account.externalAccountId)
        ) {
          continue;
        }
        fetched += 1;
        const publication = videoId
          ? await this.findPublicationByPlatformId(account._id, videoId)
          : null;
        const result = await this.upsertEngagement({
          accountId: account._id,
          publicationId: publication?._id,
          platform: MediaPlatform.YOUTUBE,
          type: MediaEngagementType.COMMENT_REPLY,
          source: MediaEngagementSource.API,
          platformEngagementId: replyId,
          platformParentId: id,
          platformThreadId: this.stringValue(thread?.id),
          platformAuthorId: replyAuthorId,
          authorDisplayName: this.stringValue(replySnippet?.authorDisplayName),
          authorProfileUrl: this.stringValue(replySnippet?.authorChannelUrl),
          text: replyText,
          receivedAt: this.dateValue(replySnippet?.publishedAt) ?? new Date(),
          canReply: Boolean(writeToken),
          replyMode: writeToken
            ? MediaEngagementReplyMode.PUBLIC
            : MediaEngagementReplyMode.UNAVAILABLE,
          replyRestriction: writeToken
            ? undefined
            : 'YouTube replies require an OAuth token with youtube.force-ssl scope.',
        });
        if (result) upserted += 1;
      }
    }

    return {
      accountId: account._id.toString(),
      platform: account.platform,
      fetched,
      upserted,
    };
  }

  private async syncX(
    account: MediaAccountDocument,
    limit: number,
  ): Promise<SyncResult> {
    const userId = account.externalAccountId?.trim();
    if (!userId) return this.notConfigured(account, 'X user ID is missing.');
    const token = this.resolveReadCredential(account);
    const writeToken = this.resolveWriteCredential(account);
    if (!token) {
      return this.notConfigured(account, 'X read credential is missing.');
    }

    const url = new URL(
      `https://api.x.com/2/users/${encodeURIComponent(userId)}/mentions`,
    );
    url.searchParams.set('max_results', String(Math.max(limit, 5)));
    url.searchParams.set(
      'tweet.fields',
      'author_id,created_at,conversation_id,referenced_tweets',
    );
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'id,name,username,profile_image_url');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await this.assertOk(response, 'X mentions sync');
    const payload = await this.jsonObject(response);
    const data = Array.isArray(payload.data) ? payload.data : [];
    const includes = this.objectValue(payload.includes);
    const users = Array.isArray(includes?.users) ? includes.users : [];
    const userMap = new Map<string, Record<string, unknown>>();
    for (const rawUser of users) {
      const user = this.objectValue(rawUser);
      const id = this.stringValue(user?.id);
      if (id && user) userMap.set(id, user);
    }
    let fetched = 0;
    let upserted = 0;

    for (const raw of data.slice(0, limit)) {
      const post = this.objectValue(raw);
      const id = this.stringValue(post?.id);
      const text = this.stringValue(post?.text);
      if (!id || !text) continue;
      const authorId = this.stringValue(post?.author_id);
      const author = authorId ? userMap.get(authorId) : undefined;
      const username = this.stringValue(author?.username);
      fetched += 1;
      const result = await this.upsertEngagement({
        accountId: account._id,
        platform: MediaPlatform.X,
        type: MediaEngagementType.MENTION,
        source: MediaEngagementSource.API,
        platformEngagementId: id,
        platformThreadId: this.stringValue(post?.conversation_id),
        platformAuthorId: authorId,
        authorUsername: username,
        authorDisplayName: this.stringValue(author?.name),
        authorProfileUrl: username ? `https://x.com/${username}` : undefined,
        text,
        receivedAt: this.dateValue(post?.created_at) ?? new Date(),
        permalink: username
          ? `https://x.com/${username}/status/${id}`
          : undefined,
        canReply: Boolean(writeToken),
        replyMode: writeToken
          ? MediaEngagementReplyMode.PUBLIC
          : MediaEngagementReplyMode.UNAVAILABLE,
        replyRestriction: writeToken
          ? 'X self-serve API replies are allowed only when the original author explicitly mentioned or quoted this account. Mention-timeline items satisfy the mention case.'
          : 'X mentions can be read with X_BEARER_TOKEN, but replies require a user-context X_ACCESS_TOKEN with write permission.',
      });
      if (result) upserted += 1;
    }

    return {
      accountId: account._id.toString(),
      platform: account.platform,
      fetched,
      upserted,
    };
  }

  private async ingestInstagramWebhook(payload: unknown) {
    const root = this.objectValue(payload);
    const entries = Array.isArray(root?.entry) ? root.entry : [];
    let processed = 0;
    for (const rawEntry of entries) {
      const entry = this.objectValue(rawEntry);
      const accountExternalId = this.stringValue(entry?.id);
      if (!accountExternalId) continue;
      const account = await this.accountModel.findOne({
        platform: MediaPlatform.INSTAGRAM,
        isActive: true,
        externalAccountId: accountExternalId,
      });
      if (!account) continue;

      const directField = this.stringValue(entry?.field);
      const directValue = this.objectValue(entry?.value);
      if (
        (directField === 'comments' || directField === 'live_comments') &&
        directValue
      ) {
        processed += await this.ingestInstagramCommentValue(
          account,
          directValue,
        );
      }

      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const rawChange of changes) {
        const change = this.objectValue(rawChange);
        const field = this.stringValue(change?.field);
        const value = this.objectValue(change?.value);
        if ((field === 'comments' || field === 'live_comments') && value) {
          processed += await this.ingestInstagramCommentValue(account, value);
        }
      }

      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const rawMessage of messaging) {
        const event = this.objectValue(rawMessage);
        const message = this.objectValue(event?.message);
        const sender = this.objectValue(event?.sender);
        const id = this.stringValue(message?.mid);
        const text = this.stringValue(message?.text);
        if (!id || !text) continue;
        const result = await this.upsertEngagement({
          accountId: account._id,
          platform: MediaPlatform.INSTAGRAM,
          type: MediaEngagementType.DIRECT_MESSAGE,
          source: MediaEngagementSource.WEBHOOK,
          platformEngagementId: id,
          platformConversationId: this.stringValue(event?.conversation_id),
          platformAuthorId: this.stringValue(sender?.id),
          text,
          receivedAt: new Date(
            this.numberValue(event?.timestamp) ?? Date.now(),
          ),
          canReply: Boolean(this.resolveWriteCredential(account)),
          replyMode: MediaEngagementReplyMode.MESSAGE,
        });
        if (result) processed += 1;
      }
    }
    return { processed };
  }

  private async ingestInstagramCommentValue(
    account: MediaAccountDocument,
    value: Record<string, unknown>,
  ) {
    const id = this.stringValue(value.id);
    const text = this.stringValue(value.text);
    if (!id || !text) return 0;
    const from = this.objectValue(value.from);
    const media = this.objectValue(value.media);
    const mediaId = this.stringValue(media?.id);
    const publication = mediaId
      ? await this.findPublicationByPlatformId(account._id, mediaId)
      : null;
    const result = await this.upsertEngagement({
      accountId: account._id,
      publicationId: publication?._id,
      platform: MediaPlatform.INSTAGRAM,
      type: MediaEngagementType.COMMENT,
      source: MediaEngagementSource.WEBHOOK,
      platformEngagementId: id,
      platformParentId: mediaId,
      platformThreadId: mediaId,
      platformAuthorId: this.stringValue(from?.id),
      authorUsername: this.stringValue(from?.username),
      text,
      receivedAt: new Date(),
      canReply: Boolean(this.resolveWriteCredential(account)),
      replyMode: MediaEngagementReplyMode.PUBLIC,
      metadata: {
        mediaProductType: this.stringValue(media?.media_product_type),
      },
    });
    return result ? 1 : 0;
  }

  private async ingestWhatsAppWebhook(payload: unknown) {
    const root = this.objectValue(payload);
    const entries = Array.isArray(root?.entry) ? root.entry : [];
    let processed = 0;
    for (const rawEntry of entries) {
      const entry = this.objectValue(rawEntry);
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const rawChange of changes) {
        const change = this.objectValue(rawChange);
        const value = this.objectValue(change?.value);
        const metadata = this.objectValue(value?.metadata);
        const phoneNumberId = this.stringValue(metadata?.phone_number_id);
        if (!phoneNumberId) continue;
        const account = await this.accountModel.findOne({
          platform: MediaPlatform.WHATSAPP,
          isActive: true,
          $or: [
            { externalAccountId: phoneNumberId },
            { 'metadata.phoneNumberId': phoneNumberId },
          ],
        });
        if (!account) continue;
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const firstContact = this.objectValue(contacts[0]);
        const profile = this.objectValue(firstContact?.profile);
        for (const rawMessage of messages) {
          const message = this.objectValue(rawMessage);
          const id = this.stringValue(message?.id);
          const from = this.stringValue(message?.from);
          if (!id || !from) continue;
          const textObject = this.objectValue(message?.text);
          const buttonObject = this.objectValue(message?.button);
          const interactive = this.objectValue(message?.interactive);
          const text =
            this.stringValue(textObject?.body) ??
            this.stringValue(buttonObject?.text) ??
            this.stringValue(interactive?.type) ??
            `[${this.stringValue(message?.type) ?? 'message'}]`;
          const context = this.objectValue(message?.context);
          const result = await this.upsertEngagement({
            accountId: account._id,
            platform: MediaPlatform.WHATSAPP,
            type: MediaEngagementType.WHATSAPP_MESSAGE,
            source: MediaEngagementSource.WEBHOOK,
            platformEngagementId: id,
            platformParentId: this.stringValue(context?.id),
            platformAuthorId: from,
            authorDisplayName: this.stringValue(profile?.name),
            text,
            receivedAt: new Date(
              (this.numberValue(message?.timestamp) ?? Date.now() / 1000) *
                1000,
            ),
            canReply: Boolean(this.resolveWriteCredential(account)),
            replyMode: MediaEngagementReplyMode.MESSAGE,
            metadata: {
              phoneNumberId,
              messageType: this.stringValue(message?.type),
            },
          });
          if (result) processed += 1;
        }
      }
    }
    return { processed };
  }

  private async sendPlatformReply(
    item: MediaEngagementItemDocument,
    account: MediaAccountDocument,
    token: string,
    text: string,
  ): Promise<{ id?: string }> {
    switch (item.platform) {
      case MediaPlatform.LINKEDIN:
        return this.replyLinkedIn(item, account, token, text);
      case MediaPlatform.INSTAGRAM:
        return this.replyInstagram(item, account, token, text);
      case MediaPlatform.YOUTUBE:
        return this.replyYouTube(item, token, text);
      case MediaPlatform.X:
        return this.replyX(item, token, text);
      case MediaPlatform.WHATSAPP:
        return this.replyWhatsApp(item, account, token, text);
      default:
        throw new BadRequestException(
          `Automatic engagement replies are not configured for ${item.platform}.`,
        );
    }
  }

  private async replyLinkedIn(
    item: MediaEngagementItemDocument,
    account: MediaAccountDocument,
    token: string,
    text: string,
  ) {
    const actor = account.externalAccountId?.trim();
    const object = item.platformParentId?.trim();
    if (!actor || !object) {
      throw new BadRequestException(
        'LinkedIn reply requires the account actor URN and original post URN.',
      );
    }
    const version =
      this.configService.get<string>('LINKEDIN_API_VERSION') ?? '202604';
    const target = encodeURIComponent(item.platformEngagementId);
    const response = await fetch(
      `https://api.linkedin.com/rest/socialActions/${target}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'LinkedIn-Version': version,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor,
          object,
          parentComment: item.platformEngagementId,
          message: { text },
        }),
      },
    );
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'LinkedIn comment reply', payload);
    return {
      id:
        response.headers.get('x-restli-id') ??
        this.stringValue(payload.commentUrn) ??
        this.stringValue(payload.id),
    };
  }

  private async replyInstagram(
    item: MediaEngagementItemDocument,
    account: MediaAccountDocument,
    token: string,
    text: string,
  ) {
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    if (item.type === MediaEngagementType.DIRECT_MESSAGE) {
      const accountId = account.externalAccountId?.trim();
      if (!accountId || !item.platformAuthorId) {
        throw new BadRequestException(
          'Instagram message reply requires account and sender IDs.',
        );
      }
      const response = await fetch(
        `https://graph.instagram.com/${version}/${encodeURIComponent(accountId)}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient: { id: item.platformAuthorId },
            message: { text },
          }),
        },
      );
      const payload = await this.jsonObject(response);
      await this.assertOk(response, 'Instagram message reply', payload);
      return { id: this.stringValue(payload.message_id) };
    }

    const response = await fetch(
      `https://graph.instagram.com/${version}/${encodeURIComponent(item.platformEngagementId)}/replies`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      },
    );
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'Instagram comment reply', payload);
    return { id: this.stringValue(payload.id) };
  }

  private async replyYouTube(
    item: MediaEngagementItemDocument,
    token: string,
    text: string,
  ) {
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/comments?part=snippet',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            parentId: item.platformEngagementId,
            textOriginal: text,
          },
        }),
      },
    );
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'YouTube comment reply', payload);
    return { id: this.stringValue(payload.id) };
  }

  private async replyX(
    item: MediaEngagementItemDocument,
    token: string,
    text: string,
  ) {
    const response = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        reply: { in_reply_to_tweet_id: item.platformEngagementId },
      }),
    });
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'X reply', payload);
    const data = this.objectValue(payload.data);
    return { id: this.stringValue(data?.id) };
  }

  private async replyWhatsApp(
    item: MediaEngagementItemDocument,
    account: MediaAccountDocument,
    token: string,
    text: string,
  ) {
    const phoneNumberId =
      this.stringValue(item.metadata?.phoneNumberId) ??
      this.stringValue(account.metadata?.phoneNumberId) ??
      account.externalAccountId?.trim();
    if (!phoneNumberId || !item.platformAuthorId) {
      throw new BadRequestException(
        'WhatsApp reply requires phoneNumberId and sender number.',
      );
    }
    const version =
      this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
    const response = await fetch(
      `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: item.platformAuthorId,
          context: { message_id: item.platformEngagementId },
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      },
    );
    const payload = await this.jsonObject(response);
    await this.assertOk(response, 'WhatsApp reply', payload);
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const first = this.objectValue(messages[0]);
    return { id: this.stringValue(first?.id) };
  }

  private async upsertEngagement(input: UpsertEngagementInput) {
    const existing = await this.engagementModel.findOne({
      accountId: input.accountId,
      platformEngagementId: input.platformEngagementId,
    });
    if (existing) {
      existing.lastSyncedAt = new Date();
      existing.text = input.text;
      existing.canReply = input.canReply;
      existing.replyMode = input.replyMode;
      existing.replyRestriction = input.replyRestriction;
      existing.metadata = {
        ...(existing.metadata ?? {}),
        ...(input.metadata ?? {}),
      };
      await existing.save();
      return false;
    }

    const defaults = this.fallbackAnalysis(input.text);
    await this.engagementModel.create({
      ...input,
      status: MediaEngagementStatus.NEW,
      priority: defaults.priority,
      sentiment: defaults.sentiment,
      intent: defaults.intent,
      needsResponse: defaults.needsResponse,
      lastSyncedAt: new Date(),
      metadata: input.metadata ?? {},
      isActive: true,
    });
    return true;
  }

  private fallbackAnalysis(text: string): AiEngagementDraft {
    const normalized = text.toLowerCase();
    const looksSpam =
      /(crypto|forex|dm me for promotion|paid promotion|guaranteed followers)/i.test(
        text,
      );
    const looksLead =
      /(demo|price|pricing|work with|hire|collab|collaborat|partnership|interested)/i.test(
        text,
      );
    const looksSupport = /(not working|error|issue|problem|help|support)/i.test(
      text,
    );
    const looksNegative =
      /(bad|terrible|hate|wrong|disappoint|scam|useless)/i.test(text);
    const isQuestion =
      text.includes('?') ||
      /^(how|what|why|when|where|can|could|would|do|does|is|are)\b/i.test(
        text.trim(),
      );
    const intent = looksSpam
      ? MediaEngagementIntent.SPAM
      : looksLead
        ? MediaEngagementIntent.LEAD
        : looksSupport
          ? MediaEngagementIntent.SUPPORT
          : isQuestion
            ? MediaEngagementIntent.QUESTION
            : looksNegative
              ? MediaEngagementIntent.CRITICISM
              : MediaEngagementIntent.APPRECIATION;
    const priority =
      looksLead || looksSupport
        ? MediaEngagementPriority.HIGH
        : MediaEngagementPriority.NORMAL;
    const sentiment = looksNegative
      ? MediaEngagementSentiment.NEGATIVE
      : /thank|love|great|amazing|helpful|nice|awesome/.test(normalized)
        ? MediaEngagementSentiment.POSITIVE
        : MediaEngagementSentiment.NEUTRAL;
    const needsResponse =
      !looksSpam && (isQuestion || looksLead || looksSupport || looksNegative);
    const suggestedReply = looksSpam
      ? ''
      : isQuestion
        ? 'Thanks for asking — I want to give you a useful answer rather than guess. I’ll respond with the relevant details.'
        : looksLead
          ? 'Thanks for reaching out. I’d be happy to understand what you’re looking for and see whether there’s a fit.'
          : looksNegative
            ? 'Thanks for saying this. I’d like to understand what didn’t work for you and respond to the specific issue.'
            : 'Thank you — I appreciate you taking the time to say that.';
    return {
      summary: text.slice(0, 300),
      priority,
      sentiment,
      intent,
      needsResponse,
      suggestedReply,
    };
  }

  private async recentPublications(
    account: MediaAccountDocument,
    limit: number,
  ) {
    return this.publicationModel
      .find({
        accountId: account._id,
        platform: account.platform,
        isActive: true,
        platformPostId: { $type: 'string' },
      })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .limit(limit);
  }

  private async findPublicationByPlatformId(
    accountId: Types.ObjectId,
    platformPostId: string,
  ): Promise<MediaPublicationDocument | null> {
    return this.publicationModel.findOne({
      accountId,
      platformPostId,
      isActive: true,
    });
  }

  private async requireItem(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid Media engagement item ID.');
    }
    const item = await this.engagementModel.findById(id);
    if (!item || !item.isActive) {
      throw new NotFoundException('Media engagement item not found.');
    }
    return item;
  }

  private notConfigured(
    account: MediaAccountDocument,
    note: string,
  ): SyncResult {
    return {
      accountId: account._id.toString(),
      platform: account.platform,
      fetched: 0,
      upserted: 0,
      note,
    };
  }

  private resolveReadCredential(account: MediaAccountDocument) {
    return this.resolveReadCredentialFromLean(account);
  }

  private resolveWriteCredential(account: MediaAccountDocument) {
    return this.resolveWriteCredentialFromLean(account);
  }

  private resolveExplicitCredential(account: { credentialRef?: string }) {
    const ref = account.credentialRef?.trim();
    if (!ref) return undefined;
    const key = ref.startsWith('env:') ? ref.slice(4) : ref;
    return this.configService.get<string>(key)?.trim() || undefined;
  }

  private resolveReadCredentialFromLean(account: {
    platform: MediaPlatform;
    credentialRef?: string;
  }) {
    const explicit = this.resolveExplicitCredential(account);
    if (explicit) return explicit;

    const fallbacks: Partial<Record<MediaPlatform, string[]>> = {
      [MediaPlatform.LINKEDIN]: ['LINKEDIN_ACCESS_TOKEN'],
      [MediaPlatform.INSTAGRAM]: ['INSTAGRAM_ACCESS_TOKEN'],
      [MediaPlatform.YOUTUBE]: [
        'YOUTUBE_OAUTH_ACCESS_TOKEN',
        'YOUTUBE_ACCESS_TOKEN',
      ],
      [MediaPlatform.X]: ['X_BEARER_TOKEN', 'X_ACCESS_TOKEN'],
      [MediaPlatform.WHATSAPP]: ['WHATSAPP_ACCESS_TOKEN'],
    };
    for (const key of fallbacks[account.platform] ?? []) {
      const value = this.configService.get<string>(key)?.trim();
      if (value) return value;
    }
    return undefined;
  }

  private resolveWriteCredentialFromLean(account: {
    platform: MediaPlatform;
    credentialRef?: string;
  }) {
    const explicit = this.resolveExplicitCredential(account);
    if (explicit) return explicit;

    const fallbacks: Partial<Record<MediaPlatform, string[]>> = {
      [MediaPlatform.LINKEDIN]: ['LINKEDIN_ACCESS_TOKEN'],
      [MediaPlatform.INSTAGRAM]: ['INSTAGRAM_ACCESS_TOKEN'],
      [MediaPlatform.YOUTUBE]: [
        'YOUTUBE_OAUTH_ACCESS_TOKEN',
        'YOUTUBE_ACCESS_TOKEN',
      ],
      [MediaPlatform.X]: ['X_ACCESS_TOKEN'],
      [MediaPlatform.WHATSAPP]: ['WHATSAPP_ACCESS_TOKEN'],
    };
    for (const key of fallbacks[account.platform] ?? []) {
      const value = this.configService.get<string>(key)?.trim();
      if (value) return value;
    }
    return undefined;
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
    const details = payload ?? (await this.jsonObject(response));
    const error = this.objectValue(details.error);
    const message =
      this.stringValue(error?.message) ??
      this.stringValue(details.message) ??
      this.stringValue(details.error_description) ??
      `${label} failed with status ${response.status}.`;
    throw new Error(message);
  }

  private objectValue(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private numberValue(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private dateValue(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
