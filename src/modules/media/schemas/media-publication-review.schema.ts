import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaPublicationReviewDocument =
  HydratedDocument<MediaPublicationReview>;

export enum MediaPublicationReviewStatus {
  NEEDS_REVIEW = 'needs_review',
  CHANGES_REQUIRED = 'changes_required',
  APPROVED = 'approved',
  STALE = 'stale',
}

export enum MediaPreflightCheckStatus {
  PASS = 'pass',
  WARN = 'warn',
  BLOCK = 'block',
}

export enum MediaPreflightCheckCategory {
  COMPLETENESS = 'completeness',
  PRODUCTION = 'production',
  AUTHENTICITY = 'authenticity',
  PLATFORM_FIT = 'platform_fit',
  CLARITY = 'clarity',
  EVIDENCE = 'evidence',
  PRIVACY = 'privacy',
  NOVELTY = 'novelty',
}

@Schema({ _id: false })
export class MediaPreflightCheck {
  @Prop({ type: String, enum: MediaPreflightCheckCategory, required: true })
  category: MediaPreflightCheckCategory;

  @Prop({ type: String, enum: MediaPreflightCheckStatus, required: true })
  status: MediaPreflightCheckStatus;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;
}

export const MediaPreflightCheckSchema =
  SchemaFactory.createForClass(MediaPreflightCheck);

@Schema({ timestamps: true, collection: 'media_publication_reviews' })
export class MediaPublicationReview {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaPublication',
    required: true,
    unique: true,
    index: true,
  })
  publicationId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaContentItem',
    required: true,
    index: true,
  })
  contentItemId: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ type: String, enum: MediaPostType, required: true, index: true })
  format: MediaPostType;

  @Prop({
    type: String,
    enum: MediaPublicationReviewStatus,
    required: true,
    index: true,
  })
  status: MediaPublicationReviewStatus;

  @Prop({ min: 0, max: 100, default: 0 })
  overallScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  authenticityScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  platformFitScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  clarityScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  evidenceScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  privacyScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  noveltyScore: number;

  @Prop({ min: 0, max: 100, default: 0 })
  productionScore: number;

  @Prop({ type: [MediaPreflightCheckSchema], default: [] })
  checks: MediaPreflightCheck[];

  @Prop({ type: [String], default: [] })
  strengths: string[];

  @Prop({ type: [String], default: [] })
  changesRequired: string[];

  @Prop({ required: true, trim: true })
  sourceFingerprint: string;

  @Prop({ default: 0, min: 0 })
  reviewedProductionVersion: number;

  @Prop({ min: 0 })
  presenceStrategyVersion?: number;

  @Prop({ min: 0 })
  voiceProfileVersion?: number;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop()
  generatedAt?: Date;

  @Prop()
  approvedAt?: Date;

  @Prop({ trim: true })
  ownerNote?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaPublicationReviewSchema = SchemaFactory.createForClass(
  MediaPublicationReview,
);

MediaPublicationReviewSchema.index({ status: 1, generatedAt: -1 });
MediaPublicationReviewSchema.index({ platform: 1, status: 1, generatedAt: -1 });
