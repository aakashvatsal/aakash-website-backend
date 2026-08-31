import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MediaPostDocument = HydratedDocument<MediaPost>;

export enum MediaPlatform {
  LINKEDIN = 'linkedin',
  INSTAGRAM = 'instagram',
  YOUTUBE = 'youtube',
  X = 'x',
  FACEBOOK = 'facebook',
  THREADS = 'threads',
  WHATSAPP = 'whatsapp',
}

export enum MediaPostType {
  TEXT = 'text',
  IMAGE = 'image',
  CAROUSEL = 'carousel',
  REEL = 'reel',
  VIDEO = 'video',
  SHORT = 'short',
  STORY = 'story',
  ARTICLE = 'article',
  POLL = 'poll',
  THREAD = 'thread',
  WHATSAPP_MESSAGE = 'whatsapp_message',
  WHATSAPP_STATUS = 'whatsapp_status',
  WHATSAPP_TEMPLATE = 'whatsapp_template',
}

export enum MediaPostStatus {
  IDEA = 'idea',
  DRAFT = 'draft',
  SCRIPT_READY = 'script_ready',
  ASSETS_PENDING = 'assets_pending',
  READY = 'ready',
  SCHEDULED = 'scheduled',
  POSTED = 'posted',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum MediaSourceType {
  REAL = 'real',
  AI_GENERATED = 'ai_generated',
  DESIGNED_GRAPHIC = 'designed_graphic',
  STOCK = 'stock',
  SCREEN_RECORDING = 'screen_recording',
  NONE = 'none',
}

export enum MediaGoal {
  AWARENESS = 'awareness',
  ENGAGEMENT = 'engagement',
  EDUCATION = 'education',
  LEAD_GENERATION = 'lead_generation',
  AUTHORITY = 'authority',
  COMMUNITY = 'community',
  PRODUCT_PROMOTION = 'product_promotion',
  RECRUITMENT = 'recruitment',
  PERSONAL_BRAND = 'personal_brand',
}

export enum MediaOutcomeStatus {
  NOT_MEASURED = 'not_measured',
  BELOW_EXPECTATION = 'below_expectation',
  MET_EXPECTATION = 'met_expectation',
  ABOVE_EXPECTATION = 'above_expectation',
}

@Schema({ _id: false })
export class MediaStrategy {
  @Prop({
    type: String,
    enum: MediaGoal,
    required: true,
  })
  primaryGoal: MediaGoal;

  @Prop({
    type: [String],
    enum: MediaGoal,
    default: [],
  })
  secondaryGoals: MediaGoal[];

  @Prop({
    required: true,
    trim: true,
  })
  whyChosen: string;

  @Prop({ trim: true })
  targetAudience?: string;

  @Prop({ trim: true })
  audienceProblem?: string;

  @Prop({ trim: true })
  coreMessage?: string;

  @Prop({ trim: true, index: true })
  contentPillar?: string;

  @Prop({ trim: true })
  desiredAudienceAction?: string;

  @Prop({ trim: true })
  hypothesis?: string;
}

export const MediaStrategySchema = SchemaFactory.createForClass(MediaStrategy);

@Schema({ _id: false })
export class MediaContent {
  @Prop({
    required: true,
    trim: true,
  })
  title: string;

  @Prop({ trim: true })
  hook?: string;

  @Prop({ trim: true })
  shortDescription?: string;

  @Prop({ trim: true })
  detailedDescription?: string;

  @Prop({ trim: true })
  caption?: string;

  @Prop({ trim: true })
  textPostScript?: string;

  @Prop({ trim: true })
  videoScript?: string;

  @Prop({ trim: true })
  voiceOverScript?: string;

  @Prop({
    type: [String],
    default: [],
  })
  carouselSlides: string[];

  @Prop({
    type: [String],
    default: [],
  })
  shotList: string[];

  @Prop({
    type: [String],
    default: [],
  })
  hashtags: string[];

  @Prop({ trim: true })
  cta?: string;
}

export const MediaContentSchema = SchemaFactory.createForClass(MediaContent);

@Schema({ _id: false })
export class MediaCreative {
  @Prop({
    type: String,
    enum: MediaSourceType,
    default: MediaSourceType.NONE,
  })
  imageSource: MediaSourceType;

  @Prop({
    type: String,
    enum: MediaSourceType,
    default: MediaSourceType.NONE,
  })
  videoSource: MediaSourceType;

  @Prop({ trim: true })
  designBrief?: string;

  @Prop({ trim: true })
  imagePrompt?: string;

  @Prop({ trim: true })
  thumbnailPrompt?: string;

  @Prop({ trim: true })
  aiImagePrompt?: string;

  @Prop({ trim: true })
  aiVideoPrompt?: string;

  @Prop({ trim: true })
  realImageScript?: string;

  @Prop({ trim: true })
  realVideoScript?: string;

  @Prop({ trim: true })
  brollScript?: string;

  @Prop({
    type: [String],
    default: [],
  })
  requiredAssets: string[];

  @Prop({
    type: [String],
    default: [],
  })
  assetUrls: string[];

  @Prop({
    type: [String],
    default: [],
  })
  equipmentRequired: string[];

  @Prop({ default: false })
  permissionRequired: boolean;

