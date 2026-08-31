import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type KnowledgeGraphEdgeDocument = HydratedDocument<KnowledgeGraphEdge>;

export enum KnowledgeGraphEdgeType {
  PERSON_RELATIONSHIP = 'person_relationship',
  MENTIONS = 'mentions',
  RELATED_TO = 'related_to',
  BELONGS_TO_COMPANY = 'belongs_to_company',
  INVOLVES_PERSON = 'involves_person',
  REFERENCES = 'references',
  RECORDED_IN = 'recorded_in',
  DERIVED_FROM = 'derived_from',
  HAS_HIGHLIGHT = 'has_highlight',
  INFLUENCED_IDEA = 'influenced_idea',
  SUPPORTS = 'supports',
  CONTRADICTS = 'contradicts',
  SUPERSEDES = 'supersedes',
  PARENT_OF = 'parent_of',
}

export enum KnowledgeGraphEdgeDirection {
  DIRECTED = 'directed',
  UNDIRECTED = 'undirected',
}

@Schema({ _id: false })
export class KnowledgeGraphEvidence {
  @Prop({ trim: true })
  sourceNodeKey?: string;

  @Prop({ required: true, trim: true })
  sourceCollection: string;

  @Prop({ required: true, trim: true })
  sourceId: string;

  @Prop({ trim: true })
  fieldPath?: string;

  @Prop({ trim: true, maxlength: 1000 })
  note?: string;

  @Prop()
  occurredAt?: Date;
}

export const KnowledgeGraphEvidenceSchema = SchemaFactory.createForClass(
  KnowledgeGraphEvidence,
);

@Schema({ timestamps: true, collection: 'knowledge_graph_edges' })
export class KnowledgeGraphEdge {
  @Prop({ required: true, trim: true, unique: true, index: true })
  edgeKey: string;

  @Prop({ required: true, trim: true, index: true })
  sourceNodeKey: string;

  @Prop({ required: true, trim: true, index: true })
  targetNodeKey: string;

  @Prop({
    type: String,
    enum: KnowledgeGraphEdgeType,
    required: true,
    index: true,
  })
  type: KnowledgeGraphEdgeType;

  @Prop({ trim: true })
  label?: string;

  @Prop({ min: 0, max: 1, default: 0.7 })
  strength: number;

  @Prop({
    type: String,
    enum: KnowledgeGraphEdgeDirection,
    default: KnowledgeGraphEdgeDirection.DIRECTED,
  })
  direction: KnowledgeGraphEdgeDirection;

  @Prop({ type: [KnowledgeGraphEvidenceSchema], default: [] })
  evidence: KnowledgeGraphEvidence[];

  @Prop({ index: true })
  occurredAt?: Date;

  @Prop()
  validFrom?: Date;

  @Prop()
  validTo?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true })
  isDerived: boolean;

  @Prop({ required: true, default: Date.now, index: true })
  lastSyncedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const KnowledgeGraphEdgeSchema =
  SchemaFactory.createForClass(KnowledgeGraphEdge);

KnowledgeGraphEdgeSchema.index({ sourceNodeKey: 1, type: 1, isActive: 1 });
KnowledgeGraphEdgeSchema.index({ targetNodeKey: 1, type: 1, isActive: 1 });
KnowledgeGraphEdgeSchema.index({ occurredAt: -1, type: 1, isActive: 1 });
