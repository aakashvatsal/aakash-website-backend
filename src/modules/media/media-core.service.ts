import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CreateMediaAccountDto,
  CreateMediaAssetDto,
  CreateMediaContentItemDto,
  CreateMediaPublicationDto,
  UpdateMediaAccountDto,
} from './dto/media-core.dto';
import {
  MediaAccount,
  MediaAccountDocument,
} from './schemas/media-account.schema';
import { MediaAsset, MediaAssetDocument } from './schemas/media-asset.schema';
import {
  MediaContentItem,
  MediaContentItemDocument,
  MediaContentItemStatus,
  MediaContentOrigin,
} from './schemas/media-content-item.schema';
import {
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';
import {
  MediaPost,
  MediaPostDocument,
  MediaPlatform,
} from './schemas/media-post.schema';

type LegacyMediaPostRecord = MediaPost & { _id: Types.ObjectId };

@Injectable()
export class MediaCoreService {
  constructor(
    @InjectModel(MediaAccount.name)
    private readonly accountModel: Model<MediaAccountDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    @InjectModel(MediaPost.name)
    private readonly legacyModel: Model<MediaPostDocument>,
  ) {}

  async overview() {
    const platforms = [
      MediaPlatform.LINKEDIN,
      MediaPlatform.INSTAGRAM,
      MediaPlatform.YOUTUBE,
      MediaPlatform.X,
      MediaPlatform.WHATSAPP,
    ];
    const [accounts, contentItems, publications, assets] = await Promise.all([
      this.accountModel.find({ isActive: true }).lean(),
      this.contentModel.countDocuments({ isActive: true }),
      this.publicationModel.countDocuments({ isActive: true }),
      this.assetModel.countDocuments({ isActive: true }),
    ]);
    const configured = new Set(accounts.map((a) => a.platform));
    return {
      planningHorizonDays: 7,
      accounts,
      counts: { contentItems, publications, assets },
      missingGrowthPlatforms: platforms.filter((p) => !configured.has(p)),
    };
  }

  listAccounts() {
    return this.accountModel
      .find({ isActive: true })
      .sort({ platform: 1, isPrimary: -1 })
      .lean();
  }
  async createAccount(dto: CreateMediaAccountDto) {
    if (dto.isPrimary)
      await this.accountModel.updateMany(
        { platform: dto.platform, isActive: true },
        { $set: { isPrimary: false } },
      );
    return this.accountModel.create({
      ...dto,
      capabilities: dto.capabilities ?? {},
      strategy: { planningHorizonDays: 7, ...(dto.strategy ?? {}) },
      metadata: dto.metadata ?? {},
    });
  }

  async updateAccount(accountId: string, dto: UpdateMediaAccountDto) {
    if (!Types.ObjectId.isValid(accountId)) {
      throw new BadRequestException('Media account ID is invalid.');
    }
    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(accountId),
      isActive: true,
    });
    if (!account) throw new NotFoundException('Media account not found.');

    if (dto.isPrimary === true) {
      await this.accountModel.updateMany(
        {
          platform: account.platform,
          isActive: true,
          _id: { $ne: account._id },
        },
        { $set: { isPrimary: false } },
      );
    }

    if (dto.displayName !== undefined)
      account.displayName = dto.displayName.trim();
    if (dto.username !== undefined)
      account.username = dto.username.trim() || undefined;
    if (dto.externalAccountId !== undefined)
      account.externalAccountId = dto.externalAccountId.trim() || undefined;
    if (dto.connectionStatus !== undefined)
      account.connectionStatus = dto.connectionStatus;
    if (dto.credentialRef !== undefined)
      account.credentialRef = dto.credentialRef.trim() || undefined;
    if (dto.deliveryProvider !== undefined)
      account.deliveryProvider = dto.deliveryProvider;
    if (dto.isPrimary !== undefined) account.isPrimary = dto.isPrimary;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    if (dto.capabilities) {
      account.capabilities = {
        ...(account.capabilities ?? {}),
        ...dto.capabilities,
      };
    }
    if (dto.strategy) {
      account.strategy = {
        ...(account.strategy ?? {}),
        ...dto.strategy,
        planningHorizonDays: Math.max(
          7,
          dto.strategy.planningHorizonDays ??
            account.strategy?.planningHorizonDays ??
            7,
        ),
      };
    }
    if (dto.metadata)
      account.metadata = { ...(account.metadata ?? {}), ...dto.metadata };
    return account.save();
  }

  async listContent(search?: string) {
    const filter: Record<string, unknown> = { isActive: true };
    if (search?.trim()) filter.$text = { $search: search.trim() };
    return this.contentModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }
  createContent(dto: CreateMediaContentItemDto) {
    return this.contentModel.create({
      ...dto,
      companyId: dto.companyId ? new Types.ObjectId(dto.companyId) : undefined,
      memoryIds: dto.memoryIds?.map((id) => new Types.ObjectId(id)) ?? [],
      personIds: dto.personIds?.map((id) => new Types.ObjectId(id)) ?? [],
      generationRunId: dto.generationRunId
        ? new Types.ObjectId(dto.generationRunId)
        : undefined,
      metadata: dto.metadata ?? {},
    });
  }
  async createPublication(dto: CreateMediaPublicationDto) {
    if (
      !(await this.contentModel.exists({
        _id: new Types.ObjectId(dto.contentItemId),
        isActive: true,
      }))
    )
      throw new NotFoundException('Media content item not found.');
    if (
      dto.accountId &&
      !(await this.accountModel.exists({
        _id: new Types.ObjectId(dto.accountId),
        isActive: true,
      }))
    )
      throw new NotFoundException('Media account not found.');
    return this.publicationModel.create({
      ...dto,
      contentItemId: new Types.ObjectId(dto.contentItemId),
      accountId: dto.accountId ? new Types.ObjectId(dto.accountId) : undefined,
      sourcePublicationId: dto.sourcePublicationId
        ? new Types.ObjectId(dto.sourcePublicationId)
        : undefined,
      generationRunId: dto.generationRunId
        ? new Types.ObjectId(dto.generationRunId)
        : undefined,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      planningDueAt: dto.planningDueAt
        ? new Date(dto.planningDueAt)
        : undefined,
      scriptDueAt: dto.scriptDueAt ? new Date(dto.scriptDueAt) : undefined,
      assetDueAt: dto.assetDueAt ? new Date(dto.assetDueAt) : undefined,
      reviewDueAt: dto.reviewDueAt ? new Date(dto.reviewDueAt) : undefined,
      metadata: dto.metadata ?? {},
    });
  }
  listPublications() {
    return this.publicationModel
      .find({ isActive: true })
      .sort({ scheduledAt: 1, createdAt: -1 })
      .limit(200)
      .lean();
  }
  createAsset(dto: CreateMediaAssetDto) {
    if (!dto.contentItemId && !dto.publicationId)
      throw new BadRequestException(
        'Asset must belong to a content item or publication.',
      );
    return this.assetModel.create({
      ...dto,
      contentItemId: dto.contentItemId
        ? new Types.ObjectId(dto.contentItemId)
        : undefined,
      publicationId: dto.publicationId
        ? new Types.ObjectId(dto.publicationId)
        : undefined,
      metadata: dto.metadata ?? {},
    });
  }
  listAssets() {
    return this.assetModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
  }

  async migrationStatus() {
    const [legacy, migrated] = await Promise.all([
      this.legacyModel.countDocuments({ isActive: true }),
      this.contentModel.countDocuments({
        legacyMediaPostId: { $exists: true },
      }),
    ]);
    return {
      legacyPosts: legacy,
      migratedPosts: migrated,
      remaining: Math.max(legacy - migrated, 0),
    };
  }
  async migrateLegacy() {
    const posts = await this.legacyModel.find({ isActive: true }).lean();
    let migrated = 0;
    for (const post of posts) {
      const before = await this.contentModel.exists({
        legacyMediaPostId: post._id,
      });
      await this.syncLegacyPost(post);
      if (!before) migrated += 1;
    }
    return { migrated, ...(await this.migrationStatus()) };
  }

  async syncLegacyPost(post: LegacyMediaPostRecord | MediaPostDocument) {
    const legacyId = new Types.ObjectId(String(post._id));
    const content = await this.contentModel.findOneAndUpdate(
      { legacyMediaPostId: legacyId },
      {
        $set: {
          title: post.content?.title ?? 'Untitled media idea',
          thesis: post.strategy?.coreMessage,
          canonicalBody:
            post.content?.detailedDescription ??
            post.content?.caption ??
            post.content?.textPostScript ??
            post.content?.videoScript,
          contentPillars: post.strategy?.contentPillar
            ? [post.strategy.contentPillar]
            : [],
          audiences: post.strategy?.targetAudience
            ? [post.strategy.targetAudience]
            : [],
          goals: [
            post.strategy?.primaryGoal,
            ...(post.strategy?.secondaryGoals ?? []),
          ].filter(Boolean),
          status: post.isArchived
            ? MediaContentItemStatus.ARCHIVED
            : MediaContentItemStatus.READY,
          origin: MediaContentOrigin.LEGACY_MEDIA_POST,
          companyId: post.companyId,
          memoryIds: post.memoryIds ?? [],
          metadata: { legacyDate: post.date },
          isActive: post.isActive !== false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await this.publicationModel.findOneAndUpdate(
      { legacyMediaPostId: legacyId },
      {
        $set: {
          contentItemId: content._id,
          platform: post.platform,
          format: post.postType,
          status: post.publishing?.status,
          title: post.content?.title,
          hook: post.content?.hook,
          caption: post.content?.caption,
          script:
            post.content?.videoScript ??
            post.content?.textPostScript ??
            post.content?.voiceOverScript,
          description:
            post.content?.shortDescription ?? post.content?.detailedDescription,
          cta: post.content?.cta,
          hashtags: post.content?.hashtags ?? [],
          slides: post.content?.carouselSlides ?? [],
          scheduledAt: post.publishing?.scheduledAt,
          publishedAt: post.publishing?.publishedAt,
          externalPostUrl: post.publishing?.externalPostUrl,
          platformPostId: post.publishing?.platformPostId,
          metadata: { legacyMediaPostId: String(post._id) },
          isActive: post.isActive !== false && !post.isArchived,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return content;
  }

  async search(query: string | undefined, limit = 6) {
    const safe = Math.min(Math.max(limit, 1), 20);
    const contentFilter: Record<string, unknown> = { isActive: true };
    const publicationFilter: Record<string, unknown> = { isActive: true };
    if (query?.trim()) {
      contentFilter.$text = { $search: query.trim() };
      publicationFilter.$text = { $search: query.trim() };
    }
    const [contentItems, publications] = await Promise.all([
      this.contentModel
        .find(contentFilter)
        .sort({ createdAt: -1 })
        .limit(safe)
        .lean(),
      this.publicationModel
        .find(publicationFilter)
        .sort({ createdAt: -1 })
        .limit(safe)
        .lean(),
    ]);
    return { contentItems, publications };
  }
}
