import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaDeliveryProvider } from './media-account.schema';
import { MediaAssetType } from './media-asset.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
  MediaSourceType,
} from './media-post.schema';

export type MediaPublicationDocument = HydratedDocument<MediaPublication>;

export enum MediaProductionStatus {
  NOT_STARTED = 'not_started',
  PLANNING = 'planning',
  PLAN_READY = 'plan_ready',
  ASSETS_PENDING = 'assets_pending',
  READY = 'ready',
  COMPLETE = 'complete',
  BLOCKED = 'blocked',
}

export enum MediaProductionOrigin {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
}

export enum MediaDeliveryStatus {
  NOT_SCHEDULED = 'not_scheduled',
  SCHEDULED = 'scheduled',
  PUBLISHING = 'publishing',
  PUBLISHED = 'published',
  MANUAL_REQUIRED = 'manual_required',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Schema({ _id: false })
export class MediaProductionShot {
  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true })
  framing?: string;

  @Prop({ trim: true })
  action?: string;

  @Prop({ trim: true })
  dialogue?: string;

  @Prop({ min: 0 })
  durationSeconds?: number;

  @Prop({ trim: true })
  location?: string;

  @Prop({ type: [String], default: [] })
  equipment: string[];

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionShotSchema =
  SchemaFactory.createForClass(MediaProductionShot);

@Schema({ _id: false })
export class MediaProductionBroll {
  @Prop({ required: true, min: 1 })
  order: number;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ trim: true })
  purpose?: string;

  @Prop({ min: 0 })
  durationSeconds?: number;

  @Prop({ type: String, enum: MediaSourceType, default: MediaSourceType.REAL })
  source: MediaSourceType;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionBrollSchema =
  SchemaFactory.createForClass(MediaProductionBroll);

@Schema({ _id: false })
export class MediaProductionCarouselSlide {
  @Prop({ required: true, min: 1 })
  slideNumber: number;

  @Prop({ required: true, trim: true })
  headline: string;

  @Prop({ trim: true })
  body?: string;

  @Prop({ trim: true })
  visualDirection?: string;
}

export const MediaProductionCarouselSlideSchema = SchemaFactory.createForClass(
  MediaProductionCarouselSlide,
);

@Schema({ _id: false })
export class MediaProductionThumbnail {
  @Prop({ trim: true })
  headline?: string;

  @Prop({ trim: true })
  concept?: string;

  @Prop({ trim: true })
  composition?: string;

  @Prop({ trim: true })
  textOverlay?: string;

  @Prop({ trim: true })
  imagePrompt?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionThumbnailSchema = SchemaFactory.createForClass(
  MediaProductionThumbnail,
);

@Schema({ _id: false })
export class MediaProductionVisualDirection {
  @Prop({ trim: true })
  aspectRatio?: string;

  @Prop({ trim: true })
  framing?: string;

  @Prop({ trim: true })
  lighting?: string;

  @Prop({ trim: true })
  background?: string;

  @Prop({ trim: true })
  wardrobe?: string;

  @Prop({ type: [String], default: [] })
  props: string[];

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionVisualDirectionSchema =
  SchemaFactory.createForClass(MediaProductionVisualDirection);

@Schema({ _id: false })
export class MediaProductionCameraInstructions {
  @Prop({ trim: true })
  orientation?: string;

  @Prop({ trim: true })
  framing?: string;

  @Prop({ trim: true })
  resolution?: string;

  @Prop({ trim: true })
  fps?: string;

  @Prop({ trim: true })
  audio?: string;

  @Prop({ trim: true })
  lighting?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionCameraInstructionsSchema =
  SchemaFactory.createForClass(MediaProductionCameraInstructions);

@Schema({ _id: false })
export class MediaProductionEditInstructions {
  @Prop({ trim: true })
  pacing?: string;

  @Prop({ trim: true })
  cuts?: string;

  @Prop({ trim: true })
  captions?: string;

  @Prop({ trim: true })
  music?: string;

  @Prop({ trim: true })
  soundEffects?: string;

  @Prop({ trim: true })
  graphics?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionEditInstructionsSchema =
  SchemaFactory.createForClass(MediaProductionEditInstructions);

@Schema({ _id: false })
export class MediaProductionAssetRequirement {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ type: String, enum: MediaAssetType, required: true })
  type: MediaAssetType;

  @Prop({ trim: true })
  role?: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ type: String, enum: MediaSourceType, default: MediaSourceType.NONE })
  source: MediaSourceType;

  @Prop({ trim: true })
  prompt?: string;

  @Prop({ default: true })
  required: boolean;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaProductionAssetRequirementSchema =
  SchemaFactory.createForClass(MediaProductionAssetRequirement);

@Schema({ _id: false })
export class MediaProductionPlan {
  @Prop({ trim: true })
  finalScript?: string;

  @Prop({ trim: true })
  teleprompterScript?: string;

  @Prop({ type: [String], default: [] })
  talkingPoints: string[];

  @Prop({ type: [MediaProductionShotSchema], default: [] })
  shotList: MediaProductionShot[];

  @Prop({ type: [MediaProductionBrollSchema], default: [] })
  broll: MediaProductionBroll[];

