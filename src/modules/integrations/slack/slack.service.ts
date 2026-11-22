import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AiService } from '../../ai/ai.service';
import { ChatService } from '../../chat/chat.service';
import { MessageRole } from '../../chat/schemas/message.schema';
import { SlackIntentService, SlackIntent } from './slack-intent.service';
import {
  SlackKnowledge,
  SlackKnowledgeDocument,
  SlackOAuthState,
  SlackOAuthStateDocument,
  SlackQuery,
  SlackQueryDocument,
  SlackQueryStatus,
  SlackWorkspace,
  SlackWorkspaceDocument,
  SlackWorkspaceApproval,
} from './slack.schemas';

interface SlackEvent {
  type?: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user_team?: string;
  team?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
}
interface SlackPayload {
  type?: string;
  challenge?: string;
  team_id?: string;
  event_id?: string;
  event?: SlackEvent;
  authorizations?: Array<{ team_id?: string }>;
}
interface SlackApiResult {
  ok: boolean;
  error?: string;
  team?: { id?: string; name?: string };
  access_token?: string;
  bot_user_id?: string;
  scope?: string;
  ts?: string;
}

export const SLACK_ACCESS_DENIED_MESSAGE =
  'Sorry, HSAKAA is not accessible to your Slack account.';
const MAX_MESSAGE_CHARS = 5000;
const MAX_QUEUE_ATTEMPTS = 4;

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private working = false;

  constructor(
    @InjectModel(SlackWorkspace.name)
    private readonly workspaces: Model<SlackWorkspaceDocument>,
    @InjectModel(SlackOAuthState.name)
    private readonly oauthStates: Model<SlackOAuthStateDocument>,
    @InjectModel(SlackQuery.name)
    private readonly queries: Model<SlackQueryDocument>,
    @InjectModel(SlackKnowledge.name)
    private readonly knowledge: Model<SlackKnowledgeDocument>,
    private readonly config: ConfigService,
    private readonly ai: AiService,
    private readonly intent: SlackIntentService,
    private readonly chat: ChatService,
  ) {}

  private getConfig(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value)
      throw new ServiceUnavailableException(`${key} is not configured.`);
    return value;
  }

  private getEncryptionKey(): Buffer {
    const encoded = this.getConfig('SLACK_TOKEN_ENCRYPTION_KEY');
    if (!/^[0-9a-fA-F]{64}$/.test(encoded)) {
      throw new ServiceUnavailableException(
        'SLACK_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters.',
      );
    }
    return Buffer.from(encoded, 'hex');
  }

  private encryptToken(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decryptToken(value: string): string {
    const [iv, tag, body] = value.split('.');
    if (!iv || !tag || !body)
      throw new Error('Invalid stored Slack credential.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  getPublicInstallUrl(): string {
    const redirect = new URL(this.getConfig('SLACK_REDIRECT_URI'));
    if (!redirect.pathname.endsWith('/integrations/slack/callback')) {
      throw new ServiceUnavailableException(
        'Invalid Slack callback URL configuration.',
      );
    }
    redirect.pathname = redirect.pathname.replace(/\/callback$/, '/install');
    redirect.search = '';
    redirect.hash = '';
    return redirect.toString();
  }

  async getAuthorizationUrl(isOwner = false) {
    const clientId = this.getConfig('SLACK_CLIENT_ID');
    this.getConfig('SLACK_CLIENT_SECRET');
    this.getEncryptionKey();
    const redirectUri = this.getConfig('SLACK_REDIRECT_URI');
    const state = randomBytes(32).toString('base64url');
    await this.oauthStates.create({
      stateHash: createHash('sha256').update(state).digest('hex'),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      isOwner,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      scope: 'app_mentions:read,chat:write,im:history',
      redirect_uri: redirectUri,
      state,
    });
    return {
      authorizationUrl: `https://slack.com/oauth/v2/authorize?${params.toString()}`,
    };
  }

  async handleCallback(code?: string, state?: string, error?: string) {
    if (error)
      throw new BadRequestException(`Slack authorization declined: ${error}`);
    if (!code || !state)
      throw new BadRequestException(
        'Missing Slack authorization code or state.',
      );
    const hash = createHash('sha256').update(state).digest('hex');
    const valid = await this.oauthStates.findOneAndUpdate(
      { stateHash: hash, consumed: false, expiresAt: { $gt: new Date() } },
      { $set: { consumed: true } },
      { new: true },
    );
    if (!valid)
      throw new ForbiddenException('Expired or reused Slack OAuth state.');
    const params = new URLSearchParams({
      client_id: this.getConfig('SLACK_CLIENT_ID'),
      client_secret: this.getConfig('SLACK_CLIENT_SECRET'),
      redirect_uri: this.getConfig('SLACK_REDIRECT_URI'),
      code,
    });
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
      signal: AbortSignal.timeout(12000),
    });
    const payload = (await response.json()) as SlackApiResult;
    const teamId = payload.team?.id;
    const token = payload.access_token;
    const botUserId = payload.bot_user_id;
    if (!response.ok || !payload.ok || !teamId || !token || !botUserId) {
      this.logger.warn(
        `Slack OAuth exchange failed: ${payload.error ?? response.status}`,
      );
      throw new BadRequestException('Slack could not complete authorization.');
    }
    // Each Slack team has its own encrypted credential, approval and knowledge.
    await this.workspaces.findOneAndUpdate(
      { teamId },
      {
        $set: {
          teamName: payload.team?.name ?? teamId,
          botUserId,
          encryptedBotToken: this.encryptToken(token),
          scopes: (payload.scope ?? '').split(',').filter(Boolean),
          connected: true,
          connectedAt: new Date(),
          // Reauthorization never implicitly enables workspace access.
          enabled: false,
        },
        $setOnInsert: {
          approvalStatus: SlackWorkspaceApproval.PENDING,
          restrictChannelUsers: false,
          allowDMs: false,
          allowedChannelIds: [],
          allowedUserIds: [],
        },
      },
      { upsert: true, new: true },
    );
    return { connected: true, teamId, isOwner: valid.isOwner ?? false };
  }

  getFrontendReturnUrl(isOwner = false): string {
    const allowedUrl = this.getConfig('FRONTEND_URL').split(',')[0].trim();
    const url = new URL(
      isOwner ? '/admin/settings' : '/slack/installed',
      allowedUrl,
    );
    url.searchParams.set('slack', isOwner ? 'connected' : 'pending');
    return url.toString();
  }

  async getStatus() {
    const workspaces = await this.workspaces
      .find()
      .select('-encryptedBotToken')
      .lean();
    return {
      installUrl: this.config.get<string>('SLACK_REDIRECT_URI')
        ? this.getPublicInstallUrl()
        : null,
      configured: [
        'SLACK_CLIENT_ID',
        'SLACK_CLIENT_SECRET',
        'SLACK_SIGNING_SECRET',
        'SLACK_REDIRECT_URI',
        'SLACK_TOKEN_ENCRYPTION_KEY',
      ].every((key) => Boolean(this.config.get<string>(key))),
      workspaces: workspaces.map((workspace) => ({
        teamId: workspace.teamId,
        teamName: workspace.teamName,
        connected: workspace.connected,
        approvalStatus:
          workspace.approvalStatus ?? SlackWorkspaceApproval.PENDING,
        enabled: workspace.enabled,
        restrictChannelUsers: workspace.restrictChannelUsers ?? false,
        allowDMs: workspace.allowDMs,
        allowedChannelIds: workspace.allowedChannelIds,
        allowedUserIds: workspace.allowedUserIds,
        connectedAt: workspace.connectedAt,
      })),
    };
  }

  async updateWorkspace(
    teamId: string,
    settings: {
      enabled?: boolean;
      approvalStatus?: SlackWorkspaceApproval;
      restrictChannelUsers?: boolean;
      allowDMs?: boolean;
      allowedChannelIds?: string[];
      allowedUserIds?: string[];
    },
  ) {
    const existing = await this.workspaces.findOne({ teamId });
    if (!existing || !existing.connected)
      throw new BadRequestException('Workspace is not connected.');
    const channels = settings.allowedChannelIds ?? existing.allowedChannelIds;
    const users = settings.allowedUserIds ?? existing.allowedUserIds;
    const allowDMs = settings.allowDMs ?? existing.allowDMs;
    if (
      channels.some((id) => !/^[CG][A-Z0-9]{5,30}$/.test(id)) ||
      users.some((id) => !/^[UW][A-Z0-9]{5,30}$/.test(id))
    ) {
      throw new BadRequestException(
        'Use Slack channel IDs (C/G...) and member IDs (U/W...), not names.',
      );
    }
    const approvalStatus =
      settings.approvalStatus ??
      existing.approvalStatus ??
      SlackWorkspaceApproval.PENDING;
    if (!Object.values(SlackWorkspaceApproval).includes(approvalStatus)) {
      throw new BadRequestException('Invalid workspace approval status.');
    }
    if (
      settings.enabled === true &&
      approvalStatus !== SlackWorkspaceApproval.APPROVED
    ) {
      throw new BadRequestException(
        'Approve this workspace before enabling HSAKAA.',
      );
    }
    if (
      (settings.enabled ?? existing.enabled) &&
      channels.length === 0 &&
      !(allowDMs && users.length)
    ) {
      throw new BadRequestException(
        'Allow at least one channel or one DM member before enabling HSAKAA.',
      );
    }
    const update = {
      ...settings,
      approvalStatus,
      enabled:
        approvalStatus === SlackWorkspaceApproval.APPROVED
          ? (settings.enabled ?? existing.enabled)
          : false,
      allowedChannelIds: Array.from(new Set(channels)),
      allowedUserIds: Array.from(new Set(users)),
    };
    await this.workspaces.updateOne({ teamId }, { $set: update });
    return this.getStatus();
  }

  async disconnect(teamId: string) {
    const result = await this.workspaces.updateOne(
      { teamId },
      { $set: { connected: false, enabled: false, encryptedBotToken: '' } },
    );
    if (!result.matchedCount)
      throw new BadRequestException('Workspace not found.');
    await this.queries.deleteMany({
      teamId,
      status: SlackQueryStatus.RECEIVED,
    });
    return { disconnected: true };
  }

  verifySignature(
    rawBody: Buffer | undefined,
    timestamp?: string,
    signature?: string,
  ): void {
    if (
      !rawBody ||
      !timestamp ||
      !signature ||
      !/^v0=[0-9a-f]{64}$/.test(signature)
    ) {
      throw new UnauthorizedException('Missing Slack event signature.');
    }
    if (
      !/^\d{9,13}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    ) {
      throw new UnauthorizedException('Stale Slack event timestamp.');
    }
    const expected = `v0=${createHmac(
      'sha256',
      this.getConfig('SLACK_SIGNING_SECRET'),
    )
      .update(`v0:${timestamp}:${rawBody.toString('utf8')}`)
      .digest('hex')}`;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      throw new UnauthorizedException('Invalid Slack event signature.');
    }
  }

  async acceptEvent(payload: SlackPayload) {
    if (payload.type === 'url_verification')
      return { challenge: payload.challenge ?? '' };
    if (
      payload.type !== 'event_callback' ||
      !payload.event_id ||
      !payload.event
    )
      return { ok: true };
    const event = payload.event;
    const teamId = payload.team_id ?? payload.authorizations?.[0]?.team_id;
    if (teamId && event.type === 'app_uninstalled') {
      await this.workspaces.updateOne(
        { teamId },
        { $set: { connected: false, enabled: false, encryptedBotToken: '' } },
      );
      return { ok: true };
    }
    if (
      !teamId ||
      !event.channel ||
      !event.user ||
      !event.ts ||
      !event.text ||
      event.bot_id ||
      event.subtype ||
      event.user === 'USLACKBOT'
    )
      return { ok: true };
    const isDM = event.type === 'message' && event.channel_type === 'im';
    const isMention = event.type === 'app_mention';
    if (!isDM && !isMention) return { ok: true };
    const workspace = await this.workspaces.findOne({ teamId }).lean();
    // No bot credential exists for an unknown / uninstalled team; Slack cannot
    // receive a reply from this installation. Never process the message.
    if (!workspace?.connected || event.user === workspace.botUserId)
      return { ok: true };
    const text = event.text
      .replace(/<@[A-Z0-9]+(?:\|[^>]+)?>/g, '')
      .trim()
      .slice(0, MAX_MESSAGE_CHARS);
    if (!text) return { ok: true };
    const denied = !this.canAccess(workspace, {
      teamId,
      userId: event.user,
      senderTeamId: event.user_team ?? event.team,
      channelId: event.channel,
      isDM,
    });
    // Denials are limited to one per user/workspace/minute and store no
    // unauthorized message content. All requests are Slack-HMAC verified.
    const minuteAgo = new Date(Date.now() - 60_000);
    const count = await this.queries.countDocuments({
      teamId,
      userId: event.user,
      createdAt: { $gt: minuteAgo },
      ...(denied ? { accessDenied: true } : { accessDenied: false }),
    });
    if (count >= (denied ? 1 : 12)) return { ok: true };
    try {
      await this.queries.create({
        teamId,
        eventId: payload.event_id,
        channelId: event.channel,
        userId: event.user,
        eventTs: event.ts,
        threadTs: event.thread_ts ?? event.ts,
        threadKey: isDM ? 'dm' : (event.thread_ts ?? event.ts),
        isDM,
        senderTeamId: event.user_team ?? event.team,
        accessDenied: denied,
        query: denied ? '[Access denied: message not retained]' : text,
        status: SlackQueryStatus.RECEIVED,
        nextAttemptAt: new Date(),
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 11000
      ) {
        return { ok: true }; // Slack retry for an already accepted event.
      }
      throw error;
    }
    return { ok: true };
  }

  private canAccess(
    workspace: Pick<
      SlackWorkspace,
      | 'teamId'
      | 'connected'
      | 'approvalStatus'
      | 'enabled'
      | 'allowDMs'
      | 'allowedUserIds'
      | 'allowedChannelIds'
      | 'restrictChannelUsers'
    >,
    request: {
      teamId: string;
      senderTeamId?: string;
      userId: string;
      channelId: string;
      isDM: boolean;
    },
  ): boolean {
    if (
      !workspace.connected ||
      workspace.teamId !== request.teamId ||
      (request.senderTeamId && request.senderTeamId !== request.teamId) ||
      workspace.approvalStatus !== SlackWorkspaceApproval.APPROVED ||
      !workspace.enabled
    )
      return false;
    if (request.isDM)
      return (
        workspace.allowDMs && workspace.allowedUserIds.includes(request.userId)
      );
    return (
      workspace.allowedChannelIds.includes(request.channelId) &&
      (!workspace.restrictChannelUsers ||
        workspace.allowedUserIds.includes(request.userId))
    );
  }

  async getQueries(limit = 50) {
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
    const [items, total, resolved, pending] = await Promise.all([
      this.queries
        .find()
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .select('-__v')
        .lean(),
      this.queries.countDocuments(),
      this.queries.countDocuments({ status: SlackQueryStatus.RESOLVED }),
      this.queries.countDocuments({
        status: {
          $in: [
            SlackQueryStatus.RECEIVED,
            SlackQueryStatus.PROCESSING,
            SlackQueryStatus.NEEDS_CLARIFICATION,
          ],
        },
      }),
    ]);
    return { total, resolved, pending, items };
  }

  async getKnowledge(teamId: string) {
    const workspace = await this.workspaces
      .findOne({ teamId, connected: true })
      .lean();
    if (!workspace)
      throw new BadRequestException('Workspace is not connected.');
    return this.knowledge
      .find({ teamId: workspace.teamId })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async addKnowledge(teamId: string, title: string, content: string) {
    if (
      !title?.trim() ||
      !content?.trim() ||
      title.length > 140 ||
      content.length > 15000
    ) {
      throw new BadRequestException(
        'Title and content are required (140 / 15000 characters maximum).',
      );
    }
    const workspace = await this.workspaces
      .findOne({ teamId, connected: true })
      .lean();
    if (!workspace)
      throw new BadRequestException(
        'Connect a Slack workspace before adding knowledge.',
      );
    return this.knowledge.create({
      teamId: workspace.teamId,
      title: title.trim(),
      content: content.trim(),
    });
  }

  async deleteKnowledge(teamId: string, id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid knowledge ID.');
    const workspace = await this.workspaces
      .findOne({ teamId, connected: true })
      .lean();
    if (!workspace)
      throw new BadRequestException('Slack workspace not connected.');
    await this.knowledge.deleteOne({ _id: id, teamId: workspace.teamId });
    return { deleted: true };
  }

  private async selectKnowledge(
    message: string,
    teamId: string,
  ): Promise<string[]> {
    const words = Array.from(
      new Set(
        (message.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
          (word) =>
            ![
              'what',
              'how',
              'the',
              'does',
              'why',
              'can',
              'and',
              'you',
              'with',
            ].includes(word),
        ),
      ),
    ).slice(0, 20);
    const docs = await this.knowledge
      .find({ enabled: true, teamId })
      .select('title content')
      .lean();
    return docs
      .map((doc) => {
        const title = doc.title.toLowerCase();
        const content = doc.content.toLowerCase();
        const score = words.reduce(
          (sum, word) =>
            sum +
            (title.includes(word) ? 3 : 0) +
            (content.includes(word) ? 1 : 0),
          0,
        );
        return { doc, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ doc }) => `Title: ${doc.title}\n${doc.content.slice(0, 3000)}`);
  }

  @Interval(2500)
  async consumeQueue() {
    if (this.working) return;
    this.working = true;
    try {
      const now = new Date();
      const job = await this.queries.findOneAndUpdate(
        {
          $or: [
            { status: SlackQueryStatus.RECEIVED, nextAttemptAt: { $lte: now } },
            { status: SlackQueryStatus.PROCESSING, leaseUntil: { $lt: now } },
          ],
          attempts: { $lt: MAX_QUEUE_ATTEMPTS },
        },
        {
          $set: {
            status: SlackQueryStatus.PROCESSING,
            leaseUntil: new Date(Date.now() + 5 * 60_000),
          },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1 }, new: true },
      );
      if (!job) return;
      await this.processQuery(job);
    } catch (error) {
      this.logger.error(
        `Slack background queue: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.working = false;
    }
  }

  private async processQuery(job: SlackQueryDocument) {
    try {
      const workspace = await this.workspaces
        .findOne({ teamId: job.teamId, connected: true })
        .select('+encryptedBotToken');
      if (!workspace) {
        await this.queries.updateOne(
          { _id: job._id },
          {
            $set: {
              status: SlackQueryStatus.FAILED,
              failure: 'Workspace disabled.',
            },
          },
        );
        return;
      }
      // A previously denied request must NEVER become permitted after approval.
      // A previously accepted request must be reauthorized immediately before AI.
      const allowed =
        !job.accessDenied &&
        this.canAccess(workspace, {
          teamId: job.teamId,
          userId: job.userId,
          channelId: job.channelId,
          isDM: job.isDM,
          senderTeamId: job.senderTeamId,
        });
      if (!allowed) {
        await this.denyQuery(job, workspace);
        return;
      }
      const earlier = await this.queries.exists({
        _id: { $ne: job._id },
        teamId: job.teamId,
        channelId: job.channelId,
        threadKey: job.threadKey,
        eventTs: { $lt: job.eventTs },
        status: {
          $in: [SlackQueryStatus.RECEIVED, SlackQueryStatus.PROCESSING],
        },
      });
      if (earlier) {
        await this.queries.updateOne(
          { _id: job._id },
          {
            $set: {
              status: SlackQueryStatus.RECEIVED,
              nextAttemptAt: new Date(Date.now() + 4000),
            },
            $inc: { attempts: -1 },
          },
        );
        return;
      }
      const conversation = await this.chat.getOrCreateSlackConversation({
        teamId: job.teamId,
        channelId: job.channelId,
        threadTs: job.threadKey,
        firstMessage: job.query,
      });
      if (!conversation) throw new Error('Slack conversation not available.');
      const history = await this.chat.getRecentSlackMessages(
        conversation._id,
        12,
      );
      let detected: SlackIntent;
      try {
        detected = await this.intent.detect(job.query, history);
      } catch (error) {
        this.logger.warn(
          `Slack intent classifier unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        detected = {
          primaryIntent: 'general_query',
          underlyingNeed: 'Get help with the request',
          category: 'other',
          urgency: 'low',
          confidence: 0,
          entities: [],
          missingInformation: [],
          requestedOutcome: 'Useful response',
          needsClarification: false,
          requiresExternalAction: false,
        };
      }
      await this.queries.updateOne(
        { _id: job._id },
        {
          $set: {
            conversationId: conversation._id,
            intent: detected.primaryIntent,
            underlyingNeed: detected.underlyingNeed,
            category: detected.category,
            urgency: detected.urgency,
            confidence: detected.confidence,
            entities: detected.entities.slice(0, 20),
            missingInformation: detected.missingInformation.slice(0, 10),
            requestedOutcome: detected.requestedOutcome,
          },
        },
      );
      const knowledge = await this.selectKnowledge(job.query, job.teamId);
      const answer =
        job.answer ||
        (await this.ai.generateResponse({
          scope: 'slack',
          mode: 'Slack',
          message: job.query,
          contextSections: knowledge.length
            ? knowledge
            : ['No approved organization-specific knowledge is available.'],
          previousMessages: history,
        }));
      if (!answer.trim()) throw new Error('AI returned an empty answer.');
      await this.queries.updateOne(
        { _id: job._id },
        { $set: { answer: answer.slice(0, 12000) } },
      );
      // Reauthorize immediately before posting. An owner may have revoked
      // approval or access while the language model was generating an answer.
      const latestWorkspace = await this.workspaces
        .findOne({ teamId: job.teamId, connected: true })
        .select('+encryptedBotToken');
      if (!latestWorkspace) {
        await this.queries.updateOne(
          { _id: job._id },
          {
            $set: {
              status: SlackQueryStatus.FAILED,
              failure: 'Workspace disconnected before reply.',
            },
          },
        );
        return;
      }
      if (
        !this.canAccess(latestWorkspace, {
          teamId: job.teamId,
          userId: job.userId,
          channelId: job.channelId,
          isDM: job.isDM,
          senderTeamId: job.senderTeamId,
        })
      ) {
        await this.denyQuery(job, latestWorkspace);
        return;
      }
      // Slack's client_msg_id is deterministic per event to assist idempotent retries.
      const digest = createHash('sha256')
        .update(`${job.teamId}:${job.eventId}`)
        .digest('hex');
      const clientMessageId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
      // If the post was recorded but storing chat history failed, do not post again.
      const result = job.replyTs
        ? { ts: job.replyTs }
        : await this.slackApi(
            this.decryptToken(latestWorkspace.encryptedBotToken),
            'chat.postMessage',
            {
              channel: job.channelId,
              ...(job.isDM && job.threadTs === job.eventTs
                ? {}
                : { thread_ts: job.threadTs }),
              text: answer.slice(0, 39000),
              client_msg_id: clientMessageId,
              unfurl_links: false,
            },
          );
      if (!job.replyTs && result.ts) {
        await this.queries.updateOne(
          { _id: job._id },
          { $set: { replyTs: result.ts } },
        );
      }
      if (!job.replyTs) {
        // A failed API attempt will not create a conversation answer record.
        await this.chat.appendMessage({
          conversationId: conversation._id,
          role: MessageRole.USER,
          content: job.query,
          metadata: {
            scope: 'slack',
            teamId: job.teamId,
            channelId: job.channelId,
            userId: job.userId,
            eventId: job.eventId,
          },
        });
        await this.chat.appendMessage({
          conversationId: conversation._id,
          role: MessageRole.ASSISTANT,
          content: answer,
          metadata: {
            scope: 'slack',
            eventId: job.eventId,
            replyTs: result.ts,
          },
        });
      }
      const status = detected.needsClarification
        ? SlackQueryStatus.NEEDS_CLARIFICATION
        : detected.requiresExternalAction
          ? SlackQueryStatus.PARTIALLY_RESOLVED
          : SlackQueryStatus.RESOLVED;
      await this.queries.updateOne(
        { _id: job._id },
        {
          $set: {
            status,
            replyTs: result.ts ?? '',
            completedAt: new Date(),
            failure: '',
          },
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unexpected Slack error';
      this.logger.warn(
        `Slack event processing failed (${job.eventId}): ${errorMessage}`,
      );
      const exhausted = job.attempts >= MAX_QUEUE_ATTEMPTS;
      await this.queries.updateOne(
        { _id: job._id },
        {
          $set: {
            status: exhausted
              ? SlackQueryStatus.FAILED
              : SlackQueryStatus.RECEIVED,
            nextAttemptAt: new Date(
              Date.now() + Math.min(120000, 5000 * Math.pow(2, job.attempts)),
            ),
            failure: errorMessage.slice(0, 300),
            ...(exhausted ? { completedAt: new Date() } : {}),
          },
        },
      );
    }
  }

  private async denyQuery(
    job: SlackQueryDocument,
    workspace: SlackWorkspaceDocument,
  ) {
    // Do not include incoming text or inferred intent in a denial response.
    const result = job.replyTs
      ? { ts: job.replyTs }
      : await this.slackApi(
          this.decryptToken(workspace.encryptedBotToken),
          'chat.postMessage',
          {
            channel: job.channelId,
            ...(job.isDM && job.threadTs === job.eventTs
              ? {}
              : { thread_ts: job.threadTs }),
            text: SLACK_ACCESS_DENIED_MESSAGE,
            unfurl_links: false,
          },
        );
    await this.queries.updateOne(
      { _id: job._id },
      {
        $set: {
          status: SlackQueryStatus.ACCESS_DENIED,
          accessDenied: true,
          query: '[Access denied: message not retained]',
          answer: SLACK_ACCESS_DENIED_MESSAGE,
          replyTs: result.ts ?? '',
          completedAt: new Date(),
          failure: '',
        },
      },
    );
  }

  private async slackApi(
    token: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<SlackApiResult> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = (await response.json()) as SlackApiResult;
    if (!response.ok || !data.ok)
      throw new Error(
        `Slack API ${method} failed: ${data.error ?? response.status}`,
      );
    return data;
  }
}
