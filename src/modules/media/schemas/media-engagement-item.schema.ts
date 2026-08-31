import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaEngagementItemDocument = HydratedDocument<MediaEngagementItem>;

export enum MediaEngagementType {
  COMMENT = 'comment',
  COMMENT_REPLY = 'comment_reply',
  MENTION = 'mention',
  DIRECT_MESSAGE = 'direct_message',
  PRIVATE_REPLY = 'private_reply',
  WHATSAPP_MESSAGE = 'whatsapp_message',
}

export enum MediaEngagementStatus {
  NEW = 'new',
  OPEN = 'open',
  DRAFTED = 'drafted',
  REPLIED = 'replied',
  IGNORED = 'ignored',
  ARCHIVED = 'archived',
  FAILED = 'failed',
}

export enum MediaEngagementPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum MediaEngagementSentiment {
  POSITIVE = 'positive',
  NEUTRAL = 'neutral',
  NEGATIVE = 'negative',
  MIXED = 'mixed',
}

export enum MediaEngagementIntent {
  APPRECIATION = 'appreciation',
  QUESTION = 'question',
  SUPPORT = 'support',
  LEAD = 'lead',
  COLLABORATION = 'collaboration',
  FEEDBACK = 'feedback',
  CRITICISM = 'criticism',
  SPAM = 'spam',
  OTHER = 'other',
}

export enum MediaEngagementSource {
  API = 'api',
  WEBHOOK = 'webhook',
  MANUAL = 'manual',
}

export enum MediaEngagementReplyMode {
  PUBLIC = 'public',
  PRIVATE = 'private',
  MESSAGE = 'message',
  MANUAL = 'manual',
  UNAVAILABLE = 'unavailable',
}

@Schema({ timestamps: true, collection: 'media_engagement_items' })
export class MediaEngagementItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaAccount',
    required: true,
    index: true,
  })
  accountId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  publicationId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({
    type: String,
    enum: MediaEngagementType,
    required: true,
    index: true,
  })
  type: MediaEngagementType;

  @Prop({
    type: String,
    enum: MediaEngagementStatus,
    default: MediaEngagementStatus.NEW,
    index: true,
  })
  status: MediaEngagementStatus;

  @Prop({
    type: String,
    enum: MediaEngagementPriority,
    default: MediaEngagementPriority.NORMAL,
    index: true,
  })
  priority: MediaEngagementPriority;

  @Prop({
    type: String,
    enum: MediaEngagementSentiment,
    default: MediaEngagementSentiment.NEUTRAL,
  })
  sentiment: MediaEngagementSentiment;

  @Prop({
    type: String,
    enum: MediaEngagementIntent,
    default: MediaEngagementIntent.OTHER,
    index: true,
  })
  intent: MediaEngagementIntent;

  @Prop({
    type: String,
    enum: MediaEngagementSource,
    default: MediaEngagementSource.API,
  })
  source: MediaEngagementSource;

  @Prop({ required: true, trim: true, index: true })
  platformEngagementId: string;

  @Prop({ trim: true })
  platformParentId?: string;

  @Prop({ trim: true, index: true })
  platformThreadId?: string;

  @Prop({ trim: true, index: true })
  platformConversationId?: string;

  @Prop({ trim: true })
  platformAuthorId?: string;

  @Prop({ trim: true })
  authorUsername?: string;

  @Prop({ trim: true })
  authorDisplayName?: string;

  @Prop({ trim: true })
  authorProfileUrl?: string;

  @Prop({ required: true, trim: true, maxlength: 20000 })
  text: string;

  @Prop({ required: true, index: true })
  receivedAt: Date;

  @Prop({ trim: true })
  permalink?: string;

  @Prop({ default: true, index: true })
  needsResponse: boolean;

  @Prop({ default: false })
  canReply: boolean;

  @Prop({
    type: String,
    enum: MediaEngagementReplyMode,
    default: MediaEngagementReplyMode.UNAVAILABLE,
  })
  replyMode: MediaEngagementReplyMode;

  @Prop({ trim: true })
  replyRestriction?: string;

  @Prop({ trim: true, maxlength: 3000 })
  aiSummary?: string;

  @Prop({ trim: true, maxlength: 10000 })
  suggestedReply?: string;

  @Prop()
  suggestedReplyGeneratedAt?: Date;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ trim: true, maxlength: 10000 })
  replyText?: string;

  @Prop()
  repliedAt?: Date;

  @Prop({ trim: true })
  replyExternalId?: string;

  @Prop({ trim: true })
  replyProvider?: string;

  @Prop()
  lastSyncedAt?: Date;

  @Prop({ trim: true, maxlength: 3000 })
  lastError?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaEngagementItemSchema =
  SchemaFactory.createForClass(MediaEngagementItem);

MediaEngagementItemSchema.index(
  { accountId: 1, platformEngagementId: 1 },
  { unique: true },
);
MediaEngagementItemSchema.index({ status: 1, priority: -1, receivedAt: -1 });
MediaEngagementItemSchema.index({ platform: 1, receivedAt: -1 });
MediaEngagementItemSchema.index({ publicationId: 1, receivedAt: -1 });
MediaEngagementItemSchema.index({
  needsResponse: 1,
  status: 1,
  receivedAt: -1,
});
MediaEngagementItemSchema.index({
  text: 'text',
  authorUsername: 'text',
  authorDisplayName: 'text',
});
