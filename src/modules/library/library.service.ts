import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';

import { CreateLibraryItemDto } from './dto/create-library-item.dto';
import { LibraryQueryDto } from './dto/library-query.dto';
import { RateLibraryItemDto } from './dto/rate-library-item.dto';
import {
  SyncAppleBookItemDto,
  SyncAppleBooksDto,
} from './dto/sync-apple-books.dto';
import { UpdateLibraryItemDto } from './dto/update-library-item.dto';
import { UpdateLibraryProgressDto } from './dto/update-library-progress.dto';
import { UpdateLibraryStatusDto } from './dto/update-library-status.dto';
import { SyncAppleBooksHighlightsDto } from './dto/sync-apple-books-highlights.dto';
import {
  LibraryItem,
  LibraryItemDocument,
  LibraryItemSource,
  LibraryItemStatus,
  LibraryItemType,
} from './schemas/library-item.schema';
import {
  LibraryHighlight,
  LibraryHighlightDocument,
  LibraryHighlightType,
} from './schemas/library-highlight.schema';

@Injectable()
export class LibraryService {
  constructor(
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItemDocument>,

    @InjectModel(LibraryHighlight.name)
    private readonly libraryHighlightModel: Model<LibraryHighlightDocument>,
  ) {}

  async create(dto: CreateLibraryItemDto) {
    const preparedStatus = dto.status ?? LibraryItemStatus.WANT_TO_READ;

    const authors = this.prepareAuthors({
      author: dto.author,
      authors: dto.authors,
    });

    const author = authors.length > 0 ? authors.join(', ') : dto.author?.trim();

    const preparedDates = this.prepareStatusDates({
      status: preparedStatus,
      startedAt: dto.startedAt,
      completedAt: dto.completedAt,
    });

    const progress = this.calculateProgress({
      currentPage: dto.currentPage ?? 0,
      totalPages: dto.totalPages ?? 0,
      progressPercentage: dto.progressPercentage,
    });

    const baseSlug = dto.slug?.trim()
      ? this.sanitizeSlug(dto.slug)
      : this.generateSlug(dto.category, dto.title, author);

    const slug = await this.ensureUniqueSlug(baseSlug);

    return this.libraryItemModel.create({
      ...dto,

      title: dto.title.trim(),
      subtitle: dto.subtitle?.trim(),

      slug,

      type: dto.type ?? LibraryItemType.BOOK,

      status: preparedStatus,

      author,
      authors,

      publisher: dto.publisher?.trim(),
      category: dto.category?.trim(),

      tags: this.prepareStringArray(dto.tags),

      source: dto.source ?? LibraryItemSource.MANUAL,

      externalId: dto.externalId?.trim(),

      appleBooksId: dto.appleBooksId?.trim(),

      currentPage:
        preparedStatus === LibraryItemStatus.COMPLETED &&
        progress.totalPages > 0
          ? progress.totalPages
          : progress.currentPage,

      totalPages: progress.totalPages,

      progressPercentage:
        preparedStatus === LibraryItemStatus.COMPLETED
          ? 100
          : progress.progressPercentage,

      startedAt: preparedDates.startedAt,

      completedAt: preparedDates.completedAt,

      lastReadAt: dto.lastReadAt ? new Date(dto.lastReadAt) : undefined,

      importedAt: dto.importedAt ? new Date(dto.importedAt) : undefined,

      lastSyncedAt: dto.lastSyncedAt ? new Date(dto.lastSyncedAt) : undefined,

      keyTakeaways: this.prepareStringArray(dto.keyTakeaways),

      quotes: this.prepareStringArray(dto.quotes),

      isPublic: dto.isPublic ?? false,
      isFavourite: dto.isFavourite ?? false,
      isArchived: dto.isArchived ?? false,
      isActive: dto.isActive ?? true,
    });
  }

  async syncAppleBooks(dto: SyncAppleBooksDto) {
    const syncedAt = dto.syncedAt ? new Date(dto.syncedAt) : new Date();

    const result = {
      received: dto.books.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,

      errors: [] as Array<{
        externalId: string;
        title: string;
        message: string;
      }>,
    };

    for (const incomingBook of dto.books) {
      try {
        const externalId = incomingBook.externalId.trim();

        const existing = await this.libraryItemModel.findOne({
          source: LibraryItemSource.APPLE_BOOKS,

          externalId,
        });

        if (
          existing &&
          incomingBook.syncHash &&
          existing.syncHash === incomingBook.syncHash
        ) {
          existing.lastSyncedAt = syncedAt;

          existing.isActive = true;

          await existing.save();

          result.unchanged += 1;

          continue;
        }

        if (!existing) {
          await this.createAppleBook({
            incomingBook,
            syncedAt,
          });

          result.created += 1;

          continue;
        }

        await this.updateAppleBook({
          existing,
          incomingBook,
          syncedAt,
        });

        result.updated += 1;
      } catch (error) {
        result.failed += 1;

        result.errors.push({
          externalId: incomingBook.externalId,

          title: incomingBook.title,

          message:
            error instanceof Error
              ? error.message
              : 'Unknown synchronization error.',
        });
      }
    }

    return {
      message: 'Apple Books synchronization completed.',

      data: result,
    };
  }

