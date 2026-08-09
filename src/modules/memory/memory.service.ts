import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  QueryFilter,
  Model,
  Types,
} from 'mongoose';
import { createHash } from 'crypto';

import { CreateMemoryDto } from './dto/create-memory.dto';
import { DisputeMemoryDto } from './dto/dispute-memory.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { UpdateMemoryScoreDto } from './dto/update-memory-score.dto';
import { UpdateMemoryTagsDto } from './dto/update-memory-tags.dto';
import { MemoryVerificationService } from './memory-verification.service';
import {
  Memory,
  MemoryAccessLevel,
  MemoryDocument,
  MemoryType,
} from './schemas/memory.schema';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import { CreateManyMemoryDto } from './dto/create-many-memory.dto';
@Injectable()
export class MemoryService {
  constructor(
    @InjectModel(Memory.name)
    private readonly memoryModel:
      Model<MemoryDocument>,

    @InjectModel(MemoryPerson.name)
    private readonly memoryPersonModel:
      Model<MemoryPersonDocument>,

    private readonly verificationService:
      MemoryVerificationService,
  ) {}

  async create(dto: CreateMemoryDto) {
    // this.validateObjectId(
    //   dto.ownerUserId,
    //   'owner user ID',
    // );

    // const ownerUserId =
    //   new Types.ObjectId(dto.ownerUserId);

    const accessLevel =
      dto.accessLevel ??
      (dto.personId
        ? MemoryAccessLevel.OWNER_AND_PERSON
        : MemoryAccessLevel.OWNER_ONLY);

    this.validatePersonAccess(
      accessLevel,
      dto.personId,
    );

    const personId = await this.resolvePersonId(
      // ownerUserId,
      dto.personId,
    );

    const content = this.cleanContent(dto.content);
    const contentHash =
      this.generateContentHash(content);

    const type = dto.type ?? MemoryType.FACT;

    const duplicateFilter: QueryFilter<MemoryDocument> =
      {
        // ownerUserId,
        contentHash,
        type,
        isActive: true,
      };

    if (personId) {
      duplicateFilter.personId = personId;
    } else {
      duplicateFilter.personId = null;
      duplicateFilter.accessLevel = accessLevel;
    }

    const duplicate =
      await this.memoryModel.findOne(
        duplicateFilter,
      );

    if (duplicate) {
      return duplicate;
    }

    return this.memoryModel.create({
      // ownerUserId,
      personId,
      content,
      contentHash,
      type,
      source: dto.source,
      sourceReference:
        this.prepareSourceReference(
          dto.sourceReference,
        ),
      tags: this.normalizeTags(dto.tags),
      importance: dto.importance,
      confidence: dto.confidence,
      verificationStatus:
        dto.verificationStatus,
      accessLevel,
      sensitivity: dto.sensitivity,
      expiresAt: dto.expiresAt
        ? this.parseDate(
            dto.expiresAt,
            'expiresAt',
          )
        : undefined,
    });
  }

  async createMany(dto: CreateManyMemoryDto) {
    // this.validateObjectId(
    //     dto.ownerUserId,
    //     'owner user ID',
    // );

    const results = await Promise.allSettled(
        dto.memory.map((memory) =>
        this.create({
            ...memory,
            // ownerUserId: dto.ownerUserId,
        }),
        ),
    );

    const created: unknown[] = [];

    const failed: Array<{
        index: number;
        content: string;
        error: string;
    }> = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
        created.push(result.value);
        return;
        }

