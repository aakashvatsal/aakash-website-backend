import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HobbyDocument = HydratedDocument<Hobby>;

export enum HobbyStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  PAUSED = 'paused',
  BACKLOG = 'backlog',
  COMPLETED = 'completed',
}

export enum HobbyCategory {
  MUSIC = 'music',
  CREATIVE = 'creative',
  COGNITIVE = 'cognitive',
  PHYSICAL = 'physical',
  LANGUAGE = 'language',
  SOCIAL = 'social',
  PRACTICAL = 'practical',
  OTHER = 'other',
}

export enum HobbyIntensity {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  MAINTENANCE = 'maintenance',
}

export enum HobbyPracticeTimeWindow {
  MORNING = 'morning',
  AFTERNOON = 'afternoon',
  EVENING = 'evening',
  FLEXIBLE = 'flexible',
}

export enum HobbySource {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  SYSTEM = 'system',
}

export enum HobbyStageStatus {
  PENDING = 'pending',
  CURRENT = 'current',
  COMPLETED = 'completed',
}

@Schema({ _id: false })
export class HobbyCurriculumStage {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ trim: true })
  objective?: string;

  @Prop({ type: [String], default: [] })
  focusAreas: string[];

  @Prop({ type: [String], default: [] })
  exercises: string[];

  @Prop({ type: [String], default: [] })
  completionCriteria: string[];

  @Prop({
    type: String,
    enum: HobbyStageStatus,
    default: HobbyStageStatus.PENDING,
  })
  status: HobbyStageStatus;

  @Prop({ min: 1 })
  targetWeeks?: number;
}

export const HobbyCurriculumStageSchema =
  SchemaFactory.createForClass(HobbyCurriculumStage);

@Schema({ _id: false })
export class HobbyCandidateProfile {
  @Prop({ min: 0, max: 10, default: 5 })
  genuineCuriosity: number;

  @Prop({ min: 0, max: 10, default: 5 })
  lifestyleFit: number;

  @Prop({ min: 0, max: 10, default: 5 })
  novelty: number;

  @Prop({ min: 0, max: 10, default: 5 })
  strategicUsefulness: number;

  @Prop({ min: 0, max: 10, default: 5 })
  mediaUsefulness: number;

  @Prop({ min: 0, default: 120 })
  weeklyMinutes: number;

  @Prop({ trim: true })
  note?: string;
}

export const HobbyCandidateProfileSchema = SchemaFactory.createForClass(
  HobbyCandidateProfile,
);

@Schema({ timestamps: true, collection: 'hobbies' })
export class Hobby {
  @Prop({ required: true, trim: true, maxlength: 120, index: true })
  name: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  slug: string;

  @Prop({
    type: String,
    enum: HobbyStatus,
    default: HobbyStatus.BACKLOG,
    index: true,
  })
  status: HobbyStatus;

  @Prop({
    type: String,
    enum: HobbyCategory,
    default: HobbyCategory.OTHER,
    index: true,
  })
  category: HobbyCategory;

  @Prop({
    type: String,
    enum: HobbyIntensity,
    default: HobbyIntensity.SECONDARY,
  })
  intensity: HobbyIntensity;

  @Prop({ trim: true, maxlength: 1200 })
  goal?: string;

  @Prop({ trim: true, maxlength: 1200 })
  why?: string;

  @Prop({ trim: true, maxlength: 120 })
  currentSkillLevel?: string;

  @Prop()
  startedAt?: Date;

  @Prop()
  targetDate?: Date;

  @Prop({ trim: true, index: true })
  seasonKey?: string;

  @Prop({ trim: true })
  seasonLabel?: string;

  @Prop({ min: 1, max: 5 })
  seasonOrder?: number;

  @Prop({ default: true })
  ownerCompletionRequired: boolean;

  @Prop({ min: 1, max: 104 })
  targetHorizonWeeks?: number;

  @Prop({ min: 0, default: 0 })
  weeklyTargetMinutes: number;

  @Prop({ min: 0, max: 14, default: 0 })
  targetSessionsPerWeek: number;

  @Prop({ min: 0, default: 0 })
  recommendedSessionMinutes: number;

  @Prop({ type: [Number], default: [] })
  preferredWeekdays: number[];

  @Prop({
    type: String,
    enum: HobbyPracticeTimeWindow,
    default: HobbyPracticeTimeWindow.FLEXIBLE,
  })
  preferredPracticeTime: HobbyPracticeTimeWindow;

  @Prop({ default: true })
  aiCoachingEnabled: boolean;

  @Prop({ default: true })
  automaticReviewsEnabled: boolean;

  @Prop({ trim: true })
  currentStageKey?: string;

  @Prop({ trim: true, maxlength: 1600 })
  nextAction?: string;

  @Prop({ min: 0 })
  nextActionMinutes?: number;

  @Prop({ type: [HobbyCurriculumStageSchema], default: [] })
  curriculum: HobbyCurriculumStage[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'LibraryItem', default: [] })
  linkedLibraryItemIds: Types.ObjectId[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: HobbyCandidateProfileSchema, default: undefined })
  candidateProfile?: HobbyCandidateProfile;

  @Prop({ type: String, enum: HobbySource, default: HobbySource.MANUAL })
  source: HobbySource;

  @Prop({ default: true })
  mediaEligible: boolean;

  @Prop({ default: false, index: true })
  isArchived: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HobbySchema = SchemaFactory.createForClass(Hobby);

HobbySchema.index({ status: 1, isActive: 1, isArchived: 1 });
