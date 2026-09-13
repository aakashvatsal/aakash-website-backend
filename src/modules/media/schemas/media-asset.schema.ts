import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaSourceType } from './media-post.schema';

export type MediaAssetDocument = HydratedDocument<MediaAsset>;

export enum MediaAssetType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  THUMBNAIL = 'thumbnail',
  CAROUSEL = 'carousel',
  BROLL = 'broll',
  OTHER = 'other',
}

export enum MediaAssetStatus {
  PLANNED = 'planned',
  READY = 'ready',
  ARCHIVED = 'archived',
}

@Schema({ timestamps: true, collection: 'media_assets' })
export class MediaAsset {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaContentItem', index: true })
  contentItemId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  publicationId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaAssetType, required: true, index: true })
  type: MediaAssetType;

  @Prop({ trim: true })
  role?: string;

  @Prop({ trim: true, index: true })
  productionRequirementKey?: string;

  @Prop({ default: true })
  required: boolean;

  @Prop({ default: false, index: true })
  generatedFromProduction: boolean;

  @Prop({ type: String, enum: MediaSourceType, default: MediaSourceType.NONE })
  source: MediaSourceType;

  @Prop({ trim: true })
  url?: string;

  @Prop({ trim: true })
  storageKey?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaAsset', index: true })
  librarySourceAssetId?: Types.ObjectId;

  @Prop({ trim: true })
  storageProvider?: string;

  @Prop({ trim: true })
  originalName?: string;

  @Prop({ trim: true })
  mimeType?: string;

  @Prop({ min: 0 })
  sizeBytes?: number;

  @Prop({ default: false, index: true })
  libraryReusable: boolean;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ trim: true })
  etag?: string;

  @Prop()
  uploadedAt?: Date;

  @Prop({ trim: true })
  prompt?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({
    type: String,
    enum: MediaAssetStatus,
    default: MediaAssetStatus.PLANNED,
    index: true,
  })
  status: MediaAssetStatus;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
MediaAssetSchema.index({ contentItemId: 1, publicationId: 1, createdAt: -1 });
MediaAssetSchema.index(
  { publicationId: 1, productionRequirementKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      publicationId: { $type: 'objectId' },
      productionRequirementKey: { $type: 'string' },
    },
  },
);
