import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

import {
  LibraryItemSource,
} from './library-item.schema';

export type LibraryHighlightDocument =
  HydratedDocument<LibraryHighlight>;

export enum LibraryHighlightType {
  HIGHLIGHT = 'highlight',
  NOTE = 'note',
  HIGHLIGHT_WITH_NOTE =
    'highlight_with_note',
}

@Schema({
  timestamps: true,
  collection: 'library_highlights',
})
export class LibraryHighlight {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'LibraryItem',
    required: true,
    index: true,
  })
  libraryItemId: Types.ObjectId;

  /**
   * Apple Books book identifier.
   *
   * Matches:
   * LibraryItem.externalId
   */
  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  assetId: string;

  /**
   * Apple annotation UUID.
   */
  @Prop({
    required: true,
    trim: true,
  })
  externalId: string;

  @Prop({
    type: String,
    enum: LibraryHighlightType,
    default:
      LibraryHighlightType.HIGHLIGHT,
    index: true,
  })
  type: LibraryHighlightType;

  /**
   * Actual highlighted text.
   */
  @Prop({
    trim: true,
  })
  text?: string;

  /**
   * Personal note attached to the highlight.
   */
  @Prop({
    trim: true,
  })
  note?: string;

  /**
   * EPUB CFI location.
   *
   * Example:
   * epubcfi(/6/8/... )
   */
  @Prop({
    trim: true,
  })
  location?: string;

  @Prop({
    min: 0,
  })
  physicalLocation?: number;

  @Prop({
    min: 0,
  })
  locationRangeStart?: number;

  @Prop({
    min: 0,
  })
  locationRangeEnd?: number;

  /**
   * Raw Apple Books highlight style.
   *
   * We don't know that every macOS version uses
   * identical style mappings, so preserve the raw value.
   */
  @Prop()
  style?: number;

  @Prop({
    default: false,
  })
  isUnderline: boolean;

  @Prop({
    type: String,
    enum: LibraryItemSource,
    default:
      LibraryItemSource.APPLE_BOOKS,
    index: true,
  })
  source: LibraryItemSource;

  @Prop()
  highlightedAt?: Date;

  @Prop()
  sourceModifiedAt?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({
    trim: true,
  })
  syncHash?: string;

  /**
   * Public website visibility.
   *
   * Apple highlights stay private by default.
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

export const LibraryHighlightSchema =
  SchemaFactory.createForClass(
    LibraryHighlight,
  );

LibraryHighlightSchema.index(
  {
    source: 1,
    externalId: 1,
  },
  {
    unique: true,
  },
);

LibraryHighlightSchema.index({
  libraryItemId: 1,
  highlightedAt: -1,
  isActive: 1,
});

LibraryHighlightSchema.index({
  assetId: 1,
  source: 1,
});

LibraryHighlightSchema.index({
  libraryItemId: 1,
  isFavourite: 1,
  isActive: 1,
});

LibraryHighlightSchema.index({
  libraryItemId: 1,
  isPublic: 1,
  isActive: 1,
});

LibraryHighlightSchema.index({
  text: 'text',
  note: 'text',
});