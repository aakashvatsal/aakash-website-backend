import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MEDIA_PUBLIC_IDENTITY_PILLARS } from '../media-public-identity';
import type { MediaPublicIdentityPillar } from '../media-public-identity';
import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaPlanningCycleDocument = HydratedDocument<MediaPlanningCycle>;

@Schema({ _id: false })
export class MediaPlanningOpportunity {
  @Prop({ required: true, trim: true }) key: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, trim: true }) thesis: string;
  @Prop({ required: true, trim: true }) whyNow: string;
  @Prop({ required: true, trim: true }) sourceSummary: string;
  @Prop({ type: [String], default: [] }) evidenceIds: string[];
  @Prop({ trim: true }) companyName?: string;
  @Prop({ required: true, trim: true }) narrative: string;
  @Prop({ required: true, trim: true, default: 'builder_operator' })
  strategyNarrativeKey: string;
  @Prop({ required: true, trim: true, default: 'unclustered' })
  topicClusterKey: string;
  @Prop({
    type: String,
    required: true,
    enum: ['authority', 'discovery', 'conversion', 'affinity', 'conversation'],
    default: 'authority',
  })
  growthIntent:
    'authority' | 'discovery' | 'conversion' | 'affinity' | 'conversation';
  @Prop({
    type: String,
    enum: MEDIA_PUBLIC_IDENTITY_PILLARS,
    required: true,
    default: 'ideas_thinking',
  })
  identityPillar: MediaPublicIdentityPillar;
  @Prop({ type: [String], enum: MediaPlatform, default: [] })
  platforms: MediaPlatform[];
  @Prop({ type: [String], enum: MediaPostType, default: [] })
  formats: MediaPostType[];
  @Prop({ required: true, min: 0, max: 100 }) strategicFit: number;
  @Prop({ required: true, min: 0, max: 100 }) novelty: number;
  @Prop({ required: true, min: 0, max: 100 }) evidenceStrength: number;
  @Prop({
    type: String,
    required: true,
    enum: ['public_safe', 'needs_review'],
    trim: true,
  })
  privacy: 'public_safe' | 'needs_review';
  @Prop({ default: true }) usable: boolean;
}
export const MediaPlanningOpportunitySchema = SchemaFactory.createForClass(
  MediaPlanningOpportunity,
);

@Schema({ _id: false })
export class MediaPlanningStoryBeat {
  @Prop({ required: true, min: 1 }) order: number;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, trim: true }) purpose: string;
  @Prop({ trim: true }) opportunityKey?: string;
  @Prop({ type: [String], enum: MediaPlatform, default: [] })
  platforms: MediaPlatform[];
}
export const MediaPlanningStoryBeatSchema = SchemaFactory.createForClass(
  MediaPlanningStoryBeat,
);

@Schema({ _id: false })
export class MediaPlanningStoryArc {
  @Prop({ required: true, trim: true }) key: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, trim: true }) purpose: string;
  @Prop({ required: true, trim: true }) narrative: string;
  @Prop({ required: true, trim: true, default: '' }) premise: string;
  @Prop({ required: true, trim: true, default: '' }) currentChapter: string;
  @Prop({ required: true, trim: true, default: '' }) currentTension: string;
  @Prop({ required: true, trim: true, default: '' }) unresolvedQuestion: string;
  @Prop({ type: [String], default: [] }) audienceKnows: string[];
  @Prop({ type: [String], default: [] }) audienceDoesNotKnowYet: string[];
  @Prop({ required: true, trim: true, default: '' })
  nextNarrativeOpportunity: string;
  @Prop({
    type: String,
    required: true,
    enum: ['active', 'paused', 'completed'],
    default: 'active',
  })
  status: 'active' | 'paused' | 'completed';
  @Prop({ required: true, trim: true, default: 'builder_operator' })
  strategyNarrativeKey: string;
  @Prop({ required: true, trim: true, default: 'unclustered' })
  topicClusterKey: string;
  @Prop({
    type: String,
    required: true,
    enum: ['authority', 'discovery', 'conversion', 'affinity', 'conversation'],
    default: 'authority',
  })
  growthIntent:
    'authority' | 'discovery' | 'conversion' | 'affinity' | 'conversation';
  @Prop({ trim: true }) companyName?: string;
  @Prop({ required: true, min: 1, max: 210 }) durationDays: number;
  @Prop({ type: [MediaPlanningStoryBeatSchema], default: [] })
  beats: MediaPlanningStoryBeat[];
}
export const MediaPlanningStoryArcSchema = SchemaFactory.createForClass(
  MediaPlanningStoryArc,
);