        failed.push({
        index,
        content: dto.memory[index].content,
        error:
            result.reason instanceof Error
            ? result.reason.message
            : 'Unable to create memory.',
        });
    });

    return {
        totalRequested: dto.memory.length,
        createdCount: created.length,
        failedCount: failed.length,
        created,
        failed,
    };
  }

  async findAll(query: MemoryQueryDto) {
    // this.validateObjectId(
    //   query.ownerUserId,
    //   'owner user ID',
    // );

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(
      Math.max(query.limit ?? 20, 1),
      100,
    );

    const filter: QueryFilter<MemoryDocument> = {
      // ownerUserId: new Types.ObjectId(
      //   query.ownerUserId,
      // ),
      isActive: true,
    };

    if (query.personId) {
      this.validateObjectId(
        query.personId,
        'person ID',
      );

      filter.personId = new Types.ObjectId(
        query.personId,
      );
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.source) {
      filter.source = query.source;
    }

    if (query.accessLevel) {
      filter.accessLevel = query.accessLevel;
    }

    if (query.sensitivity) {
      filter.sensitivity = query.sensitivity;
    }

    if (query.verificationStatus) {
      filter.verificationStatus =
        query.verificationStatus;
    }

    if (query.tag?.trim()) {
      filter.tags = this.normalizeTag(query.tag);
    }

    if (query.minimumImportance !== undefined) {
      filter.importance = {
        $gte: query.minimumImportance,
      };
    }

    if (query.minimumConfidence !== undefined) {
      filter.confidence = {
        $gte: query.minimumConfidence,
      };
    }

    if (query.isDisputed !== undefined) {
      filter.isDisputed = query.isDisputed;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.memoryModel
        .find(filter)
        .sort({
          importance: -1,
          confidence: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.memoryModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicmemory(
    // ownerUserId: string,
    search?: string,
  ) {
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const filter: QueryFilter<MemoryDocument> = {
      // ownerUserId: new Types.ObjectId(
      //   ownerUserId,
      // ),
      accessLevel: MemoryAccessLevel.PUBLIC,
      isActive: true,
      isArchived: false,
      isDisputed: false,
      $or: [
        {
          expiresAt: {
            $exists: false,
          },
        },
        {
          expiresAt: null,
        },
        {
          expiresAt: {
            $gt: new Date(),
          },
        },
      ],
    };

    if (search?.trim()) {
      filter.$text = {
        $search: search.trim(),
      };
    }

    const memory = await this.memoryModel
      .find(filter)
      .sort({
        importance: -1,
        confidence: -1,
        createdAt: -1,
      })
      .lean();

    await this.markmemoryAccessed(
      memory.map((memory) => memory._id),
    );

    return memory;
  }

  async findForVerifiedPerson(
    rawSessionToken: string,
  ) {
    const session =
      await this.verificationService.validateSession(
        rawSessionToken,
      );

    const memory = await this.memoryModel
      .find({
        // ownerUserId: session.ownerUserId,
        personId: session.personId,
        accessLevel: {
          $in: [
            MemoryAccessLevel.PERSON_PRIVATE,
            MemoryAccessLevel.OWNER_AND_PERSON,
            MemoryAccessLevel.PUBLIC,
          ],
        },
        isActive: true,
        isArchived: false,
        isDisputed: false,
        $or: [
          {
            expiresAt: {
              $exists: false,
            },
          },
          {
            expiresAt: null,
          },
          {
            expiresAt: {
              $gt: new Date(),
            },
          },
        ],
      })
      .sort({
        importance: -1,
        confidence: -1,
        createdAt: -1,
      })
      .lean();

    await this.markmemoryAccessed(
      memory.map((memory) => memory._id),
    );

    return {
      personId: session.personId,
      memory,
    };
  }

  async findOne(
    memoryId: string,
    // ownerUserId: string,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.lastAccessedAt = new Date();
    memory.accessCount += 1;

    await memory.save();

    return memory;
  }

  async update(
    memoryId: string,
    // ownerUserId: string,
    dto: UpdateMemoryDto,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    const nextAccessLevel =
      dto.accessLevel ?? memory.accessLevel;

    const nextPersonId =
      dto.personId !== undefined
        ? dto.personId
        : memory.personId?.toString();

    this.validatePersonAccess(
      nextAccessLevel,
      nextPersonId,
    );

    if (dto.personId !== undefined) {
      memory.personId = await this.resolvePersonId(
        // memory.ownerUserId,
        dto.personId,
      );
    }

    if (dto.content !== undefined) {
      const content = this.cleanContent(
        dto.content,
      );

      const contentHash =
        this.generateContentHash(content);

      const duplicate =
        await this.memoryModel.exists({
          _id: {
            $ne: memory._id,
          },
          // ownerUserId: memory.ownerUserId,
          personId: memory.personId ?? null,
          contentHash,
          type: dto.type ?? memory.type,
          isActive: true,
        });

      if (duplicate) {
        throw new ConflictException(
          'A duplicate active memory already exists.',
        );
      }

      memory.content = content;
      memory.contentHash = contentHash;
    }

    if (dto.type !== undefined) {
      memory.type = dto.type;
    }

    if (dto.source !== undefined) {
      memory.source = dto.source;
    }

    if (dto.sourceReference !== undefined) {
      memory.sourceReference =
        this.prepareSourceReference(
          dto.sourceReference,
        );
    }

    if (dto.tags !== undefined) {
      memory.tags = this.normalizeTags(dto.tags);
    }

    if (dto.importance !== undefined) {
      memory.importance = dto.importance;
    }

    if (dto.confidence !== undefined) {
      memory.confidence = dto.confidence;
    }

    if (dto.verificationStatus !== undefined) {
      memory.verificationStatus =
        dto.verificationStatus;
    }

    if (dto.accessLevel !== undefined) {
      memory.accessLevel = dto.accessLevel;
    }

    if (dto.sensitivity !== undefined) {
      memory.sensitivity = dto.sensitivity;
    }

    if (dto.expiresAt !== undefined) {
      memory.expiresAt = dto.expiresAt
        ? this.parseDate(
            dto.expiresAt,
            'expiresAt',
          )
        : undefined;
    }

    await memory.save();

    return memory;
  }

  async updateScore(
    memoryId: string,
    // ownerUserId: string,
    dto: UpdateMemoryScoreDto,
  ) {
    if (
      dto.importance === undefined &&
      dto.confidence === undefined
    ) {
      throw new BadRequestException(
        'Importance or confidence is required.',
      );
    }

    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    if (dto.importance !== undefined) {
      memory.importance = dto.importance;
    }

    if (dto.confidence !== undefined) {
      memory.confidence = dto.confidence;
    }

    await memory.save();

    return memory;
  }

  async replaceTags(
    memoryId: string,
    // ownerUserId: string,
    dto: UpdateMemoryTagsDto,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.tags = this.normalizeTags(dto.tags);

    await memory.save();

    return memory;
  }

  async addTags(
    memoryId: string,
    // ownerUserId: string,
    dto: UpdateMemoryTagsDto,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.tags = this.normalizeTags([
      ...memory.tags,
      ...dto.tags,
    ]);

    await memory.save();

    return memory;
  }

  async removeTag(
    memoryId: string,
    // ownerUserId: string,
    tag: string,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    const normalizedTag =
      this.normalizeTag(tag);

    memory.tags = memory.tags.filter(
      (item) => item !== normalizedTag,
    );

    await memory.save();

    return memory;
  }

  async dispute(
    memoryId: string,
    rawSessionToken: string,
    dto: DisputeMemoryDto,
  ) {
    this.validateObjectId(memoryId, 'memory ID');

    const session =
      await this.verificationService.validateSession(
        rawSessionToken,
      );

    const memory = await this.memoryModel.findOne({
      _id: new Types.ObjectId(memoryId),
      // ownerUserId: session.ownerUserId,
      personId: session.personId,
      isActive: true,
    });

    if (!memory) {
      throw new NotFoundException(
        'Memory not found.',
      );
    }

    memory.isDisputed = true;
    memory.disputeReason = dto.reason.trim();
    memory.disputedAt = new Date();
    memory.disputedByPersonId =
      session.personId;

    await memory.save();

    return memory;
  }

  async archive(
    memoryId: string,
    // ownerUserId: string,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.isArchived = true;

    await memory.save();

    return memory;
  }

  async restore(
    memoryId: string,
    // ownerUserId: string,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.isArchived = false;

    await memory.save();

    return memory;
  }

  async remove(
    memoryId: string,
    // ownerUserId: string,
  ) {
    const memory = await this.getOwnerMemory(
      memoryId,
      // ownerUserId,
    );

    memory.isActive = false;
    memory.isArchived = true;

    await memory.save();

    return {
      message: 'Memory deleted successfully.',
    };
  }

  private async resolvePersonId(
    // ownerUserId: Types.ObjectId,
    personId?: string,
  ): Promise<Types.ObjectId | null> {
    if (!personId) {
      return null;
    }

    this.validateObjectId(personId, 'person ID');

    const personObjectId =
      new Types.ObjectId(personId);

    const personExists =
      await this.memoryPersonModel.exists({
        _id: personObjectId,
        // ownerUserId,
        isActive: true,
      });

    if (!personExists) {
      throw new NotFoundException(
        'Memory person not found.',
      );
    }

    return personObjectId;
  }

  private validatePersonAccess(
    accessLevel: MemoryAccessLevel,
    personId?: string,
  ) {
    const personSpecificLevels = [
      MemoryAccessLevel.PERSON_PRIVATE,
      MemoryAccessLevel.OWNER_AND_PERSON,
    ];

    if (
      personSpecificLevels.includes(accessLevel) &&
      !personId
    ) {
      throw new BadRequestException(
        `personId is required for ${accessLevel} memory.`,
      );
    }
  }

  private async getOwnerMemory(
    memoryId: string,
    // ownerUserId: string,
  ) {
    this.validateObjectId(memoryId, 'memory ID');
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const memory = await this.memoryModel
      .findOne({
        _id: new Types.ObjectId(memoryId),
        // ownerUserId: new Types.ObjectId(
        //   ownerUserId,
        // ),
        isActive: true,
      })
      .select('+contentHash');

    if (!memory) {
      throw new NotFoundException(
        'Memory not found.',
      );
    }

    return memory;
  }

  private prepareSourceReference(
    reference?: {
      entityId?: string;
      entityType?: string;
      externalId?: string;
      sourceUrl?: string;
      sourceCreatedAt?: string;
    },
  ) {
    if (!reference) {
      return undefined;
    }

    if (
      reference.entityId &&
      !Types.ObjectId.isValid(
        reference.entityId,
      )
    ) {
      throw new BadRequestException(
        'Invalid source entity ID.',
      );
    }

    return {
      entityId: reference.entityId
        ? new Types.ObjectId(
            reference.entityId,
          )
        : undefined,

      entityType: reference.entityType?.trim(),

      externalId:
        reference.externalId?.trim(),

      sourceUrl: reference.sourceUrl?.trim(),

      sourceCreatedAt:
        reference.sourceCreatedAt
          ? this.parseDate(
              reference.sourceCreatedAt,
              'sourceCreatedAt',
            )
          : undefined,
    };
  }

  private async markmemoryAccessed(
    memoryIds: Types.ObjectId[],
  ) {
    if (!memoryIds.length) {
      return;
    }

    await this.memoryModel.updateMany(
      {
        _id: {
          $in: memoryIds,
        },
      },
      {
        $set: {
          lastAccessedAt: new Date(),
        },
        $inc: {
          accessCount: 1,
        },
      },
    );
  }

  private cleanContent(content: string) {
    const cleanContent = content
      ?.trim()
      .replace(/\s+/g, ' ');

    if (!cleanContent) {
      throw new BadRequestException(
        'Memory content is required.',
      );
    }

    return cleanContent;
  }

  private generateContentHash(
    content: string,
  ) {
    return createHash('sha256')
      .update(content.toLowerCase())
      .digest('hex');
  }

  private normalizeTags(tags?: string[]) {
    return [
      ...new Set(
        (tags ?? [])
          .map((tag) =>
            this.normalizeTag(tag),
          )
          .filter(Boolean),
      ),
    ];
  }

  private normalizeTag(tag: string) {
    return tag
      ?.trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  private parseDate(
    value: string,
    fieldName: string,
  ) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }

    return date;
  }

  private validateObjectId(
    value: string,
    fieldName: string,
  ) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }
  }
}