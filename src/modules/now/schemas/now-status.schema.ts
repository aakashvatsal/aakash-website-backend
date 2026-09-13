import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type NowStatusDocument = HydratedDocument<NowStatus>;

export enum NowActivityType {
  WORKING = 'working',
  BUILDING = 'building',
  CODING = 'coding',
  DESIGNING = 'designing',
  MEETING = 'meeting',
  READING = 'reading',
  WRITING = 'writing',
  LEARNING = 'learning',
  RESEARCHING = 'researching',
  EXERCISING = 'exercising',
  WALKING = 'walking',
  MEDITATING = 'meditating',
  EATING = 'eating',
  COMMUTING = 'commuting',
  TRAVELLING = 'travelling',
  RESTING = 'resting',
  SLEEPING = 'sleeping',
  OFFLINE = 'offline',
  OTHER = 'other',
}

export enum NowAvailability {
  AVAILABLE = 'available',
  FOCUSED = 'focused',
  BUSY = 'busy',
  IN_MEETING = 'in_meeting',
  DO_NOT_DISTURB = 'do_not_disturb',
  AWAY = 'away',
  OFFLINE = 'offline',
}

export enum NowVisibility {
  PRIVATE = 'private',
  SHARED = 'shared',
  PUBLIC = 'public',
}

export enum NowMood {
  FOCUSED = 'focused',
  CALM = 'calm',
  CREATIVE = 'creative',
  ENERGETIC = 'energetic',
  HAPPY = 'happy',
  NEUTRAL = 'neutral',
  TIRED = 'tired',
  STRESSED = 'stressed',
  LOW = 'low',
}

export enum NowSource {
  MANUAL = 'manual',

  HSAKAA = 'hsakaa',

  HEALTH = 'health',

  WHOOP = 'whoop',

  LIBRARY = 'library',

  HOBBY = 'hobby',

  COMPANY = 'company',

  CALENDAR = 'calendar',

  SYSTEM = 'system',

  OTHER = 'other',
}

@Schema({
  _id: false,
})
export class NowCompanyReference {
  @Prop({
    type: SchemaTypes.ObjectId,

    ref: 'Company',
  })
  companyId?: Types.ObjectId;

  @Prop({
    trim: true,
  })
  companyName?: string;

  @Prop({
    trim: true,
  })
  projectName?: string;

  @Prop({
    trim: true,
  })
  currentWork?: string;
}

export const NowCompanyReferenceSchema =
  SchemaFactory.createForClass(NowCompanyReference);

@Schema({
  _id: false,
})
export class NowReadingReference {
  @Prop({
    type: SchemaTypes.ObjectId,

    ref: 'LibraryItem',
  })
  libraryItemId?: Types.ObjectId;

  @Prop({
    trim: true,
  })
  title?: string;

  @Prop({
    trim: true,
  })
  author?: string;

  @Prop({
    min: 0,

    max: 100,
  })
  progressPercentage?: number;

  @Prop({
    trim: true,
  })
  currentThought?: string;
}

export const NowReadingReferenceSchema =
  SchemaFactory.createForClass(NowReadingReference);

@Schema({
  _id: false,
})
export class NowHealthReference {
  @Prop({
    trim: true,
  })
  activity?: string;

  @Prop({
    min: 0,
  })
  workoutDurationMinutes?: number;

  @Prop({
    min: 0,
  })
  steps?: number;

  @Prop({
    min: 0,

    max: 24,
  })
  sleepHours?: number;

  @Prop({
    min: 0,

    max: 100,
  })
  recoveryScore?: number;

  @Prop({
    min: 0,

    max: 21,
  })
  strainScore?: number;

  @Prop({
    min: 0,
  })
  heartRateVariabilityMs?: number;

  @Prop({
    min: 0,
  })
  restingHeartRateBpm?: number;

  @Prop({
    min: 0,

    max: 10,
  })
  energyScore?: number;

  @Prop({
    trim: true,
  })
  summary?: string;
}

export const NowHealthReferenceSchema =
  SchemaFactory.createForClass(NowHealthReference);

@Schema({
  timestamps: true,

  collection: 'now_statuses',
})
export class NowStatus {
  /**
   * Only one active status should have
   * isCurrent=true.
   */
  @Prop({
    default: true,
  })
  isCurrent: boolean;