@Schema({ _id: false })
export class MediaPlanningImageBrief {
  @Prop({
    type: String,
    enum: ['none', 'ai_generation', 'real_photo', 'designed_graphic'],
    required: true,
    default: 'none',
  })
  mode: 'none' | 'ai_generation' | 'real_photo' | 'designed_graphic';
  @Prop({ required: true, trim: true, default: '' }) aspectRatio: string;
  @Prop({ required: true, trim: true, default: '' }) overlayText: string;
  @Prop({ required: true, trim: true, default: '' }) prompt: string;
  @Prop({ required: true, trim: true, default: '' }) description: string;
  @Prop({ required: true, trim: true, default: '' }) sourceGuidance: string;
}
export const MediaPlanningImageBriefSchema = SchemaFactory.createForClass(
  MediaPlanningImageBrief,
);

@Schema({ _id: false })
export class MediaPlanningCarouselSlide {
  @Prop({ required: true, min: 1 }) slideNumber: number;
  @Prop({ required: true, trim: true }) headline: string;
  @Prop({ required: true, trim: true }) bodyCopy: string;
  @Prop({
    type: String,
    required: true,
    enum: ['ai_image', 'real_photo', 'designed_graphic', 'text_only'],
  })
  visualType: 'ai_image' | 'real_photo' | 'designed_graphic' | 'text_only';
  @Prop({ required: true, trim: true, default: '' }) imagePrompt: string;
  @Prop({ required: true, trim: true, default: '' }) visualDescription: string;
  @Prop({ required: true, trim: true, default: '' }) overlayText: string;
}
export const MediaPlanningCarouselSlideSchema = SchemaFactory.createForClass(
  MediaPlanningCarouselSlide,
);

@Schema({ _id: false })
export class MediaPlanningTimedDirection {
  @Prop({ required: true, trim: true }) at: string;
  @Prop({ required: true, trim: true }) instruction: string;
}
export const MediaPlanningTimedDirectionSchema = SchemaFactory.createForClass(
  MediaPlanningTimedDirection,
);

@Schema({ _id: false })
export class MediaPlanningVideoPack {
  @Prop({ required: true, trim: true, default: '' }) fullScript: string;
  @Prop({ required: true, min: 0, max: 7200, default: 0 })
  targetDurationSeconds: number;
  @Prop({ required: true, trim: true, default: '' })
  deliveryInstructions: string;
  @Prop({ required: true, trim: true, default: '' }) shootStyle: string;
  @Prop({ required: true, trim: true, default: '' }) location: string;
  @Prop({ required: true, trim: true, default: '' }) movement: string;
  @Prop({ required: true, trim: true, default: '' }) openingFrame: string;
  @Prop({ required: true, trim: true, default: '' }) cameraPosition: string;
  @Prop({ type: [String], default: [] }) shotList: string[];
  @Prop({ required: true, trim: true, default: '' }) cameraInstructions: string;
  @Prop({ type: [MediaPlanningTimedDirectionSchema], default: [] })
  punchIns: MediaPlanningTimedDirection[];
  @Prop({ type: [MediaPlanningTimedDirectionSchema], default: [] })
  broll: MediaPlanningTimedDirection[];
  @Prop({ type: [MediaPlanningTimedDirectionSchema], default: [] })
  onScreenText: MediaPlanningTimedDirection[];
  @Prop({ required: true, trim: true, default: '' }) audioDirection: string;
  @Prop({ required: true, trim: true, default: '' }) lightingDirection: string;
  @Prop({ required: true, trim: true, default: '' }) editingRhythm: string;
  @Prop({ required: true, trim: true, default: '' }) captionDirection: string;
  @Prop({ required: true, trim: true, default: '' }) musicDirection: string;
  @Prop({ required: true, trim: true, default: '' }) coverDirection: string;
  @Prop({ required: true, trim: true, default: '' }) coverFrame: string;
}
export const MediaPlanningVideoPackSchema = SchemaFactory.createForClass(
  MediaPlanningVideoPack,
);

@Schema({ _id: false })
export class MediaPlanningExecution {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;
  @Prop({ type: String, required: true, enum: ['post', 'skip'] }) action:
    'post' | 'skip';
  @Prop({ required: true, trim: true }) time: string;
  @Prop({ type: String, enum: MediaPostType, required: true })
  format: MediaPostType;
  @Prop({ required: true, trim: true }) formatIntent: string;
  @Prop({ trim: true }) opportunityKey?: string;
  @Prop({ trim: true }) storyArcKey?: string;
  @Prop({ required: true, trim: true }) reason: string;
  @Prop({ required: true, trim: true }) whyThisFormat: string;
  @Prop({ required: true, trim: true }) whyThisTime: string;
  @Prop({ required: true, trim: true }) title: string;
  @Prop({ required: true, trim: true }) hook: string;
  @Prop({ required: true, trim: true }) caption: string;
  @Prop({ required: true, trim: true }) script: string;
  @Prop({ required: true, trim: true }) description: string;
  @Prop({ required: true, trim: true }) cta: string;
  @Prop({ type: [String], default: [] }) hashtags: string[];
  @Prop({ type: [String], default: [] }) slides: string[];
  @Prop({ required: true, trim: true }) coverText: string;
  @Prop({ required: true, trim: true }) thumbnailText: string;
  @Prop({ required: true, trim: true }) pinnedComment: string;
  @Prop({ required: true, trim: true }) storyFollowUp: string;
  @Prop({ required: true, trim: true }) productionNotes: string;

