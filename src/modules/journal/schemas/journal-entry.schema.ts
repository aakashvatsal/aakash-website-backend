import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type JournalEntryDocument = HydratedDocument<JournalEntry>;

export enum JournalEntryType {
  DAILY = 'daily',

  REFLECTION = 'reflection',

  DECISION = 'decision',

  IDEA = 'idea',

  GRATITUDE = 'gratitude',

  LESSON = 'lesson',

  MEETING_NOTE = 'meeting_note',
}

export enum JournalMood {
  FOCUSED = 'focused',

  CALM = 'calm',

  CREATIVE = 'creative',

  HAPPY = 'happy',

  ENERGETIC = 'energetic',

  NEUTRAL = 'neutral',

  TIRED = 'tired',

  STRESSED = 'stressed',

  ANXIOUS = 'anxious',

  LOW = 'low',
}

export enum JournalVisibility {
  PRIVATE = 'private',

  SHARED = 'shared',

  PUBLIC = 'public',
}

export enum JournalSource {
  MANUAL = 'manual',

  HSAKAA = 'hsakaa',

  SYSTEM = 'system',

  IMPORTED = 'imported',

  OTHER = 'other',

  BRAIN_DUMP = 'brain_dump',
}

/**
 * Workout snapshot stored with
 * the journal entry.
 *
 * This is intentionally a snapshot,
 * not the canonical health record.
 */
@Schema({
  _id: false,
})
export class JournalWorkout {
  @Prop({
    type: Boolean,

    default: false,
  })
  completed: boolean;

  @Prop({
    type: String,

    trim: true,
  })
  type?: string;

  @Prop({
    type: String,

    trim: true,
  })
  title?: string;

  @Prop({
    type: Number,

    min: 0,
  })
  durationMinutes?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 21,
  })
  strainScore?: number;

  @Prop({
    type: String,

    trim: true,
  })
  notes?: string;
}

export const JournalWorkoutSchema =
  SchemaFactory.createForClass(JournalWorkout);

/**
 * Reading snapshot.
 */
@Schema({
  _id: false,
})
export class JournalReading {
  @Prop({
    type: Boolean,

    default: false,
  })
  completed: boolean;

  @Prop({
    type: SchemaTypes.ObjectId,

    ref: 'LibraryItem',
  })
  libraryItemId?: Types.ObjectId;

  @Prop({
    type: String,

    trim: true,
  })
  title?: string;

  @Prop({
    type: String,

    trim: true,
  })
  author?: string;

  @Prop({
    type: Number,

    min: 0,
  })
  pagesRead?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 100,
  })
  progressPercentage?: number;

  @Prop({
    type: String,

    trim: true,
  })
  thought?: string;
}

export const JournalReadingSchema =
  SchemaFactory.createForClass(JournalReading);

/**
 * Sleep snapshot.
 *
 * Canonical data still lives
 * inside Health.
 */
@Schema({
  _id: false,
})
export class JournalSleep {
  @Prop({
    type: Number,

    min: 0,

    max: 24,
  })
  durationHours?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 100,
  })
  performancePercentage?: number;

  @Prop({
    type: Number,

    min: 1,

    max: 10,
  })
  quality?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 100,
  })
  recoveryScore?: number;
}

export const JournalSleepSchema = SchemaFactory.createForClass(JournalSleep);

@Schema({
  timestamps: true,

  collection: 'journal_entries',
})
export class JournalEntry {
  /**
   * Actual timestamp representing
   * the journal entry date.
   */
  @Prop({
    type: Date,

    required: true,

    index: true,
  })
  date: Date;

  /**
   * Asia/Kolkata-friendly key:
   *
   * YYYY-MM-DD
   *
   * Easier for daily grouping/filtering.
   */
  @Prop({
    type: String,

    required: true,

    index: true,

    trim: true,
  })
  dateKey: string;

  @Prop({
    type: String,

    required: true,

    unique: true,

    index: true,

    trim: true,

    lowercase: true,
  })
  slug: string;

  @Prop({
    type: String,

    enum: JournalEntryType,

    default: JournalEntryType.DAILY,

    index: true,
  })
  type: JournalEntryType;

  @Prop({
    type: String,

    required: true,

    trim: true,
  })
  title: string;

  /**
   * Main journal body.
   *
   * Can contain markdown.
   */
  @Prop({
    type: String,

    trim: true,
  })
  content?: string;

  /**
   * Short standout line shown on
   * cards/homepage.
   */
  @Prop({
    type: String,

    trim: true,
  })
  highlight?: string;