  @Prop({ default: false })
  permissionTaken: boolean;

  @Prop({ trim: true })
  permissionNotes?: string;
}

export const MediaCreativeSchema = SchemaFactory.createForClass(MediaCreative);

@Schema({ _id: false })
export class MediaPublishing {
  @Prop({
    type: String,
    enum: MediaPostStatus,
    default: MediaPostStatus.IDEA,
    index: true,
  })
  status: MediaPostStatus;

  @Prop()
  scheduledAt?: Date;

  @Prop()
  publishedAt?: Date;

  @Prop({ trim: true })
  externalPostUrl?: string;

  @Prop({ trim: true })
  platformPostId?: string;

  @Prop({ trim: true })
  platformAccountId?: string;

  @Prop({ trim: true })
  platformMediaId?: string;

  @Prop({ trim: true })
  analyticsUrl?: string;

  @Prop({ trim: true })
  errorMessage?: string;
}

export const MediaPublishingSchema =
  SchemaFactory.createForClass(MediaPublishing);

@Schema({ _id: false })
export class MediaExpectationMetric {
  @Prop({
    required: true,
    trim: true,
  })
  metric: string;

  @Prop({
    required: true,
    min: 0,
  })
  expectedValue: number;

  @Prop({ trim: true })
  unit?: string;
}

export const MediaExpectationMetricSchema = SchemaFactory.createForClass(
  MediaExpectationMetric,
);

@Schema({ _id: false })
export class MediaExpectation {
  @Prop({ trim: true })
  summary?: string;

  @Prop({
    type: [MediaExpectationMetricSchema],
    default: [],
  })
  metrics: MediaExpectationMetric[];

  @Prop({
    min: 0,
    default: 72,
  })
  evaluationAfterHours: number;
}

export const MediaExpectationSchema =
  SchemaFactory.createForClass(MediaExpectation);

@Schema({ _id: false })
export class MediaOutcome {
  @Prop({
    type: String,
    enum: MediaOutcomeStatus,
    default: MediaOutcomeStatus.NOT_MEASURED,
  })
  status: MediaOutcomeStatus;

  @Prop({ trim: true })
  resultSummary?: string;

  @Prop({ trim: true })
  expectationResult?: string;

  @Prop({ trim: true })
  whatWorked?: string;

  @Prop({ trim: true })
  whatDidNotWork?: string;

  @Prop({ trim: true })
  lessonLearned?: string;

  @Prop({ trim: true })
  nextAction?: string;

  @Prop({
    min: 0,
    max: 10,
  })
  contentScore?: number;

  @Prop()
  evaluatedAt?: Date;
}

export const MediaOutcomeSchema = SchemaFactory.createForClass(MediaOutcome);

@Schema({ _id: false })
export class MediaAnalyticsSync {
  @Prop({ default: false })
  enabled: boolean;

  @Prop()
  lastSyncedAt?: Date;

  @Prop()
  nextSyncAt?: Date;

  @Prop({ trim: true })
  lastSyncError?: string;

  @Prop({
    min: 0,
    default: 0,
  })
  syncAttempts: number;
}

export const MediaAnalyticsSyncSchema =
  SchemaFactory.createForClass(MediaAnalyticsSync);

@Schema({
  timestamps: true,
  collection: 'media_posts',
})
export class MediaPost {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Company',
    index: true,
  })
  companyId?: Types.ObjectId;

  @Prop({
    required: true,
    index: true,
  })
  date: Date;

  @Prop({
    type: String,
    enum: MediaPlatform,
    required: true,
    index: true,
  })
  platform: MediaPlatform;

  @Prop({
    type: String,
    enum: MediaPostType,
    required: true,
    index: true,
  })
  postType: MediaPostType;

  @Prop({
    type: MediaStrategySchema,
    required: true,
  })
  strategy: MediaStrategy;

  @Prop({
    type: MediaContentSchema,
    required: true,
  })
  content: MediaContent;

  @Prop({
    type: MediaCreativeSchema,
    default: () => ({}),
  })
  creative: MediaCreative;

  @Prop({
    type: MediaPublishingSchema,
    default: () => ({}),
  })
  publishing: MediaPublishing;

  @Prop({
    type: MediaExpectationSchema,
    default: () => ({}),
  })
  expectation: MediaExpectation;

  @Prop({
    type: MediaOutcomeSchema,
    default: () => ({}),
  })
  outcome: MediaOutcome;

  @Prop({
    type: MediaAnalyticsSyncSchema,
    default: () => ({}),
  })
  analyticsSync: MediaAnalyticsSync;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop({ default: true })
  isActive: boolean;
}

export const MediaPostSchema = SchemaFactory.createForClass(MediaPost);

MediaPostSchema.index({
  date: -1,
});

MediaPostSchema.index({
  platform: 1,
  'publishing.status': 1,
  date: -1,
});

MediaPostSchema.index({
  companyId: 1,
  date: -1,
});

MediaPostSchema.index({
  'strategy.contentPillar': 1,
  date: -1,
});

MediaPostSchema.index({
  'content.title': 'text',
  'content.hook': 'text',
  'content.caption': 'text',
  'content.detailedDescription': 'text',
  'strategy.whyChosen': 'text',
  'strategy.coreMessage': 'text',
});