  @Prop({ required: true, trim: true, default: '' }) publishCopy: string;
  // Legacy compatibility fields. V3.13.1 generates one canonical platform-native
  // publishCopy and derives these deterministically for older consumers.
  @Prop({ required: true, trim: true, default: '' }) copyPasteText: string;
  @Prop({ required: true, trim: true, default: '' }) copyPasteCaption: string;
  @Prop({ type: [String], default: [] }) evidenceIds: string[];
  @Prop({ type: MediaPlanningImageBriefSchema, default: () => ({}) })
  imageBrief: MediaPlanningImageBrief;
  @Prop({ type: [MediaPlanningCarouselSlideSchema], default: [] })
  carouselSlides: MediaPlanningCarouselSlide[];
  @Prop({ type: MediaPlanningVideoPackSchema, default: () => ({}) })
  videoPack: MediaPlanningVideoPack;
  @Prop({ type: [String], default: [] }) xThread: string[];
  @Prop({ type: [String], default: [] }) whatsappSequence: string[];
  @Prop({ default: false }) executionReady: boolean;
  @Prop({ type: [String], default: [] }) readinessIssues: string[];

  @Prop({ required: true, min: 0, max: 240 }) estimatedMinutes: number;
  @Prop({ default: true }) requiresApproval: boolean;
}
export const MediaPlanningExecutionSchema = SchemaFactory.createForClass(
  MediaPlanningExecution,
);

@Schema({ _id: false })
export class MediaPlanningEngagementTask {
  @Prop({ type: String, enum: MediaPlatform, required: true })
  platform: MediaPlatform;
  @Prop({ required: true, trim: true }) time: string;
  @Prop({ required: true, min: 0, max: 30 }) count: number;
  @Prop({ required: true, trim: true }) purpose: string;
  @Prop({ required: true, trim: true }) guidance: string;
}
export const MediaPlanningEngagementTaskSchema = SchemaFactory.createForClass(
  MediaPlanningEngagementTask,
);

@Schema({ _id: false })
export class MediaPlanningStoryFrame {
  @Prop({ required: true, min: 1 }) order: number;
  @Prop({ required: true, trim: true, default: '' }) overlayText: string;
  @Prop({ required: true, trim: true, default: '' }) spokenText: string;
  @Prop({ required: true, trim: true, default: '' }) visualDescription: string;
  @Prop({ required: true, trim: true, default: '' }) captureInstruction: string;
  @Prop({ required: true, trim: true, default: '' }) interactiveElement: string;
}
export const MediaPlanningStoryFrameSchema = SchemaFactory.createForClass(
  MediaPlanningStoryFrame,
);

@Schema({ _id: false })
export class MediaPlanningDailyStory {
  @Prop({ type: String, required: true, enum: ['post', 'skip'] })
  action: 'post' | 'skip';
  @Prop({ required: true, trim: true, default: '' }) time: string;
  @Prop({
    type: String,
    required: true,
    enum: [
      'routine',
      'current_work',
      'learning',
      'hobby',
      'personal_growth',
      'professional',
      'human_moment',
    ],
  })
  sourceType:
    | 'routine'
    | 'current_work'
    | 'learning'
    | 'hobby'
    | 'personal_growth'
    | 'professional'
    | 'human_moment';
  @Prop({ type: [String], default: [] }) sourceEvidenceIds: string[];
  @Prop({ required: true, trim: true, default: '' }) reason: string;
  @Prop({ required: true, trim: true, default: '' }) captureBrief: string;
  @Prop({ type: [MediaPlanningStoryFrameSchema], default: [] })
  frames: MediaPlanningStoryFrame[];
  @Prop({ default: false }) executionReady: boolean;
  @Prop({ type: [String], default: [] }) readinessIssues: string[];
}
export const MediaPlanningDailyStorySchema = SchemaFactory.createForClass(
  MediaPlanningDailyStory,
);

