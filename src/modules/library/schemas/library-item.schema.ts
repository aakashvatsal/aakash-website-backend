import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
} from 'mongoose';

export type LibraryItemDocument =
  HydratedDocument<LibraryItem>;

export enum LibraryItemType {
  BOOK = 'book',
  ARTICLE = 'article',
  PAPER = 'paper',
  PODCAST = 'podcast',
  VIDEO = 'video',
  COURSE = 'course',
  NOTE = 'note',
}

export enum LibraryItemStatus {
  WANT_TO_READ = 'want_to_read',
  READING = 'reading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  DROPPED = 'dropped',
}

export enum LibraryItemSource {
  MANUAL = 'manual',
  APPLE_BOOKS = 'apple_books',
}

@Schema({
  timestamps: true,
  collection: 'library_items',
})
export class LibraryItem {
  // Enable this when multiple users will own library items.
  //
  // @Prop({
  //   type: SchemaTypes.ObjectId,
  //   ref: 'User',
  //   required: true,
  //   index: true,
  // })
  // userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  title: string;

  @Prop({
    trim: true,
    lowercase: true,
  })
  slug?: string;

  @Prop({
    trim: true,
  })
  subtitle?: string;

  @Prop({
    type: String,
    enum: LibraryItemType,
    default: LibraryItemType.BOOK,
    index: true,
  })
  type: LibraryItemType;

  @Prop({
    type: String,
    enum: LibraryItemStatus,
    default: LibraryItemStatus.WANT_TO_READ,
    index: true,
  })
  status: LibraryItemStatus;

  /**
   * Retained for compatibility with the current frontend.
   */
  @Prop({
    trim: true,
  })
  author?: string;

  /**
   * Canonical authors list.
   *
   * Example:
   * [
   *   'David Thomas',
   *   'Andrew Hunt'
   * ]
   */
  @Prop({
    type: [String],
    default: [],
  })
  authors: string[];

  @Prop({
    trim: true,
  })
  publisher?: string;

  @Prop({
    trim: true,
  })
  category?: string;

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    trim: true,
  })
  coverImageUrl?: string;

  @Prop({
    trim: true,
  })
  sourceUrl?: string;

  @Prop({
    min: 0,
    default: 0,
  })
  highlightsCount: number;

  @Prop({
    min: 0,
    default: 0,
  })
  notesCount: number;

  @Prop()
  lastHighlightedAt?: Date;

  /**
   * Identifies where the library item originated.
   */
  @Prop({
    type: String,
    enum: LibraryItemSource,
    default: LibraryItemSource.MANUAL,
    index: true,
  })
  source: LibraryItemSource;

  /**
   * Stable identifier from the external source.
   *
   * For Apple Books, this should be the locally available
   * book identifier used by the Mac sync agent.
   */
  @Prop({
    trim: true,
  })
  externalId?: string;

  /**
   * Apple Books Store identifier, when available.
   *
   * This is different from externalId because externalId
   * may represent a local Apple Books database identifier.
   */
  @Prop({
    trim: true,
  })
  appleBooksId?: string;

  @Prop({
    min: 0,
    max: 100,
    default: 0,
  })
  progressPercentage: number;

  @Prop({
    min: 0,
    default: 0,
  })
  currentPage: number;

  @Prop({
    min: 0,
    default: 0,
  })
  totalPages: number;

  @Prop({
    min: 0,
    max: 5,
  })
  rating?: number;

  /**
   * Public or curated summary written inside HSAKAA.
   */
  @Prop({
    trim: true,
  })
  summary?: string;

  /**
   * Private overall notes about the library item.
   *
   * Individual Apple Books highlights should later be
   * stored in a separate library_highlights collection.
   */
  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: [String],
    default: [],
  })
  keyTakeaways: string[];

  /**
   * Only selected or manually curated quotes should be
   * stored here.
   */
  @Prop({
    type: [String],
    default: [],
  })
  quotes: string[];

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  lastReadAt?: Date;

  /**
   * Date on which the item was first imported from
   * Apple Books or another source.
   */
  @Prop()
  importedAt?: Date;

  /**
   * Last successful synchronization time.
   */
  @Prop()
  lastSyncedAt?: Date;

  /**
   * Hash generated from synced source data.
   *
   * The Mac agent can compare this value to avoid sending
   * unchanged books repeatedly.
   */
  @Prop({
    trim: true,
  })
  syncHash?: string;

  /**
   * Imported Apple Books items should remain private
   * until manually published.
   */
  @Prop({
    default: false,
    index: true,
  })
  isPublic: boolean;

  @Prop({
    default: false,
  })
  isFavourite: boolean;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const LibraryItemSchema =
  SchemaFactory.createForClass(LibraryItem);

/**
 * Prevent duplicate slugs while allowing items without a slug.
 */
LibraryItemSchema.index(
  {
    slug: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      slug: {
        $type: 'string',
      },
    },
  },
);

/**
 * Prevent the same external item from being imported twice.
 *
 * Example:
 * source: apple_books
 * externalId: local-apple-book-id
 */
LibraryItemSchema.index(
  {
    source: 1,
    externalId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      externalId: {
        $type: 'string',
      },
    },
  },
);

LibraryItemSchema.index({
  status: 1,
  type: 1,
  isActive: 1,
});

LibraryItemSchema.index({
  type: 1,
  category: 1,
  isActive: 1,
});

LibraryItemSchema.index({
  source: 1,
  lastSyncedAt: -1,
});

LibraryItemSchema.index({
  isPublic: 1,
  isArchived: 1,
  isActive: 1,
});

LibraryItemSchema.index({
  lastReadAt: -1,
});

LibraryItemSchema.index({
  title: 'text',
  subtitle: 'text',
  author: 'text',
  authors: 'text',
  category: 'text',
  tags: 'text',
  summary: 'text',
  keyTakeaways: 'text',
});