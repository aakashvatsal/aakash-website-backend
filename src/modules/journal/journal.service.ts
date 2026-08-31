import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';

import { JournalQueryDto } from './dto/journal-query.dto';

import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';

import {
  JournalEntry,
  JournalEntryDocument,
  JournalReading,
  JournalSleep,
  JournalSource,
  JournalVisibility,
  JournalWorkout,
} from './schemas/journal-entry.schema';

type JournalFilter = Record<string, any>;

@Injectable()
export class JournalService {
  constructor(
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,
  ) {}

  async create(dto: CreateJournalEntryDto) {
    const date = this.parseDate(dto.date);

    const dateKey = dto.dateKey?.trim() || this.toDateKey(date);

    const slug = await this.generateUniqueSlug(dto.slug || dto.title, dateKey);

    const visibility = dto.visibility ?? JournalVisibility.PRIVATE;

    const isPublished = dto.isPublished === true;

    const publishedAt = isPublished
      ? dto.publishedAt
        ? this.parseDate(dto.publishedAt)
        : new Date()
      : undefined;

    const reading = this.buildReading(dto.reading);

    const journalEntry = new this.journalModel({
      ...dto,

      date,

      dateKey,

      slug,

      visibility,

      isPublished,

      publishedAt,

      source: dto.source ?? JournalSource.MANUAL,

      memoryIds: this.toObjectIds(dto.memoryIds) ?? [],

      companyIds: this.toObjectIds(dto.companyIds) ?? [],

      libraryItemIds: this.toObjectIds(dto.libraryItemIds) ?? [],

      reading,
    });

    return journalEntry.save();
  }

  async findAll(query: JournalQueryDto) {
    const page = query.page ?? 1;

    const limit = query.limit ?? 20;

    const filter: JournalFilter = {};

    if (query.type !== undefined) {
      filter.type = query.type;
    }

    if (query.mood !== undefined) {
      filter.mood = query.mood;
    }

    if (query.visibility !== undefined) {
      filter.visibility = query.visibility;
    }

    if (query.source !== undefined) {
      filter.source = query.source;
    }

    if (query.isPublished !== undefined) {
      filter.isPublished = query.isPublished;
    }

    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    } else {
      filter.isArchived = false;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    } else {
      filter.isActive = true;
    }

    if (query.tag) {
      filter.tags = query.tag.trim();
    }

