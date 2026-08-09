import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type MeditationEntryDocument =
  HydratedDocument<MeditationEntry>;

export enum MeditationType {
  MINDFULNESS = 'mindfulness',
  BREATHING = 'breathing',
  BODY_SCAN = 'body_scan',
  GUIDED = 'guided',
  MANTRA = 'mantra',
  VISUALIZATION = 'visualization',
  LOVING_KINDNESS = 'loving_kindness',
  WALKING = 'walking',
  SLEEP = 'sleep',
  SOUND = 'sound',
  PRAYER = 'prayer',
  OTHER = 'other',
}

export enum MeditationStatus {
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  ABANDONED = 'abandoned',
}

export enum MeditationPosition {
  SITTING = 'sitting',
  LYING = 'lying',
  STANDING = 'standing',
  WALKING = 'walking',
  OTHER = 'other',
}

export enum MeditationMood {
  VERY_CALM = 'very_calm',
  CALM = 'calm',
  NEUTRAL = 'neutral',
  RESTLESS = 'restless',
  STRESSED = 'stressed',
  ANXIOUS = 'anxious',
  LOW = 'low',
  ENERGETIC = 'energetic',
}

export enum MeditationEnvironment {
  INDOOR = 'indoor',
  OUTDOOR = 'outdoor',
  OFFICE = 'office',
  HOME = 'home',
  TRAVEL = 'travel',
  OTHER = 'other',
}

@Schema({
  timestamps: true,
  collection: 'meditation_entries',
})
export class MeditationEntry {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  /**
   * Calendar day this session belongs to.
   * Multiple sessions are allowed on the same date.
   */
  @Prop({
    required: true,
    index: true,
  })
  date: Date;

  @Prop({
    required: true,
    trim: true,
  })
  title: string;

  @Prop({
    type: String,
    enum: MeditationType,
    default: MeditationType.MINDFULNESS,
    index: true,
  })
  type: MeditationType;

  @Prop({
    type: String,
    enum: MeditationStatus,
    default: MeditationStatus.PLANNED,
    index: true,
  })
  status: MeditationStatus;

  @Prop({
    type: String,
    enum: MeditationPosition,
    default: MeditationPosition.SITTING,
  })
  position: MeditationPosition;

  @Prop({
    type: String,
    enum: MeditationEnvironment,
  })
  environment?: MeditationEnvironment;

  @Prop({
    min: 0,
    default: 0,
  })
  plannedDurationMinutes: number;

  @Prop({
    min: 0,
    default: 0,
  })
  actualDurationMinutes: number;

  @Prop()
  scheduledAt?: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  pausedAt?: Date;

  @Prop()
  resumedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  skippedAt?: Date;

  @Prop()
  abandonedAt?: Date;

  @Prop({
    min: 0,
    default: 0,
  })
  totalPausedMinutes: number;

  @Prop({
    trim: true,
  })
  technique?: string;

  @Prop({
    trim: true,
  })
  guideName?: string;

  @Prop({
    trim: true,
  })
  appName?: string;

  @Prop({
    trim: true,
  })
  audioUrl?: string;

  @Prop({
    trim: true,
  })
  skippedReason?: string;

  @Prop({
    trim: true,
  })
  abandonedReason?: string;

  @Prop({
    min: 0,
    max: 10,
  })
  focusScore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  calmnessBefore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  calmnessAfter?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  stressBefore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  stressAfter?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  energyBefore?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  energyAfter?: number;

  @Prop({
    min: 0,
    max: 10,
  })
  satisfactionScore?: number;

  @Prop({
    type: String,
    enum: MeditationMood,
  })
  moodBefore?: MeditationMood;

  @Prop({
    type: String,
    enum: MeditationMood,
  })
  moodAfter?: MeditationMood;

  @Prop({
    min: 0,
    default: 0,
  })
  distractionsCount: number;

  @Prop({
    type: [String],
    default: [],
  })
  distractions: string[];

  @Prop({
    type: [String],
    default: [],
  })
  insights: string[];

  @Prop({
    type: [String],
    default: [],
  })
  intentions: string[];

  @Prop({
    type: [String],
    default: [],
  })
  benefits: string[];

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    trim: true,
  })
  notes?: string;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

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

export const MeditationEntrySchema =
  SchemaFactory.createForClass(MeditationEntry);

MeditationEntrySchema.index({
  userId: 1,
  date: -1,
  isActive: 1,
});

MeditationEntrySchema.index({
  userId: 1,
  status: 1,
  date: -1,
});

MeditationEntrySchema.index({
  userId: 1,
  type: 1,
  date: -1,
});

MeditationEntrySchema.index({
  userId: 1,
  isFavourite: 1,
  isArchived: 1,
});

MeditationEntrySchema.index({
  title: 'text',
  technique: 'text',
  guideName: 'text',
  notes: 'text',
  insights: 'text',
  intentions: 'text',
  benefits: 'text',
  tags: 'text',
});