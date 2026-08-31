import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaGoal } from './media-post.schema';

export type MediaContentItemDocument = HydratedDocument<MediaContentItem>;

export enum MediaContentItemStatus {
  IDEA = 'idea',
  DEVELOPING = 'developing',
  READY = 'ready',
  ARCHIVED = 'archived',
}

export enum MediaContentOrigin {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  JOURNAL = 'journal',
  MEMORY = 'memory',
  DECISION = 'decision',
  PEOPLE = 'people',
  COMPANY = 'company',
  LIBRARY = 'library',
  REPURPOSED = 'repurposed',
  LEGACY_MEDIA_POST = 'legacy_media_post',
}

@Schema({ timestamps: true, collection: 'media_content_items' })
export class MediaContentItem {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  thesis?: string;

  @Prop({ trim: true })
  whyNow?: string;

  @Prop({ trim: true })
  canonicalBody?: string;

  @Prop({ trim: true })
  story?: string;

  @Prop({ type: [String], default: [] })
  evidence: string[];

  @Prop({ type: [String], default: [] })
  contentPillars: string[];

  @Prop({ type: [String], default: [] })
  audiences: string[];

  @Prop({ type: [String], enum: MediaGoal, default: [] })
  goals: MediaGoal[];

  @Prop({
    type: String,
    enum: MediaContentItemStatus,
    default: MediaContentItemStatus.IDEA,
    index: true,
  })
  status: MediaContentItemStatus;

  @Prop({
    type: String,
    enum: MediaContentOrigin,
    default: MediaContentOrigin.MANUAL,
    index: true,
  })
  origin: MediaContentOrigin;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Company', index: true })
  companyId?: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Memory', default: [] })
  memoryIds: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Person', default: [] })
  personIds: Types.ObjectId[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPost', index: true })
  legacyMediaPostId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaGenerationRun', index: true })
  generationRunId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaContentItemSchema =
  SchemaFactory.createForClass(MediaContentItem);

MediaContentItemSchema.index({ createdAt: -1 });
MediaContentItemSchema.index({ contentPillars: 1, createdAt: -1 });
MediaContentItemSchema.index(
  { legacyMediaPostId: 1 },
  {
    unique: true,
    partialFilterExpression: { legacyMediaPostId: { $type: 'objectId' } },
  },
);
MediaContentItemSchema.index({
  title: 'text',
  thesis: 'text',
  canonicalBody: 'text',
  story: 'text',
  evidence: 'text',
  contentPillars: 'text',
});