@Schema({ _id: false })
export class MediaPlanningYoutubeCommunityPost {
  @Prop({ type: String, required: true, enum: ['post', 'skip'] })
  action: 'post' | 'skip';
  @Prop({ required: true, trim: true, default: '' }) time: string;
  @Prop({ type: String, required: true, enum: ['text', 'image', 'poll'] })
  format: 'text' | 'image' | 'poll';
  @Prop({
    type: String,
    required: true,
    enum: [
      'routine',
      'current_work',
      'learning',
      'hobby',
      'personal_growth',
      'professional',
      'human_moment',
    ],
  })
  sourceType:
    | 'routine'
    | 'current_work'
    | 'learning'
    | 'hobby'
    | 'personal_growth'
    | 'professional'
    | 'human_moment';
  @Prop({ type: [String], default: [] }) sourceEvidenceIds: string[];
  @Prop({ required: true, trim: true, default: '' }) reason: string;
  @Prop({ required: true, trim: true, default: '' }) publishCopy: string;
  @Prop({ type: MediaPlanningImageBriefSchema, default: () => ({}) })
  imageBrief: MediaPlanningImageBrief;
  @Prop({ required: true, trim: true, default: '' }) pollQuestion: string;
  @Prop({ type: [String], default: [] }) pollOptions: string[];
  @Prop({ default: false }) executionReady: boolean;
  @Prop({ type: [String], default: [] }) readinessIssues: string[];
}
export const MediaPlanningYoutubeCommunityPostSchema =
  SchemaFactory.createForClass(MediaPlanningYoutubeCommunityPost);

@Schema({ _id: false })
export class MediaPlanningDay {
  @Prop({ required: true, trim: true }) date: string;
  @Prop({ required: true, trim: true }) theme: string;
  @Prop({ required: true, trim: true }) workload: string;
  @Prop({ type: [MediaPlanningExecutionSchema], default: [] })
  executions: MediaPlanningExecution[];
  @Prop({ type: MediaPlanningDailyStorySchema, default: () => ({}) })
  instagramStory: MediaPlanningDailyStory;
  @Prop({
    type: MediaPlanningYoutubeCommunityPostSchema,
    default: () => ({}),
  })
  youtubeCommunity: MediaPlanningYoutubeCommunityPost;
  @Prop({ type: [MediaPlanningEngagementTaskSchema], default: [] })
  engagement: MediaPlanningEngagementTask[];
}
export const MediaPlanningDaySchema =
  SchemaFactory.createForClass(MediaPlanningDay);

@Schema({ _id: false })
export class MediaPlanningWeekContext {
  @Prop({
    type: String,
    enum: ['yes', 'no', 'maybe', 'unknown'],
    default: 'unknown',
  })
  outingStatus: 'yes' | 'no' | 'maybe' | 'unknown';

  @Prop({ trim: true, default: '' })
  outingDetails: string;

  @Prop({ required: true, trim: true })
  weekKey: string;

  @Prop({ default: Date.now })
  capturedAt: Date;
}
export const MediaPlanningWeekContextSchema = SchemaFactory.createForClass(
  MediaPlanningWeekContext,
);

@Schema({ timestamps: true, collection: 'media_planning_cycles' })
export class MediaPlanningCycle {
  @Prop({ required: true, unique: true, index: true, trim: true }) key: string;
  @Prop({ required: true, trim: true }) startDate: string;
  @Prop({ required: true, trim: true }) endDate: string;
  @Prop({ required: true, default: 'Asia/Kolkata' }) timezone: string;
  @Prop({ required: true, trim: true }) learningStage: string;
  @Prop({ required: true, trim: true }) summary: string;
  @Prop({ type: [MediaPlanningOpportunitySchema], default: [] })
  opportunities: MediaPlanningOpportunity[];
  @Prop({ type: [MediaPlanningStoryArcSchema], default: [] })
  storyArcs: MediaPlanningStoryArc[];
  @Prop({ type: [MediaPlanningDaySchema], default: [] })
  days: MediaPlanningDay[];
  @Prop({ type: MediaPlanningWeekContextSchema, default: () => ({}) })
  weekContext: MediaPlanningWeekContext;
  @Prop({ required: true, trim: true }) strategyFingerprint: string;
  @Prop({ required: true, trim: true }) contextFingerprint: string;
  @Prop({ required: true, trim: true }) aiModel: string;
  @Prop({ trim: true }) aiResponseId?: string;
  @Prop({ required: true, default: Date.now }) generatedAt: Date;
  @Prop({ default: true, index: true }) isActive: boolean;
}
export const MediaPlanningCycleSchema =
  SchemaFactory.createForClass(MediaPlanningCycle);
MediaPlanningCycleSchema.index({ startDate: -1, generatedAt: -1 });