  @Prop({
    type: String,

    enum: NowActivityType,

    required: true,

    index: true,
  })
  activityType: NowActivityType;

  /**
   * Human readable activity:
   *
   * "Building the HSAKAA health system"
   * "Reading The Pragmatic Programmer"
   * "Morning walk"
   */
  @Prop({
    required: true,

    trim: true,
  })
  activity: string;

  /**
   * Short public headline.
   *
   * Example:
   * "Shipping HSAKAA Health"
   */
  @Prop({
    trim: true,
  })
  headline?: string;

  /**
   * Longer context around what is
   * currently happening.
   */
  @Prop({
    trim: true,
  })
  description?: string;

  /**
   * The most important thing occupying
   * attention right now.
   */
  @Prop({
    trim: true,
  })
  currentFocus?: string;

  @Prop({
    type: String,

    enum: NowAvailability,

    default: NowAvailability.FOCUSED,

    index: true,
  })
  availability: NowAvailability;

  @Prop({
    type: String,

    enum: NowMood,
  })
  mood?: NowMood;

  @Prop({
    min: 0,

    max: 10,
  })
  energyScore?: number;

  @Prop({
    min: 0,

    max: 10,
  })
  focusScore?: number;

  /**
   * Keep location deliberately coarse.
   *
   * Examples:
   * Mumbai
   * Office
   * Home
   *
   * Not precise coordinates.
   */
  @Prop({
    trim: true,
  })
  locationName?: string;

  @Prop({
    trim: true,
  })
  locationType?: string;

  @Prop({
    type: NowCompanyReferenceSchema,

    default: undefined,
  })
  building?: NowCompanyReference;

  @Prop({
    type: NowReadingReferenceSchema,

    default: undefined,
  })
  reading?: NowReadingReference;

  @Prop({
    trim: true,
  })
  thinking?: string;

  @Prop({
    trim: true,
  })
  writing?: string;

  @Prop({
    type: NowHealthReferenceSchema,

    default: undefined,
  })
  health?: NowHealthReference;

  @Prop({
    type: [String],

    default: [],
  })
  tags: string[];

  @Prop({
    type: String,

    enum: NowVisibility,

    default: NowVisibility.PUBLIC,

    index: true,
  })
  visibility: NowVisibility;

  @Prop({
    default: false,
  })
  showLocation: boolean;

  @Prop({
    default: true,
  })
  showAvailability: boolean;

  @Prop({
    default: true,
  })
  showMood: boolean;

  @Prop({
    default: true,
  })
  showHealth: boolean;

  @Prop({
    required: true,

    default: Date.now,

    index: true,
  })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  /**
   * Optional automatic expiration.
   *
   * If expiresAt < now then this status
   * should no longer be considered live.
   */
  @Prop()
  expiresAt?: Date;

  /**
   * Last detected or manually confirmed
   * activity timestamp.
   */
  @Prop()
  lastActivityAt?: Date;

  @Prop({
    type: String,

    enum: NowSource,

    default: NowSource.MANUAL,

    index: true,
  })
  source: NowSource;

  /**
   * Optional source identifier.
   *
   * Examples:
   *
   * health entry ID
   * library item ID
   * calendar event ID
   */
  @Prop({
    trim: true,
  })
  sourceExternalId?: string;

  @Prop({
    type: SchemaTypes.Mixed,

    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const NowStatusSchema = SchemaFactory.createForClass(NowStatus);

/**
 * Query current status quickly.
 */
NowStatusSchema.index({
  isCurrent: 1,

  isActive: 1,

  startedAt: -1,
});

/**
 * Public Now page.
 */
NowStatusSchema.index({
  visibility: 1,

  isCurrent: 1,

  isActive: 1,
});

/**
 * Status history.
 */
NowStatusSchema.index({
  startedAt: -1,

  isActive: 1,
});

/**
 * Source queries.
 */
NowStatusSchema.index({
  source: 1,

  startedAt: -1,
});

/**
 * Lookup source-generated statuses.
 */
NowStatusSchema.index({
  source: 1,

  sourceExternalId: 1,
});

/**
 * There can only be one ACTIVE
 * current NowStatus.
 *
 * Historical statuses have:
 *
 * isCurrent=false
 */
NowStatusSchema.index(
  {
    isCurrent: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      isCurrent: true,

      isActive: true,
    },
  },
);

NowStatusSchema.index({
  expiresAt: 1,
});
