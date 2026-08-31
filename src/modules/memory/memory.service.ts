import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { QueryFilter, Model, Types } from 'mongoose';
import { createHash } from 'crypto';

import { AiService } from '../ai/ai.service';

import { BackfillMemoryEmbeddingsDto } from './dto/backfill-memory-embeddings.dto';
import { CreateMemoryDto } from './dto/create-memory.dto';
import { DisputeMemoryDto } from './dto/dispute-memory.dto';
import {
  ContradictMemoryDto,
  MemoryDisputeResolution,
  ResolveMemoryDisputeDto,
  SupersedeMemoryDto,
} from './dto/manage-memory-lifecycle.dto';
import { MemoryQueryDto } from './dto/memory-query.dto';
import { MemoryRecallQueryDto } from './dto/memory-recall-query.dto';
import { UpdateMemoryDto } from './dto/update-memory.dto';
import { UpdateMemoryScoreDto } from './dto/update-memory-score.dto';
import { UpdateMemoryTagsDto } from './dto/update-memory-tags.dto';
import { MemoryVerificationService } from './memory-verification.service';
import { MemoryRecallService } from './memory-recall.service';
import {
  Memory,
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDocument,
  MemoryDurability,
  MemoryLifecycleStatus,
  MemoryPersonRelation,
  MemoryScope,
  MemorySensitivity,
  MemoryType,
} from './schemas/memory.schema';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import { CreateManyMemoryDto } from './dto/create-many-memory.dto';
@Injectable()
export class MemoryService implements OnModuleInit {
  constructor(
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<MemoryDocument>,

    @InjectModel(MemoryPerson.name)
    private readonly memoryPersonModel: Model<MemoryPersonDocument>,

    private readonly verificationService: MemoryVerificationService,

    private readonly aiService: AiService,

    private readonly memoryRecallService: MemoryRecallService,
  ) {}

  async onModuleInit() {
    await this.ensureNonDestructiveExpiryIndex();
  }