  @Prop({
    type: String,

    enum: JournalMood,

    default: JournalMood.NEUTRAL,

    index: true,
  })
  mood: JournalMood;

  @Prop({
    type: Number,

    min: 1,

    max: 10,
  })
  moodScore?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 10,
  })
  energyScore?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 10,
  })
  productivityScore?: number;

  @Prop({
    type: Number,

    min: 0,

    max: 10,
  })
  stressScore?: number;

  @Prop({
    type: [String],

    default: [],
  })
  tags: string[];

  @Prop({
    type: [String],

    default: [],
  })
  lessons: string[];

  @Prop({
    type: [String],

    default: [],
  })
  decisions: string[];

  @Prop({
    type: [String],

    default: [],
  })
  ideas: string[];

  @Prop({
    type: [String],

    default: [],
  })
  gratitude: string[];

  @Prop({
    type: [String],

    default: [],
  })
  challenges: string[];

  @Prop({
    type: [String],

    default: [],
  })
  wins: string[];

  @Prop({
    type: JournalWorkoutSchema,

    default: () => ({
      completed: false,
    }),
  })
  workout: JournalWorkout;

  @Prop({
    type: JournalReadingSchema,

    default: () => ({
      completed: false,
    }),
  })
  reading: JournalReading;

  @Prop({
    type: JournalSleepSchema,

    default: () => ({}),
  })
  sleep: JournalSleep;

  @Prop({
    type: Number,

    min: 0,

    default: 0,
  })
  steps: number;

  /**
   * Memories connected to this entry.
   */
  @Prop({
    type: [SchemaTypes.ObjectId],

    ref: 'Memory',

    default: [],
  })
  memoryIds: Types.ObjectId[];

  /**
   * Companies involved in this day/
   * thought/decision.
   */
  @Prop({
    type: [SchemaTypes.ObjectId],

    ref: 'Company',

    default: [],
  })
  companyIds: Types.ObjectId[];

  /**
   * Additional library items referenced
   * beyond the main reading snapshot.
   */
  @Prop({
    type: [SchemaTypes.ObjectId],

    ref: 'LibraryItem',

    default: [],
  })
  libraryItemIds: Types.ObjectId[];

  /**
   * Public/private handling.
   *
   * This replaces isPrivate.
   */
  @Prop({
    type: String,

    enum: JournalVisibility,

    default: JournalVisibility.PRIVATE,

    index: true,
  })
  visibility: JournalVisibility;

  /**
   * Publishing is separate from visibility.
   *
   * An entry may be public-ready but
   * not published yet.
   */
  @Prop({
    type: Boolean,

    default: false,

    index: true,
  })
  isPublished: boolean;

  @Prop({
    type: Date,
  })
  publishedAt?: Date;

  @Prop({
    type: Boolean,

    default: false,

    index: true,
  })
  isFavourite: boolean;

  @Prop({
    type: Boolean,

    default: false,

    index: true,
  })
  isArchived: boolean;

  @Prop({
    type: Boolean,

    default: true,

    index: true,
  })
  isActive: boolean;

  /**
   * Where the entry came from.
   */
  @Prop({
    type: String,

    enum: JournalSource,

    default: JournalSource.MANUAL,

    index: true,
  })
  source: JournalSource;

  @Prop({
    type: String,

    trim: true,
  })
  sourceExternalId?: string;

  /**
   * Internal integration/AI metadata.
   * Never expose directly from public APIs.
   */
  @Prop({
    type: SchemaTypes.Mixed,

    default: {},
  })
  metadata: Record<string, unknown>;
}

export const JournalEntrySchema = SchemaFactory.createForClass(JournalEntry);

/**
 * Common Journal listing.
 */
JournalEntrySchema.index({
  isActive: 1,

  isArchived: 1,

  date: -1,
});

/**
 * Public journal page.
 */
JournalEntrySchema.index({
  visibility: 1,

  isPublished: 1,

  isActive: 1,

  isArchived: 1,

  date: -1,
});

/**
 * Filter by entry type.
 */
JournalEntrySchema.index({
  type: 1,

  date: -1,
});

/**
 * Daily grouping.
 */
JournalEntrySchema.index({
  dateKey: 1,

  date: -1,
});

/**
 * Mood history.
 */
JournalEntrySchema.index({
  mood: 1,

  date: -1,
});

/**
 * Integration deduplication.
 */
JournalEntrySchema.index({
  source: 1,

  sourceExternalId: 1,
});
