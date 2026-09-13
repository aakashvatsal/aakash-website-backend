import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import OpenAI from 'openai';

import { AiService } from '../ai/ai.service';
import { MediaLaunchService } from './media-launch.service';
import {
  MediaAccount,
  MediaAccountDocument,
} from './schemas/media-account.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import {
  MediaSocialFollowing,
  MediaSocialFollowingDocument,
} from './schemas/media-social-following.schema';
import {
  MediaSocialPresenceReview,
  MediaSocialPresenceReviewDocument,
} from './schemas/media-social-presence-review.schema';
import {
  MediaSocialProfile,
  MediaSocialProfileDocument,
  MediaSocialProfileSyncStatus,
} from './schemas/media-social-profile.schema';
import {
  MediaSocialRecommendation,
  MediaSocialRecommendationDocument,
  MediaSocialRecommendationPriority,
  MediaSocialRecommendationStatus,
  MediaSocialRecommendationVerification,
} from './schemas/media-social-recommendation.schema';

const PRIMARY_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
] as const;

const NETWORK_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
] as const;

interface ProfileSnapshotInput {
  externalAccountId?: string;
  displayName?: string;
  username?: string;
  headline?: string;
  bio?: string;
  profileUrl?: string;
  profileImageUrl?: string;
  bannerUrl?: string;
  websiteUrl?: string;
  followerCount?: number;
  followingCount?: number;
  mediaCount?: number;
  verified?: boolean;
  metadata?: Record<string, unknown>;
}

interface NetworkIdentity {
  externalProfileId?: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  profileImageUrl?: string;
  metadata?: Record<string, unknown>;
}

interface AiNetworkRecommendation {
  platform: MediaPlatform;
  displayName: string;
  username: string;
  profileUrl: string;
  category: string;
  whyFollow: string;
  whatToLearn: string;
  doNotImitate: string;
  priority: MediaSocialRecommendationPriority;
}

interface AiProfileAudit {
  platform: MediaPlatform;
  verdict: 'keep' | 'change' | 'review';
  headlineVerdict: 'keep' | 'change' | 'not_applicable';
  bioVerdict: 'keep' | 'change' | 'not_applicable';
  linkVerdict: 'keep' | 'change' | 'review' | 'not_applicable';
  bannerVerdict: 'keep' | 'change' | 'review' | 'not_applicable';
  recommendedHeadline: string;
  recommendedBio: string;
  recommendedLink: string;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
}

interface VerificationResult {
  verification: MediaSocialRecommendationVerification;
  note: string;
  externalProfileId?: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  profileImageUrl?: string;
}

interface ProfileImageAudit {
  inspected: boolean;
  verdict: 'keep' | 'change' | 'review';
  summary: string;
  strengths: string[];
  improvements: string[];
  confidence: 'low' | 'medium' | 'high';
}