  @Prop({ type: [MediaProductionCarouselSlideSchema], default: [] })
  carouselSlides: MediaProductionCarouselSlide[];

  @Prop({ type: MediaProductionThumbnailSchema })
  thumbnail?: MediaProductionThumbnail;

  @Prop({ type: MediaProductionVisualDirectionSchema })
  visualDirection?: MediaProductionVisualDirection;

  @Prop({ type: MediaProductionCameraInstructionsSchema })
  cameraInstructions?: MediaProductionCameraInstructions;

  @Prop({ type: MediaProductionEditInstructionsSchema })
  editInstructions?: MediaProductionEditInstructions;

  @Prop({ type: [MediaProductionAssetRequirementSchema], default: [] })
  assetRequirements: MediaProductionAssetRequirement[];

  @Prop({ type: [String], default: [] })
  equipment: string[];

  @Prop({ type: [String], default: [] })
  publishChecklist: string[];

  @Prop({ type: [String], default: [] })
  risks: string[];

  @Prop({ trim: true })
  notes?: string;

  @Prop({
    type: String,
    enum: MediaProductionOrigin,
    default: MediaProductionOrigin.HSAKAA,
  })
  origin: MediaProductionOrigin;

  @Prop()
  generatedAt?: Date;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  responseId?: string;

  @Prop({ trim: true })
  promptVersion?: string;
}

export const MediaProductionPlanSchema =
  SchemaFactory.createForClass(MediaProductionPlan);

@Schema({ timestamps: true, collection: 'media_publications' })
export class MediaPublication {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaContentItem',
    required: true,
    index: true,
  })
  contentItemId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaAccount', index: true })
  accountId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ type: String, enum: MediaPostType, required: true, index: true })
  format: MediaPostType;

  @Prop({
    type: String,
    enum: MediaPostStatus,
    default: MediaPostStatus.IDEA,
    index: true,
  })
  status: MediaPostStatus;

  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  hook?: string;

  @Prop({ trim: true })
  caption?: string;

  @Prop({ trim: true })
  script?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  cta?: string;

  @Prop({ type: [String], default: [] })
  hashtags: string[];

  @Prop({ type: [String], default: [] })
  slides: string[];

  @Prop({
    type: String,
    enum: MediaProductionStatus,
    default: MediaProductionStatus.NOT_STARTED,
    index: true,
  })
  productionStatus: MediaProductionStatus;

  @Prop({ type: MediaProductionPlanSchema })
  production?: MediaProductionPlan;

  @Prop({ default: 0, min: 0 })
  productionVersion: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaGenerationRun', index: true })
  productionRunId?: Types.ObjectId;

  @Prop()
  scheduledAt?: Date;

  @Prop()
  publishedAt?: Date;

  @Prop({
    type: String,
    enum: MediaDeliveryStatus,
    default: MediaDeliveryStatus.NOT_SCHEDULED,
    index: true,
  })
  deliveryStatus: MediaDeliveryStatus;

  @Prop({ default: false })
  autoPublish: boolean;

  @Prop({ type: String, enum: MediaDeliveryProvider })
  deliveryProviderUsed?: MediaDeliveryProvider;

  @Prop({ trim: true, index: true })
  bufferPostId?: string;

  @Prop({ trim: true })
  bufferChannelId?: string;

  @Prop({ trim: true })
  bufferPostStatus?: string;

  @Prop()
  bufferHandedOffAt?: Date;

  @Prop()
  bufferLastSyncedAt?: Date;

  @Prop()
  scheduleApprovedAt?: Date;

  @Prop({ default: 0, min: 0 })
  publishAttempts: number;

  @Prop()
  lastPublishAttemptAt?: Date;

  @Prop()
  nextPublishAttemptAt?: Date;

  @Prop({ trim: true })
  lastPublishError?: string;

  @Prop()
  manualPublishCompletedAt?: Date;

  @Prop()
  planningDueAt?: Date;

  @Prop()
  scriptDueAt?: Date;

  @Prop()
  assetDueAt?: Date;

  @Prop()
  reviewDueAt?: Date;

  @Prop({ trim: true })
  externalPostUrl?: string;

  @Prop({ trim: true })
  platformPostId?: string;

  @Prop({ default: false })
  intentionalRepurpose: boolean;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  sourcePublicationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPost', index: true })
  legacyMediaPostId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaGenerationRun', index: true })
  generationRunId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaPublicationSchema =
  SchemaFactory.createForClass(MediaPublication);

MediaPublicationSchema.index({ platform: 1, status: 1, scheduledAt: 1 });
MediaPublicationSchema.index({ productionStatus: 1, createdAt: -1 });
MediaPublicationSchema.index({
  deliveryStatus: 1,
  scheduledAt: 1,
  autoPublish: 1,
});
MediaPublicationSchema.index({ bufferPostId: 1, deliveryStatus: 1 });
MediaPublicationSchema.index({ contentItemId: 1, createdAt: -1 });
MediaPublicationSchema.index(
  { legacyMediaPostId: 1 },
  {
    unique: true,
    partialFilterExpression: { legacyMediaPostId: { $type: 'objectId' } },
  },
);
MediaPublicationSchema.index({
  title: 'text',
  hook: 'text',
  caption: 'text',
  script: 'text',
  description: 'text',
});
