import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  QueryFilter,
  Model,
  Types,
} from 'mongoose';

import { CreateMediaPostDto } from './dto/create-media-post.dto';
import { UpdateMediaPostDto } from './dto/update-media-post.dto';
import { UpdateMediaOutcomeDto } from './dto/update-media-outcome.dto';
import { MediaAnalyticsService } from './services/media-analytics.service';
import {
  MediaMetricSnapshot,
  MediaMetricSnapshotDocument,
  MetricSnapshotPeriod,
} from './schemas/media-metric-snapshot.schema';
import {
  MediaPost,
  MediaPostDocument,
  MediaPostStatus,
  MediaPlatform
} from './schemas/media-post.schema';

interface FindMediaPostsParams {
  // userId: string;
  platform?: MediaPlatform;
  status?: MediaPostStatus;
  companyId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(MediaPost.name)
    private readonly mediaPostModel: Model<MediaPostDocument>,

    @InjectModel(MediaMetricSnapshot.name)
    private readonly mediaMetricSnapshotModel:
      Model<MediaMetricSnapshotDocument>,

    private readonly mediaAnalyticsService: MediaAnalyticsService,
  ) {}

  async create(dto: CreateMediaPostDto) {
  const mediaPost = await this.mediaPostModel.create({
    ...dto,

    companyId: dto.companyId
      ? new Types.ObjectId(dto.companyId)
      : undefined,

    date: new Date(dto.date),

    publishing: dto.publishing
      ? {
          ...dto.publishing,

          scheduledAt: dto.publishing.scheduledAt
            ? new Date(dto.publishing.scheduledAt)
            : undefined,

          publishedAt: dto.publishing.publishedAt
            ? new Date(dto.publishing.publishedAt)
            : undefined,
        }
      : undefined,

    outcome: dto.outcome
      ? {
          ...dto.outcome,

          evaluatedAt: dto.outcome.evaluatedAt
            ? new Date(dto.outcome.evaluatedAt)
            : undefined,
        }
      : undefined,

    analyticsSync: dto.analyticsSync
      ? {
          ...dto.analyticsSync,

          lastSyncedAt: dto.analyticsSync.lastSyncedAt
            ? new Date(dto.analyticsSync.lastSyncedAt)
            : undefined,
        }
      : undefined,

    memoryIds: dto.memoryIds?.map(
      (memoryId) => new Types.ObjectId(memoryId),
    ),

    metadata: dto.metadata ?? {},

    isActive: dto.isActive ?? true,
    isArchived: dto.isArchived ?? false,
  });

  return {
    statusCode: 201,
    message: 'Media post created successfully',
    data: mediaPost,
  };
}

  async findAll(params: FindMediaPostsParams) {
    const {
      // userId,
      platform,
      status,
      companyId,
      search,
      page = 1,
      limit = 20,
    } = params;

    // if (!Types.ObjectId.isValid(userId)) {
    //   throw new BadRequestException('Invalid user ID.');
    // }

    const filter: QueryFilter<MediaPostDocument> = {
      // userId: new Types.ObjectId(userId),
      isActive: true,
    };

    if (platform) {
      filter.platform = platform;
    }

    if (status) {
      filter['publishing.status'] = status;
    }

    if (companyId) {
      if (!Types.ObjectId.isValid(companyId)) {
        throw new BadRequestException('Invalid company ID.');
      }

      filter.companyId = new Types.ObjectId(companyId);
    }

    if (search?.trim()) {
      filter.$text = {
        $search: search.trim(),
      };
    }

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100,
    );

    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.mediaPostModel
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),

      this.mediaPostModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findOne(mediaPostId: string, userId?: string) {
    this.validateObjectId(mediaPostId, 'media post ID');
    // this.validateObjectId(userId, 'user ID');

    const mediaPost = await this.mediaPostModel
      .findOne({
        _id: new Types.ObjectId(mediaPostId),
        // userId: new Types.ObjectId(userId),
        isActive: true,
      })
      .lean();

    if (!mediaPost) {
      throw new NotFoundException('Media post not found.');
    }

    const latestMetrics = await this.mediaMetricSnapshotModel
      .findOne({
        mediaPostId: new Types.ObjectId(mediaPostId),
        period: MetricSnapshotPeriod.LATEST,
      })
      .lean();

    return {
      ...mediaPost,
      latestMetrics,
    };
  }

  async update(
    mediaPostId: string,
    // userId: string,
    dto: UpdateMediaPostDto,
  ) {
    this.validateObjectId(mediaPostId, 'media post ID');
    // this.validateObjectId(userId, 'user ID');

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    // if (dto.userId) {
    //   updateData.userId = new Types.ObjectId(dto.userId);
    // }

    if (dto.companyId) {
      updateData.companyId = new Types.ObjectId(dto.companyId);
    }

    if (dto.date) {
      updateData.date = new Date(dto.date);
    }

    if (dto.publishing) {
      updateData.publishing = {
        ...dto.publishing,
        scheduledAt: dto.publishing.scheduledAt
          ? new Date(dto.publishing.scheduledAt)
          : undefined,
        publishedAt: dto.publishing.publishedAt
          ? new Date(dto.publishing.publishedAt)
          : undefined,
      };
    }

    const updated = await this.mediaPostModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(mediaPostId),
          // userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Media post not found.');
    }

    return updated;
  }

  async updateOutcome(
    mediaPostId: string,
    userId: string,
    dto: UpdateMediaOutcomeDto,
  ) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const outcome = {
      ...dto,
      evaluatedAt: dto.evaluatedAt
        ? new Date(dto.evaluatedAt)
        : new Date(),
    };

    const updated = await this.mediaPostModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(mediaPostId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            outcome,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Media post not found.');
    }

    return updated;
  }

  async markAsPosted(
    mediaPostId: string,
    userId: string,
    publishingData: {
      externalPostUrl: string;
      platformPostId: string;
      platformAccountId?: string;
      platformMediaId?: string;
      analyticsUrl?: string;
      publishedAt?: Date;
    },
  ) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const updated = await this.mediaPostModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(mediaPostId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            'publishing.status': MediaPostStatus.POSTED,
            'publishing.publishedAt':
              publishingData.publishedAt || new Date(),
            'publishing.externalPostUrl':
              publishingData.externalPostUrl,
            'publishing.platformPostId':
              publishingData.platformPostId,
            'publishing.platformAccountId':
              publishingData.platformAccountId,
            'publishing.platformMediaId':
              publishingData.platformMediaId,
            'publishing.analyticsUrl':
              publishingData.analyticsUrl,
            'publishing.errorMessage': null,
            'analyticsSync.enabled': true,
            'analyticsSync.nextSyncAt': new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Media post not found.');
    }

    return updated;
  }

  async syncMetrics(
    mediaPostId: string,
    userId: string,
    period: MetricSnapshotPeriod =
      MetricSnapshotPeriod.LATEST,
  ) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const mediaPost = await this.mediaPostModel.findOne({
      _id: new Types.ObjectId(mediaPostId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!mediaPost) {
      throw new NotFoundException('Media post not found.');
    }

    if (
      mediaPost.publishing?.status !==
      MediaPostStatus.POSTED
    ) {
      throw new BadRequestException(
        'Metrics can only be synced for a posted media item.',
      );
    }

    if (!mediaPost.publishing?.platformPostId) {
      throw new BadRequestException(
        'Platform post ID is missing.',
      );
    }

    try {
      const metrics =
        await this.mediaAnalyticsService.getPostMetrics({
          platform: mediaPost.platform,
          platformPostId:
            mediaPost.publishing.platformPostId,
          platformAccountId:
            mediaPost.publishing.platformAccountId,
          platformMediaId:
            mediaPost.publishing.platformMediaId,
        });

      const normalized = metrics.normalized;

      const engagementRate =
        normalized.engagementRate ??
        this.calculateEngagementRate({
          impressions: normalized.impressions || 0,
          reach: normalized.reach || 0,
          likes: normalized.likes || 0,
          comments: normalized.comments || 0,
          shares: normalized.shares || 0,
          saves: normalized.saves || 0,
          clicks: normalized.clicks || 0,
        });

      const snapshot =
        await this.mediaMetricSnapshotModel
          .findOneAndUpdate(
            {
              mediaPostId: mediaPost._id,
              period,
            },
            {
              $set: {
                // userId: mediaPost.userId,
                mediaPostId: mediaPost._id,
                platform: mediaPost.platform,
                period,
                capturedAt: new Date(),
                impressions:
                  normalized.impressions || 0,
                reach: normalized.reach || 0,
                views: normalized.views || 0,
                likes: normalized.likes || 0,
                comments: normalized.comments || 0,
                shares: normalized.shares || 0,
                saves: normalized.saves || 0,
                clicks: normalized.clicks || 0,
                profileVisits:
                  normalized.profileVisits || 0,
                followersGained:
                  normalized.followersGained || 0,
                leadsGenerated:
                  normalized.leadsGenerated || 0,
                conversions:
                  normalized.conversions || 0,
                watchTimeSeconds:
                  normalized.watchTimeSeconds || 0,
                averageWatchPercentage:
                  normalized.averageWatchPercentage,
                engagementRate,
                rawMetrics: metrics.raw,
              },
            },
            {
              upsert: true,
              new: true,
              runValidators: true,
            },
          )
          .lean();

      await this.mediaPostModel.updateOne(
        {
          _id: mediaPost._id,
        },
        {
          $set: {
            'analyticsSync.enabled': true,
            'analyticsSync.lastSyncedAt': new Date(),
            'analyticsSync.nextSyncAt':
              this.getNextSyncDate(mediaPost),
            'analyticsSync.lastSyncError': null,
          },
          $inc: {
            'analyticsSync.syncAttempts': 1,
          },
        },
      );

      return snapshot;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown analytics sync error';

      await this.mediaPostModel.updateOne(
        {
          _id: mediaPost._id,
        },
        {
          $set: {
            'analyticsSync.lastSyncError': message,
          },
          $inc: {
            'analyticsSync.syncAttempts': 1,
          },
        },
      );

      throw error;
    }
  }

  async getMetricHistory(
    mediaPostId: string,
    userId: string,
  ) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const mediaPostExists =
      await this.mediaPostModel.exists({
        _id: new Types.ObjectId(mediaPostId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

    if (!mediaPostExists) {
      throw new NotFoundException('Media post not found.');
    }

    return this.mediaMetricSnapshotModel
      .find({
        mediaPostId: new Types.ObjectId(mediaPostId),
      })
      .sort({
        capturedAt: 1,
      })
      .lean();
  }

  async archive(mediaPostId: string, userId: string) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const updated = await this.mediaPostModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(mediaPostId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            isArchived: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Media post not found.');
    }

    return updated;
  }

  async remove(mediaPostId: string, userId: string) {
    this.validateObjectId(mediaPostId, 'media post ID');
    this.validateObjectId(userId, 'user ID');

    const updated = await this.mediaPostModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(mediaPostId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            isActive: false,
            isArchived: true,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Media post not found.');
    }

    return {
      message: 'Media post deleted successfully.',
    };
  }

  private calculateEngagementRate(metrics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    clicks: number;
  }): number {
    const engagements =
      metrics.likes +
      metrics.comments +
      metrics.shares +
      metrics.saves +
      metrics.clicks;

    const denominator =
      metrics.impressions || metrics.reach;

    if (!denominator) {
      return 0;
    }

    return Number(
      ((engagements / denominator) * 100).toFixed(2),
    );
  }

  private getNextSyncDate(
    mediaPost: MediaPostDocument,
  ): Date {
    const publishedAt =
      mediaPost.publishing?.publishedAt || new Date();

    const hoursSincePublished =
      (Date.now() - publishedAt.getTime()) /
      (1000 * 60 * 60);

    const nextSyncAt = new Date();

    if (hoursSincePublished < 24) {
      nextSyncAt.setHours(nextSyncAt.getHours() + 1);
      return nextSyncAt;
    }

    if (hoursSincePublished < 168) {
      nextSyncAt.setHours(nextSyncAt.getHours() + 12);
      return nextSyncAt;
    }

    nextSyncAt.setDate(nextSyncAt.getDate() + 1);
    return nextSyncAt;
  }

  private validateObjectId(
    value: string,
    fieldName: string,
  ): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }
  }
}