@Injectable()
export class MediaSocialPresenceService {
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly launchService: MediaLaunchService,
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaSocialProfile.name)
    private readonly profileModel: Model<MediaSocialProfileDocument>,
    @InjectModel(MediaSocialFollowing.name)
    private readonly followingModel: Model<MediaSocialFollowingDocument>,
    @InjectModel(MediaSocialRecommendation.name)
    private readonly recommendationModel: Model<MediaSocialRecommendationDocument>,
    @InjectModel(MediaSocialPresenceReview.name)
    private readonly reviewModel: Model<MediaSocialPresenceReviewDocument>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.getOrThrow<string>('OPENAI_API_KEY'),
    });
    this.model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-5.6-sol';
  }

  async overview() {
    const [accounts, profiles, following, recommendations, reviews] =
      await Promise.all([
        this.accountModel
          .find({ isActive: true, platform: { $in: PRIMARY_PLATFORMS } })
          .sort({ platform: 1, isPrimary: -1 })
          .lean(),
        this.profileModel
          .find({ isActive: true, platform: { $in: PRIMARY_PLATFORMS } })
          .sort({ platform: 1 })
          .lean(),
        this.followingModel
          .find({ isActive: true, platform: { $in: NETWORK_PLATFORMS } })
          .sort({ platform: 1, displayName: 1 })
          .limit(500)
          .lean(),
        this.recommendationModel
          .find({ isActive: true, platform: { $in: NETWORK_PLATFORMS } })
          .sort({ status: 1, priority: 1, lastRecommendedAt: -1 })
          .limit(150)
          .lean(),
        this.reviewModel.find().sort({ weekOf: -1 }).limit(12).lean(),
      ]);

    const profileByAccount = new Map(
      profiles.map((profile) => [String(profile.accountId), profile]),
    );
    const followingCountByAccount = new Map<string, number>();
    for (const item of following) {
      const key = String(item.accountId);
      followingCountByAccount.set(
        key,
        (followingCountByAccount.get(key) ?? 0) + 1,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      policy: {
        auditWeeklyChangeRarely: true,
        autoProfileChanges: false,
        autoFollow: false,
        recommendationsRequireHumanAction: true,
        sundayReview: '07:05 Asia/Kolkata',
      },
      accounts: accounts.map((account) => ({
        account,
        profile: profileByAccount.get(String(account._id)) ?? null,
        nativeSync: this.nativeCapability(account),
        observedFollowingCount:
          followingCountByAccount.get(String(account._id)) ?? 0,
      })),
      following,
      recommendations,
      activeRecommendations: recommendations.filter(
        (item) => item.status === MediaSocialRecommendationStatus.RECOMMENDED,
      ),
      latestReview: reviews[0] ?? null,
      reviews,
    };
  }

  async syncAll(syncNetwork = true) {
    const accounts = await this.accountModel
      .find({ isActive: true, platform: { $in: PRIMARY_PLATFORMS } })
      .sort({ platform: 1, isPrimary: -1 });
    const seen = new Set<MediaPlatform>();
    const results: unknown[] = [];

    for (const account of accounts) {
      if (seen.has(account.platform)) continue;
      seen.add(account.platform);
      try {
        results.push(await this.syncAccountDocument(account, syncNetwork));
      } catch (error) {
        results.push({
          accountId: account._id.toString(),
          platform: account.platform,
          ok: false,
          error: error instanceof Error ? error.message : 'Social sync failed.',
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      results,
      overview: await this.overview(),
    };
  }

  async syncAccount(accountId: string, syncNetwork = true) {
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('Invalid Media account ID.');
    }
    const account = await this.accountModel.findById(accountId);
    if (!account || !account.isActive) {
      throw new NotFoundException('Media account not found.');
    }
    if (!PRIMARY_PLATFORMS.includes(account.platform as never)) {
      throw new BadRequestException(
        'Social Presence sync is limited to LinkedIn, Instagram, YouTube, X and WhatsApp.',
      );
    }
    return this.syncAccountDocument(account, syncNetwork);
  }

  async refreshRecommendations(force = false) {
    const [following, existing, launch] = await Promise.all([
      this.followingModel
        .find({ isActive: true, platform: { $in: NETWORK_PLATFORMS } })
        .lean(),
      this.recommendationModel
        .find({ isActive: true, platform: { $in: NETWORK_PLATFORMS } })
        .lean(),
      this.launchService.overview(),
    ]);

    const active = existing.filter(
      (item) => item.status === MediaSocialRecommendationStatus.RECOMMENDED,
    );
    if (!force && active.length >= 8) {
      return {
        generatedAt: new Date().toISOString(),
        created: 0,
        skipped: 'There are already enough active recommendations to review.',
        recommendations: active,
      };
    }

    const blocked = existing
      .filter((item) =>
        [
          MediaSocialRecommendationStatus.FOLLOWED,
          MediaSocialRecommendationStatus.DISMISSED,
        ].includes(item.status),
      )
      .map((item) => ({
        platform: item.platform,
        displayName: item.displayName,
        username: item.username ?? '',
        status: item.status,
      }));

    const response = await this.aiService.generateStructuredResponse<{
      recommendations: AiNetworkRecommendation[];
    }>({
      name: 'hsakaa_media_social_network_recommendations_v4',
      instructions: [
        "You are HSAKAA curating Aakash's deliberate social information network.",
        'Recommend accounts worth following, not accounts to imitate. Prioritize builders/operators, grassroots sports and sports-tech, freight/logistics, AI/technology, product/engineering, India startup ecosystem, Mumbai ecosystem, communication/content craft, books/learning and current practiced skills where useful.',
        "Do not turn this into a celebrity list. Prefer people or organizations whose ongoing posts are likely to improve Aakash's thinking, relationships or public-figure awareness.",
        'Never recommend WhatsApp accounts. Use only LinkedIn, Instagram, YouTube or X.',
        'Do not repeat anyone in the observed-following list or blocked history. Do not re-recommend dismissed or already-followed people.',
        'Return a real public account name only when you are reasonably confident it exists. If a username/profile URL is uncertain, leave that string empty; never invent handles or URLs.',
        'Mix categories and platforms. Produce 8-12 recommendations total, normally 2-3 per platform.',
        'Explain why to follow, what to learn, and one trait/style Aakash should not blindly imitate.',
      ].join('\n'),
      input: JSON.stringify({
        owner: 'Aakash',
        publicIdentity:
          'Builder/operator + ideas/thinking + learning/experiments + Building Aakash + human/unfiltered. Co-founder/CEO 8lete and co-founder/CTO Frayto context is usable, without inventing metrics.',
        launchProfilePlans: launch.state?.profilePlans ?? [],
        currentlyObservedFollowing: following.map((item) => ({
          platform: item.platform,
          displayName: item.displayName ?? '',
          username: item.username ?? '',
        })),
        blockedHistory: blocked,
      }),
      schema: this.recommendationSchema(),
      verbosity: 'medium',
      reasoningEffort: 'medium',
      maxOutputTokens: 6000,
    });

    const followedKeys = new Set(
      following.map((item) => `${item.platform}:${item.identityKey}`),
    );
    const existingByKey = new Map(
      existing.map((item) => [`${item.platform}:${item.identityKey}`, item]),
    );
    let created = 0;
    let refreshed = 0;
    const now = new Date();

    for (const candidate of response.data.recommendations) {
      if (!NETWORK_PLATFORMS.includes(candidate.platform as never)) continue;
      const identityKey = this.identityKey(
        candidate.username || candidate.displayName,
      );
      if (!identityKey) continue;
      const compoundKey = `${candidate.platform}:${identityKey}`;
      if (followedKeys.has(compoundKey)) continue;
      const prior = existingByKey.get(compoundKey);
      if (
        prior &&
        prior.status !== MediaSocialRecommendationStatus.RECOMMENDED
      ) {
        continue;
      }

      const verification = await this.verifyRecommendation(candidate);
      const set = {
        platform: candidate.platform,
        identityKey,
        externalProfileId: verification.externalProfileId,
        username: verification.username || candidate.username || undefined,
        displayName: verification.displayName || candidate.displayName,
        profileUrl:
          verification.profileUrl || candidate.profileUrl || undefined,
        profileImageUrl: verification.profileImageUrl,
        category: candidate.category,
        whyFollow: candidate.whyFollow,
        whatToLearn: candidate.whatToLearn,
        doNotImitate: candidate.doNotImitate,
        priority: candidate.priority,
        verification: verification.verification,
        verificationNote: verification.note,
        source: 'hsakaa_ai_plus_native_verification',
        lastRecommendedAt: now,
        isActive: true,
        metadata: {
          aiModel: response.model,
          aiResponseId: response.responseId,
        },
      };
      if (prior) {
        await this.recommendationModel.updateOne(
          { _id: prior._id },
          { $set: set },
        );
        refreshed += 1;
      } else {
        await this.recommendationModel.create({
          ...set,
          status: MediaSocialRecommendationStatus.RECOMMENDED,
          firstRecommendedAt: now,
        });
        created += 1;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      created,
      refreshed,
      recommendations: await this.recommendationModel
        .find({ isActive: true })
        .sort({ status: 1, priority: 1, lastRecommendedAt: -1 })
        .lean(),
    };
  }

  async updateRecommendation(
    id: string,
    status: MediaSocialRecommendationStatus,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid social recommendation ID.');
    }
    const recommendation = await this.recommendationModel.findOneAndUpdate(
      { _id: id, isActive: true },
      {
        $set: {
          status,
          actedAt:
            status === MediaSocialRecommendationStatus.RECOMMENDED
              ? undefined
              : new Date(),
        },
      },
      { new: true },
    );
    if (!recommendation) {
      throw new NotFoundException('Social recommendation not found.');
    }
    return recommendation;
  }

  async runWeeklyReview(force = false) {
    const weekOf = this.currentSundayIst();
    const existing = await this.reviewModel.findOne({ weekOf });
    if (existing && !force) return existing;

    await this.syncAll(false);
    const activeRecommendations = await this.recommendationModel.countDocuments(
      {
        isActive: true,
        status: MediaSocialRecommendationStatus.RECOMMENDED,
      },
    );
    if (activeRecommendations < 6) {
      try {
        await this.refreshRecommendations(false);
      } catch {
        // A weekly profile audit must still complete if recommendation generation
        // is temporarily unavailable.
      }
    }

    const [profiles, launch, recommendations] = await Promise.all([
      this.profileModel
        .find({ isActive: true, platform: { $in: PRIMARY_PLATFORMS } })
        .sort({ platform: 1 })
        .lean(),
      this.launchService.overview(),
      this.recommendationModel
        .find({
          isActive: true,
          status: MediaSocialRecommendationStatus.RECOMMENDED,
        })
        .sort({ priority: 1, lastRecommendedAt: -1 })
        .limit(12)
        .lean(),
    ]);

    const plans = launch.state?.profilePlans ?? [];
    const profileRecords = profiles as unknown as Array<
      Record<string, unknown>
    >;
    const planRecords = plans as unknown as Array<Record<string, unknown>>;
    const textAudits = await this.generateTextProfileAudits(
      profileRecords,
      planRecords,
    );
    const platformReviews: Array<Record<string, unknown>> = [];

    for (const platform of PRIMARY_PLATFORMS) {
      const profile = profiles.find((item) => item.platform === platform);
      const profileRecord = profile as unknown as
        Record<string, unknown> | undefined;
      const plan = plans.find((item) => item.platform === platform);
      const planRecord = plan as unknown as Record<string, unknown> | undefined;
      const textAudit =
        textAudits.find((item) => item.platform === platform) ??
        this.fallbackTextAudit(platform, profileRecord, planRecord);
      const photoAudit = await this.auditProfileImage(
        profile?.profileImageUrl,
        platform,
        plan?.profileImageGuidance ?? '',
      );
      const changeRecommended =
        textAudit.verdict === 'change' || photoAudit.verdict === 'change';
      platformReviews.push({
        platform,
        connected: Boolean(profile),
        syncStatus: profile?.syncStatus ?? 'missing',
        current: profile
          ? {
              displayName: profile.displayName ?? '',
              username: profile.username ?? '',
              headline: profile.headline ?? '',
              bio: profile.bio ?? '',
              profileUrl: profile.profileUrl ?? '',
              profileImageUrl: profile.profileImageUrl ?? '',
              bannerUrl: profile.bannerUrl ?? '',
              websiteUrl: profile.websiteUrl ?? '',
              followerCount: profile.followerCount ?? null,
              followingCount: profile.followingCount ?? null,
            }
          : null,
        launchPlan: plan ?? null,
        audit: textAudit,
        photoAudit,
        changeRecommended,
      });
    }

    const profilesKept = platformReviews.filter(
      (item) => item.changeRecommended === false,
    ).length;
    const profileChangesRecommended = platformReviews.length - profilesKept;
    const changesRecommended = platformReviews
      .filter((item) => item.changeRecommended === true)
      .map((item) => `${String(item.platform)} profile needs review.`);
    const networkActions = recommendations.slice(0, 8).map((item) => {
      const handle = item.username ? ` (@${item.username})` : '';
      return `${item.platform}: consider ${item.displayName}${handle} — ${item.whyFollow}`;
    });
    const wins = platformReviews
      .filter((item) => item.changeRecommended === false)
      .map((item) => `${String(item.platform)} profile can stay unchanged.`);
    const summary =
      profileChangesRecommended === 0
        ? 'No profile identity changes are needed this week. Keep the current profiles stable and focus on the highest-value network additions.'
        : `${profileChangesRecommended} of ${platformReviews.length} profiles have a meaningful change or review recommendation; the rest should stay stable.`;

    return this.reviewModel.findOneAndUpdate(
      { weekOf },
      {
        $set: {
          weekOf,
          generatedAt: new Date(),
          summary,
          platformReviews,
          wins,
          changesRecommended,
          networkActions,
          profileChangesRecommended,
          profilesKept,
          recommendationsActive: recommendations.length,
          metadata: {
            policy: 'audit_weekly_change_rarely',
            autoProfileChanges: false,
            autoFollow: false,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  private async syncAccountDocument(
    account: MediaAccountDocument,
    syncNetwork: boolean,
  ) {
    const startedAt = new Date();
    try {
      const snapshot = await this.fetchProfile(account);
      const profile = await this.profileModel.findOneAndUpdate(
        { accountId: account._id },
        {
          $set: {
            accountId: account._id,
            platform: account.platform,
            ...snapshot,
            syncStatus: MediaSocialProfileSyncStatus.SYNCED,
            syncNote: undefined,
            syncedAt: new Date(),
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      const accountSet: Record<string, unknown> = {};
      if (snapshot.externalAccountId && !account.externalAccountId) {
        accountSet.externalAccountId = snapshot.externalAccountId;
      }
      if (snapshot.username && !account.username) {
        accountSet.username = snapshot.username;
      }
      if (
        snapshot.displayName &&
        snapshot.displayName !== account.displayName
      ) {
        accountSet.displayName = snapshot.displayName;
      }
      if (Object.keys(accountSet).length) {
        await this.accountModel.updateOne(
          { _id: account._id },
          { $set: accountSet },
        );
      }

      let networkResult: Record<string, unknown> = {
        supported: false,
        fetched: 0,
        note: this.networkCapabilityNote(account.platform),
      };
      if (syncNetwork) {
        networkResult = await this.syncNetwork(account, startedAt);
      }
      return {
        accountId: account._id.toString(),
        platform: account.platform,
        ok: true,
        profile,
        network: networkResult,
      };
    } catch (error) {
      const note =
        error instanceof Error ? error.message : 'Social profile sync failed.';
      await this.profileModel.findOneAndUpdate(
        { accountId: account._id },
        {
          $set: {
            accountId: account._id,
            platform: account.platform,
            syncStatus: this.resolveSyncFailureStatus(note),
            syncNote: note,
            syncedAt: new Date(),
            isActive: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      throw error;
    }
  }

  private async fetchProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    switch (account.platform) {
      case MediaPlatform.LINKEDIN:
        return this.fetchLinkedInProfile(account);
      case MediaPlatform.INSTAGRAM:
        return this.fetchInstagramProfile(account);
      case MediaPlatform.YOUTUBE:
        return this.fetchYouTubeProfile(account);
      case MediaPlatform.X:
        return this.fetchXProfile(account);
      case MediaPlatform.WHATSAPP:
        return this.fetchWhatsAppProfile(account);
      default:
        throw new Error(
          'Native profile sync is not supported for this platform.',
        );
    }
  }

  private async fetchLinkedInProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    const token = this.resolveCredential(account, ['LINKEDIN_ACCESS_TOKEN']);
    if (!token) throw new Error('LinkedIn access token is not configured.');
    const response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await this.json(response, 'LinkedIn profile sync');
    const username = account.username?.trim();
    return {
      externalAccountId: this.string(payload.sub) ?? account.externalAccountId,
      displayName: this.string(payload.name) ?? account.displayName,
      username,
      profileUrl: username
        ? `https://www.linkedin.com/in/${encodeURIComponent(username)}`
        : undefined,
      profileImageUrl: this.string(payload.picture),
      metadata: {
        locale: payload.locale ?? null,
        apiSurface: 'openid_userinfo',
        limitation:
          'LinkedIn self-serve profile sync exposes basic authenticated identity only; headline, about, banner and following graph require manual/live-page review unless additional approved LinkedIn products are granted.',
      },
    };
  }

  private async fetchInstagramProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    const token = this.resolveCredential(account, ['INSTAGRAM_ACCESS_TOKEN']);
    const userId = account.externalAccountId?.trim();
    if (!token) throw new Error('Instagram access token is not configured.');
    if (!userId)
      throw new Error('Instagram professional account ID is missing.');
    const version = this.metaVersion();
    const url = new URL(
      `https://graph.facebook.com/${version}/${encodeURIComponent(userId)}`,
    );
    url.searchParams.set(
      'fields',
      'id,username,name,biography,profile_picture_url,website,followers_count,follows_count,media_count',
    );
    url.searchParams.set('access_token', token);
    const payload = await this.json(await fetch(url), 'Instagram profile sync');
    const username = this.string(payload.username);
    return {
      externalAccountId: this.string(payload.id) ?? userId,
      displayName: this.string(payload.name) ?? username ?? account.displayName,
      username,
      bio: this.string(payload.biography),
      profileUrl: username
        ? `https://www.instagram.com/${username}/`
        : undefined,
      profileImageUrl: this.string(payload.profile_picture_url),
      websiteUrl: this.string(payload.website),
      followerCount: this.number(payload.followers_count),
      followingCount: this.number(payload.follows_count),
      mediaCount: this.number(payload.media_count),
      metadata: { apiSurface: 'instagram_graph_professional' },
    };
  }

  private async fetchYouTubeProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    const oauth = this.resolveCredential(account, [
      'YOUTUBE_OAUTH_ACCESS_TOKEN',
      'YOUTUBE_ACCESS_TOKEN',
    ]);
    const apiKey = this.configService.get<string>('YOUTUBE_API_KEY')?.trim();
    if (!oauth && !apiKey) {
      throw new Error('YouTube OAuth token or API key is not configured.');
    }
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,brandingSettings');
    if (oauth) {
      url.searchParams.set('mine', 'true');
    } else if (account.externalAccountId) {
      url.searchParams.set('id', account.externalAccountId);
      url.searchParams.set('key', apiKey!);
    } else {
      throw new Error(
        'YouTube channel ID is required when only YOUTUBE_API_KEY is configured.',
      );
    }
    const response = await fetch(url, {
      headers: oauth ? { Authorization: `Bearer ${oauth}` } : undefined,
    });
    const payload = await this.json(response, 'YouTube profile sync');
    const items = Array.isArray(payload.items) ? payload.items : [];
    const channel = this.object(items[0]);
    if (!channel) throw new Error('YouTube did not return the owned channel.');
    const snippet = this.object(channel.snippet) ?? {};
    const stats = this.object(channel.statistics) ?? {};
    const branding = this.object(channel.brandingSettings) ?? {};
    const image = this.object(branding.image) ?? {};
    const thumbnails = this.object(snippet.thumbnails) ?? {};
    const high =
      this.object(thumbnails.high) ?? this.object(thumbnails.default) ?? {};
    const customUrl = this.string(snippet.customUrl);
    const channelId = this.string(channel.id);
    return {
      externalAccountId: channelId,
      displayName: this.string(snippet.title) ?? account.displayName,
      username: customUrl?.replace(/^@/, ''),
      bio: this.string(snippet.description),
      profileUrl: channelId
        ? `https://www.youtube.com/channel/${channelId}`
        : undefined,
      profileImageUrl: this.string(high.url),
      bannerUrl: this.string(image.bannerExternalUrl),
      followerCount: this.number(stats.subscriberCount),
      mediaCount: this.number(stats.videoCount),
      metadata: {
        viewCount: this.number(stats.viewCount) ?? null,
        hiddenSubscriberCount: Boolean(stats.hiddenSubscriberCount),
        country: this.string(snippet.country) ?? null,
        apiSurface: oauth ? 'youtube_oauth_owner' : 'youtube_public_channel',
      },
    };
  }

  private async fetchXProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    const token = this.resolveCredential(account, [
      'X_BEARER_TOKEN',
      'X_ACCESS_TOKEN',
    ]);
    if (!token) throw new Error('X read token is not configured.');
    const locator = account.externalAccountId?.trim()
      ? `https://api.x.com/2/users/${encodeURIComponent(account.externalAccountId.trim())}`
      : account.username?.trim()
        ? `https://api.x.com/2/users/by/username/${encodeURIComponent(account.username.trim().replace(/^@/, ''))}`
        : null;
    if (!locator) throw new Error('X user ID or username is missing.');
    const url = new URL(locator);
    url.searchParams.set(
      'user.fields',
      'id,name,username,description,profile_image_url,public_metrics,verified,url,entities,location',
    );
    const payload = await this.json(
      await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
      'X profile sync',
    );
    const data = this.object(payload.data);
    if (!data) throw new Error('X did not return the configured user.');
    const metrics = this.object(data.public_metrics) ?? {};
    const username = this.string(data.username);
    return {
      externalAccountId: this.string(data.id),
      displayName: this.string(data.name) ?? account.displayName,
      username,
      bio: this.string(data.description),
      profileUrl: username ? `https://x.com/${username}` : undefined,
      profileImageUrl: this.upscaleXProfileImage(
        this.string(data.profile_image_url),
      ),
      websiteUrl: this.string(data.url),
      followerCount: this.number(metrics.followers_count),
      followingCount: this.number(metrics.following_count),
      mediaCount: this.number(metrics.tweet_count),
      verified: typeof data.verified === 'boolean' ? data.verified : undefined,
      metadata: {
        listedCount: this.number(metrics.listed_count) ?? null,
        likeCount: this.number(metrics.like_count) ?? null,
        location: this.string(data.location) ?? null,
        apiSurface: 'x_v2',
      },
    };
  }

  private async fetchWhatsAppProfile(
    account: MediaAccountDocument,
  ): Promise<ProfileSnapshotInput> {
    const token = this.resolveCredential(account, ['WHATSAPP_ACCESS_TOKEN']);
    const phoneNumberId =
      this.string(account.metadata?.phoneNumberId) ??
      account.externalAccountId?.trim() ??
      this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID')?.trim();
    if (!token) throw new Error('WhatsApp access token is not configured.');
    if (!phoneNumberId) throw new Error('WhatsApp phone number ID is missing.');
    const url = new URL(
      `https://graph.facebook.com/${this.metaVersion()}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile`,
    );
    url.searchParams.set(
      'fields',
      'about,address,description,email,profile_picture_url,websites,vertical',
    );
    const payload = await this.json(
      await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
      'WhatsApp business profile sync',
    );
    const data = Array.isArray(payload.data)
      ? this.object(payload.data[0])
      : undefined;
    if (!data) throw new Error('WhatsApp did not return a business profile.');
    const websites = Array.isArray(data.websites) ? data.websites : [];
    return {
      externalAccountId: phoneNumberId,
      displayName: account.displayName,
      username: account.username,
      headline: this.string(data.about),
      bio: this.string(data.description),
      profileImageUrl: this.string(data.profile_picture_url),
      websiteUrl: this.string(websites[0]),
      metadata: {
        address: this.string(data.address) ?? null,
        email: this.string(data.email) ?? null,
        vertical: this.string(data.vertical) ?? null,
        apiSurface: 'whatsapp_business_profile',
      },
    };
  }

  private async syncNetwork(
    account: MediaAccountDocument,
    startedAt: Date,
  ): Promise<Record<string, unknown>> {
    if (account.platform === MediaPlatform.YOUTUBE) {
      const identities = await this.fetchYouTubeSubscriptions(account);
      await this.persistNetwork(account, identities, startedAt);
      return {
        supported: true,
        fetched: identities.length,
        source: 'youtube_subscriptions',
      };
    }
    if (account.platform === MediaPlatform.X) {
      const identities = await this.fetchXFollowing(account);
      await this.persistNetwork(account, identities, startedAt);
      return {
        supported: true,
        fetched: identities.length,
        source: 'x_following',
      };
    }
    return {
      supported: false,
      fetched: 0,
      note: this.networkCapabilityNote(account.platform),
    };
  }

  private async fetchYouTubeSubscriptions(
    account: MediaAccountDocument,
  ): Promise<NetworkIdentity[]> {
    const token = this.resolveCredential(account, [
      'YOUTUBE_OAUTH_ACCESS_TOKEN',
      'YOUTUBE_ACCESS_TOKEN',
    ]);
    if (!token) return [];
    const items: NetworkIdentity[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page += 1) {
      const url = new URL(
        'https://www.googleapis.com/youtube/v3/subscriptions',
      );
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('mine', 'true');
      url.searchParams.set('maxResults', '50');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const payload = await this.json(
        await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
        'YouTube subscriptions sync',
      );
      const data = Array.isArray(payload.items) ? payload.items : [];
      for (const raw of data) {
        const item = this.object(raw);
        const snippet = this.object(item?.snippet);
        const resource = this.object(snippet?.resourceId);
        const thumbnails = this.object(snippet?.thumbnails) ?? {};
        const high =
          this.object(thumbnails.high) ?? this.object(thumbnails.default) ?? {};
        const channelId = this.string(resource?.channelId);
        if (!channelId) continue;
        items.push({
          externalProfileId: channelId,
          displayName: this.string(snippet?.title),
          profileUrl: `https://www.youtube.com/channel/${channelId}`,
          profileImageUrl: this.string(high.url),
        });
      }
      pageToken = this.string(payload.nextPageToken);
      if (!pageToken) break;
    }
    return items;
  }

  private async fetchXFollowing(
    account: MediaAccountDocument,
  ): Promise<NetworkIdentity[]> {
    const token = this.resolveCredential(account, [
      'X_BEARER_TOKEN',
      'X_ACCESS_TOKEN',
    ]);
    const userId = account.externalAccountId?.trim();
    if (!token || !userId) return [];
    const items: NetworkIdentity[] = [];
    let paginationToken: string | undefined;
    for (let page = 0; page < 4; page += 1) {
      const url = new URL(
        `https://api.x.com/2/users/${encodeURIComponent(userId)}/following`,
      );
      url.searchParams.set('max_results', '100');
      url.searchParams.set(
        'user.fields',
        'id,name,username,profile_image_url,description,verified',
      );
      if (paginationToken)
        url.searchParams.set('pagination_token', paginationToken);
      const payload = await this.json(
        await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
        'X following sync',
      );
      const data = Array.isArray(payload.data) ? payload.data : [];
      for (const raw of data) {
        const user = this.object(raw);
        const id = this.string(user?.id);
        const username = this.string(user?.username);
        if (!id && !username) continue;
        items.push({
          externalProfileId: id,
          username,
          displayName: this.string(user?.name),
          profileUrl: username ? `https://x.com/${username}` : undefined,
          profileImageUrl: this.upscaleXProfileImage(
            this.string(user?.profile_image_url),
          ),
          metadata: { verified: user?.verified ?? null },
        });
      }
      const meta = this.object(payload.meta) ?? {};
      paginationToken = this.string(meta.next_token);
      if (!paginationToken) break;
    }
    return items;
  }

  private async persistNetwork(
    account: MediaAccountDocument,
    identities: NetworkIdentity[],
    startedAt: Date,
  ) {
    for (const identity of identities) {
      const identityKey = this.identityKey(
        identity.externalProfileId ??
          identity.username ??
          identity.displayName ??
          '',
      );
      if (!identityKey) continue;
      await this.followingModel.updateOne(
        { accountId: account._id, identityKey },
        {
          $set: {
            accountId: account._id,
            platform: account.platform,
            identityKey,
            ...identity,
            source: 'native_api',
            observedAt: new Date(),
            isActive: true,
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
    await this.followingModel.updateMany(
      {
        accountId: account._id,
        isActive: true,
        observedAt: { $lt: startedAt },
      },
      { $set: { isActive: false } },
    );
  }

  private async verifyRecommendation(
    candidate: AiNetworkRecommendation,
  ): Promise<VerificationResult> {
    if (candidate.platform === MediaPlatform.X && candidate.username.trim()) {
      return this.verifyX(candidate);
    }
    if (
      candidate.platform === MediaPlatform.INSTAGRAM &&
      candidate.username.trim()
    ) {
      return this.verifyInstagram(candidate);
    }
    if (candidate.platform === MediaPlatform.YOUTUBE) {
      return this.verifyYouTube(candidate);
    }
    return {
      verification: MediaSocialRecommendationVerification.MANUAL_REQUIRED,
      note:
        candidate.platform === MediaPlatform.LINKEDIN
          ? 'LinkedIn self-serve APIs do not provide general member discovery; verify this recommendation manually before following.'
          : 'Native verification is unavailable for this recommendation.',
    };
  }

  private async verifyX(candidate: AiNetworkRecommendation) {
    const token = this.firstConfig(['X_BEARER_TOKEN', 'X_ACCESS_TOKEN']);
    if (!token) {
      return {
        verification: MediaSocialRecommendationVerification.MANUAL_REQUIRED,
        note: 'Configure X_BEARER_TOKEN to verify suggested X accounts.',
      };
    }
    try {
      const username = candidate.username.trim().replace(/^@/, '');
      const url = new URL(
        `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`,
      );
      url.searchParams.set('user.fields', 'id,name,username,profile_image_url');
      const payload = await this.json(
        await fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
        'X recommendation verification',
      );
      const data = this.object(payload.data);
      if (!data) throw new Error('X account was not found.');
      const verifiedUsername = this.string(data.username);
      return {
        verification: MediaSocialRecommendationVerification.VERIFIED,
        note: 'Verified against X API by exact username.',
        externalProfileId: this.string(data.id),
        username: verifiedUsername,
        displayName: this.string(data.name),
        profileUrl: verifiedUsername
          ? `https://x.com/${verifiedUsername}`
          : undefined,
        profileImageUrl: this.upscaleXProfileImage(
          this.string(data.profile_image_url),
        ),
      };
    } catch (error) {
      return {
        verification: MediaSocialRecommendationVerification.UNVERIFIED,
        note: error instanceof Error ? error.message : 'X verification failed.',
      };
    }
  }

  private async verifyInstagram(candidate: AiNetworkRecommendation) {
    const token = this.firstConfig(['INSTAGRAM_ACCESS_TOKEN']);
    const owner = await this.accountModel
      .findOne({ platform: MediaPlatform.INSTAGRAM, isActive: true })
      .lean();
    const ownerId = owner?.externalAccountId?.trim();
    if (!token || !ownerId) {
      return {
        verification: MediaSocialRecommendationVerification.MANUAL_REQUIRED,
        note: 'Instagram Business Discovery verification needs the connected professional account ID and token.',
      };
    }
    try {
      const username = candidate.username.trim().replace(/^@/, '');
      const url = new URL(
        `https://graph.facebook.com/${this.metaVersion()}/${encodeURIComponent(ownerId)}`,
      );
      url.searchParams.set(
        'fields',
        `business_discovery.username(${username}){id,username,name,profile_picture_url,followers_count}`,
      );
      url.searchParams.set('access_token', token);
      const payload = await this.json(
        await fetch(url),
        'Instagram recommendation verification',
      );
      const data = this.object(payload.business_discovery);
      if (!data)
        throw new Error(
          'Instagram account was not found through Business Discovery.',
        );
      const verifiedUsername = this.string(data.username);
      return {
        verification: MediaSocialRecommendationVerification.VERIFIED,
        note: 'Verified through Instagram Business Discovery.',
        externalProfileId: this.string(data.id),
        username: verifiedUsername,
        displayName: this.string(data.name),
        profileUrl: verifiedUsername
          ? `https://www.instagram.com/${verifiedUsername}/`
          : undefined,
        profileImageUrl: this.string(data.profile_picture_url),
      };
    } catch (error) {
      return {
        verification: MediaSocialRecommendationVerification.UNVERIFIED,
        note:
          error instanceof Error
            ? error.message
            : 'Instagram verification failed.',
      };
    }
  }

  private async verifyYouTube(candidate: AiNetworkRecommendation) {
    const token = this.firstConfig([
      'YOUTUBE_OAUTH_ACCESS_TOKEN',
      'YOUTUBE_ACCESS_TOKEN',
    ]);
    const key = this.configService.get<string>('YOUTUBE_API_KEY')?.trim();
    if (!token && !key) {
      return {
        verification: MediaSocialRecommendationVerification.MANUAL_REQUIRED,
        note: 'Configure YouTube OAuth or API key to verify channel recommendations.',
      };
    }
    try {
      const query = candidate.username.trim() || candidate.displayName.trim();
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'channel');
      url.searchParams.set('maxResults', '5');
      url.searchParams.set('q', query);
      if (key) url.searchParams.set('key', key);
      const payload = await this.json(
        await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }),
        'YouTube recommendation verification',
      );
      const items = Array.isArray(payload.items) ? payload.items : [];
      const normalizedName = this.identityKey(candidate.displayName);
      const match = items
        .map((item) => this.object(item))
        .find((item) => {
          const snippet = this.object(item?.snippet);
          return (
            this.identityKey(this.string(snippet?.title) ?? '') ===
            normalizedName
          );
        });
      if (!match) {
        return {
          verification: MediaSocialRecommendationVerification.UNVERIFIED,
          note: 'YouTube search did not return an exact channel-name match; verify manually.',
        };
      }
      const snippet = this.object(match.snippet) ?? {};
      const id = this.object(match.id) ?? {};
      const thumbnails = this.object(snippet.thumbnails) ?? {};
      const high =
        this.object(thumbnails.high) ?? this.object(thumbnails.default) ?? {};
      const channelId = this.string(id.channelId);
      return {
        verification: MediaSocialRecommendationVerification.VERIFIED,
        note: 'Verified by exact channel-name match through YouTube Data API.',
        externalProfileId: channelId,
        displayName: this.string(snippet.title),
        profileUrl: channelId
          ? `https://www.youtube.com/channel/${channelId}`
          : undefined,
        profileImageUrl: this.string(high.url),
      };
    } catch (error) {
      return {
        verification: MediaSocialRecommendationVerification.UNVERIFIED,
        note:
          error instanceof Error
            ? error.message
            : 'YouTube verification failed.',
      };
    }
  }

  private async generateTextProfileAudits(
    profiles: Array<Record<string, unknown>>,
    plans: Array<Record<string, unknown>>,
  ): Promise<AiProfileAudit[]> {
    try {
      const response = await this.aiService.generateStructuredResponse<{
        audits: AiProfileAudit[];
      }>({
        name: 'hsakaa_media_social_profile_audit_v4',
        instructions: [
          "You are HSAKAA performing Aakash's Sunday social-profile audit.",
          'Core policy: audit weekly, change rarely. Identity consistency is more valuable than cosmetic weekly rewriting.',
          'Recommend CHANGE only for a meaningful reason: factual information is outdated, positioning materially changed, the current field is clearly weak/empty, a platform role changed, or there is an obvious high-value improvement.',
          'Never invent achievements, metrics, titles, locations or facts. Preserve the umbrella identity across platforms but do not make every platform bio identical.',
          'LinkedIn OpenID profile sync may not expose headline/about/banner; treat missing API fields as REVIEW/NOT_APPLICABLE rather than claiming they are absent on the real profile.',
          'WhatsApp does not need a creator-style bio. Keep it restrained and human/professional.',
          'Do not assess the visual quality of a profile photo here; a separate multimodal inspection handles it.',
        ].join('\n'),
        input: JSON.stringify({
          owner: 'Aakash',
          profiles,
          launchProfilePlans: plans,
        }),
        schema: this.profileAuditSchema(),
        verbosity: 'medium',
        reasoningEffort: 'medium',
        maxOutputTokens: 6000,
      });
      return response.data.audits;
    } catch {
      return [];
    }
  }

  private async auditProfileImage(
    imageUrl: string | undefined,
    platform: MediaPlatform,
    guidance: string,
  ): Promise<ProfileImageAudit> {
    if (!imageUrl?.trim()) {
      return {
        inspected: false,
        verdict: 'change',
        summary:
          'No profile image was available from the connected profile sync.',
        strengths: [],
        improvements: [
          'Add or expose a recognizable profile image for this channel.',
        ],
        confidence: 'high',
      };
    }
    try {
      const response = await this.openai.responses.create({
        model: this.model,
        instructions: [
          "You are HSAKAA reviewing Aakash's current public social profile picture for brand consistency.",
          'Judge only visible communication qualities: face visibility, crop at thumbnail size, lighting, distracting background, recognizability, consistency and whether it feels appropriately human/professional for the platform.',
          'Do not infer age, ethnicity, attractiveness, health, personality, wealth or other sensitive/personal traits from appearance.',
          'Core policy: audit weekly, change rarely. Recommend CHANGE only when there is a meaningful visible issue, not because a different photo could theoretically be marginally better.',
          `Platform: ${platform}. Existing profile-image guidance: ${guidance || 'none'}.`,
        ].join('\n'),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Inspect this exact current public profile image and return the requested structured audit.',
              },
              { type: 'input_image', image_url: imageUrl, detail: 'high' },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'hsakaa_media_profile_image_audit_v4',
            schema: this.profileImageAuditSchema(),
            strict: true,
          },
          verbosity: 'low',
        },
        reasoning: { effort: 'low' },
        max_output_tokens: 1800,
        store: false,
      });
      const raw = response.output_text.trim();
      if (!raw) throw new Error('Profile image audit returned no output.');
      return {
        inspected: true,
        ...(JSON.parse(raw) as Omit<ProfileImageAudit, 'inspected'>),
      };
    } catch (error) {
      return {
        inspected: false,
        verdict: 'review',
        summary:
          'The current profile image URL could not be inspected reliably this run.',
        strengths: [],
        improvements: [
          error instanceof Error
            ? `Multimodal review unavailable: ${error.message}`
            : 'Multimodal review unavailable.',
        ],
        confidence: 'low',
      };
    }
  }

  private fallbackTextAudit(
    platform: MediaPlatform,
    profile: Record<string, unknown> | undefined,
    plan: Record<string, unknown> | undefined,
  ): AiProfileAudit {
    if (!profile) {
      return {
        platform,
        verdict: 'review',
        headlineVerdict: 'not_applicable',
        bioVerdict: 'not_applicable',
        linkVerdict: 'not_applicable',
        bannerVerdict: 'review',
        recommendedHeadline: this.string(plan?.headline) ?? '',
        recommendedBio: this.string(plan?.bio) ?? '',
        recommendedLink: this.string(plan?.linkStrategy) ?? '',
        reasons: [
          'Connect/sync this platform before changing its public identity.',
        ],
        confidence: 'low',
      };
    }
    const meaningfulMissingBio =
      platform !== MediaPlatform.LINKEDIN &&
      platform !== MediaPlatform.WHATSAPP &&
      !(this.string(profile.bio) ?? '').trim();
    return {
      platform,
      verdict: meaningfulMissingBio ? 'change' : 'keep',
      headlineVerdict: 'not_applicable',
      bioVerdict: meaningfulMissingBio ? 'change' : 'keep',
      linkVerdict: 'review',
      bannerVerdict: 'review',
      recommendedHeadline: this.string(plan?.headline) ?? '',
      recommendedBio: meaningfulMissingBio
        ? (this.string(plan?.bio) ?? '')
        : (this.string(profile.bio) ?? ''),
      recommendedLink: this.string(plan?.linkStrategy) ?? '',
      reasons: meaningfulMissingBio
        ? [
            'The synced profile has no usable bio/description; use the existing Launch recommendation as the starting point.',
          ]
        : [
            'No high-confidence text change was identified without AI review; keep the current identity stable.',
          ],
      confidence: 'low',
    };
  }

  private nativeCapability(account: {
    platform: MediaPlatform;
    externalAccountId?: string;
    username?: string;
    credentialRef?: string;
  }) {
    const credential = Boolean(
      this.resolveCredential(account, this.credentialKeys(account.platform)),
    );
    return {
      profileReadConfigured: credential,
      networkRead:
        account.platform === MediaPlatform.YOUTUBE
          ? credential
            ? 'supported_with_oauth'
            : 'not_configured'
          : account.platform === MediaPlatform.X
            ? credential && Boolean(account.externalAccountId)
              ? 'supported'
              : 'not_configured'
            : 'manual_or_not_exposed',
      profileWrite: 'approval_only_not_implemented',
      followWrite: 'manual_only',
      note: this.networkCapabilityNote(account.platform),
    };
  }

  private networkCapabilityNote(platform: MediaPlatform) {
    switch (platform) {
      case MediaPlatform.YOUTUBE:
        return 'Owned-channel subscriptions can be read with YouTube OAuth.';
      case MediaPlatform.X:
        return 'Following can be read with X user data access; this system does not auto-follow.';
      case MediaPlatform.INSTAGRAM:
        return 'Instagram professional APIs can verify known Business/Creator usernames, but do not expose a general personal following graph for this workflow.';
      case MediaPlatform.LINKEDIN:
        return 'LinkedIn self-serve APIs do not expose a general member following graph; recommendations remain manual and explicitly marked for verification.';
      case MediaPlatform.WHATSAPP:
        return 'WhatsApp has no social following graph; only the Business Profile participates in profile auditing.';
      default:
        return 'Network sync is not supported.';
    }
  }

  private credentialKeys(platform: MediaPlatform): string[] {
    const keys: Partial<Record<MediaPlatform, string[]>> = {
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
    return keys[platform] ?? [];
  }

  private resolveCredential(
    account: { credentialRef?: string },
    fallbacks: string[],
  ) {
    const ref = account.credentialRef?.trim();
    if (ref) {
      const key = ref.startsWith('env:') ? ref.slice(4) : ref;
      const value = this.configService.get<string>(key)?.trim();
      if (value) return value;
    }
    return this.firstConfig(fallbacks);
  }

  private firstConfig(keys: string[]) {
    for (const key of keys) {
      const value = this.configService.get<string>(key)?.trim();
      if (value) return value;
    }
    return undefined;
  }

  private resolveSyncFailureStatus(note: string) {
    if (/not configured|missing|required when/i.test(note)) {
      return MediaSocialProfileSyncStatus.NOT_CONFIGURED;
    }
    if (/not supported/i.test(note)) {
      return MediaSocialProfileSyncStatus.NOT_SUPPORTED;
    }
    return MediaSocialProfileSyncStatus.ERROR;
  }

  private metaVersion() {
    return this.configService.get<string>('META_GRAPH_API_VERSION') ?? 'v23.0';
  }

  private async json(response: Response, label: string) {
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = (JSON.parse(text) as Record<string, unknown>) ?? {};
      } catch {
        payload = { raw: text.slice(0, 2000) };
      }
    }
    if (!response.ok) {
      const error = this.object(payload.error);
      const detail = this.string(error?.message) ?? this.string(payload.raw);
      throw new Error(
        `${label} failed (${response.status})${detail ? `: ${detail}` : ''}.`,
      );
    }
    return payload;
  }

  private object(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private string(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private number(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private identityKey(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/[/?#].*$/, '')
      .replace(/[^a-z0-9._-]+/g, '-');
  }

  private upscaleXProfileImage(value?: string) {
    return value?.replace('_normal.', '.');
  }

  private currentSundayIst() {
    const now = new Date();
    const ist = new Date(now.getTime() + 330 * 60_000);
    const day = ist.getUTCDay();
    ist.setUTCDate(ist.getUTCDate() - day);
    const yyyy = ist.getUTCFullYear();
    const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(ist.getUTCDate()).padStart(2, '0');
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00+05:30`);
  }

  private recommendationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['recommendations'],
      properties: {
        recommendations: {
          type: 'array',
          minItems: 8,
          maxItems: 12,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'platform',
              'displayName',
              'username',
              'profileUrl',
              'category',
              'whyFollow',
              'whatToLearn',
              'doNotImitate',
              'priority',
            ],
            properties: {
              platform: {
                type: 'string',
                enum: [
                  MediaPlatform.LINKEDIN,
                  MediaPlatform.INSTAGRAM,
                  MediaPlatform.YOUTUBE,
                  MediaPlatform.X,
                ],
              },
              displayName: { type: 'string', minLength: 1 },
              username: { type: 'string' },
              profileUrl: { type: 'string' },
              category: { type: 'string', minLength: 2 },
              whyFollow: { type: 'string', minLength: 20 },
              whatToLearn: { type: 'string', minLength: 15 },
              doNotImitate: { type: 'string', minLength: 10 },
              priority: {
                type: 'string',
                enum: Object.values(MediaSocialRecommendationPriority),
              },
            },
          },
        },
      },
    };
  }

  private profileAuditSchema(): Record<string, unknown> {
    const platformValues = [...PRIMARY_PLATFORMS];
    return {
      type: 'object',
      additionalProperties: false,
      required: ['audits'],
      properties: {
        audits: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'platform',
              'verdict',
              'headlineVerdict',
              'bioVerdict',
              'linkVerdict',
              'bannerVerdict',
              'recommendedHeadline',
              'recommendedBio',
              'recommendedLink',
              'reasons',
              'confidence',
            ],
            properties: {
              platform: { type: 'string', enum: platformValues },
              verdict: { type: 'string', enum: ['keep', 'change', 'review'] },
              headlineVerdict: {
                type: 'string',
                enum: ['keep', 'change', 'not_applicable'],
              },
              bioVerdict: {
                type: 'string',
                enum: ['keep', 'change', 'not_applicable'],
              },
              linkVerdict: {
                type: 'string',
                enum: ['keep', 'change', 'review', 'not_applicable'],
              },
              bannerVerdict: {
                type: 'string',
                enum: ['keep', 'change', 'review', 'not_applicable'],
              },
              recommendedHeadline: { type: 'string' },
              recommendedBio: { type: 'string' },
              recommendedLink: { type: 'string' },
              reasons: {
                type: 'array',
                minItems: 1,
                maxItems: 6,
                items: { type: 'string' },
              },
              confidence: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
              },
            },
          },
        },
      },
    };
  }

  private profileImageAuditSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'verdict',
        'summary',
        'strengths',
        'improvements',
        'confidence',
      ],
      properties: {
        verdict: { type: 'string', enum: ['keep', 'change', 'review'] },
        summary: { type: 'string' },
        strengths: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        improvements: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    };
  }
}
