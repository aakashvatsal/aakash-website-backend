import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, QueryFilter, Types } from 'mongoose';

import {
  AcceptMemoryInboxItemDto,
  CaptureMemoryInboxItemDto,
  RejectMemoryInboxItemDto,
} from './dto/capture-memory-inbox-item.dto';
import { MemoryInboxQueryDto } from './dto/memory-inbox-query.dto';
import { MemoryService } from './memory.service';
import {
  MemoryInboxItem,
  MemoryInboxItemDocument,
  MemoryInboxStatus,
} from './schemas/memory-inbox-item.schema';
import {
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryPersonRelation,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

@Injectable()
export class MemoryInboxService {
  constructor(
    @InjectModel(MemoryInboxItem.name)
    private readonly inboxModel: Model<MemoryInboxItemDocument>,
    private readonly memoryService: MemoryService,
  ) {}

  async capture(dto: CaptureMemoryInboxItemDto) {
    return this.createInboxItem({
      ...dto,
      captureOrigin: dto.captureOrigin ?? MemoryCaptureOrigin.MANUAL,
      source: dto.source ?? MemorySource.MANUAL,
    });
  }

  async captureFromHsakaa(
    dto: Omit<CaptureMemoryInboxItemDto, 'captureOrigin' | 'source'>,
  ) {
    const sensitivity = dto.sensitivity ?? MemorySensitivity.PERSONAL;

    if (
      sensitivity === MemorySensitivity.SENSITIVE ||
      sensitivity === MemorySensitivity.HIGHLY_SENSITIVE
    ) {
      throw new BadRequestException(
        'Sensitive memory candidates require explicit user confirmation and cannot be auto-staged by HSAKAA.',
      );
    }

    return this.createInboxItem({
      ...dto,
      captureOrigin: MemoryCaptureOrigin.HSAKAA,
      source: MemorySource.CHAT,
      accessLevel: MemoryAccessLevel.OWNER_ONLY,
      verificationStatus: MemoryVerificationStatus.INFERRED,
      sensitivity,
    });
  }

  async findAll(query: MemoryInboxQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: QueryFilter<MemoryInboxItemDocument> = {
      isActive: true,
    };

    if (query.status) filter.status = query.status;
    if (query.captureOrigin) filter.captureOrigin = query.captureOrigin;
    if (query.durability) filter.durability = query.durability;
    if (query.source) filter.source = query.source;
    if (query.sensitivity) filter.sensitivity = query.sensitivity;
    if (query.scope) filter.scope = query.scope;

    if (query.search?.trim()) {
      const escaped = query.search
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { content: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } },
        { categories: { $regex: escaped, $options: 'i' } },
        { 'entities.name': { $regex: escaped, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total, pending] = await Promise.all([
      this.inboxModel
        .find(filter)
        .sort({
          status: 1,
          importance: -1,
          capturedAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inboxModel.countDocuments(filter),
      this.inboxModel.countDocuments({
        isActive: true,
        status: MemoryInboxStatus.PENDING,
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      pendingCount: pending,
    };
  }

  async getPendingForHsakaa(limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 20);

    const items = await this.inboxModel
      .find({
        isActive: true,
        status: MemoryInboxStatus.PENDING,
      })
      .sort({ importance: -1, capturedAt: -1 })
      .limit(safeLimit)
      .lean();

    return {
      pendingCount: await this.inboxModel.countDocuments({
        isActive: true,
        status: MemoryInboxStatus.PENDING,
      }),
      items,
    };
  }

  async accept(inboxItemId: string, dto: AcceptMemoryInboxItemDto) {
    const item = await this.getPendingItem(inboxItemId);

    const content = dto.content?.trim() || item.content;
    const durability = dto.durability ?? item.durability;
    const expiresAt =
      dto.expiresAt ??
      (item.expiresAt ? item.expiresAt.toISOString() : undefined);

    const memory = await this.memoryService.create({
      personId: dto.personId ?? item.personId?.toString(),
      scope:
        dto.scope ??
        (item.personId && !(item.personLinks ?? []).length
          ? MemoryScope.INDIVIDUAL
          : item.scope),
      personLinks: dto.personLinks
        ? dto.personLinks
        : (item.personLinks ?? []).map((link) => ({
            personId: link.personId.toString(),
            relation: link.relation,
          })),
      content,
      type: dto.type ?? item.type,
      source: item.source,
      sourceReference: item.sourceReference
        ? {
            entityId: item.sourceReference.entityId?.toString(),
            entityType: item.sourceReference.entityType,
            externalId: item.sourceReference.externalId,
            sourceUrl: item.sourceReference.sourceUrl,
            sourceCreatedAt:
              item.sourceReference.sourceCreatedAt?.toISOString(),
          }
        : undefined,
      tags: dto.tags ?? item.tags,
      categories: dto.categories ?? item.categories,
      entities: dto.entities
        ? dto.entities.map((entity) => ({
            type: entity.type,
            name: entity.name,
            entityId: entity.entityId,
            externalId: entity.externalId,
          }))
        : item.entities.map((entity) => ({
            type: entity.type,
            name: entity.name,
            entityId: entity.entityId?.toString(),
            externalId: entity.externalId,
          })),
      importance: dto.importance ?? item.importance,
      confidence: dto.confidence ?? item.confidence,
      verificationStatus:
        dto.verificationStatus ?? MemoryVerificationStatus.CONFIRMED,
      accessLevel: dto.accessLevel ?? item.accessLevel,
      sensitivity: dto.sensitivity ?? item.sensitivity,
      durability,
      captureOrigin: item.captureOrigin,
      capturedAt: item.capturedAt.toISOString(),
      happenedAt: dto.happenedAt ?? item.happenedAt?.toISOString(),
      inboxItemId: item._id.toString(),
      expiresAt,
    });

    item.status = MemoryInboxStatus.ACCEPTED;
    item.acceptedMemoryId = memory._id;
    item.acceptedAt = new Date();
    item.rejectionReason = undefined;
    item.rejectedAt = undefined;
    await item.save();

    return {
      inboxItem: item,
      memory,
    };
  }

  async reject(inboxItemId: string, dto: RejectMemoryInboxItemDto) {
    const item = await this.getPendingItem(inboxItemId);

    item.status = MemoryInboxStatus.REJECTED;
    item.rejectedAt = new Date();
    item.rejectionReason = dto.reason?.trim() || undefined;
    await item.save();

    return item;
  }

  private async createInboxItem(dto: CaptureMemoryInboxItemDto) {
    const content = this.cleanContent(dto.content);
    const contentHash = this.generateContentHash(content);
    const type = dto.type ?? MemoryType.FACT;
    const attribution = await this.memoryService.resolveAttribution({
      scope: dto.scope,
      personId: dto.personId,
      personLinks: dto.personLinks,
    });

    const duplicateFilter: QueryFilter<MemoryInboxItemDocument> = {
      contentHash,
      type,
      scope: attribution.scope,
      status: MemoryInboxStatus.PENDING,
      isActive: true,
    };

    if (attribution.scope === MemoryScope.INDIVIDUAL) {
      duplicateFilter.personId = attribution.personId;
    } else if (attribution.scope === MemoryScope.GROUP) {
      const subjectIds = attribution.personLinks
        .filter((link) =>
          [
            MemoryPersonRelation.PRIMARY_SUBJECT,
            MemoryPersonRelation.PARTICIPANT,
          ].includes(link.relation),
        )
        .map((link) => link.personId);
      duplicateFilter.$and = subjectIds.map((personId) => ({
        personLinks: {
          $elemMatch: {
            personId,
            relation: {
              $in: [
                MemoryPersonRelation.PRIMARY_SUBJECT,
                MemoryPersonRelation.PARTICIPANT,
              ],
            },
          },
        },
      }));
    } else {
      duplicateFilter.personId = null;
    }

    const duplicate = await this.inboxModel.findOne(duplicateFilter);

    if (duplicate) {
      return duplicate;
    }

    const capturedAt = dto.capturedAt
      ? this.parseDate(dto.capturedAt, 'capturedAt')
      : new Date();

    return this.inboxModel.create({
      personId: attribution.personId,
      scope: attribution.scope,
      personLinks: attribution.personLinks,
      content,
      contentHash,
      type,
      source: dto.source ?? MemorySource.MANUAL,
      sourceReference: this.prepareSourceReference(dto.sourceReference),
      tags: this.normalizeLabels(dto.tags),
      categories: this.normalizeLabels(dto.categories),
      entities: this.prepareEntities(dto.entities),
      importance: dto.importance ?? 0.5,
      confidence: dto.confidence ?? 0.5,
      verificationStatus:
        dto.verificationStatus ?? MemoryVerificationStatus.UNVERIFIED,
      accessLevel: dto.accessLevel ?? MemoryAccessLevel.OWNER_ONLY,
      sensitivity: dto.sensitivity ?? MemorySensitivity.PERSONAL,
      durability: dto.durability ?? MemoryDurability.DURABLE,
      captureOrigin: dto.captureOrigin ?? MemoryCaptureOrigin.MANUAL,
      capturedAt,
      happenedAt: dto.happenedAt
        ? this.parseDate(dto.happenedAt, 'happenedAt')
        : undefined,
      expiresAt: dto.expiresAt
        ? this.parseDate(dto.expiresAt, 'expiresAt')
        : undefined,
      proposalReason: dto.proposalReason?.trim(),
      status: MemoryInboxStatus.PENDING,
    });
  }

  private async getPendingItem(inboxItemId: string) {
    if (!Types.ObjectId.isValid(inboxItemId)) {
      throw new BadRequestException('Invalid memory inbox item ID.');
    }

    const item = await this.inboxModel
      .findOne({
        _id: new Types.ObjectId(inboxItemId),
        isActive: true,
      })
      .select('+contentHash');

    if (!item) {
      throw new NotFoundException('Memory inbox item not found.');
    }

    if (item.status !== MemoryInboxStatus.PENDING) {
      throw new ConflictException(
        `Memory inbox item is already ${item.status}.`,
      );
    }

    return item;
  }

  private cleanContent(content: string) {
    const clean = content?.trim().replace(/\s+/g, ' ');
    if (!clean) throw new BadRequestException('Memory content is required.');
    return clean;
  }

  private generateContentHash(content: string) {
    return createHash('sha256').update(content.toLowerCase()).digest('hex');
  }

  private normalizeLabels(values?: string[]) {
    return [
      ...new Set(
        (values ?? [])
          .map((value) => value.trim().toLowerCase().replace(/\s+/g, '-'))
          .filter(Boolean),
      ),
    ];
  }

  private prepareEntities(entities?: CaptureMemoryInboxItemDto['entities']) {
    return (entities ?? []).map((entity) => {
      if (entity.entityId && !Types.ObjectId.isValid(entity.entityId)) {
        throw new BadRequestException('Invalid memory entity ID.');
      }

      return {
        type: entity.type,
        name: entity.name.trim(),
        entityId: entity.entityId
          ? new Types.ObjectId(entity.entityId)
          : undefined,
        externalId: entity.externalId?.trim(),
      };
    });
  }

  private prepareSourceReference(
    reference?: CaptureMemoryInboxItemDto['sourceReference'],
  ) {
    if (!reference) return undefined;

    if (reference.entityId && !Types.ObjectId.isValid(reference.entityId)) {
      throw new BadRequestException('Invalid source entity ID.');
    }

    return {
      entityId: reference.entityId
        ? new Types.ObjectId(reference.entityId)
        : undefined,
      entityType: reference.entityType?.trim(),
      externalId: reference.externalId?.trim(),
      sourceUrl: reference.sourceUrl?.trim(),
      sourceCreatedAt: reference.sourceCreatedAt
        ? this.parseDate(reference.sourceCreatedAt, 'sourceCreatedAt')
        : undefined,
    };
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
    return date;
  }
}