    if (query.search) {
      const search = this.escapeRegex(query.search.trim());

      filter.$or = [
        {
          title: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          content: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          highlight: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          tags: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          lessons: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          decisions: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          ideas: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          gratitude: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          challenges: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          wins: {
            $regex: search,

            $options: 'i',
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.journalModel
        .find(filter)
        .sort({
          date: -1,

          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.journalModel.countDocuments(filter),
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

  async findById(journalEntryId: string) {
    const journalEntry = await this.journalModel
      .findOne({
        _id: this.toObjectId(journalEntryId),

        isActive: true,
      })
      .lean();

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found.');
    }

    return journalEntry;
  }

  async findBySlug(slug: string) {
    const journalEntry = await this.journalModel
      .findOne({
        slug: slug.trim().toLowerCase(),

        isActive: true,

        isArchived: false,
      })
      .lean();

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found.');
    }

    return journalEntry;
  }

  async findPublic(query: JournalQueryDto) {
    const page = query.page ?? 1;

    const limit = query.limit ?? 20;

    const filter: JournalFilter = {
      visibility: JournalVisibility.PUBLIC,

      isPublished: true,

      isArchived: false,

      isActive: true,
    };

    if (query.type !== undefined) {
      filter.type = query.type;
    }

    if (query.mood !== undefined) {
      filter.mood = query.mood;
    }

    if (query.source !== undefined) {
      filter.source = query.source;
    }

    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }

    if (query.tag) {
      filter.tags = query.tag.trim();
    }

    if (query.search) {
      const search = this.escapeRegex(query.search.trim());

      filter.$or = [
        {
          title: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          content: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          highlight: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          tags: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          lessons: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          decisions: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          ideas: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          gratitude: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          challenges: {
            $regex: search,

            $options: 'i',
          },
        },

        {
          wins: {
            $regex: search,

            $options: 'i',
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.journalModel
        .find(filter)
        .sort({
          date: -1,

          publishedAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.journalModel.countDocuments(filter),
    ]);

    return {
      data: data.map((entry) => this.toPublicEntry(entry)),

      pagination: {
        page,

        limit,

        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicBySlug(slug: string) {
    const journalEntry = await this.journalModel
      .findOne({
        slug: slug.trim().toLowerCase(),

        visibility: JournalVisibility.PUBLIC,

        isPublished: true,

        isArchived: false,

        isActive: true,
      })
      .lean();

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found.');
    }

    return this.toPublicEntry(journalEntry);
  }

  async update(journalEntryId: string, dto: UpdateJournalEntryDto) {
    const journalEntry = await this.getDocument(journalEntryId);

    this.assertDailyJournalUpdateAllowed(journalEntry, dto);

    if (dto.date !== undefined) {
      const date = this.parseDate(dto.date);

      journalEntry.date = date;

      journalEntry.dateKey = dto.dateKey?.trim() || this.toDateKey(date);
    } else if (dto.dateKey !== undefined) {
      journalEntry.dateKey = dto.dateKey.trim();
    }

    if (dto.title !== undefined) {
      journalEntry.title = dto.title.trim();
    }

    if (dto.slug !== undefined) {
      journalEntry.slug = await this.generateUniqueSlug(
        dto.slug,
        journalEntry.dateKey,
        journalEntry._id,
      );
    }

    if (dto.type !== undefined) {
      journalEntry.type = dto.type;
    }

    if (dto.content !== undefined) {
      journalEntry.content = dto.content;
    }

    if (dto.highlight !== undefined) {
      journalEntry.highlight = dto.highlight;
    }

    if (dto.mood !== undefined) {
      journalEntry.mood = dto.mood;
    }

    if (dto.moodScore !== undefined) {
      journalEntry.moodScore = dto.moodScore;
    }

    if (dto.energyScore !== undefined) {
      journalEntry.energyScore = dto.energyScore;
    }

    if (dto.productivityScore !== undefined) {
      journalEntry.productivityScore = dto.productivityScore;
    }

    if (dto.stressScore !== undefined) {
      journalEntry.stressScore = dto.stressScore;
    }

    if (dto.tags !== undefined) {
      journalEntry.tags = dto.tags;
    }

    if (dto.lessons !== undefined) {
      journalEntry.lessons = dto.lessons;
    }

    if (dto.decisions !== undefined) {
      journalEntry.decisions = dto.decisions;
    }

    if (dto.ideas !== undefined) {
      journalEntry.ideas = dto.ideas;
    }

    if (dto.gratitude !== undefined) {
      journalEntry.gratitude = dto.gratitude;
    }

    if (dto.challenges !== undefined) {
      journalEntry.challenges = dto.challenges;
    }

    if (dto.wins !== undefined) {
      journalEntry.wins = dto.wins;
    }

    if (dto.workout !== undefined) {
      journalEntry.workout = {
        ...(journalEntry.workout ?? {}),

        ...dto.workout,
      };
    }

    if (dto.reading !== undefined) {
      const { libraryItemId, ...readingData } = dto.reading;

      journalEntry.reading = {
        ...(journalEntry.reading ?? {}),

        ...readingData,

        libraryItemId:
          libraryItemId !== undefined
            ? this.toObjectId(libraryItemId)
            : journalEntry.reading?.libraryItemId,
      };
    }

    if (dto.sleep !== undefined) {
      journalEntry.sleep = {
        ...(journalEntry.sleep ?? {}),

        ...dto.sleep,
      };
    }

    if (dto.steps !== undefined) {
      journalEntry.steps = dto.steps;
    }

    if (dto.memoryIds !== undefined) {
      journalEntry.memoryIds = this.toObjectIds(dto.memoryIds) ?? [];
    }

    if (dto.companyIds !== undefined) {
      journalEntry.companyIds = this.toObjectIds(dto.companyIds) ?? [];
    }

    if (dto.libraryItemIds !== undefined) {
      journalEntry.libraryItemIds = this.toObjectIds(dto.libraryItemIds) ?? [];
    }

    if (dto.visibility !== undefined) {
      journalEntry.visibility = dto.visibility;
    }

    if (dto.isFavourite !== undefined) {
      journalEntry.isFavourite = dto.isFavourite;
    }

    if (dto.isArchived !== undefined) {
      journalEntry.isArchived = dto.isArchived;
    }

    if (dto.isActive !== undefined) {
      journalEntry.isActive = dto.isActive;
    }

    if (dto.source !== undefined) {
      journalEntry.source = dto.source;
    }

    if (dto.sourceExternalId !== undefined) {
      journalEntry.sourceExternalId = dto.sourceExternalId;
    }

    if (dto.metadata !== undefined) {
      journalEntry.metadata = dto.metadata;
    }

    if (dto.isPublished !== undefined) {
      journalEntry.isPublished = dto.isPublished;

      if (dto.isPublished) {
        journalEntry.publishedAt = dto.publishedAt
          ? this.parseDate(dto.publishedAt)
          : (journalEntry.publishedAt ?? new Date());
      } else {
        journalEntry.publishedAt = undefined;
      }
    } else if (dto.publishedAt !== undefined) {
      journalEntry.publishedAt = this.parseDate(dto.publishedAt);
    }

    return journalEntry.save();
  }

  async publish(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    this.assertDailyJournalPublishAllowed(journalEntry);

    journalEntry.visibility = JournalVisibility.PUBLIC;

    journalEntry.isPublished = true;

    journalEntry.publishedAt = new Date();

    journalEntry.isArchived = false;

    journalEntry.isActive = true;

    return journalEntry.save();
  }

  async unpublish(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    journalEntry.isPublished = false;

    journalEntry.publishedAt = undefined;

    return journalEntry.save();
  }

  async favourite(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    journalEntry.isFavourite = true;

    return journalEntry.save();
  }

  async unfavourite(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    journalEntry.isFavourite = false;

    return journalEntry.save();
  }

  async archive(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    journalEntry.isArchived = true;

    journalEntry.isPublished = false;

    journalEntry.publishedAt = undefined;

    return journalEntry.save();
  }

  async restore(journalEntryId: string) {
    const journalEntry = await this.journalModel.findById(
      this.toObjectId(journalEntryId),
    );

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found.');
    }

    journalEntry.isArchived = false;

    journalEntry.isActive = true;

    return journalEntry.save();
  }

  async remove(journalEntryId: string) {
    const journalEntry = await this.getDocument(journalEntryId);

    journalEntry.isActive = false;

    journalEntry.isArchived = true;

    journalEntry.isPublished = false;

    journalEntry.publishedAt = undefined;

    await journalEntry.save();

    return {
      message: 'Journal entry deleted successfully.',
    };
  }

  private async getDocument(journalEntryId: string) {
    const journalEntry = await this.journalModel.findOne({
      _id: this.toObjectId(journalEntryId),

      isActive: true,
    });

    if (!journalEntry) {
      throw new NotFoundException('Journal entry not found.');
    }

    return journalEntry;
  }

  private buildReading(
    reading?: CreateJournalEntryDto['reading'],
  ): JournalReading | undefined {
    if (!reading) {
      return undefined;
    }

    const { libraryItemId, ...readingData } = reading;

    return {
      ...readingData,

      libraryItemId: libraryItemId ? this.toObjectId(libraryItemId) : undefined,
    } as JournalReading;
  }

  private async generateUniqueSlug(
    value: string,
    dateKey: string,
    excludeId?: Types.ObjectId,
  ) {
    const normalized = this.slugify(value);

    const base = normalized || 'journal';

    let slug = `${dateKey}-${base}`;

    let counter = 2;

    while (await this.slugExists(slug, excludeId)) {
      slug = `${dateKey}-${base}-${counter}`;

      counter += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, excludeId?: Types.ObjectId) {
    const filter: JournalFilter = {
      slug,
    };

    if (excludeId) {
      filter._id = {
        $ne: excludeId,
      };
    }

    const exists = await this.journalModel.exists(filter);

    return Boolean(exists);
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private toDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new BadRequestException('Unable to generate journal date key.');
    }

    return `${year}-${month}-${day}`;
  }

  private parseDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    return date;
  }

  private toObjectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ObjectId: ${value}`);
    }

    return new Types.ObjectId(value);
  }

  private toObjectIds(values?: string[]) {
    if (!values) {
      return undefined;
    }

    return values.map((value) => this.toObjectId(value));
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private assertDailyJournalUpdateAllowed(
    journalEntry: JournalEntryDocument,
    dto: UpdateJournalEntryDto,
  ) {
    const kind = this.getDailyJournalKind(journalEntry);

    if (!kind) {
      return;
    }

    if (
      dto.metadata !== undefined ||
      dto.source !== undefined ||
      dto.sourceExternalId !== undefined ||
      dto.date !== undefined ||
      dto.dateKey !== undefined ||
      dto.slug !== undefined
    ) {
      throw new BadRequestException(
        'HSAKAA daily journal provenance and date cannot be replaced through the normal editor.',
      );
    }

    if (
      kind === 'private' &&
      (dto.visibility === JournalVisibility.PUBLIC || dto.isPublished === true)
    ) {
      throw new BadRequestException(
        'The private HSAKAA daily journal cannot be published. Use its separate public-safe draft.',
      );
    }

    if (kind === 'public' && dto.isPublished === true) {
      if (this.isPublicDailyDraftStale(journalEntry)) {
        throw new BadRequestException(
          'The public-safe HSAKAA journal draft is stale. Regenerate and approve it again before publishing.',
        );
      }
      if (this.getApprovalStatus(journalEntry) !== 'approved') {
        throw new BadRequestException(
          'Approve the public-safe HSAKAA journal draft before publishing it.',
        );
      }
    }
  }

  private assertDailyJournalPublishAllowed(journalEntry: JournalEntryDocument) {
    const kind = this.getDailyJournalKind(journalEntry);

    if (kind === 'private') {
      throw new BadRequestException(
        'The private HSAKAA daily journal cannot be published. Publish only its separate public-safe draft.',
      );
    }

    if (kind === 'public') {
      if (this.isPublicDailyDraftStale(journalEntry)) {
        throw new BadRequestException(
          'The public-safe HSAKAA journal draft is stale. Regenerate and approve it again before publishing.',
        );
      }
      if (this.getApprovalStatus(journalEntry) !== 'approved') {
        throw new BadRequestException(
          'Approve the public-safe HSAKAA journal draft before publishing it.',
        );
      }
    }
  }

  private getDailyJournalKind(journalEntry: {
    metadata?: unknown;
  }): 'private' | 'public' | null {
    const metadata =
      journalEntry.metadata && typeof journalEntry.metadata === 'object'
        ? (journalEntry.metadata as Record<string, unknown>)
        : {};

    if (metadata.dailySynthesis === true) {
      return 'private';
    }

    if (metadata.dailyPublicDerivative === true) {
      return 'public';
    }

    return null;
  }

  private isPublicDailyDraftStale(journalEntry: { metadata?: unknown }) {
    const metadata =
      journalEntry.metadata && typeof journalEntry.metadata === 'object'
        ? (journalEntry.metadata as Record<string, unknown>)
        : {};
    return metadata.publicDraftStale === true;
  }

  private getApprovalStatus(journalEntry: { metadata?: unknown }) {
    const metadata =
      journalEntry.metadata && typeof journalEntry.metadata === 'object'
        ? (journalEntry.metadata as Record<string, unknown>)
        : {};

    return metadata.approvalStatus;
  }

  private toPublicEntry(entry: any) {
    const plainEntry =
      entry && typeof entry.toObject === 'function' ? entry.toObject() : entry;

    const {
      metadata: _metadata,

      sourceExternalId: _sourceExternalId,

      memoryIds: _memoryIds,

      isActive: _isActive,

      isArchived: _isArchived,

      ...publicEntry
    } = plainEntry;

    return publicEntry;
  }
}
