import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  CreateMediaGrowthExperimentDto,
  RecordMediaAccountMetricsDto,
  RebuildMediaGrowthLearningsDto,
  UpdateMediaGrowthExperimentDto,
} from './dto/media-core.dto';
import { MediaAnalyticsService } from './services/media-analytics.service';
import {
  MediaAccount,
  MediaAccountDocument,
} from './schemas/media-account.schema';
import {
  MediaAccountMetricSnapshot,
  MediaAccountMetricSnapshotDocument,
} from './schemas/media-account-metric-snapshot.schema';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import {
  MediaContentMemory,
  MediaContentMemoryDocument,
  MediaContentMemoryScope,
} from './schemas/media-content-memory.schema';
import {
  MediaGrowthDimension,
  MediaGrowthLearning,
  MediaGrowthLearningDirection,
  MediaGrowthLearningDocument,
} from './schemas/media-growth-learning.schema';
import {
  MediaGrowthExperiment,
  MediaGrowthExperimentDocument,
  MediaGrowthExperimentStatus,
} from './schemas/media-growth-experiment.schema';
import {
  MediaAnalyticsSource,
  MediaMetricSnapshot,
  MediaMetricSnapshotDocument,
  MetricSnapshotPeriod,
} from './schemas/media-metric-snapshot.schema';
import { MediaPlatform, MediaPostStatus } from './schemas/media-post.schema';
import {
  MediaDeliveryStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

export interface PublicationPerformance {
  publicationId: string;
  contentItemId: string;
  accountId?: string;
  platform: MediaPlatform;
  format: string;
  title: string;
  publishedAt?: Date;
  performanceScore: number;
  engagementRate: number;
  shareSaveRate: number;
  followerConversionRate: number;
  impressions: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  profileVisits: number;
  followersGained: number;
  watchTimeSeconds: number;
  averageWatchPercentage?: number;
}

interface LearningSample extends PublicationPerformance {
  contentPillars: string[];
  origin?: string;
  hookArchetype?: string;
  ctaArchetype?: string;
}

@Injectable()
export class MediaGrowthService {
  constructor(
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaContentMemory.name)
    private readonly memoryModel: Model<MediaContentMemoryDocument>,
    @InjectModel(MediaMetricSnapshot.name)
    private readonly metricModel: Model<MediaMetricSnapshotDocument>,
    @InjectModel(MediaAccountMetricSnapshot.name)
    private readonly accountMetricModel: Model<MediaAccountMetricSnapshotDocument>,
    @InjectModel(MediaGrowthLearning.name)
    private readonly learningModel: Model<MediaGrowthLearningDocument>,
    @InjectModel(MediaGrowthExperiment.name)
    private readonly experimentModel: Model<MediaGrowthExperimentDocument>,
    private readonly analyticsService: MediaAnalyticsService,
  ) {}

  async overview(days = 30) {
    const safeDays = Math.min(Math.max(days, 7), 365);
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const [performance, learnings, experiments, accounts] = await Promise.all([
      this.getPerformanceSamples(since),
      this.listLearnings(20),
      this.listExperiments(20),
      this.accountModel.find({ isActive: true }).sort({ platform: 1 }).lean(),
    ]);

    const platformSummaries = Object.values(MediaPlatform)
      .map((platform) => {
        const items = performance.filter((item) => item.platform === platform);
        if (!items.length) return null;
        return {
          platform,
          publications: items.length,
          averagePerformanceScore: this.average(
            items.map((item) => item.performanceScore),
          ),
          averageEngagementRate: this.average(
            items.map((item) => item.engagementRate),
          ),
          followersGained: items.reduce(
            (sum, item) => sum + item.followersGained,
            0,
          ),
          reach: items.reduce((sum, item) => sum + item.reach, 0),
          views: items.reduce((sum, item) => sum + item.views, 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const accountGrowth = await Promise.all(
      accounts.map(async (account) => {
        const snapshots = await this.accountMetricModel
          .find({ accountId: account._id, capturedAt: { $gte: since } })
          .sort({ capturedAt: 1 })
          .lean();
        const first = snapshots[0];
        const latest = snapshots.at(-1);
        const firstAudience = first
          ? Math.max(first.followers || 0, first.subscribers || 0)
          : 0;
        const latestAudience = latest
          ? Math.max(latest.followers || 0, latest.subscribers || 0)
          : 0;
        return {
          accountId: account._id.toString(),
          platform: account.platform,
          displayName: account.displayName,
          snapshots: snapshots.length,
          audience: latestAudience,
          netAudienceGrowth: latestAudience - firstAudience,
          growthPercent:
            firstAudience > 0
              ? this.round(
                  ((latestAudience - firstAudience) / firstAudience) * 100,
                )
              : 0,
          latestCapturedAt: latest?.capturedAt,
        };
      }),
    );

    const sorted = performance
      .slice()
      .sort((a, b) => b.performanceScore - a.performanceScore);

    return {
      generatedAt: new Date().toISOString(),
      rangeDays: safeDays,
      publicationsMeasured: performance.length,
      averagePerformanceScore: this.average(
        performance.map((item) => item.performanceScore),
      ),
      totalFollowersGained: performance.reduce(
        (sum, item) => sum + item.followersGained,
        0,
      ),
      totalReach: performance.reduce((sum, item) => sum + item.reach, 0),
      totalViews: performance.reduce((sum, item) => sum + item.views, 0),
      platformSummaries,
      accountGrowth,
      topContent: sorted.slice(0, 8),
      needsLearning: sorted.slice(-5).reverse(),
      learnings,
      experiments,
      analyticsProviders: this.analyticsService.getProviderStatus(),
      policy: {
        personalOsOwnsAnalyticsHistory: true,
        bufferIsDeliveryNotAnalyticsSourceOfTruth: true,
        comparisonsUseNormalizedPerformanceScores: true,
        learningsRequireMultipleSamples: true,
        learningsAreEvidenceNotHardRules: true,
        directorConsumesHighConfidenceLearnings: true,
      },
    };
  }

  async syncPublicationMetrics(
    publicationId: string,
    period: MetricSnapshotPeriod = MetricSnapshotPeriod.LATEST,
  ) {
    const publication = await this.requirePublication(publicationId);
    if (
      publication.status !== MediaPostStatus.POSTED &&
      publication.deliveryStatus !== MediaDeliveryStatus.PUBLISHED
    ) {
      throw new BadRequestException(
        'Metrics can only be synced for a published Media publication.',
      );
    }
    if (!publication.platformPostId?.trim()) {
      throw new BadRequestException(
        'Platform post ID is required before analytics can be synced.',
      );
    }

    const metrics = await this.analyticsService.getPostMetrics({
      platform: publication.platform,
      platformPostId: publication.platformPostId,
      platformAccountId: publication.accountId?.toString(),
    });
    const normalized = metrics.normalized;
    const derived = this.deriveRates(normalized);

    return this.metricModel
      .findOneAndUpdate(
        { mediaPublicationId: publication._id, period },
        {
          $set: {
            mediaPublicationId: publication._id,
            ...(publication.legacyMediaPostId
              ? { mediaPostId: publication.legacyMediaPostId }
              : {}),
            ...(publication.accountId
              ? { accountId: publication.accountId }
              : {}),
            platform: publication.platform,
            format: publication.format,
            capturedAt: new Date(),
            period,
            source: MediaAnalyticsSource.DIRECT_PLATFORM,
            impressions: normalized.impressions || 0,
            reach: normalized.reach || 0,
            views: normalized.views || 0,
            engagedViews: normalized.engagedViews || 0,
            likes: normalized.likes || 0,
            comments: normalized.comments || 0,
            shares: normalized.shares || 0,
            saves: normalized.saves || 0,
            sends: normalized.sends || 0,
            clicks: normalized.clicks || 0,
            profileVisits: normalized.profileVisits || 0,
            followersGained: normalized.followersGained || 0,
            followersLost: normalized.followersLost || 0,
            leadsGenerated: normalized.leadsGenerated || 0,
            conversions: normalized.conversions || 0,
            watchTimeSeconds: normalized.watchTimeSeconds || 0,
            averageViewDurationSeconds:
              normalized.averageViewDurationSeconds || 0,
            averageWatchPercentage: normalized.averageWatchPercentage,
            engagementRate: derived.engagementRate,
            shareSaveRate: derived.shareSaveRate,
            followerConversionRate: derived.followerConversionRate,
            performanceScore: derived.performanceScore,
            rawMetrics: metrics.raw,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean();
  }

  async syncPublished(limit = 50, period = MetricSnapshotPeriod.LATEST) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const publications = await this.publicationModel
      .find({
        isActive: true,
        platformPostId: { $type: 'string', $ne: '' },
        $or: [
          { status: MediaPostStatus.POSTED },
          { deliveryStatus: MediaDeliveryStatus.PUBLISHED },
        ],
      })
      .sort({ publishedAt: -1, updatedAt: -1 })
      .limit(safeLimit)
      .lean();

    const synced: string[] = [];
    const failures: Array<{ publicationId: string; error: string }> = [];
    for (const publication of publications) {
      try {
        await this.syncPublicationMetrics(publication._id.toString(), period);
        synced.push(publication._id.toString());
      } catch (error) {
        failures.push({
          publicationId: publication._id.toString(),
          error:
            error instanceof Error ? error.message : 'Analytics sync failed.',
        });
      }
    }
    return { attempted: publications.length, synced, failures };
  }

  async publicationPerformance(publicationId: string) {
    const publication = await this.requirePublication(publicationId);
    const snapshots = await this.metricModel
      .find({ mediaPublicationId: publication._id })
      .sort({ capturedAt: 1 })
      .lean();
    return {
      publication,
      snapshots,
      latest: snapshots.at(-1),
    };
  }

  async recordAccountMetrics(
    accountId: string,
    dto: RecordMediaAccountMetricsDto,
  ) {
    const account = await this.accountModel.findOne({
      _id: this.objectId(accountId, 'Media account ID'),
      isActive: true,
    });
    if (!account) throw new NotFoundException('Media account not found.');
    const capturedAt = dto.capturedAt ? new Date(dto.capturedAt) : new Date();
    capturedAt.setMilliseconds(0);
    return this.accountMetricModel
      .findOneAndUpdate(
        { accountId: account._id, capturedAt },
        {
          $set: {
            accountId: account._id,
            platform: account.platform,
            capturedAt,
            followers: dto.followers ?? 0,
            subscribers: dto.subscribers ?? 0,
            profileViews: dto.profileViews ?? 0,
            impressions: dto.impressions ?? 0,
            reach: dto.reach ?? 0,
            views: dto.views ?? 0,
            websiteClicks: dto.websiteClicks ?? 0,
            leads: dto.leads ?? 0,
            source: dto.source?.trim() || 'manual_or_connector',
            rawMetrics: dto.rawMetrics ?? {},
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean();
  }

  async syncAccountMetrics(accountId: string) {
    const account = await this.accountModel.findOne({
      _id: this.objectId(accountId, 'Media account ID'),
      isActive: true,
    });
    if (!account) throw new NotFoundException('Media account not found.');
    if (!account.capabilities?.canReadAnalytics) {
      throw new BadRequestException(
        'This Media account is not configured for analytics access.',
      );
    }

    const metrics = await this.analyticsService.getAccountMetrics({
      platform: account.platform,
      platformAccountId: account.externalAccountId,
    });
    const capturedAt = new Date();
    capturedAt.setMinutes(0, 0, 0);

    return this.accountMetricModel
      .findOneAndUpdate(
        { accountId: account._id, capturedAt },
        {
          $set: {
            accountId: account._id,
            platform: account.platform,
            capturedAt,
            followers: metrics.normalized.followers ?? 0,
            subscribers: metrics.normalized.subscribers ?? 0,
            profileViews: metrics.normalized.profileViews ?? 0,
            impressions: metrics.normalized.impressions ?? 0,
            reach: metrics.normalized.reach ?? 0,
            views: metrics.normalized.views ?? 0,
            websiteClicks: metrics.normalized.websiteClicks ?? 0,
            leads: metrics.normalized.leads ?? 0,
            source: 'direct_platform',
            rawMetrics: metrics.raw,
          },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean();
  }

  async syncAccounts(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const accounts = await this.accountModel
      .find({ isActive: true, 'capabilities.canReadAnalytics': true })
      .sort({ isPrimary: -1, platform: 1 })
      .limit(safeLimit)
      .lean();
    const synced: string[] = [];
    const failures: Array<{ accountId: string; error: string }> = [];
    for (const account of accounts) {
      try {
        await this.syncAccountMetrics(account._id.toString());
        synced.push(account._id.toString());
      } catch (error) {
        failures.push({
          accountId: account._id.toString(),
          error:
            error instanceof Error
              ? error.message
              : 'Account analytics sync failed.',
        });
      }
    }
    return { attempted: accounts.length, synced, failures };
  }

  async accountGrowth(accountId: string, days = 90) {
    const account = await this.accountModel.findOne({
      _id: this.objectId(accountId, 'Media account ID'),
      isActive: true,
    });
    if (!account) throw new NotFoundException('Media account not found.');
    const safeDays = Math.min(Math.max(days, 7), 3650);
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const snapshots = await this.accountMetricModel
      .find({ accountId: account._id, capturedAt: { $gte: since } })
      .sort({ capturedAt: 1 })
      .lean();
    return { account, rangeDays: safeDays, snapshots };
  }

  async rebuildLearnings(dto: RebuildMediaGrowthLearningsDto = {}) {
    const days = Math.min(Math.max(dto.days ?? 90, 7), 365);
    const minSampleSize = Math.min(Math.max(dto.minSampleSize ?? 3, 2), 100);
    const since = new Date(Date.now() - days * 86_400_000);
    const samples = await this.getLearningSamples(since);

    const platformBaselines = new Map<MediaPlatform, number>();
    for (const platform of Object.values(MediaPlatform)) {
      platformBaselines.set(
        platform,
        this.average(
          samples
            .filter((item) => item.platform === platform)
            .map((item) => item.performanceScore),
        ),
      );
    }
    const globalBaseline = this.average(
      samples.map((item) => item.performanceScore),
    );

    const groups = new Map<
      string,
      {
        dimension: MediaGrowthDimension;
        value: string;
        platform?: MediaPlatform;
        samples: LearningSample[];
      }
    >();
    const add = (
      dimension: MediaGrowthDimension,
      value: string | undefined,
      sample: LearningSample,
      platform?: MediaPlatform,
    ) => {
      const normalizedValue = value?.trim();
      if (!normalizedValue) return;
      const key = `${platform ?? 'all'}|${dimension}|${normalizedValue.toLowerCase()}`;
      const existing = groups.get(key) ?? {
        dimension,
        value: normalizedValue,
        platform,
        samples: [],
      };
      existing.samples.push(sample);
      groups.set(key, existing);
    };

    for (const sample of samples) {
      add(MediaGrowthDimension.PLATFORM, sample.platform, sample);
      add(MediaGrowthDimension.FORMAT, sample.format, sample, sample.platform);
      for (const pillar of sample.contentPillars) {
        add(
          MediaGrowthDimension.CONTENT_PILLAR,
          pillar,
          sample,
          sample.platform,
        );
      }
      add(
        MediaGrowthDimension.HOOK_ARCHETYPE,
        sample.hookArchetype,
        sample,
        sample.platform,
      );
      add(
        MediaGrowthDimension.CTA_ARCHETYPE,
        sample.ctaArchetype,
        sample,
        sample.platform,
      );
      add(MediaGrowthDimension.ORIGIN, sample.origin, sample, sample.platform);
      if (sample.publishedAt) {
        add(
          MediaGrowthDimension.PUBLISH_HOUR,
          String(sample.publishedAt.getHours()).padStart(2, '0'),
          sample,
          sample.platform,
        );
        add(
          MediaGrowthDimension.PUBLISH_WEEKDAY,
          String(sample.publishedAt.getDay()),
          sample,
          sample.platform,
        );
      }
    }

    const generatedAt = new Date();
    const learnings = [...groups.values()]
      .filter((group) => group.samples.length >= minSampleSize)
      .map((group) => {
        const averagePerformanceScore = this.average(
          group.samples.map((item) => item.performanceScore),
        );
        const baselinePerformanceScore =
          group.dimension === MediaGrowthDimension.PLATFORM
            ? globalBaseline
            : platformBaselines.get(group.platform as MediaPlatform) ||
              globalBaseline;
        const liftPercent = baselinePerformanceScore
          ? this.round(
              ((averagePerformanceScore - baselinePerformanceScore) /
                baselinePerformanceScore) *
                100,
            )
          : 0;
        const direction =
          liftPercent >= 10
            ? MediaGrowthLearningDirection.POSITIVE
            : liftPercent <= -10
              ? MediaGrowthLearningDirection.NEGATIVE
              : MediaGrowthLearningDirection.NEUTRAL;
        const confidence = Math.min(
          95,
          this.round(
            35 +
              group.samples.length * 9 +
              Math.min(Math.abs(liftPercent), 50) * 0.3,
          ),
        );
        const platformLabel = group.platform ? ` on ${group.platform}` : '';
        const summary = `${group.dimension.replaceAll('_', ' ')} “${group.value}” is ${liftPercent >= 0 ? '+' : ''}${liftPercent}% versus the relevant baseline${platformLabel} across ${group.samples.length} measured publications.`;
        const recommendedAction =
          direction === MediaGrowthLearningDirection.POSITIVE
            ? `Use this pattern more often${platformLabel}, while rotating topic, angle and examples so growth learning does not create repetitive content.`
            : direction === MediaGrowthLearningDirection.NEGATIVE
              ? `Reduce this pattern${platformLabel} or run a controlled experiment before using it heavily again.`
              : `Keep testing this pattern${platformLabel}; the current evidence is not strong enough to prefer or avoid it.`;
        return {
          dimension: group.dimension,
          value: group.value,
          platform: group.platform,
          sampleSize: group.samples.length,
          confidence,
          liftPercent,
          averagePerformanceScore,
          baselinePerformanceScore,
          direction,
          summary,
          recommendedAction,
          evidencePublicationIds: group.samples
            .slice()
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .slice(0, 12)
            .map((item) => new Types.ObjectId(item.publicationId)),
          isActive: true,
          generatedAt,
        };
      });

    await this.learningModel.updateMany(
      { isActive: true },
      { $set: { isActive: false } },
    );
    if (learnings.length) await this.learningModel.insertMany(learnings);

    return {
      rangeDays: days,
      minSampleSize,
      measuredPublications: samples.length,
      generatedLearnings: learnings.length,
      positive: learnings.filter(
        (item) => item.direction === MediaGrowthLearningDirection.POSITIVE,
      ).length,
      negative: learnings.filter(
        (item) => item.direction === MediaGrowthLearningDirection.NEGATIVE,
      ).length,
      learnings: await this.listLearnings(100),
    };
  }

  listLearnings(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.learningModel
      .find({ isActive: true })
      .sort({ confidence: -1, liftPercent: -1, generatedAt: -1 })
      .limit(safeLimit)
      .lean();
  }

  async directorLearningContext(platforms: MediaPlatform[]) {
    const learnings = await this.learningModel
      .find({
        isActive: true,
        confidence: { $gte: 60 },
        $or: [
          { platform: { $in: platforms } },
          { platform: { $exists: false } },
        ],
      })
      .sort({ confidence: -1, generatedAt: -1 })
      .limit(24)
      .lean();
    return learnings.map((item) => ({
      platform: item.platform,
      dimension: item.dimension,
      value: item.value,
      direction: item.direction,
      liftPercent: item.liftPercent,
      confidence: item.confidence,
      sampleSize: item.sampleSize,
      summary: item.summary,
      recommendedAction: item.recommendedAction,
    }));
  }

  listExperiments(limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.experimentModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
  }

  createExperiment(dto: CreateMediaGrowthExperimentDto) {
    return this.experimentModel.create({
      title: dto.title.trim(),
      hypothesis: dto.hypothesis.trim(),
      platform: dto.platform,
      variable: dto.variable.trim(),
      control: dto.control.trim(),
      variant: dto.variant.trim(),
      controlPublicationIds: (dto.controlPublicationIds ?? []).map((id) =>
        this.objectId(id, 'control publication ID'),
      ),
      variantPublicationIds: (dto.variantPublicationIds ?? []).map((id) =>
        this.objectId(id, 'variant publication ID'),
      ),
      status: dto.status ?? MediaGrowthExperimentStatus.PLANNED,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      metadata: dto.metadata ?? {},
      isActive: true,
    });
  }

  async updateExperiment(
    experimentId: string,
    dto: UpdateMediaGrowthExperimentDto,
  ) {
    const set: Record<string, unknown> = {};
    if (dto.title !== undefined) set.title = dto.title.trim();
    if (dto.hypothesis !== undefined) set.hypothesis = dto.hypothesis.trim();
    if (dto.platform !== undefined) set.platform = dto.platform;
    if (dto.variable !== undefined) set.variable = dto.variable.trim();
    if (dto.control !== undefined) set.control = dto.control.trim();
    if (dto.variant !== undefined) set.variant = dto.variant.trim();
    if (dto.controlPublicationIds !== undefined)
      set.controlPublicationIds = dto.controlPublicationIds.map((id) =>
        this.objectId(id, 'control publication ID'),
      );
    if (dto.variantPublicationIds !== undefined)
      set.variantPublicationIds = dto.variantPublicationIds.map((id) =>
        this.objectId(id, 'variant publication ID'),
      );
    if (dto.status !== undefined) set.status = dto.status;
    if (dto.startedAt !== undefined) set.startedAt = new Date(dto.startedAt);
    if (dto.completedAt !== undefined)
      set.completedAt = new Date(dto.completedAt);
    if (dto.winner !== undefined) {
      if (!['control', 'variant', 'inconclusive'].includes(dto.winner)) {
        throw new BadRequestException(
          'Experiment winner must be control, variant or inconclusive.',
        );
      }
      set.winner = dto.winner;
    }
    if (dto.liftPercent !== undefined) set.liftPercent = dto.liftPercent;
    if (dto.resultSummary !== undefined)
      set.resultSummary = dto.resultSummary.trim();
    if (dto.nextAction !== undefined) set.nextAction = dto.nextAction.trim();
    if (dto.metadata !== undefined) set.metadata = dto.metadata;

    const updated = await this.experimentModel
      .findOneAndUpdate(
        {
          _id: this.objectId(experimentId, 'growth experiment ID'),
          isActive: true,
        },
        { $set: set },
        { new: true, runValidators: true },
      )
      .lean();
    if (!updated)
      throw new NotFoundException('Media growth experiment not found.');
    return updated;
  }

  private async getPerformanceSamples(
    since: Date,
  ): Promise<PublicationPerformance[]> {
    const publications = await this.publicationModel
      .find({
        isActive: true,
        publishedAt: { $gte: since },
        $or: [
          { status: MediaPostStatus.POSTED },
          { deliveryStatus: MediaDeliveryStatus.PUBLISHED },
        ],
      })
      .lean();
    if (!publications.length) return [];
    const ids = publications.map((item) => item._id);
    const snapshots = await this.metricModel
      .find({ mediaPublicationId: { $in: ids } })
      .sort({ capturedAt: -1 })
      .lean();
    const latest = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      const key = snapshot.mediaPublicationId?.toString();
      if (key && !latest.has(key)) latest.set(key, snapshot);
    }
    return publications
      .map<PublicationPerformance | null>((publication) => {
        const snapshot = latest.get(publication._id.toString());
        if (!snapshot) return null;
        return {
          publicationId: publication._id.toString(),
          contentItemId: publication.contentItemId.toString(),
          accountId: publication.accountId?.toString(),
          platform: publication.platform,
          format: publication.format,
          title:
            publication.title || publication.hook || 'Untitled publication',
          publishedAt: publication.publishedAt,
          performanceScore: snapshot.performanceScore || 0,
          engagementRate: snapshot.engagementRate || 0,
          shareSaveRate: snapshot.shareSaveRate || 0,
          followerConversionRate: snapshot.followerConversionRate || 0,
          impressions: snapshot.impressions || 0,
          reach: snapshot.reach || 0,
          views: snapshot.views || 0,
          likes: snapshot.likes || 0,
          comments: snapshot.comments || 0,
          shares: snapshot.shares || 0,
          saves: snapshot.saves || 0,
          clicks: snapshot.clicks || 0,
          profileVisits: snapshot.profileVisits || 0,
          followersGained: snapshot.followersGained || 0,
          watchTimeSeconds: snapshot.watchTimeSeconds || 0,
          averageWatchPercentage: snapshot.averageWatchPercentage,
        };
      })
      .filter((item): item is PublicationPerformance => Boolean(item));
  }

  private async getLearningSamples(since: Date): Promise<LearningSample[]> {
    const performance = await this.getPerformanceSamples(since);
    if (!performance.length) return [];
    const contentIds = [
      ...new Set(performance.map((item) => item.contentItemId)),
    ].map((id) => new Types.ObjectId(id));
    const publicationIds = performance.map(
      (item) => new Types.ObjectId(item.publicationId),
    );
    const [contentItems, memories] = await Promise.all([
      this.contentModel.find({ _id: { $in: contentIds } }).lean(),
      this.memoryModel
        .find({
          publicationId: { $in: publicationIds },
          scope: MediaContentMemoryScope.PUBLICATION,
          isActive: true,
        })
        .lean(),
    ]);
    const contentMap = new Map(
      contentItems.map((item) => [item._id.toString(), item]),
    );
    const memoryMap = new Map(
      memories
        .filter((item) => item.publicationId)
        .map((item) => [item.publicationId!.toString(), item]),
    );
    return performance.map((item) => {
      const content = contentMap.get(item.contentItemId);
      const memory = memoryMap.get(item.publicationId);
      return {
        ...item,
        contentPillars: content?.contentPillars ?? [],
        origin: content?.origin,
        hookArchetype: memory?.hookArchetype,
        ctaArchetype: memory?.ctaArchetype,
      };
    });
  }

  private deriveRates(metrics: {
    impressions?: number;
    reach?: number;
    views?: number;
    engagedViews?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    sends?: number;
    clicks?: number;
    profileVisits?: number;
    followersGained?: number;
    averageWatchPercentage?: number;
    engagementRate?: number;
  }) {
    const denominator = Math.max(
      metrics.impressions || 0,
      metrics.reach || 0,
      metrics.views || 0,
      metrics.engagedViews || 0,
    );
    const engagements =
      (metrics.likes || 0) +
      (metrics.comments || 0) +
      (metrics.shares || 0) +
      (metrics.saves || 0) +
      (metrics.sends || 0) +
      (metrics.clicks || 0);
    const engagementRate =
      metrics.engagementRate ??
      (denominator ? this.round((engagements / denominator) * 100) : 0);
    const shareSaveRate = denominator
      ? this.round(
          (((metrics.shares || 0) +
            (metrics.saves || 0) +
            (metrics.sends || 0)) /
            denominator) *
            100,
        )
      : 0;
    const followerConversionRate = denominator
      ? this.round(((metrics.followersGained || 0) / denominator) * 100)
      : 0;
    const actionRate = denominator
      ? (((metrics.profileVisits || 0) + (metrics.clicks || 0)) / denominator) *
        100
      : 0;
    const performanceScore = this.round(
      Math.min(35, (engagementRate / 10) * 35) +
        Math.min(20, (shareSaveRate / 4) * 20) +
        Math.min(20, (followerConversionRate / 1) * 20) +
        Math.min(10, (actionRate / 3) * 10) +
        Math.min(15, ((metrics.averageWatchPercentage || 0) / 70) * 15),
    );
    return {
      engagementRate,
      shareSaveRate,
      followerConversionRate,
      performanceScore,
    };
  }

  private async requirePublication(publicationId: string) {
    const publication = await this.publicationModel.findOne({
      _id: this.objectId(publicationId, 'Media publication ID'),
      isActive: true,
    });
    if (!publication)
      throw new NotFoundException('Media publication not found.');
    return publication;
  }

  private objectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value))
      throw new BadRequestException(`Invalid ${label}.`);
    return new Types.ObjectId(value);
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return this.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    );
  }

  private round(value: number) {
    return Number(value.toFixed(2));
  }
}
