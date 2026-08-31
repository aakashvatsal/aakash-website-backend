import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform, MediaPostType } from './media-post.schema';

export type MediaContentMemoryDocument = HydratedDocument<MediaContentMemory>;

export enum MediaContentMemoryScope {
  CONTENT = 'content',
  PUBLICATION = 'publication',
  REJECTED_CANDIDATE = 'rejected_candidate',
}

export enum MediaContentMemoryStatus {
  ACTIVE = 'active',
  REJECTED = 'rejected',
  ARCHIVED = 'archived',
}

export enum MediaRepetitionRisk {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  BLOCKED = 'blocked',
}

@Schema({ _id: false })
export class MediaSimilarityMatch {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaContentMemory' })
  memoryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaContentItem' })
  contentItemId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication' })
  publicationId?: Types.ObjectId;

  @Prop({ min: 0, max: 1, required: true })
  score: number;

  @Prop({ min: 0, max: 1 })
  semanticScore?: number;

  @Prop({ min: 0, max: 1 })
  lexicalScore?: number;

  @Prop({ min: 0, max: 1 })
  componentScore?: number;

  @Prop({ type: [String], default: [] })
  reasons: string[];
}

const MediaSimilarityMatchSchema =
  SchemaFactory.createForClass(MediaSimilarityMatch);

@Schema({ timestamps: true, collection: 'media_content_memory' })
export class MediaContentMemory {
  @Prop({
    type: String,
    enum: MediaContentMemoryScope,
    required: true,
    index: true,
  })
  scope: MediaContentMemoryScope;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaContentItem', index: true })
  contentItemId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  publicationId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaGenerationRun', index: true })
  generationRunId?: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, index: true })
  platform?: MediaPlatform;

  @Prop({ type: String, enum: MediaPostType, index: true })
  format?: MediaPostType;

  @Prop({ trim: true })
  title?: string;

  @Prop({ trim: true })
  topic?: string;

  @Prop({ trim: true })
  thesis?: string;

  @Prop({ trim: true })
  angle?: string;

  @Prop({ trim: true })
  hookArchetype?: string;

  @Prop({ trim: true })
  openingPattern?: string;

  @Prop({ type: [String], default: [] })
  storyKeys: string[];

  @Prop({ type: [String], default: [] })
  exampleKeys: string[];

  @Prop({ type: [String], default: [] })
  structure: string[];

  @Prop({ trim: true })
  ctaArchetype?: string;

  @Prop({ trim: true })
  visualConcept?: string;

  @Prop({ type: [String], default: [] })
  keyPhrases: string[];

  @Prop({ type: [String], default: [] })
  entities: string[];

  @Prop({ trim: true })
  emotionalTone?: string;

  @Prop({ required: true, trim: true })
  normalizedText: string;

  @Prop({ type: [String], default: [] })
  lexicalSignature: string[];

  @Prop({ type: [Number], default: undefined, select: false })
  embedding?: number[];

  @Prop({ trim: true })
  embeddingModel?: string;

  @Prop()
  embeddingGeneratedAt?: Date;

  @Prop({ min: 0, max: 100, default: 100 })
  noveltyScore: number;

  @Prop({
    type: String,
    enum: MediaRepetitionRisk,
    default: MediaRepetitionRisk.LOW,
    index: true,
  })
  repetitionRisk: MediaRepetitionRisk;

  @Prop({ type: [MediaSimilarityMatchSchema], default: [] })
  similarMatches: MediaSimilarityMatch[];

  @Prop({
    type: String,
    enum: MediaContentMemoryStatus,
    default: MediaContentMemoryStatus.ACTIVE,
    index: true,
  })
  status: MediaContentMemoryStatus;

  @Prop({ default: false })
  intentionalRepurpose: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaContentMemorySchema =
  SchemaFactory.createForClass(MediaContentMemory);

MediaContentMemorySchema.index({ scope: 1, createdAt: -1 });
MediaContentMemorySchema.index({ repetitionRisk: 1, createdAt: -1 });
MediaContentMemorySchema.index({ status: 1, createdAt: -1 });
MediaContentMemorySchema.index(
  { contentItemId: 1, scope: 1 },
  {
    unique: true,
    partialFilterExpression: {
      contentItemId: { $type: 'objectId' },
      scope: MediaContentMemoryScope.CONTENT,
    },
  },
);
MediaContentMemorySchema.index(
  { publicationId: 1, scope: 1 },
  {
    unique: true,
    partialFilterExpression: {
      publicationId: { $type: 'objectId' },
      scope: MediaContentMemoryScope.PUBLICATION,
    },
  },
);
MediaContentMemorySchema.index({
  title: 'text',
  topic: 'text',
  thesis: 'text',
  angle: 'text',
  hookArchetype: 'text',
  keyPhrases: 'text',
  storyKeys: 'text',
  exampleKeys: 'text',
  normalizedText: 'text',
});
