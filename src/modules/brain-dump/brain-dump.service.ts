import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';

import { JournalService } from '../journal/journal.service';
import {
  JournalEntryType,
  JournalSource,
  JournalVisibility,
} from '../journal/schemas/journal-entry.schema';
import { MemoryService } from '../memory/memory.service';
import {
  MemoryAccessLevel,
  MemorySource,
  MemoryType,
} from '../memory/schemas/memory.schema';
import { TasksService } from '../tasks/tasks.service';
import { TaskSource, TaskStatus } from '../tasks/schemas/task.schema';

import {
  BrainDumpQueryDto,
  BrainDumpSortBy,
  BrainDumpSortOrder,
} from './dto/brain-dump-query.dto';
import { CreateBrainDumpDto } from './dto/create-brain-dump.dto';
import { ProcessBrainDumpDto } from './dto/process-brain-dump.dto';
import { UpdateBrainDumpDto } from './dto/update-brain-dump.dto';
import {
  BrainDump,
  BrainDumpDocument,
  BrainDumpSource,
  BrainDumpStatus,
  BrainDumpTarget,
} from './schemas/brain-dump.schema';

type BrainDumpRecord = BrainDump & {
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class BrainDumpService {
  constructor(
    @InjectModel(BrainDump.name)
    private readonly brainDumpModel: Model<BrainDumpRecord>,
    private readonly tasksService: TasksService,
    private readonly journalService: JournalService,
    private readonly memoryService: MemoryService,
  ) {}

  async create(dto: CreateBrainDumpDto) {
    const content = dto.content?.trim();

    if (!content) {
      throw new BadRequestException('Brain dump content is required.');
    }

    return this.brainDumpModel.create({
      content,
      title: dto.title?.trim() || undefined,
      source: dto.source ?? BrainDumpSource.MANUAL,
      status: BrainDumpStatus.INBOX,
      tags: this.normalizeTags(dto.tags),
      isFavourite: dto.isFavourite ?? false,
      metadata: dto.metadata ?? {},
      isActive: true,
      isArchived: false,
    });
  }

  async findAll(query: BrainDumpQueryDto) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: QueryFilter<BrainDumpRecord> = query.isArchived
      ? { isArchived: true }
      : { isActive: true, isArchived: false };

    if (query.status) filter.status = query.status;
    if (query.source) filter.source = query.source;
    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }
    if (query.tag?.trim()) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    if (query.search?.trim()) {
      const search = this.escapeRegex(query.search.trim());
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    if (query.from || query.to) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (query.from) createdAt.$gte = new Date(query.from);
      if (query.to) createdAt.$lte = new Date(query.to);
      filter.createdAt = createdAt;
    }

    const sortBy = query.sortBy ?? BrainDumpSortBy.CREATED_AT;
    const sortOrder = query.sortOrder === BrainDumpSortOrder.ASC ? 1 : -1;

    const [items, total] = await Promise.all([
      this.brainDumpModel
        .find(filter)
        .sort({ [sortBy]: sortOrder, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.brainDumpModel.countDocuments(filter),
    ]);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSummary() {
    const { start, end } = this.getIstDayRange(new Date());

    const [
      totalInbox,
      capturedToday,
      processedToday,
      discardedToday,
      favouriteInbox,
      oldestInbox,
      recentInbox,
    ] = await Promise.all([
      this.brainDumpModel.countDocuments({
        status: BrainDumpStatus.INBOX,
        isActive: true,
        isArchived: false,
      }),
      this.brainDumpModel.countDocuments({
        createdAt: { $gte: start, $lt: end },
        isArchived: false,
      }),
      this.brainDumpModel.countDocuments({
        status: BrainDumpStatus.PROCESSED,
        processedAt: { $gte: start, $lt: end },
        isArchived: false,
      }),
      this.brainDumpModel.countDocuments({
        status: BrainDumpStatus.DISCARDED,
        discardedAt: { $gte: start, $lt: end },
        isArchived: false,
      }),
      this.brainDumpModel.countDocuments({
        status: BrainDumpStatus.INBOX,
        isFavourite: true,
        isActive: true,
        isArchived: false,
      }),
      this.brainDumpModel
        .findOne({
          status: BrainDumpStatus.INBOX,
          isActive: true,
          isArchived: false,
        })
        .sort({ createdAt: 1 })
        .select({ createdAt: 1 })
        .lean(),
      this.brainDumpModel
        .find({
          status: BrainDumpStatus.INBOX,
          isActive: true,
          isArchived: false,
        })
        .sort({ isFavourite: -1, createdAt: -1 })
        .limit(5)
        .select({ title: 1, content: 1, tags: 1, isFavourite: 1, createdAt: 1 })
        .lean(),
    ]);

    return {
      totalInbox,
      capturedToday,
      processedToday,
      discardedToday,
      favouriteInbox,
      oldestInboxAt: oldestInbox?.createdAt ?? null,
      recentInbox,
    };
  }

  async findOne(brainDumpId: string) {
    const objectId = this.toObjectId(brainDumpId);

    const item = await this.brainDumpModel.findOne({
      _id: objectId,
      isActive: true,
      isArchived: false,
    });

    if (!item) {
      throw new NotFoundException('Brain dump item not found.');
    }

    return item;
  }

  async update(brainDumpId: string, dto: UpdateBrainDumpDto) {
    const item = await this.findOne(brainDumpId);

    if (
      item.status === BrainDumpStatus.PROCESSED &&
      (dto.content !== undefined ||
        dto.title !== undefined ||
        dto.source !== undefined)
    ) {
      throw new ConflictException(
        'Processed brain dump content cannot be rewritten. Update the created entity instead.',
      );
    }

    if (dto.content !== undefined) {
      const content = dto.content.trim();
      if (!content) {
        throw new BadRequestException('Brain dump content cannot be empty.');
      }
      item.content = content;
    }

    if (dto.title !== undefined) item.title = dto.title.trim() || undefined;
    if (dto.source !== undefined) item.source = dto.source;
    if (dto.tags !== undefined) item.tags = this.normalizeTags(dto.tags);
    if (dto.isFavourite !== undefined) item.isFavourite = dto.isFavourite;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

    return item.save();
  }

  async process(brainDumpId: string, dto: ProcessBrainDumpDto) {
    const objectId = this.toObjectId(brainDumpId);

    const reserved = await this.brainDumpModel.findOneAndUpdate(
      {
        _id: objectId,
        status: BrainDumpStatus.INBOX,
        isActive: true,
        isArchived: false,
      },
      { $set: { status: BrainDumpStatus.PROCESSING } },
      { new: true },
    );

    if (!reserved) {
      const existing = await this.brainDumpModel.findById(objectId).lean();
      if (!existing) {
        throw new NotFoundException('Brain dump item not found.');
      }
      throw new ConflictException(
        `Brain dump item cannot be processed from status "${existing.status}".`,
      );
    }

    try {
      const created = await this.createTargetEntity(reserved, dto);
      const createdId = this.extractEntityId(created);

      const processed = await this.brainDumpModel.findByIdAndUpdate(
        objectId,
        {
          $set: {
            status: BrainDumpStatus.PROCESSED,
            processedAs: dto.target,
            processedEntityId: createdId,
            processedAt: new Date(),
            discardedAt: null,
          },
        },
        { new: true },
      );

      return { brainDump: processed, created };
    } catch (error) {
      await this.brainDumpModel.updateOne(
        { _id: objectId, status: BrainDumpStatus.PROCESSING },
        { $set: { status: BrainDumpStatus.INBOX } },
      );
      throw error;
    }
  }

  async discard(brainDumpId: string) {
    const item = await this.findOne(brainDumpId);
    if (item.status === BrainDumpStatus.PROCESSED) {
      throw new ConflictException(
        'Processed brain dump items cannot be discarded. Archive them instead.',
      );
    }
    item.status = BrainDumpStatus.DISCARDED;
    item.discardedAt = new Date();
    return item.save();
  }

  async reopen(brainDumpId: string) {
    const item = await this.findOne(brainDumpId);
    if (item.status !== BrainDumpStatus.DISCARDED) {
      throw new ConflictException(
        'Only discarded brain dump items can be reopened.',
      );
    }
    item.status = BrainDumpStatus.INBOX;
    item.discardedAt = undefined;
    return item.save();
  }

  async archive(brainDumpId: string) {
    const item = await this.findOne(brainDumpId);
    item.isArchived = true;
    item.isActive = false;
    item.archivedAt = new Date();
    return item.save();
  }

  async restore(brainDumpId: string) {
    const objectId = this.toObjectId(brainDumpId);
    const item = await this.brainDumpModel.findOne({
      _id: objectId,
      isArchived: true,
    });
    if (!item) {
      throw new NotFoundException('Archived brain dump item not found.');
    }
    item.isArchived = false;
    item.isActive = true;
    item.archivedAt = undefined;
    return item.save();
  }

  async remove(brainDumpId: string) {
    const objectId = this.toObjectId(brainDumpId);
    const result = await this.brainDumpModel.deleteOne({ _id: objectId });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Brain dump item not found.');
    }
    return { deleted: true, brainDumpId };
  }

  private async createTargetEntity(
    item: BrainDumpDocument,
    dto: ProcessBrainDumpDto,
  ) {
    const brainDumpId = item._id.toString();
    const title =
      dto.title?.trim() || item.title?.trim() || this.makeTitle(item.content);
    const tags = this.normalizeTags([
      ...(item.tags ?? []),
      ...(dto.tags ?? []),
    ]);
    const metadata = {
      brainDumpId,
      brainDumpSource: item.source,
      capturedAt: item.createdAt?.toISOString(),
    };

    switch (dto.target) {
      case BrainDumpTarget.TASK:
        return this.tasksService.create({
          title,
          description: item.content,
          status: TaskStatus.TODO,
          priority: dto.priority,
          area: dto.area,
          dueAt: dto.dueAt,
          tags,
          source: TaskSource.BRAIN_DUMP,
          sourceExternalId: brainDumpId,
          metadata,
        });
      case BrainDumpTarget.JOURNAL:
        return this.journalService.create({
          date: (item.createdAt ?? new Date()).toISOString(),
          title,
          content: item.content,
          type: dto.journalType ?? JournalEntryType.IDEA,
          tags,
          visibility: JournalVisibility.PRIVATE,
          source: JournalSource.BRAIN_DUMP,
          sourceExternalId: brainDumpId,
          metadata,
        });
      case BrainDumpTarget.MEMORY:
        return this.memoryService.create({
          content: item.content,
          type: dto.memoryType ?? MemoryType.FACT,
          source: MemorySource.BRAIN_DUMP,
          sourceReference: {
            entityId: brainDumpId,
            entityType: 'brain_dump',
            sourceCreatedAt: (item.createdAt ?? new Date()).toISOString(),
          },
          tags,
          accessLevel: dto.memoryAccessLevel ?? MemoryAccessLevel.OWNER_ONLY,
          sensitivity: dto.memorySensitivity,
        });
      default:
        throw new BadRequestException(
          'Unsupported brain dump processing target.',
        );
    }
  }

  private extractEntityId(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) {
      throw new BadRequestException(
        'Processed entity did not return a valid ID.',
      );
    }

    const record = entity as { _id?: unknown; id?: unknown };
    const rawId = record._id ?? record.id;
    const id =
      rawId instanceof Types.ObjectId
        ? rawId.toHexString()
        : typeof rawId === 'string'
          ? rawId
          : null;

    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        'Processed entity did not return a valid ID.',
      );
    }

    return new Types.ObjectId(id);
  }

  private makeTitle(content: string) {
    const firstLine = content.split(/\r?\n/)[0]?.trim() || content.trim();
    const compact = firstLine.replace(/\s+/g, ' ');
    return compact.length <= 120
      ? compact
      : `${compact.slice(0, 117).trim()}...`;
  }

  private normalizeTags(tags?: string[]) {
    return Array.from(
      new Set(
        (tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ),
    );
  }

  private toObjectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid brain dump ID.');
    }
    return new Types.ObjectId(value);
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getIstDayRange(date: Date) {
    const offsetMs = 330 * 60 * 1000;
    const shifted = new Date(date.getTime() + offsetMs);
    const shiftedStart = Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    );
    const start = new Date(shiftedStart - offsetMs);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
  }
}