  async findAll(query: LibraryQueryDto, publicOnly = false) {
    const page = Math.max(query.page ?? 1, 1);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: QueryFilter<LibraryItemDocument> = {
      isActive: true,
      ...(publicOnly
        ? {
            isPublic: true,
            isArchived: false,
          }
        : {}),
    };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.category?.trim()) {
      filter.category = {
        $regex: this.escapeRegex(query.category.trim()),
        $options: 'i',
      };
    }

    if (query.author?.trim()) {
      filter.$or = [
        {
          author: {
            $regex: this.escapeRegex(query.author.trim()),
            $options: 'i',
          },
        },
        {
          authors: {
            $regex: this.escapeRegex(query.author.trim()),
            $options: 'i',
          },
        },
      ];
    }

    if (query.tag?.trim()) {
      filter.tags = {
        $regex: this.escapeRegex(query.tag.trim()),
        $options: 'i',
      };
    }

    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }

    if (!publicOnly && query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.libraryItemModel
        .find(filter)
        .select({
          _id: 1,

          slug: 1,

          title: 1,

          author: 1,

          authors: 1,

          category: 1,

          type: 1,

          status: 1,

          coverImageUrl: 1,

          progressPercentage: 1,

          currentPage: 1,

          totalPages: 1,

          rating: 1,

          highlightsCount: 1,

          notesCount: 1,

          lastReadAt: 1,

          lastHighlightedAt: 1,

          isFavourite: 1,

          source: 1,

          isPublic: 1,

          isArchived: 1,

          isActive: 1,
        })
        .sort({
          isFavourite: -1,
          lastReadAt: -1,
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.libraryItemModel.countDocuments(filter),
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

  async findOne(libraryItemId: string, publicOnly = false) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const query = this.libraryItemModel.findOne({
      _id: new Types.ObjectId(libraryItemId),

      isActive: true,
      ...(publicOnly
        ? {
            isPublic: true,
            isArchived: false,
          }
        : {}),
    });

    if (publicOnly) {
      query.select(
        '_id slug title subtitle type status author authors publisher category tags coverImageUrl sourceUrl progressPercentage currentPage totalPages rating summary keyTakeaways quotes highlightsCount notesCount lastHighlightedAt startedAt completedAt lastReadAt isFavourite',
      );
    }

    const item = await query.lean();

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  async findOneViaSlug(slug: string, publicOnly = false) {
    const preparedSlug = this.sanitizeSlug(slug);

    const query = this.libraryItemModel.findOne({
      slug: preparedSlug,
      isActive: true,
      ...(publicOnly
        ? {
            isPublic: true,
            isArchived: false,
          }
        : {}),
    });

    if (publicOnly) {
      query.select(
        '_id slug title subtitle type status author authors publisher category tags coverImageUrl sourceUrl progressPercentage currentPage totalPages rating summary keyTakeaways quotes highlightsCount notesCount lastHighlightedAt startedAt completedAt lastReadAt isFavourite',
      );
    }

    const item = await query.lean();

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  async update(libraryItemId: string, dto: UpdateLibraryItemDto) {
    const item = await this.getItemDocument(libraryItemId);

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    if (dto.title !== undefined) {
      updateData.title = dto.title.trim();
    }

    if (dto.subtitle !== undefined) {
      updateData.subtitle = dto.subtitle?.trim() || null;
    }

    if (dto.publisher !== undefined) {
      updateData.publisher = dto.publisher?.trim() || null;
    }

    if (dto.category !== undefined) {
      updateData.category = dto.category?.trim() || null;
    }

    if (dto.author !== undefined) {
      updateData.author = dto.author?.trim() || null;
    }

    if (dto.authors !== undefined) {
      const authors = this.prepareAuthors({
        author: dto.author,
        authors: dto.authors,
      });

      updateData.authors = authors;

      if (dto.author === undefined) {
        updateData.author = authors.length > 0 ? authors.join(', ') : null;
      }
    }

    if (dto.tags !== undefined) {
      updateData.tags = this.prepareStringArray(dto.tags);
    }

    if (dto.keyTakeaways !== undefined) {
      updateData.keyTakeaways = this.prepareStringArray(dto.keyTakeaways);
    }

    if (dto.quotes !== undefined) {
      updateData.quotes = this.prepareStringArray(dto.quotes);
    }

    if (dto.slug !== undefined) {
      const preparedSlug = this.sanitizeSlug(dto.slug);

      updateData.slug = await this.ensureUniqueSlug(
        preparedSlug,
        item._id.toString(),
      );
    }

    if (
      dto.currentPage !== undefined ||
      dto.totalPages !== undefined ||
      dto.progressPercentage !== undefined
    ) {
      const progress = this.calculateProgress({
        currentPage: dto.currentPage ?? item.currentPage,

        totalPages: dto.totalPages ?? item.totalPages,

        progressPercentage: dto.progressPercentage,
      });

      updateData.currentPage = progress.currentPage;

      updateData.totalPages = progress.totalPages;

      updateData.progressPercentage = progress.progressPercentage;
    }

    if (dto.startedAt !== undefined) {
      updateData.startedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    }

    if (dto.completedAt !== undefined) {
      updateData.completedAt = dto.completedAt
        ? new Date(dto.completedAt)
        : null;
    }

    if (dto.lastReadAt !== undefined) {
      updateData.lastReadAt = dto.lastReadAt ? new Date(dto.lastReadAt) : null;
    }

    if (dto.importedAt !== undefined) {
      updateData.importedAt = dto.importedAt ? new Date(dto.importedAt) : null;
    }

    if (dto.lastSyncedAt !== undefined) {
      updateData.lastSyncedAt = dto.lastSyncedAt
        ? new Date(dto.lastSyncedAt)
        : null;
    }

    if (dto.status !== undefined) {
      const dates = this.prepareStatusDates({
        status: dto.status,

        startedAt: dto.startedAt ?? item.startedAt?.toISOString(),

        completedAt: dto.completedAt ?? item.completedAt?.toISOString(),
      });

      updateData.startedAt = dates.startedAt;

      updateData.completedAt = dates.completedAt;

      if (dto.status === LibraryItemStatus.COMPLETED) {
        updateData.progressPercentage = 100;

        updateData.lastReadAt = dto.lastReadAt
          ? new Date(dto.lastReadAt)
          : new Date();

        const totalPages = dto.totalPages ?? item.totalPages;

        if (totalPages > 0) {
          updateData.currentPage = totalPages;
        }
      }

      if (dto.status === LibraryItemStatus.WANT_TO_READ) {
        updateData.progressPercentage = 0;

        updateData.currentPage = 0;

        updateData.completedAt = null;
      }
    }

    return this.libraryItemModel
      .findByIdAndUpdate(
        item._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();
  }

  async updateProgress(libraryItemId: string, dto: UpdateLibraryProgressDto) {
    const item = await this.getItemDocument(libraryItemId);

    const progress = this.calculateProgress({
      currentPage: dto.currentPage ?? item.currentPage,

      totalPages: dto.totalPages ?? item.totalPages,

      progressPercentage: dto.progressPercentage,
    });

    const updateData: Record<string, unknown> = {
      currentPage: progress.currentPage,

      totalPages: progress.totalPages,

      progressPercentage: progress.progressPercentage,

      lastReadAt: dto.lastReadAt ? new Date(dto.lastReadAt) : new Date(),
    };

    if (
      item.status === LibraryItemStatus.WANT_TO_READ ||
      item.status === LibraryItemStatus.PAUSED
    ) {
      updateData.status = LibraryItemStatus.READING;

      if (!item.startedAt) {
        updateData.startedAt = new Date();
      }
    }

    if (progress.progressPercentage >= 100) {
      updateData.status = LibraryItemStatus.COMPLETED;

      updateData.completedAt = new Date();

      updateData.progressPercentage = 100;

      if (progress.totalPages > 0) {
        updateData.currentPage = progress.totalPages;
      }
    }

    return this.libraryItemModel
      .findByIdAndUpdate(
        item._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();
  }

  async updateStatus(libraryItemId: string, dto: UpdateLibraryStatusDto) {
    const item = await this.getItemDocument(libraryItemId);

    const dates = this.prepareStatusDates({
      status: dto.status,

      startedAt: dto.startedAt ?? item.startedAt?.toISOString(),

      completedAt: dto.completedAt ?? item.completedAt?.toISOString(),
    });

    const updateData: Record<string, unknown> = {
      status: dto.status,
      startedAt: dates.startedAt,
      completedAt: dates.completedAt,
    };

    if (dto.status === LibraryItemStatus.COMPLETED) {
      updateData.progressPercentage = 100;

      updateData.lastReadAt = new Date();

      if (item.totalPages > 0) {
        updateData.currentPage = item.totalPages;
      }
    }

    if (dto.status === LibraryItemStatus.WANT_TO_READ) {
      updateData.progressPercentage = 0;

      updateData.currentPage = 0;

      updateData.completedAt = null;
    }

    return this.libraryItemModel
      .findByIdAndUpdate(
        item._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();
  }

  async rate(libraryItemId: string, dto: RateLibraryItemDto) {
    return this.updateField(libraryItemId, {
      rating: dto.rating,
    });
  }

  async toggleFavourite(libraryItemId: string) {
    const item = await this.getItemDocument(libraryItemId);

    item.isFavourite = !item.isFavourite;

    await item.save();

    return item;
  }

  async setFavourite(libraryItemId: string, isFavourite: boolean) {
    return this.updateField(libraryItemId, {
      isFavourite,
    });
  }

  async addTakeaway(libraryItemId: string, value: string) {
    return this.addUniqueArrayItem(libraryItemId, 'keyTakeaways', value);
  }

  async removeTakeaway(libraryItemId: string, value: string) {
    return this.removeArrayItem(libraryItemId, 'keyTakeaways', value);
  }

  async addQuote(libraryItemId: string, value: string) {
    return this.addUniqueArrayItem(libraryItemId, 'quotes', value);
  }

  async removeQuote(libraryItemId: string, value: string) {
    return this.removeArrayItem(libraryItemId, 'quotes', value);
  }

  async syncAppleBooksHighlights(dto: SyncAppleBooksHighlightsDto) {
    const syncedAt = dto.syncedAt ? new Date(dto.syncedAt) : new Date();

    const result = {
      received: dto.highlights.length,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,

      errors: [] as Array<{
        externalId: string;
        assetId: string;
        message: string;
      }>,
    };

    const affectedLibraryItemIds = new Set<string>();

    for (const incomingHighlight of dto.highlights) {
      try {
        const assetId = incomingHighlight.assetId.trim();

        const externalId = incomingHighlight.externalId.trim();

        /**
         * Find the book using the Apple asset ID.
         */
        const libraryItem = await this.libraryItemModel.findOne({
          source: LibraryItemSource.APPLE_BOOKS,

          externalId: assetId,

          isActive: true,
        });

        /**
         * Some annotation records may point at an asset
         * that isn't present in the current library.
         */
        if (!libraryItem) {
          result.skipped += 1;

          continue;
        }

        const text = incomingHighlight.text?.trim();

        const note = incomingHighlight.note?.trim();

        /**
         * We only store meaningful highlights/notes.
         *
         * Apple also keeps reading positions/bookmarks in
         * the annotation database. Those can have neither
         * selected text nor a note.
         */
        if (!text && !note) {
          result.skipped += 1;

          continue;
        }

        const existing = await this.libraryHighlightModel.findOne({
          source: LibraryItemSource.APPLE_BOOKS,

          externalId,
        });

        if (
          existing &&
          incomingHighlight.syncHash &&
          existing.syncHash === incomingHighlight.syncHash
        ) {
          existing.lastSyncedAt = syncedAt;

          existing.isActive = true;

          await existing.save();

          result.unchanged += 1;

          affectedLibraryItemIds.add(libraryItem._id.toString());

          continue;
        }

        const type = this.determineHighlightType(text, note);

        if (!existing) {
          await this.libraryHighlightModel.create({
            libraryItemId: libraryItem._id,

            assetId,
            externalId,

            type,

            text,
            note,

            location: incomingHighlight.location?.trim(),

            physicalLocation: incomingHighlight.physicalLocation,

            locationRangeStart: incomingHighlight.locationRangeStart,

            locationRangeEnd: incomingHighlight.locationRangeEnd,

            style: incomingHighlight.style,

            isUnderline: incomingHighlight.isUnderline ?? false,

            source: LibraryItemSource.APPLE_BOOKS,

            highlightedAt: incomingHighlight.highlightedAt
              ? new Date(incomingHighlight.highlightedAt)
              : undefined,

            sourceModifiedAt: incomingHighlight.sourceModifiedAt
              ? new Date(incomingHighlight.sourceModifiedAt)
              : undefined,

            lastSyncedAt: syncedAt,

            syncHash: incomingHighlight.syncHash,

            isPublic: false,
            isFavourite: false,
            isArchived: false,
            isActive: true,
          });

          result.created += 1;
        } else {
          existing.libraryItemId = libraryItem._id;

          existing.assetId = assetId;

          existing.type = type;

          existing.text = text;
          existing.note = note;

          existing.location = incomingHighlight.location?.trim();

          existing.physicalLocation = incomingHighlight.physicalLocation;

          existing.locationRangeStart = incomingHighlight.locationRangeStart;

          existing.locationRangeEnd = incomingHighlight.locationRangeEnd;

          existing.style = incomingHighlight.style;

          existing.isUnderline = incomingHighlight.isUnderline ?? false;

          if (incomingHighlight.highlightedAt) {
            existing.highlightedAt = new Date(incomingHighlight.highlightedAt);
          }

          if (incomingHighlight.sourceModifiedAt) {
            existing.sourceModifiedAt = new Date(
              incomingHighlight.sourceModifiedAt,
            );
          }

          existing.lastSyncedAt = syncedAt;

          existing.syncHash = incomingHighlight.syncHash;

          existing.isActive = true;

          await existing.save();

          result.updated += 1;
        }

        affectedLibraryItemIds.add(libraryItem._id.toString());
      } catch (error) {
        result.failed += 1;

        result.errors.push({
          externalId: incomingHighlight.externalId,

          assetId: incomingHighlight.assetId,

          message:
            error instanceof Error
              ? error.message
              : 'Unknown synchronization error.',
        });
      }
    }

    /**
     * Refresh the cached counters on each affected book.
     */
    for (const libraryItemId of affectedLibraryItemIds) {
      await this.refreshHighlightStats(libraryItemId);
    }

    return {
      message: 'Apple Books highlights synchronization completed.',

      data: result,
    };
  }

  async updateMissingCoverImages() {
    const libraryItems = await this.libraryItemModel
      .find({
        isActive: true,
        type: LibraryItemType.BOOK,
        $or: [
          {
            coverImageUrl: {
              $exists: false,
            },
          },
          {
            coverImageUrl: null,
          },
          {
            coverImageUrl: '',
          },
        ],
      })
      .select({
        title: 1,
        author: 1,
        authors: 1,
        coverImageUrl: 1,
      })
      .lean();

    const result = {
      total: libraryItems.length,
      updated: 0,
      notFound: 0,
      failed: 0,
      books: [] as Array<{
        libraryItemId: string;
        title: string;
        author?: string;
        status: 'updated' | 'not_found' | 'failed';
        coverImageUrl?: string;
        message?: string;
      }>,
    };

    for (const libraryItem of libraryItems) {
      const title = libraryItem.title?.trim();

      const author =
        libraryItem.author?.trim() || libraryItem.authors?.[0]?.trim();

      if (!title) {
        result.failed += 1;

        result.books.push({
          libraryItemId: libraryItem._id.toString(),
          title: libraryItem.title ?? 'Unknown',
          author,
          status: 'failed',
          message: 'Book title is missing.',
        });

        continue;
      }

      try {
        /**
         * ------------------------------------------------------
         * Search Open Library
         * ------------------------------------------------------
         */

        const searchParams = new URLSearchParams();

        searchParams.set('title', title);

        if (author) {
          searchParams.set('author', author);
        }

        searchParams.set('limit', '10');

        const url = `https://openlibrary.org/search.json?${searchParams.toString()}`;

        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',

            'User-Agent': 'HSAKAA/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`Open Library returned HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          docs?: Array<{
            key?: string;
            title?: string;
            author_name?: string[];
            cover_i?: number;
            cover_edition_key?: string;
          }>;
        };

        /**
         * ------------------------------------------------------
         * Normalize strings
         *
         * Zurich International Chess Tournament, 1953
         *
         * becomes:
         *
         * zurich international chess tournament 1953
         * ------------------------------------------------------
         */

        const normalize = (value?: string) =>
          (value ?? '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const expectedTitle = normalize(title);

        const expectedAuthor = normalize(author);

        /**
         * ------------------------------------------------------
         * Find best matching result
         * ------------------------------------------------------
         */

        const matchingBook = data.docs?.find((book) => {
          /**
           * No cover = useless for this task.
           */
          if (!book.cover_i) {
            return false;
          }

          const resultTitle = normalize(book.title);

          /**
           * Require title match.
           *
           * Punctuation differences are removed by
           * normalization.
           */
          if (resultTitle !== expectedTitle) {
            return false;
          }

          /**
           * If Apple Books doesn't contain an
           * author, accept exact title.
           */
          if (!expectedAuthor) {
            return true;
          }

          const authors = book.author_name ?? [];

          return authors.some((resultAuthor) => {
            const normalizedAuthor = normalize(resultAuthor);

            /**
             * Exact author:
             *
             * David Bronstein
             * =
             * David Bronstein
             */
            if (normalizedAuthor === expectedAuthor) {
              return true;
            }

            /**
             * Handle slightly different
             * author representations.
             */
            return (
              normalizedAuthor.includes(expectedAuthor) ||
              expectedAuthor.includes(normalizedAuthor)
            );
          });
        });

        /**
         * ------------------------------------------------------
         * Nothing suitable found
         * ------------------------------------------------------
         */

        if (!matchingBook?.cover_i) {
          result.notFound += 1;

          result.books.push({
            libraryItemId: libraryItem._id.toString(),

            title,

            author,

            status: 'not_found',
          });

          /**
           * Small delay so we're not hammering
           * Open Library.
           */
          await new Promise<void>((resolve) => setTimeout(resolve, 250));

          continue;
        }

        /**
         * ------------------------------------------------------
         * Generate Open Library cover URL
         * ------------------------------------------------------
         */

        const coverImageUrl = `https://covers.openlibrary.org/b/id/${matchingBook.cover_i}-L.jpg`;

        /**
         * ------------------------------------------------------
         * Update database
         *
         * We again check coverImageUrl so this can never
         * overwrite an image that was added while the
         * external request was running.
         * ------------------------------------------------------
         */

        const updateResult = await this.libraryItemModel.updateOne(
          {
            _id: libraryItem._id,

            $or: [
              {
                coverImageUrl: {
                  $exists: false,
                },
              },
              {
                coverImageUrl: null,
              },
              {
                coverImageUrl: '',
              },
            ],
          },
          {
            $set: {
              coverImageUrl,
            },
          },
        );

        if (updateResult.modifiedCount > 0) {
          result.updated += 1;

          result.books.push({
            libraryItemId: libraryItem._id.toString(),

            title,

            author,

            status: 'updated',

            coverImageUrl,
          });

          console.log(`[Cover] ${title} → ${coverImageUrl}`);
        }

        /**
         * Small delay between Open Library calls.
         */
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        result.failed += 1;

        result.books.push({
          libraryItemId: libraryItem._id.toString(),

          title,

          author,

          status: 'failed',

          message: error instanceof Error ? error.message : 'Unknown error',
        });

        console.error(`[Cover failed] ${title}`, error);

        await new Promise<void>((resolve) => setTimeout(resolve, 250));
      }
    }

    return {
      statusCode: 200,

      message: 'Missing cover images updated.',

      data: result,
    };
  }

  async getHighlights(libraryItemId: string, publicOnly = false) {
    this.validateObjectId(libraryItemId, 'library item ID');

    await this.findOne(libraryItemId, publicOnly);

    const query = this.libraryHighlightModel
      .find({
        libraryItemId: new Types.ObjectId(libraryItemId),

        isActive: true,
        isArchived: false,
        ...(publicOnly
          ? {
              isPublic: true,
            }
          : {}),
      })
      .sort({
        highlightedAt: 1,
        createdAt: 1,
      });

    if (publicOnly) {
      query.select('_id type text note isUnderline highlightedAt isFavourite');
    }

    return query.lean();
  }

  async updateSummary(libraryItemId: string, summary: string) {
    return this.updateField(libraryItemId, {
      summary: summary.trim(),
    });
  }

  async updateNotes(libraryItemId: string, notes: string) {
    return this.updateField(libraryItemId, {
      notes: notes.trim(),
    });
  }

  async archive(libraryItemId: string) {
    return this.updateField(libraryItemId, {
      isArchived: true,
    });
  }

  async restore(libraryItemId: string) {
    return this.updateField(libraryItemId, {
      isArchived: false,
    });
  }

  async getSummary() {
    const items = await this.libraryItemModel
      .find({
        isActive: true,
        isArchived: false,
      })
      .lean();

    const statusCounts = Object.values(LibraryItemStatus).reduce<
      Record<string, number>
    >((result, status) => {
      result[status] = 0;

      return result;
    }, {});

    const typeCounts = Object.values(LibraryItemType).reduce<
      Record<string, number>
    >((result, type) => {
      result[type] = 0;

      return result;
    }, {});

    const sourceCounts = Object.values(LibraryItemSource).reduce<
      Record<string, number>
    >((result, source) => {
      result[source] = 0;

      return result;
    }, {});

    for (const item of items) {
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;

      typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;

      const source = item.source ?? LibraryItemSource.MANUAL;

      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }

    const completedItems = items.filter(
      (item) => item.status === LibraryItemStatus.COMPLETED,
    );

    const currentlyReading = items.filter(
      (item) => item.status === LibraryItemStatus.READING,
    );

    const categoryCounts = items.reduce<Record<string, number>>(
      (result, item) => {
        if (item.category) {
          result[item.category] = (result[item.category] ?? 0) + 1;
        }

        return result;
      },
      {},
    );

    return {
      totalItems: items.length,

      statusCounts,

      typeCounts,

      sourceCounts,

      currentlyReading: currentlyReading.map((item) => ({
        id: item._id,
        title: item.title,
        author: item.author,
        authors: item.authors,
        type: item.type,
        source: item.source ?? LibraryItemSource.MANUAL,
        progressPercentage: item.progressPercentage,
        currentPage: item.currentPage,
        totalPages: item.totalPages,
        lastReadAt: item.lastReadAt,
      })),

      completed: {
        count: completedItems.length,

        averageRating: this.average(
          completedItems.map((item) => item.rating).filter(this.isNumber),
        ),

        totalPages: completedItems.reduce(
          (total, item) => total + (item.totalPages ?? 0),

          0,
        ),
      },

      progress: {
        averageProgressPercentage: this.average(
          items.map((item) => item.progressPercentage).filter(this.isNumber),
        ),

        totalCurrentPages: items.reduce(
          (total, item) => total + (item.currentPage ?? 0),

          0,
        ),
      },

      favouritesCount: items.filter((item) => item.isFavourite).length,

      publicItemsCount: items.filter((item) => item.isPublic).length,

      keyTakeawaysCount: items.reduce(
        (total, item) => total + (item.keyTakeaways?.length ?? 0),

        0,
      ),

      quotesCount: items.reduce(
        (total, item) => total + (item.quotes?.length ?? 0),

        0,
      ),

      topCategories: Object.entries(categoryCounts)
        .sort((first, second) => second[1] - first[1])
        .slice(0, 10)
        .map(([category, count]) => ({
          category,
          count,
        })),
    };
  }

  async getRecentActivity(limit = 10) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    return this.libraryItemModel
      .find({
        isActive: true,
        isArchived: false,

        lastReadAt: {
          $exists: true,
          $ne: null,
        },
      })
      .sort({
        lastReadAt: -1,
      })
      .limit(safeLimit)
      .select({
        title: 1,
        subtitle: 1,
        author: 1,
        authors: 1,
        type: 1,
        status: 1,
        source: 1,
        progressPercentage: 1,
        currentPage: 1,
        totalPages: 1,
        coverImageUrl: 1,
        lastReadAt: 1,
      })
      .lean();
  }

  async remove(libraryItemId: string) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const item = await this.libraryItemModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(libraryItemId),

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

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return {
      message: 'Library item deleted successfully.',
    };
  }

  private async createAppleBook(params: {
    incomingBook: SyncAppleBookItemDto;

    syncedAt: Date;
  }) {
    const { incomingBook, syncedAt } = params;

    const authors = this.prepareAuthors({
      author: incomingBook.author,

      authors: incomingBook.authors,
    });

    const author =
      authors.length > 0 ? authors.join(', ') : incomingBook.author?.trim();

    const status =
      incomingBook.status ??
      this.determineStatusFromProgress(incomingBook.progressPercentage);

    const progress = this.calculateProgress({
      currentPage: incomingBook.currentPage ?? 0,

      totalPages: incomingBook.totalPages ?? 0,

      progressPercentage: incomingBook.progressPercentage,
    });

    const dates = this.prepareStatusDates({
      status,
      startedAt: incomingBook.startedAt,
      completedAt: incomingBook.completedAt,
    });

    const baseSlug = this.generateSlug(
      incomingBook.category,
      incomingBook.title,
      author,
    );

    const slug = await this.ensureUniqueSlug(baseSlug);

    return this.libraryItemModel.create({
      title: incomingBook.title.trim(),

      slug,

      subtitle: incomingBook.subtitle?.trim(),

      type: incomingBook.type ?? LibraryItemType.BOOK,

      status,

      author,

      authors,

      publisher: incomingBook.publisher?.trim(),

      category: incomingBook.category?.trim(),

      tags: this.prepareStringArray(incomingBook.tags),

      coverImageUrl: incomingBook.coverImageUrl,

      sourceUrl: incomingBook.sourceUrl,

      source: LibraryItemSource.APPLE_BOOKS,

      externalId: incomingBook.externalId.trim(),

      appleBooksId: incomingBook.appleBooksId?.trim(),

      progressPercentage:
        status === LibraryItemStatus.COMPLETED
          ? 100
          : progress.progressPercentage,

      currentPage:
        status === LibraryItemStatus.COMPLETED && progress.totalPages > 0
          ? progress.totalPages
          : progress.currentPage,

      totalPages: progress.totalPages,

      startedAt: dates.startedAt,

      completedAt: dates.completedAt,

      lastReadAt: incomingBook.lastReadAt
        ? new Date(incomingBook.lastReadAt)
        : undefined,

      importedAt: syncedAt,

      lastSyncedAt: syncedAt,

      syncHash: incomingBook.syncHash,

      isPublic: false,

      isFavourite: false,

      isArchived: false,

      isActive: true,
    });
  }

  private async updateAppleBook(params: {
    existing: LibraryItemDocument;

    incomingBook: SyncAppleBookItemDto;

    syncedAt: Date;
  }) {
    const { existing, incomingBook, syncedAt } = params;

    const authors = this.prepareAuthors({
      author: incomingBook.author,

      authors: incomingBook.authors,
    });

    const author =
      authors.length > 0 ? authors.join(', ') : incomingBook.author?.trim();

    const status =
      incomingBook.status ??
      this.determineStatusFromProgress(incomingBook.progressPercentage);

    const progress = this.calculateProgress({
      currentPage: incomingBook.currentPage ?? existing.currentPage,

      totalPages: incomingBook.totalPages ?? existing.totalPages,

      progressPercentage: incomingBook.progressPercentage,
    });

    const dates = this.prepareStatusDates({
      status,

      startedAt: incomingBook.startedAt ?? existing.startedAt?.toISOString(),

      completedAt:
        incomingBook.completedAt ?? existing.completedAt?.toISOString(),
    });

    existing.title = incomingBook.title.trim();

    if (incomingBook.subtitle !== undefined) {
      existing.subtitle = incomingBook.subtitle?.trim();
    }

    existing.type = incomingBook.type ?? LibraryItemType.BOOK;

    existing.status = status;

    if (author) {
      existing.author = author;
    }

    if (authors.length > 0) {
      existing.authors = authors;
    }

    if (incomingBook.publisher !== undefined) {
      existing.publisher = incomingBook.publisher?.trim();
    }

    if (incomingBook.category !== undefined) {
      existing.category = incomingBook.category?.trim();
    }

    if (incomingBook.tags !== undefined) {
      existing.tags = this.prepareStringArray(incomingBook.tags);
    }

    if (incomingBook.coverImageUrl) {
      existing.coverImageUrl = incomingBook.coverImageUrl;
    }

    if (incomingBook.sourceUrl) {
      existing.sourceUrl = incomingBook.sourceUrl;
    }

    if (incomingBook.appleBooksId) {
      existing.appleBooksId = incomingBook.appleBooksId.trim();
    }

    existing.progressPercentage =
      status === LibraryItemStatus.COMPLETED
        ? 100
        : progress.progressPercentage;

    existing.currentPage =
      status === LibraryItemStatus.COMPLETED && progress.totalPages > 0
        ? progress.totalPages
        : progress.currentPage;

    existing.totalPages = progress.totalPages;

    existing.startedAt = dates.startedAt;

    existing.completedAt = dates.completedAt;

    if (incomingBook.lastReadAt) {
      existing.lastReadAt = new Date(incomingBook.lastReadAt);
    }

    existing.lastSyncedAt = syncedAt;

    existing.syncHash = incomingBook.syncHash;

    existing.isActive = true;

    await existing.save();

    return existing;
  }

  private async getItemDocument(libraryItemId: string) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const item = await this.libraryItemModel.findOne({
      _id: new Types.ObjectId(libraryItemId),

      isActive: true,
    });

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  private async updateField(
    libraryItemId: string,
    fields: Record<string, unknown>,
  ) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const item = await this.libraryItemModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(libraryItemId),

          isActive: true,
        },
        {
          $set: fields,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  private async addUniqueArrayItem(
    libraryItemId: string,
    field: 'keyTakeaways' | 'quotes',
    value: string,
  ) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const cleanValue = value?.trim();

    if (!cleanValue) {
      throw new BadRequestException('Value is required.');
    }

    const item = await this.libraryItemModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(libraryItemId),

          isActive: true,
        },
        {
          $addToSet: {
            [field]: cleanValue,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  private async removeArrayItem(
    libraryItemId: string,
    field: 'keyTakeaways' | 'quotes',
    value: string,
  ) {
    this.validateObjectId(libraryItemId, 'library item ID');

    const cleanValue = value?.trim();

    if (!cleanValue) {
      throw new BadRequestException('Value is required.');
    }

    const item = await this.libraryItemModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(libraryItemId),

          isActive: true,
        },
        {
          $pull: {
            [field]: cleanValue,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!item) {
      throw new NotFoundException('Library item not found.');
    }

    return item;
  }

  private calculateProgress(params: {
    currentPage: number;
    totalPages: number;
    progressPercentage?: number;
  }) {
    const currentPage = Math.max(params.currentPage ?? 0, 0);

    const totalPages = Math.max(params.totalPages ?? 0, 0);

    if (totalPages > 0 && currentPage > totalPages) {
      throw new BadRequestException('Current page cannot exceed total pages.');
    }

    let progressPercentage = params.progressPercentage;

    if (progressPercentage === undefined && totalPages > 0) {
      progressPercentage = Number(
        ((currentPage / totalPages) * 100).toFixed(2),
      );
    }

    progressPercentage = Math.min(Math.max(progressPercentage ?? 0, 0), 100);

    return {
      currentPage,
      totalPages,
      progressPercentage,
    };
  }

  private prepareStatusDates(params: {
    status: LibraryItemStatus;
    startedAt?: string;
    completedAt?: string;
  }) {
    let startedAt = params.startedAt ? new Date(params.startedAt) : undefined;

    let completedAt = params.completedAt
      ? new Date(params.completedAt)
      : undefined;

    if (params.status === LibraryItemStatus.READING && !startedAt) {
      startedAt = new Date();
    }

    if (params.status === LibraryItemStatus.COMPLETED) {
      if (!startedAt) {
        startedAt = new Date();
      }

      if (!completedAt) {
        completedAt = new Date();
      }
    }

    if (params.status !== LibraryItemStatus.COMPLETED) {
      completedAt = undefined;
    }

    return {
      startedAt,
      completedAt,
    };
  }

  private prepareAuthors(params: { author?: string; authors?: string[] }) {
    const authors = this.prepareStringArray(params.authors);

    if (authors.length === 0 && params.author?.trim()) {
      const preparedAuthors = params.author
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean);

      authors.push(...preparedAuthors);
    }

    return [...new Set(authors)];
  }

  private prepareStringArray(values?: string[]) {
    if (!values?.length) {
      return [];
    }

    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private determineStatusFromProgress(progressPercentage?: number) {
    if (progressPercentage !== undefined && progressPercentage >= 100) {
      return LibraryItemStatus.COMPLETED;
    }

    if (progressPercentage !== undefined && progressPercentage > 0) {
      return LibraryItemStatus.READING;
    }

    return LibraryItemStatus.WANT_TO_READ;
  }

  private generateSlug(category?: string, title?: string, author?: string) {
    return this.sanitizeSlug(
      [category || LibraryItemType.BOOK, title, author]
        .filter(Boolean)
        .join('-'),
    );
  }

  private sanitizeSlug(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return slug || 'library-item';
  }

  private async ensureUniqueSlug(baseSlug: string, excludedItemId?: string) {
    let slug = baseSlug;
    let suffix = 1;

    while (true) {
      const filter: QueryFilter<LibraryItemDocument> = {
        slug,
      };

      if (excludedItemId) {
        filter._id = {
          $ne: new Types.ObjectId(excludedItemId),
        };
      }

      const exists = await this.libraryItemModel.exists(filter);

      if (!exists) {
        return slug;
      }

      suffix += 1;

      slug = `${baseSlug}-${suffix}`;
    }
  }

  private average(values: number[]) {
    if (!values.length) {
      return null;
    }

    return Number(
      (
        values.reduce((total, value) => total + value, 0) / values.length
      ).toFixed(2),
    );
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isNumber(this: void, value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }

  private determineHighlightType(text?: string, note?: string) {
    if (text && note) {
      return LibraryHighlightType.HIGHLIGHT_WITH_NOTE;
    }

    if (note && !text) {
      return LibraryHighlightType.NOTE;
    }

    return LibraryHighlightType.HIGHLIGHT;
  }

  private async refreshHighlightStats(libraryItemId: string) {
    const objectId = new Types.ObjectId(libraryItemId);

    const highlights = await this.libraryHighlightModel
      .find({
        libraryItemId: objectId,
        isActive: true,
        isArchived: false,
      })
      .select({
        text: 1,
        note: 1,
        highlightedAt: 1,
      })
      .lean();

    const highlightsCount = highlights.filter((highlight) =>
      Boolean(highlight.text?.trim()),
    ).length;

    const notesCount = highlights.filter((highlight) =>
      Boolean(highlight.note?.trim()),
    ).length;

    const lastHighlightedAt = highlights
      .map((highlight) => highlight.highlightedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((first, second) => second.getTime() - first.getTime())[0];

    await this.libraryItemModel.updateOne(
      {
        _id: objectId,
      },
      {
        $set: {
          highlightsCount,
          notesCount,
          lastHighlightedAt: lastHighlightedAt ?? null,
        },
      },
    );
  }
}
