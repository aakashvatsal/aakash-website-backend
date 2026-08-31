import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type KnowledgeGraphNodeDocument = HydratedDocument<KnowledgeGraphNode>;

export enum KnowledgeGraphNodeType {
  PERSON = 'person',
  COMPANY = 'company',
  DECISION = 'decision',
  JOURNAL = 'journal',
  MEMORY = 'memory',
  BOOK = 'book',
  HIGHLIGHT = 'highlight',
  HEALTH = 'health',
  MEDIA = 'media',
  TASK = 'task',
}

export enum KnowledgeGraphPrivacy {
  OWNER_ONLY = 'owner_only',
  PUBLIC_SAFE = 'public_safe',
}

@Schema({ timestamps: true, collection: 'knowledge_graph_nodes' })
export class KnowledgeGraphNode {
  @Prop({ required: true, trim: true, unique: true, index: true })
  nodeKey: string;

  @Prop({
    type: String,
    enum: KnowledgeGraphNodeType,
    required: true,
    index: true,
  })
  type: KnowledgeGraphNodeType;

  @Prop({ required: true, trim: true, index: true })
  sourceCollection: string;

  @Prop({ required: true, trim: true, index: true })
  sourceId: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ trim: true, maxlength: 4000 })
  summary?: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ min: 0, max: 1, default: 0.5, index: true })
  importance: number;

  @Prop({
    type: String,
    enum: KnowledgeGraphPrivacy,
    default: KnowledgeGraphPrivacy.OWNER_ONLY,
    index: true,
  })
  privacy: KnowledgeGraphPrivacy;

  @Prop({ index: true })
  occurredAt?: Date;

  @Prop()
  validFrom?: Date;

  @Prop()
  validTo?: Date;

  @Prop()
  sourceCreatedAt?: Date;

  @Prop()
  sourceUpdatedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ trim: true, select: false })
  searchText?: string;

  @Prop({ required: true, default: Date.now, index: true })
  lastSyncedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const KnowledgeGraphNodeSchema =
  SchemaFactory.createForClass(KnowledgeGraphNode);

KnowledgeGraphNodeSchema.index({ type: 1, occurredAt: -1, importance: -1 });
KnowledgeGraphNodeSchema.index(
  { sourceCollection: 1, sourceId: 1 },
  { unique: true },
);
KnowledgeGraphNodeSchema.index({
  label: 'text',
  summary: 'text',
  aliases: 'text',
  tags: 'text',
  searchText: 'text',
});
