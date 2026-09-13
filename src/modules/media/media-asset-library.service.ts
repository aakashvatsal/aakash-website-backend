import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateMediaAssetUploadIntentDto } from './dto/media-core.dto';
import { MediaAssetStorageService } from './media-asset-storage.service';
import {
  MediaAsset,
  MediaAssetDocument,
  MediaAssetStatus,
  MediaAssetType,
} from './schemas/media-asset.schema';
import { MediaSourceType } from './schemas/media-post.schema';

@Injectable()
export class MediaAssetLibraryService {
  constructor(
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    private readonly storage: MediaAssetStorageService,
  ) {}

  storageStatus() {
    return this.storage.getStatus();
  }

  async list(
    input: {
      search?: string;
      type?: MediaAssetType;
      limit?: number;
    } = {},
  ) {
    const query: Record<string, unknown> = {
      isActive: true,
      libraryReusable: true,
    };
    if (input.type) query.type = input.type;
    const search = input.search?.trim();
    if (search) {
      const expression = new RegExp(this.escapeRegex(search), 'i');
      query.$or = [
        { originalName: expression },
        { role: expression },
        { notes: expression },
        { tags: expression },
      ];
    }
    const records = await this.assetModel
      .find(query)
      .sort({ uploadedAt: -1, createdAt: -1 })
      .limit(Math.max(1, Math.min(input.limit ?? 100, 250)))
      .lean();
    return records.map((asset) => this.withAccessUrl(asset));
  }

  async createUploadIntent(dto: CreateMediaAssetUploadIntentDto) {
    const originalName = this.cleanFilename(dto.filename);
    const mimeType = dto.mimeType.trim().toLowerCase();
    const type = dto.type ?? this.inferType(mimeType);
    const storageKey = this.storage.buildObjectKey(type, originalName);
    const asset = await this.assetModel.create({
      contentItemId: undefined,
      publicationId: undefined,
      type,
      role: dto.role?.trim() || undefined,
      required: false,
      generatedFromProduction: false,
      source: dto.source ?? MediaSourceType.REAL,
      storageProvider: 's3',
      storageKey,
      originalName,
      mimeType,
      sizeBytes: dto.sizeBytes,
      libraryReusable: true,
      tags: this.normalizeTags(dto.tags),
      notes: dto.notes?.trim() || undefined,
      status: MediaAssetStatus.PLANNED,
      metadata: {
        uploadState: 'intent_created',
      },
      isActive: true,
    });
    return {
      asset: asset.toObject(),
      upload: this.storage.createUploadUrl({
        key: storageKey,
        mimeType,
      }),
    };
  }

  async completeUpload(assetId: string) {
    const asset = await this.assetModel.findOne({
      _id: this.objectId(assetId),
      isActive: true,
      libraryReusable: true,
    });
    if (!asset) throw new NotFoundException('Media Library asset not found.');
    if (!asset.storageKey) {
      throw new BadRequestException(
        'Media Library asset has no S3 object key.',
      );
    }
    if (asset.status === MediaAssetStatus.READY) {
      return this.withAccessUrl(asset.toObject());
    }

    const head = await this.storage.headObject(asset.storageKey);
    if (!head.exists) {
      throw new BadRequestException(
        'The Media asset has not reached S3 yet. Complete the upload before confirming it.',
      );
    }
    if (
      asset.sizeBytes !== undefined &&
      head.contentLength !== undefined &&
      asset.sizeBytes !== head.contentLength
    ) {
      throw new BadRequestException(
        `Uploaded Media asset size mismatch: expected ${asset.sizeBytes} bytes but S3 contains ${head.contentLength}.`,
      );
    }

    asset.status = MediaAssetStatus.READY;
    asset.uploadedAt = new Date();
    asset.etag = head.etag;
    asset.mimeType = head.contentType || asset.mimeType;
    asset.metadata = {
      ...(asset.metadata ?? {}),
      uploadState: 'verified',
      verifiedAt: new Date().toISOString(),
    };
    await asset.save();
    return this.withAccessUrl(asset.toObject());
  }

  async archive(assetId: string) {
    const asset = await this.assetModel.findOne({
      _id: this.objectId(assetId),
      isActive: true,
      libraryReusable: true,
    });
    if (!asset) throw new NotFoundException('Media Library asset not found.');
    asset.status = MediaAssetStatus.ARCHIVED;
    asset.isActive = false;
    asset.metadata = {
      ...(asset.metadata ?? {}),
      archivedAt: new Date().toISOString(),
      physicalObjectRetainedForHistoricalReferences: true,
    };
    await asset.save();
    return asset.toObject();
  }