  async create(dto: CreateMemoryDto) {
    // this.validateObjectId(
    //   dto.ownerUserId,
    //   'owner user ID',
    // );

    // const ownerUserId =
    //   new Types.ObjectId(dto.ownerUserId);

    const attribution = await this.resolveAttribution({
      scope: dto.scope,
      personId: dto.personId,
      personLinks: dto.personLinks,
    });

    const accessLevel =
      dto.accessLevel ??
      (attribution.scope === MemoryScope.INDIVIDUAL
        ? MemoryAccessLevel.OWNER_AND_PERSON
        : MemoryAccessLevel.OWNER_ONLY);

    this.validatePersonAccess(accessLevel, attribution.personId?.toString());

    const personId = attribution.personId;

    const content = this.cleanContent(dto.content);
    const contentHash = this.generateContentHash(content);

    const type = dto.type ?? MemoryType.FACT;

    const duplicateFilter: QueryFilter<MemoryDocument> = {
      // ownerUserId,
      contentHash,
      type,
      isActive: true,
    };

    if (attribution.scope === MemoryScope.INDIVIDUAL && personId) {
      duplicateFilter.personId = personId;
    } else if (attribution.scope === MemoryScope.GROUP) {
      duplicateFilter.scope = MemoryScope.GROUP;
      const subjectIds = attribution.personLinks
        .filter((link) =>
          [
            MemoryPersonRelation.PRIMARY_SUBJECT,
            MemoryPersonRelation.PARTICIPANT,
          ].includes(link.relation),
        )
        .map((link) => link.personId);
      duplicateFilter.$and = subjectIds.map((subjectId) => ({
        personLinks: {
          $elemMatch: {
            personId: subjectId,
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
      duplicateFilter.accessLevel = accessLevel;
      duplicateFilter.$or = [
        { scope: MemoryScope.GENERAL },
        { scope: { $exists: false } },
      ];
    }

    const duplicate = await this.memoryModel.findOne(duplicateFilter);

    if (duplicate) {
      return duplicate;
    }

    const capturedAt = dto.capturedAt
      ? this.parseDate(dto.capturedAt, 'capturedAt')
      : new Date();
    const durability = dto.durability ?? MemoryDurability.DURABLE;
    const expiresAt = this.resolveExpiry(durability, dto.expiresAt, capturedAt);

    const memory = await this.memoryModel.create({
      // ownerUserId,
      personId,
      scope: attribution.scope,
      personLinks: attribution.personLinks,
      content,
      contentHash,
      type,
      source: dto.source,
      sourceReference: this.prepareSourceReference(dto.sourceReference),
      tags: this.normalizeTags(dto.tags),
      categories: this.normalizeTags(dto.categories),
      entities: this.prepareEntities(dto.entities),
      importance: dto.importance,
      confidence: dto.confidence,
      verificationStatus: dto.verificationStatus,
      accessLevel,
      sensitivity: dto.sensitivity,
      durability,
      captureOrigin: dto.captureOrigin ?? MemoryCaptureOrigin.MANUAL,
      capturedAt,
      happenedAt: dto.happenedAt
        ? this.parseDate(dto.happenedAt, 'happenedAt')
        : undefined,
      inboxItemId: dto.inboxItemId
        ? new Types.ObjectId(dto.inboxItemId)
        : undefined,
      expiresAt,
      lifecycleStatus: MemoryLifecycleStatus.ACTIVE,
      lifecycleHistory: [],
    });

    await this.syncEmbeddingBestEffort(memory);

    return memory;
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
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    await this.syncExpiredMemories();

    const includeHistorical =
      Boolean(query.includeHistorical) ||
      Boolean(query.lifecycleStatus) ||
      query.isArchived === true ||
      query.isDisputed === true;

    const filter: QueryFilter<MemoryDocument> = includeHistorical
      ? {}
      : this.getCurrentTruthFilter();

    if (query.personId) {
      this.validateObjectId(query.personId, 'person ID');
      filter.personId = new Types.ObjectId(query.personId);
    }

    if (query.subjectPersonId) {
      this.validateObjectId(query.subjectPersonId, 'subject person ID');
      const subjectPersonId = new Types.ObjectId(query.subjectPersonId);
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { personId: subjectPersonId },
            { 'personLinks.personId': subjectPersonId },
          ],
        },
      ];
    }

    if (query.scope) {
      filter.scope = query.scope;
    }

    if (query.personRelation) {
      filter.personLinks = {
        $elemMatch: { relation: query.personRelation },
      };
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
      filter.verificationStatus = query.verificationStatus;
    }

    if (query.tag?.trim()) {
      filter.tags = this.normalizeTag(query.tag);
    }

    if (query.category?.trim()) {
      filter.categories = this.normalizeTag(query.category);
    }

    if (query.entity?.trim()) {
      filter['entities.name'] = {
        $regex: query.entity.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        $options: 'i',
      };
    }

    if (query.durability) {
      filter.durability = query.durability;
    }

    if (query.captureOrigin) {
      filter.captureOrigin = query.captureOrigin;
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

    if (query.lifecycleStatus) {
      filter.lifecycleStatus = query.lifecycleStatus;
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

  async recall(dto: MemoryRecallQueryDto) {
    await this.syncExpiredMemories();

    const safeLimit = Math.min(Math.max(dto.limit ?? 8, 1), 20);
    const plan = this.memoryRecallService.buildPlan({
      query: dto.query,
      intent: dto.intent,
      type: dto.type,
      includeHistorical: dto.includeHistorical,
    });

    const explicitTypeFilter = plan.explicitType
      ? { type: plan.explicitType }
      : {};

    const currentCandidates = await this.memoryModel
      .find({
        ...this.getCurrentTruthFilter(),
        ...explicitTypeFilter,
      })
      .sort({ importance: -1, confidence: -1, capturedAt: -1 })
      .limit(500)
      .lean();

    const current = this.memoryRecallService.rank(
      currentCandidates,
      plan,
      safeLimit,
    );

    const historicalCandidates = plan.includeHistorical
      ? await this.memoryModel
          .find({
            ...explicitTypeFilter,
            lifecycleStatus: {
              $in: [
                MemoryLifecycleStatus.SUPERSEDED,
                MemoryLifecycleStatus.CONTRADICTED,
                MemoryLifecycleStatus.EXPIRED,
                MemoryLifecycleStatus.ARCHIVED,
                MemoryLifecycleStatus.DISPUTED,
              ],
            },
          })
          .sort({ importance: -1, confidence: -1, capturedAt: -1 })
          .limit(500)
          .lean()
      : [];

    const historical = this.memoryRecallService.rank(
      historicalCandidates,
      plan,
      safeLimit,
    );

    await this.markmemoryAccessed(
      [...current, ...historical].map(({ memory }) => memory._id),
    );

    return {
      query: plan.query,
      plan: {
        intent: plan.intent,
        explicitType: plan.explicitType,
        inferredType: plan.inferredType,
        includeHistorical: plan.includeHistorical,
        tokens: plan.tokens,
        ranking:
          'Deterministic lexical, metadata, semantic-type, recency, importance, confidence and verification scoring. No OpenAI call is used for recall.',
      },
      current,
      historical,
      currentCount: current.length,
      historicalCount: historical.length,
    };
  }

  async retrievePublicForHsakaa(query: string, limit = 8, mode?: string) {
    await this.syncExpiredMemories();
    const safeLimit = Math.min(Math.max(limit, 1), 12);
    const retrievalText = [query, this.getModeRetrievalTerms(mode)]
      .filter(Boolean)
      .join(' ')
      .trim();

    const memories = await this.memoryModel
      .find(this.getPublicEmbeddingEligibleFilter())
      .sort({ importance: -1, confidence: -1, capturedAt: -1 })
      .limit(500)
      .lean();

    const plan = this.memoryRecallService.buildPlan({ query: retrievalText });
    const ranked = this.memoryRecallService.rank(memories, plan, safeLimit);

    await this.markmemoryAccessed(ranked.map(({ memory }) => memory._id));

    return ranked.map(({ memory, retrievalScore, matchedFields }) => ({
      ...memory,
      retrievalScore,
      matchedFields,
    }));
  }

  async getEmbeddingStatus() {
    const model = this.aiService.getEmbeddingModel();
    const eligibleFilter = this.getPublicEmbeddingEligibleFilter();

    const [eligibleTotal, currentModelTotal] = await Promise.all([
      this.memoryModel.countDocuments(eligibleFilter),
      this.memoryModel.countDocuments({
        ...eligibleFilter,
        embeddingGenerated: true,
        embeddingModel: model,
        'embedding.0': {
          $exists: true,
        },
      }),
    ]);

    return {
      model,
      eligibleTotal,
      generatedCurrentModel: currentModelTotal,
      missingOrStale: Math.max(eligibleTotal - currentModelTotal, 0),
    };
  }

  async backfillPublicEmbeddings(dto: BackfillMemoryEmbeddingsDto) {
    const limit = Math.min(Math.max(dto.limit ?? 100, 1), 500);

    const model = this.aiService.getEmbeddingModel();
    const eligibleFilter = this.getPublicEmbeddingEligibleFilter();

    const filter: QueryFilter<MemoryDocument> = dto.force
      ? eligibleFilter
      : {
          ...eligibleFilter,
          $and: [
            ...((eligibleFilter.$and as Array<QueryFilter<MemoryDocument>>) ??
              []),
            {
              $or: [
                {
                  embeddingGenerated: {
                    $ne: true,
                  },
                },
                {
                  embeddingModel: {
                    $ne: model,
                  },
                },
                {
                  'embedding.0': {
                    $exists: false,
                  },
                },
              ],
            },
          ],
        };

    const memories = await this.memoryModel
      .find(filter)
      .sort({
        importance: -1,
        confidence: -1,
        updatedAt: -1,
      })
      .limit(limit)
      .lean();

    let generated = 0;
    let failed = 0;
    const batchSize = 25;

    for (let offset = 0; offset < memories.length; offset += batchSize) {
      const batch = memories.slice(offset, offset + batchSize);

      try {
        const result = await this.aiService.generateEmbeddings(
          batch.map((memory) => this.buildMemoryEmbeddingText(memory)),
        );

        if (result.embeddings.length !== batch.length) {
          failed += batch.length;
          continue;
        }

        const generatedAt = new Date();

        await this.memoryModel.bulkWrite(
          batch.map((memory, index) => ({
            updateOne: {
              filter: {
                _id: memory._id,
              },
              update: {
                $set: {
                  embedding: result.embeddings[index],
                  embeddingModel: result.model,
                  embeddingGenerated: true,
                  embeddingGeneratedAt: generatedAt,
                },
              },
            },
          })),
        );

        generated += batch.length;
      } catch {
        failed += batch.length;
      }
    }

    return {
      model,
      requested: memories.length,
      generated,
      failed,
      force: Boolean(dto.force),
    };
  }

  async regenerateEmbedding(memoryId: string) {
    const memory = await this.getOwnerMemory(memoryId);

    if (!this.isEmbeddingEligible(memory)) {
      await this.clearEmbedding(memory._id);

      throw new BadRequestException(
        'Only active, non-sensitive public memories are eligible for HSAKAA embeddings.',
      );
    }

    const generated = await this.generateAndStoreEmbedding(memory);

    if (!generated) {
      throw new BadRequestException('Unable to generate the memory embedding.');
    }

    return {
      memoryId: memory._id.toString(),
      embeddingGenerated: true,
      embeddingModel: this.aiService.getEmbeddingModel(),
    };
  }

  async findPublicmemory(
    // ownerUserId: string,
    search?: string,
  ) {
    await this.syncExpiredMemories();
    // this.validateObjectId(
    //   ownerUserId,
    //   'owner user ID',
    // );

    const filter = this.getPublicEmbeddingEligibleFilter();

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

    await this.markmemoryAccessed(memory.map((memory) => memory._id));

    return memory;
  }

  async findForVerifiedPerson(rawSessionToken: string) {
    await this.syncExpiredMemories();
    const session =
      await this.verificationService.validateSession(rawSessionToken);

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

    await this.markmemoryAccessed(memory.map((memory) => memory._id));

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
    this.assertCurrentMemoryEditable(memory);

    const currentPersonLinks = (memory.personLinks ?? []).map((link) => ({
      personId: link.personId.toString(),
      relation: link.relation,
    }));
    const currentScope =
      memory.scope ??
      (memory.personId ? MemoryScope.INDIVIDUAL : MemoryScope.GENERAL);

    const attribution =
      dto.scope !== undefined ||
      dto.personId !== undefined ||
      dto.personLinks !== undefined
        ? await this.resolveAttribution({
            scope: dto.scope ?? currentScope,
            personId:
              dto.personId !== undefined
                ? dto.personId
                : memory.personId?.toString(),
            personLinks: dto.personLinks ?? currentPersonLinks,
          })
        : {
            scope: currentScope,
            personId: memory.personId ?? null,
            personLinks: memory.personLinks ?? [],
          };

    const shouldRefreshEmbedding = [
      dto.content,
      dto.type,
      dto.source,
      dto.tags,
      dto.categories,
      dto.entities,
      dto.scope,
      dto.personLinks,
      dto.accessLevel,
      dto.sensitivity,
      dto.durability,
      dto.expiresAt,
    ].some((value) => value !== undefined);

    const nextAccessLevel = dto.accessLevel ?? memory.accessLevel;

    this.validatePersonAccess(
      nextAccessLevel,
      attribution.personId?.toString(),
    );

    if (
      dto.scope !== undefined ||
      dto.personId !== undefined ||
      dto.personLinks !== undefined
    ) {
      memory.scope = attribution.scope;
      memory.personId = attribution.personId;
      memory.personLinks = attribution.personLinks;
    }

    if (dto.content !== undefined) {
      const content = this.cleanContent(dto.content);

      const contentHash = this.generateContentHash(content);

      const duplicate = await this.memoryModel.exists({
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
      memory.sourceReference = this.prepareSourceReference(dto.sourceReference);
    }

    if (dto.tags !== undefined) {
      memory.tags = this.normalizeTags(dto.tags);
    }

    if (dto.categories !== undefined) {
      memory.categories = this.normalizeTags(dto.categories);
    }

    if (dto.entities !== undefined) {
      memory.entities = this.prepareEntities(dto.entities);
    }

    if (dto.importance !== undefined) {
      memory.importance = dto.importance;
    }

    if (dto.confidence !== undefined) {
      memory.confidence = dto.confidence;
    }

    if (dto.verificationStatus !== undefined) {
      memory.verificationStatus = dto.verificationStatus;
    }

    if (dto.accessLevel !== undefined) {
      memory.accessLevel = dto.accessLevel;
    }

    if (dto.sensitivity !== undefined) {
      memory.sensitivity = dto.sensitivity;
    }

    if (dto.durability !== undefined) {
      memory.durability = dto.durability;
    }

    if (dto.captureOrigin !== undefined) {
      memory.captureOrigin = dto.captureOrigin;
    }

    if (dto.capturedAt !== undefined) {
      memory.capturedAt = this.parseDate(dto.capturedAt, 'capturedAt');
    }

    if (dto.happenedAt !== undefined) {
      memory.happenedAt = dto.happenedAt
        ? this.parseDate(dto.happenedAt, 'happenedAt')
        : undefined;
    }

    if (dto.inboxItemId !== undefined) {
      if (!Types.ObjectId.isValid(dto.inboxItemId)) {
        throw new BadRequestException('Invalid memory inbox item ID.');
      }
      memory.inboxItemId = new Types.ObjectId(dto.inboxItemId);
    }

    if (dto.expiresAt !== undefined || dto.durability !== undefined) {
      memory.expiresAt = this.resolveExpiry(
        memory.durability ?? MemoryDurability.DURABLE,
        dto.expiresAt,
        memory.capturedAt ?? new Date(),
      );
    }

    await memory.save();

    if (shouldRefreshEmbedding) {
      await this.syncEmbeddingBestEffort(memory);
    }

    return memory;
  }

  async updateScore(
    memoryId: string,
    // ownerUserId: string,
    dto: UpdateMemoryScoreDto,
  ) {
    if (dto.importance === undefined && dto.confidence === undefined) {
      throw new BadRequestException('Importance or confidence is required.');
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

    await this.syncEmbeddingBestEffort(memory);

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

    memory.tags = this.normalizeTags([...memory.tags, ...dto.tags]);

    await memory.save();

    await this.syncEmbeddingBestEffort(memory);

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

    const normalizedTag = this.normalizeTag(tag);

    memory.tags = memory.tags.filter((item) => item !== normalizedTag);

    await memory.save();

    await this.syncEmbeddingBestEffort(memory);

    return memory;
  }

  async dispute(
    memoryId: string,
    rawSessionToken: string,
    dto: DisputeMemoryDto,
  ) {
    this.validateObjectId(memoryId, 'memory ID');

    const session =
      await this.verificationService.validateSession(rawSessionToken);

    const memory = await this.memoryModel.findOne({
      _id: new Types.ObjectId(memoryId),
      personId: session.personId,
      isActive: true,
    });

    if (!memory) {
      throw new NotFoundException('Memory not found.');
    }

    memory.disputeReason = dto.reason.trim();
    memory.disputedAt = new Date();
    memory.disputedByPersonId = session.personId;

    await this.transitionLifecycle(
      memory,
      MemoryLifecycleStatus.DISPUTED,
      `Person dispute: ${dto.reason.trim()}`,
    );
    await this.clearEmbedding(memory._id);

    return memory;
  }

  async archive(memoryId: string, reason = 'Archived by owner.') {
    const memory = await this.getOwnerMemory(memoryId);

    if (
      this.getEffectiveLifecycleStatus(memory) ===
      MemoryLifecycleStatus.FORGOTTEN
    ) {
      throw new BadRequestException('Forgotten memory cannot be archived.');
    }

    await this.transitionLifecycle(
      memory,
      MemoryLifecycleStatus.ARCHIVED,
      reason,
    );
    await this.clearEmbedding(memory._id);

    return memory;
  }

  async restore(memoryId: string, reason = 'Restored by owner.') {
    const memory = await this.getOwnerMemory(memoryId);
    const current = this.getEffectiveLifecycleStatus(memory);

    if (
      [
        MemoryLifecycleStatus.SUPERSEDED,
        MemoryLifecycleStatus.CONTRADICTED,
        MemoryLifecycleStatus.DISPUTED,
        MemoryLifecycleStatus.FORGOTTEN,
      ].includes(current)
    ) {
      throw new BadRequestException(
        `${current} memory cannot be restored directly because that would rewrite truth history.`,
      );
    }

    const target = this.hasExpired(memory)
      ? MemoryLifecycleStatus.EXPIRED
      : MemoryLifecycleStatus.ACTIVE;

    await this.transitionLifecycle(memory, target, reason);

    if (target === MemoryLifecycleStatus.ACTIVE) {
      await this.syncEmbeddingBestEffort(memory);
    } else {
      await this.clearEmbedding(memory._id);
    }

    return memory;
  }

  async remove(memoryId: string) {
    const memory = await this.getOwnerMemory(memoryId);

    await this.transitionLifecycle(
      memory,
      MemoryLifecycleStatus.FORGOTTEN,
      'Deliberately forgotten by owner.',
    );
    await this.clearEmbedding(memory._id);

    return {
      message: 'Memory forgotten successfully.',
    };
  }

  async supersede(memoryId: string, dto: SupersedeMemoryDto) {
    if (memoryId === dto.supersedingMemoryId) {
      throw new BadRequestException('A memory cannot supersede itself.');
    }

    const [oldMemory, newMemory] = await Promise.all([
      this.getOwnerMemory(memoryId),
      this.getOwnerMemory(dto.supersedingMemoryId),
    ]);

    this.assertCurrentMemoryEditable(newMemory);

    const oldStatus = this.getEffectiveLifecycleStatus(oldMemory);
    if (oldStatus === MemoryLifecycleStatus.FORGOTTEN) {
      throw new BadRequestException('Forgotten memory cannot be superseded.');
    }

    oldMemory.supersededByMemoryId = newMemory._id;
    newMemory.supersedesMemoryId = oldMemory._id;

    await this.transitionLifecycle(
      oldMemory,
      MemoryLifecycleStatus.SUPERSEDED,
      dto.reason.trim(),
      newMemory._id,
    );
    await newMemory.save();
    await this.clearEmbedding(oldMemory._id);

    return { superseded: oldMemory, authoritative: newMemory };
  }

  async contradict(memoryId: string, dto: ContradictMemoryDto) {
    if (memoryId === dto.authoritativeMemoryId) {
      throw new BadRequestException('A memory cannot contradict itself.');
    }

    const [contradicted, authoritative] = await Promise.all([
      this.getOwnerMemory(memoryId),
      this.getOwnerMemory(dto.authoritativeMemoryId),
    ]);

    this.assertCurrentMemoryEditable(authoritative);

    contradicted.contradictedByMemoryIds = this.addObjectId(
      contradicted.contradictedByMemoryIds,
      authoritative._id,
    );
    authoritative.contradictsMemoryIds = this.addObjectId(
      authoritative.contradictsMemoryIds,
      contradicted._id,
    );

    await this.transitionLifecycle(
      contradicted,
      MemoryLifecycleStatus.CONTRADICTED,
      dto.reason.trim(),
      authoritative._id,
    );
    await authoritative.save();
    await this.clearEmbedding(contradicted._id);

    return { contradicted, authoritative };
  }

  async resolveDispute(memoryId: string, dto: ResolveMemoryDisputeDto) {
    const memory = await this.getOwnerMemory(memoryId);

    if (
      this.getEffectiveLifecycleStatus(memory) !==
      MemoryLifecycleStatus.DISPUTED
    ) {
      throw new BadRequestException('Memory is not currently disputed.');
    }

    const reason = [dto.reason.trim(), dto.note?.trim()]
      .filter(Boolean)
      .join(' — ');

    if (dto.resolution === MemoryDisputeResolution.ARCHIVE) {
      return this.archive(memoryId, reason);
    }
    if (dto.resolution === MemoryDisputeResolution.FORGET) {
      await this.transitionLifecycle(
        memory,
        MemoryLifecycleStatus.FORGOTTEN,
        reason,
      );
      await this.clearEmbedding(memory._id);
      return memory;
    }

    memory.disputeReason = undefined;
    memory.disputedAt = undefined;
    memory.disputedByPersonId = undefined;
    const target = this.hasExpired(memory)
      ? MemoryLifecycleStatus.EXPIRED
      : MemoryLifecycleStatus.ACTIVE;
    await this.transitionLifecycle(memory, target, reason);
    if (target === MemoryLifecycleStatus.ACTIVE) {
      await this.syncEmbeddingBestEffort(memory);
    }
    return memory;
  }

  private getPublicEmbeddingEligibleFilter(): QueryFilter<MemoryDocument> {
    return {
      accessLevel: MemoryAccessLevel.PUBLIC,
      sensitivity: {
        $nin: [MemorySensitivity.SENSITIVE, MemorySensitivity.HIGHLY_SENSITIVE],
      },
      isActive: true,
      isArchived: false,
      isDisputed: false,
      $or: [
        { lifecycleStatus: MemoryLifecycleStatus.ACTIVE },
        { lifecycleStatus: { $exists: false } },
      ],
      $and: [
        {
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
        },
      ],
    };
  }

  private isEmbeddingEligible(memory: {
    accessLevel: MemoryAccessLevel;
    sensitivity: MemorySensitivity;
    isActive: boolean;
    isArchived: boolean;
    isDisputed: boolean;
    lifecycleStatus?: MemoryLifecycleStatus;
    expiresAt?: Date;
  }) {
    const hasExpired = Boolean(
      memory.expiresAt && memory.expiresAt.getTime() <= Date.now(),
    );

    return (
      memory.accessLevel === MemoryAccessLevel.PUBLIC &&
      memory.sensitivity !== MemorySensitivity.SENSITIVE &&
      memory.sensitivity !== MemorySensitivity.HIGHLY_SENSITIVE &&
      memory.isActive &&
      !memory.isArchived &&
      !memory.isDisputed &&
      (!memory.lifecycleStatus ||
        memory.lifecycleStatus === MemoryLifecycleStatus.ACTIVE) &&
      !hasExpired
    );
  }

  private buildMemoryEmbeddingText(memory: {
    content: string;
    type: MemoryType | string;
    source?: string;
    tags?: string[];
    categories?: string[];
    entities?: Array<{ name: string; type: string }>;
  }) {
    return [
      `Memory: ${memory.content}`,
      `Type: ${memory.type}`,
      memory.source ? `Source: ${memory.source}` : null,
      memory.tags?.length ? `Tags: ${memory.tags.join(', ')}` : null,
      memory.categories?.length
        ? `Categories: ${memory.categories.join(', ')}`
        : null,
      memory.entities?.length
        ? `Entities: ${memory.entities
            .map((entity) => `${entity.type}:${entity.name}`)
            .join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async syncEmbeddingBestEffort(memory: MemoryDocument) {
    if (!this.isEmbeddingEligible(memory)) {
      await this.clearEmbedding(memory._id);
      memory.embeddingGenerated = false;
      memory.embeddingModel = undefined;
      memory.embeddingGeneratedAt = undefined;
      return;
    }

    try {
      await this.generateAndStoreEmbedding(memory);
    } catch {
      // Never fail a memory write because the embedding provider is unavailable.
      await this.clearEmbedding(memory._id);
      memory.embeddingGenerated = false;
      memory.embeddingModel = undefined;
      memory.embeddingGeneratedAt = undefined;
    }
  }

  private async generateAndStoreEmbedding(memory: MemoryDocument) {
    const result = await this.aiService.generateEmbedding(
      this.buildMemoryEmbeddingText(memory),
    );

    const generatedAt = new Date();

    await this.memoryModel.updateOne(
      {
        _id: memory._id,
      },
      {
        $set: {
          embedding: result.embedding,
          embeddingModel: result.model,
          embeddingGenerated: true,
          embeddingGeneratedAt: generatedAt,
        },
      },
    );

    memory.embeddingGenerated = true;
    memory.embeddingModel = result.model;
    memory.embeddingGeneratedAt = generatedAt;

    return true;
  }

  private async clearEmbedding(memoryId: Types.ObjectId) {
    await this.memoryModel.updateOne(
      {
        _id: memoryId,
      },
      {
        $set: {
          embeddingGenerated: false,
        },
        $unset: {
          embedding: 1,
          embeddingModel: 1,
          embeddingGeneratedAt: 1,
        },
      },
    );
  }

  private cosineSimilarity(first: number[], second: number[]) {
    if (!first.length || first.length !== second.length) {
      return 0;
    }

    let dotProduct = 0;
    let firstMagnitude = 0;
    let secondMagnitude = 0;

    for (let index = 0; index < first.length; index += 1) {
      dotProduct += first[index] * second[index];
      firstMagnitude += first[index] ** 2;
      secondMagnitude += second[index] ** 2;
    }

    if (!firstMagnitude || !secondMagnitude) {
      return 0;
    }

    return (
      dotProduct / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude))
    );
  }

  async resolveAttribution(input: {
    scope?: MemoryScope;
    personId?: string | null;
    personLinks?: Array<{
      personId: string;
      relation: MemoryPersonRelation;
    }>;
  }) {
    const rawLinks = input.personLinks ?? [];
    const inferredScope =
      input.scope ??
      (input.personId
        ? MemoryScope.INDIVIDUAL
        : rawLinks.filter((link) =>
              [
                MemoryPersonRelation.PRIMARY_SUBJECT,
                MemoryPersonRelation.PARTICIPANT,
              ].includes(link.relation),
            ).length >= 2
          ? MemoryScope.GROUP
          : MemoryScope.GENERAL);

    const normalized = new Map<
      string,
      { personId: string; relation: MemoryPersonRelation }
    >();

    for (const link of rawLinks) {
      this.validateObjectId(link.personId, 'memory person link ID');
      const key = `${link.personId}:${link.relation}`;
      normalized.set(key, {
        personId: link.personId,
        relation: link.relation,
      });
    }

    let primaryPersonId = input.personId?.trim() || undefined;

    if (primaryPersonId) {
      this.validateObjectId(primaryPersonId, 'person ID');
    }

    if (inferredScope === MemoryScope.INDIVIDUAL) {
      const primaryLinks = [...normalized.values()].filter(
        (link) => link.relation === MemoryPersonRelation.PRIMARY_SUBJECT,
      );

      if (!primaryPersonId && primaryLinks.length === 1) {
        primaryPersonId = primaryLinks[0].personId;
      }

      if (!primaryPersonId) {
        throw new BadRequestException(
          'Individual memories require one primary person.',
        );
      }

      for (const [key, link] of normalized) {
        if (link.relation === MemoryPersonRelation.PRIMARY_SUBJECT) {
          normalized.delete(key);
        }
      }
      normalized.set(
        `${primaryPersonId}:${MemoryPersonRelation.PRIMARY_SUBJECT}`,
        {
          personId: primaryPersonId,
          relation: MemoryPersonRelation.PRIMARY_SUBJECT,
        },
      );
    }

    if (inferredScope === MemoryScope.GENERAL) {
      if (primaryPersonId) {
        throw new BadRequestException(
          'General memories cannot have a primary person.',
        );
      }

      const invalidSubject = [...normalized.values()].some((link) =>
        [
          MemoryPersonRelation.PRIMARY_SUBJECT,
          MemoryPersonRelation.PARTICIPANT,
        ].includes(link.relation),
      );

      if (invalidSubject) {
        throw new BadRequestException(
          'General memories may mention or source people, but cannot assign person subjects.',
        );
      }
    }

    if (inferredScope === MemoryScope.GROUP) {
      if (primaryPersonId) {
        throw new BadRequestException(
          'Group memories cannot use a single primary personId.',
        );
      }

      const subjectPeople = new Set(
        [...normalized.values()]
          .filter((link) =>
            [
              MemoryPersonRelation.PRIMARY_SUBJECT,
              MemoryPersonRelation.PARTICIPANT,
            ].includes(link.relation),
          )
          .map((link) => link.personId),
      );

      if (subjectPeople.size < 2) {
        throw new BadRequestException(
          'Group memories require at least two subject or participant people.',
        );
      }
    }

    const uniquePersonIds = [
      ...new Set([...normalized.values()].map((link) => link.personId)),
    ];
    const people = uniquePersonIds.length
      ? await this.memoryPersonModel
          .find({
            _id: { $in: uniquePersonIds.map((id) => new Types.ObjectId(id)) },
            isActive: true,
          })
          .select('_id name preferredName')
          .lean()
      : [];

    if (people.length !== uniquePersonIds.length) {
      throw new NotFoundException(
        'One or more linked memory people do not exist or are inactive.',
      );
    }

    const names = new Map(
      people.map((person) => [
        person._id.toString(),
        person.preferredName || person.name,
      ]),
    );

    return {
      scope: inferredScope,
      personId: primaryPersonId ? new Types.ObjectId(primaryPersonId) : null,
      personLinks: [...normalized.values()].map((link) => ({
        personId: new Types.ObjectId(link.personId),
        relation: link.relation,
        displayNameSnapshot: names.get(link.personId),
      })),
    };
  }

  async resolvePersonLinksByNames(
    links: Array<{ name: string; relation: MemoryPersonRelation }>,
  ) {
    const resolved: Array<{
      personId: string;
      relation: MemoryPersonRelation;
    }> = [];

    for (const link of links) {
      const query = link.name.trim();
      if (!query) {
        throw new BadRequestException('Linked person name is required.');
      }

      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const exact = new RegExp(`^${escaped}$`, 'i');
      const matches = await this.memoryPersonModel
        .find({
          isActive: true,
          isArchived: false,
          $or: [{ name: exact }, { preferredName: exact }, { aliases: exact }],
        })
        .select('_id name preferredName')
        .limit(3)
        .lean();

      if (matches.length !== 1) {
        throw new BadRequestException(
          matches.length
            ? `Person reference "${query}" is ambiguous. Use a more specific saved person name.`
            : `No saved person matches "${query}". Add or identify the person before linking this memory.`,
        );
      }

      resolved.push({
        personId: matches[0]._id.toString(),
        relation: link.relation,
      });
    }

    return resolved;
  }

  async findPersonMemoryContext(
    personQuery: string,
    limit = 12,
    type?: MemoryType,
    includeHistorical = false,
    queryText?: string,
  ) {
    await this.syncExpiredMemories();
    const query = personQuery.trim();
    if (!query) {
      throw new BadRequestException('Person name is required.');
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exact = new RegExp(`^${escaped}$`, 'i');
    const people = await this.memoryPersonModel
      .find({
        isActive: true,
        isArchived: false,
        $or: [{ name: exact }, { preferredName: exact }, { aliases: exact }],
      })
      .select('_id name preferredName relationship aliases')
      .limit(5)
      .lean();

    if (people.length !== 1) {
      return {
        status: people.length ? 'ambiguous' : 'not_found',
        query,
        matches: people.map((person) => ({
          personId: person._id.toString(),
          name: person.preferredName || person.name,
          fullName: person.name,
          relationship: person.relationship,
        })),
        individualMemories: [],
        groupMemories: [],
        relatedMentions: [],
        historicalMemories: [],
      };
    }

    const person = people[0];
    const personId = person._id;
    const safeLimit = Math.min(Math.max(limit, 1), 20);
    const recallPlan = this.memoryRecallService.buildPlan({
      query: queryText,
      type,
      includeHistorical,
    });
    const active: QueryFilter<MemoryDocument> = {
      ...this.getCurrentTruthFilter(),
      ...(type ? { type } : {}),
    };

    const [individualCandidates, groupCandidates, mentionCandidates] =
      await Promise.all([
        this.memoryModel
          .find({
            ...active,
            $and: [
              {
                $or: [
                  { scope: MemoryScope.INDIVIDUAL, personId },
                  { scope: { $exists: false }, personId },
                  {
                    personLinks: {
                      $elemMatch: {
                        personId,
                        relation: MemoryPersonRelation.PRIMARY_SUBJECT,
                      },
                    },
                  },
                ],
              },
            ],
          })
          .sort({ importance: -1, confidence: -1, capturedAt: -1 })
          .limit(200)
          .lean(),
        this.memoryModel
          .find({
            ...active,
            scope: MemoryScope.GROUP,
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
          })
          .sort({ importance: -1, confidence: -1, capturedAt: -1 })
          .limit(200)
          .lean(),
        this.memoryModel
          .find({
            ...active,
            personLinks: {
              $elemMatch: {
                personId,
                relation: {
                  $in: [
                    MemoryPersonRelation.MENTIONED,
                    MemoryPersonRelation.SOURCE,
                    MemoryPersonRelation.RELATED,
                  ],
                },
              },
            },
          })
          .sort({ importance: -1, confidence: -1, capturedAt: -1 })
          .limit(200)
          .lean(),
      ]);

    const individualMemories = this.memoryRecallService.rank(
      individualCandidates,
      recallPlan,
      safeLimit,
    );
    const groupMemories = this.memoryRecallService.rank(
      groupCandidates,
      recallPlan,
      safeLimit,
    );
    const relatedMentions = this.memoryRecallService.rank(
      mentionCandidates,
      recallPlan,
      Math.min(safeLimit, 8),
    );

    const historicalCandidates = includeHistorical
      ? await this.memoryModel
          .find({
            ...(type ? { type } : {}),
            lifecycleStatus: {
              $in: [
                MemoryLifecycleStatus.SUPERSEDED,
                MemoryLifecycleStatus.CONTRADICTED,
                MemoryLifecycleStatus.EXPIRED,
                MemoryLifecycleStatus.ARCHIVED,
                MemoryLifecycleStatus.DISPUTED,
              ],
            },
            $or: [{ personId }, { 'personLinks.personId': personId }],
          })
          .sort({ importance: -1, confidence: -1, capturedAt: -1 })
          .limit(200)
          .lean()
      : [];

    const historicalMemories = this.memoryRecallService.rank(
      historicalCandidates,
      recallPlan,
      safeLimit,
    );

    await this.markmemoryAccessed(
      [
        ...individualMemories,
        ...groupMemories,
        ...relatedMentions,
        ...historicalMemories,
      ].map(({ memory }) => memory._id),
    );

    return {
      status: 'resolved',
      query,
      person: {
        personId: personId.toString(),
        name: person.preferredName || person.name,
        fullName: person.name,
        relationship: person.relationship,
      },
      attributionRule:
        'Individual and group memories are authoritative for this person. Mention/source/related memories are context only and must not be attributed as the person’s own preference, belief or action.',
      recallPlan: {
        intent: recallPlan.intent,
        explicitType: recallPlan.explicitType,
        inferredType: recallPlan.inferredType,
        includeHistorical: recallPlan.includeHistorical,
        tokens: recallPlan.tokens,
      },
      individualMemories,
      groupMemories,
      relatedMentions,
      historicalMemories,
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

    const personObjectId = new Types.ObjectId(personId);

    const personExists = await this.memoryPersonModel.exists({
      _id: personObjectId,
      // ownerUserId,
      isActive: true,
    });

    if (!personExists) {
      throw new NotFoundException('Memory person not found.');
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

    if (personSpecificLevels.includes(accessLevel) && !personId) {
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
      })
      .select('+contentHash');

    if (!memory) {
      throw new NotFoundException('Memory not found.');
    }

    return memory;
  }

  private getCurrentTruthFilter(): QueryFilter<MemoryDocument> {
    return {
      isActive: true,
      isArchived: false,
      isDisputed: false,
      $and: [
        {
          $or: [
            { lifecycleStatus: MemoryLifecycleStatus.ACTIVE },
            { lifecycleStatus: { $exists: false } },
          ],
        },
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    };
  }

  private hasExpired(memory: { expiresAt?: Date | null }) {
    return Boolean(
      memory.expiresAt && memory.expiresAt.getTime() <= Date.now(),
    );
  }

  private getEffectiveLifecycleStatus(memory: MemoryDocument) {
    if (memory.lifecycleStatus) {
      if (
        memory.lifecycleStatus === MemoryLifecycleStatus.ACTIVE &&
        this.hasExpired(memory)
      ) {
        return MemoryLifecycleStatus.EXPIRED;
      }
      return memory.lifecycleStatus;
    }
    if (memory.isDisputed) return MemoryLifecycleStatus.DISPUTED;
    if (memory.isArchived) return MemoryLifecycleStatus.ARCHIVED;
    if (!memory.isActive) return MemoryLifecycleStatus.FORGOTTEN;
    if (this.hasExpired(memory)) return MemoryLifecycleStatus.EXPIRED;
    return MemoryLifecycleStatus.ACTIVE;
  }

  private assertCurrentMemoryEditable(memory: MemoryDocument) {
    const status = this.getEffectiveLifecycleStatus(memory);
    if (status !== MemoryLifecycleStatus.ACTIVE) {
      throw new BadRequestException(
        `Only active current memories can be edited. This memory is ${status}.`,
      );
    }
  }

  private async transitionLifecycle(
    memory: MemoryDocument,
    toStatus: MemoryLifecycleStatus,
    reason: string,
    relatedMemoryId?: Types.ObjectId,
  ) {
    const fromStatus = this.getEffectiveLifecycleStatus(memory);
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException('Lifecycle change reason is required.');
    }

    if (fromStatus !== toStatus) {
      memory.lifecycleHistory = [
        ...(memory.lifecycleHistory ?? []),
        {
          fromStatus,
          toStatus,
          reason: normalizedReason,
          relatedMemoryId,
          changedAt: new Date(),
        },
      ] as never;
    }

    memory.lifecycleStatus = toStatus;
    memory.isActive = toStatus === MemoryLifecycleStatus.ACTIVE;
    memory.isArchived = [
      MemoryLifecycleStatus.ARCHIVED,
      MemoryLifecycleStatus.FORGOTTEN,
    ].includes(toStatus);
    memory.isDisputed = toStatus === MemoryLifecycleStatus.DISPUTED;

    await memory.save();
  }

  private addObjectId(
    existing: Types.ObjectId[] | undefined,
    value: Types.ObjectId,
  ) {
    const ids = existing ?? [];
    return ids.some((id) => id.equals(value)) ? ids : [...ids, value];
  }

  private async syncExpiredMemories() {
    const changedAt = new Date();
    await this.memoryModel.updateMany(
      {
        isActive: true,
        isArchived: false,
        isDisputed: false,
        expiresAt: { $lte: changedAt },
        $or: [
          { lifecycleStatus: MemoryLifecycleStatus.ACTIVE },
          { lifecycleStatus: { $exists: false } },
        ],
      },
      {
        $set: {
          lifecycleStatus: MemoryLifecycleStatus.EXPIRED,
          isActive: false,
        },
        $push: {
          lifecycleHistory: {
            fromStatus: MemoryLifecycleStatus.ACTIVE,
            toStatus: MemoryLifecycleStatus.EXPIRED,
            reason: 'Temporary memory reached its expiry date.',
            changedAt,
          },
        },
      },
    );
  }

  private async ensureNonDestructiveExpiryIndex() {
    try {
      const indexes = await this.memoryModel.collection.indexes();
      const ttlIndexes = indexes.filter(
        (index) =>
          index.key?.expiresAt === 1 &&
          typeof index.expireAfterSeconds === 'number',
      );

      for (const index of ttlIndexes) {
        if (index.name) {
          await this.memoryModel.collection.dropIndex(index.name);
        }
      }

      await this.memoryModel.collection.createIndex(
        { lifecycleStatus: 1, expiresAt: 1, updatedAt: -1 },
        { name: 'memory_lifecycle_expiry_history' },
      );
    } catch {
      // Index maintenance must not prevent the Personal OS from starting.
    }
  }

  private prepareSourceReference(reference?: {
    entityId?: string;
    entityType?: string;
    externalId?: string;
    sourceUrl?: string;
    sourceCreatedAt?: string;
  }) {
    if (!reference) {
      return undefined;
    }

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

  private prepareEntities(entities?: CreateMemoryDto['entities']) {
    return (entities ?? []).map((entity) => {
      if (entity.entityId && !Types.ObjectId.isValid(entity.entityId)) {
        throw new BadRequestException('Invalid memory entity ID.');
      }

      const name = entity.name?.trim();
      if (!name) {
        throw new BadRequestException('Memory entity name is required.');
      }

      return {
        type: entity.type,
        name,
        entityId: entity.entityId
          ? new Types.ObjectId(entity.entityId)
          : undefined,
        externalId: entity.externalId?.trim(),
      };
    });
  }

  private resolveExpiry(
    durability: MemoryDurability,
    rawExpiry: string | null | undefined,
    capturedAt: Date,
  ) {
    if (rawExpiry) {
      return this.parseDate(rawExpiry, 'expiresAt');
    }

    if (durability === MemoryDurability.TEMPORARY) {
      const expiresAt = new Date(capturedAt);
      expiresAt.setDate(expiresAt.getDate() + 30);
      return expiresAt;
    }

    return undefined;
  }

  private async markmemoryAccessed(memoryIds: Types.ObjectId[]) {
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

  private tokenizeForRetrieval(value: string) {
    const stopWords = new Set([
      'aakash',
      'hsakaa',
      'about',
      'after',
      'again',
      'also',
      'because',
      'does',
      'from',
      'have',
      'into',
      'just',
      'most',
      'right',
      'that',
      'this',
      'what',
      'when',
      'where',
      'which',
      'with',
      'would',
      'your',
    ]);

    return [
      ...new Set(
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, ' ')
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length > 2 && !stopWords.has(token)),
      ),
    ].slice(0, 20);
  }

  private getModeRetrievalTerms(mode?: string) {
    const terms: Record<string, string> = {
      Companies:
        'company companies venture founder business product strategy market',
      Journal: 'journal reflection lesson decision idea challenge win learning',
      Library: 'library book reading author takeaway quote learning',
      Health:
        'health training workout sleep recovery routine performance fitness',
      Media: 'media content post story social video audience communication',
      Memory:
        'memory preference principle decision relationship experience goal',
    };

    return mode ? (terms[mode] ?? '') : '';
  }

  private cleanContent(content: string) {
    const cleanContent = content?.trim().replace(/\s+/g, ' ');

    if (!cleanContent) {
      throw new BadRequestException('Memory content is required.');
    }

    return cleanContent;
  }

  private generateContentHash(content: string) {
    return createHash('sha256').update(content.toLowerCase()).digest('hex');
  }

  private normalizeTags(tags?: string[]) {
    return [
      ...new Set(
        (tags ?? []).map((tag) => this.normalizeTag(tag)).filter(Boolean),
      ),
    ];
  }

  private normalizeTag(tag: string) {
    return tag?.trim().toLowerCase().replace(/\s+/g, '-');
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }

    return date;
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