  async getReusableAsset(assetId: string) {
    const asset = await this.assetModel.findOne({
      _id: this.objectId(assetId),
      isActive: true,
      libraryReusable: true,
      status: MediaAssetStatus.READY,
    });
    if (!asset) {
      throw new NotFoundException('Ready Media Library asset not found.');
    }
    return asset;
  }

  async suggestForRequirement(
    requirement: Pick<
      MediaAsset,
      'type' | 'role' | 'source' | 'notes' | 'prompt' | 'librarySourceAssetId'
    >,
    limit = 6,
  ) {
    const compatibleTypes = this.compatibleTypes(requirement.type);
    const candidates = await this.assetModel
      .find({
        isActive: true,
        libraryReusable: true,
        status: MediaAssetStatus.READY,
        type: { $in: compatibleTypes },
      })
      .sort({ uploadedAt: -1, createdAt: -1 })
      .limit(120)
      .lean();

    const requirementTokens = this.tokens([
      requirement.role,
      requirement.notes,
      requirement.prompt,
    ]);
    return candidates
      .filter(
        (candidate) =>
          candidate._id.toString() !==
          requirement.librarySourceAssetId?.toString(),
      )
      .map((candidate) => {
        const candidateTokens = this.tokens([
          candidate.originalName,
          candidate.role,
          candidate.notes,
          ...(candidate.tags ?? []),
        ]);
        const overlap = requirementTokens.size
          ? [...requirementTokens].filter((token) => candidateTokens.has(token))
              .length / requirementTokens.size
          : 0;
        const exactType = candidate.type === requirement.type ? 0.52 : 0.34;
        const sourceMatch =
          requirement.source && candidate.source === requirement.source
            ? 0.13
            : 0;
        const roleMatch = overlap * 0.3;
        const recencyBonus = candidate.uploadedAt ? 0.05 : 0;
        return {
          ...this.withAccessUrl(candidate),
          matchScore: Math.min(
            1,
            exactType + sourceMatch + roleMatch + recencyBonus,
          ),
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, Math.max(1, Math.min(limit, 12)));
  }

  isCompatible(requirementType: MediaAssetType, libraryType: MediaAssetType) {
    return this.compatibleTypes(requirementType).includes(libraryType);
  }

  private withAccessUrl<T extends { storageKey?: string; url?: string }>(
    asset: T,
  ) {
    const accessUrl = this.storage.resolveAssetUrl(asset, 3600);
    return accessUrl ? { ...asset, accessUrl } : { ...asset };
  }

  private compatibleTypes(type: MediaAssetType): MediaAssetType[] {
    switch (type) {
      case MediaAssetType.THUMBNAIL:
        return [MediaAssetType.THUMBNAIL, MediaAssetType.IMAGE];
      case MediaAssetType.BROLL:
        return [MediaAssetType.BROLL, MediaAssetType.VIDEO];
      case MediaAssetType.CAROUSEL:
        return [
          MediaAssetType.CAROUSEL,
          MediaAssetType.IMAGE,
          MediaAssetType.DOCUMENT,
        ];
      case MediaAssetType.IMAGE:
        return [MediaAssetType.IMAGE, MediaAssetType.THUMBNAIL];
      case MediaAssetType.VIDEO:
        return [MediaAssetType.VIDEO, MediaAssetType.BROLL];
      default:
        return [type];
    }
  }

  private inferType(mimeType: string) {
    if (mimeType.startsWith('image/')) return MediaAssetType.IMAGE;
    if (mimeType.startsWith('video/')) return MediaAssetType.VIDEO;
    if (mimeType.startsWith('audio/')) return MediaAssetType.AUDIO;
    if (
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/') ||
      mimeType.includes('presentation') ||
      mimeType.includes('document')
    ) {
      return MediaAssetType.DOCUMENT;
    }
    return MediaAssetType.OTHER;
  }

  private normalizeTags(tags?: string[]) {
    return [
      ...new Set(
        (tags ?? []).map((item) => item.trim().toLowerCase()).filter(Boolean),
      ),
    ].slice(0, 30);
  }

  private tokens(values: Array<string | undefined>) {
    return new Set(
      values
        .filter((value): value is string => Boolean(value?.trim()))
        .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/g))
        .filter((token) => token.length >= 3)
        .slice(0, 80),
    );
  }

  private cleanFilename(value: string) {
    const cleaned = value
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[^a-zA-Z0-9._() -]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 180);
    if (!cleaned) throw new BadRequestException('Media filename is required.');
    return cleaned;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid Media identifier.');
    }
    return new Types.ObjectId(value);
  }
}
