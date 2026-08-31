import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PersonGraphEdgeDocument = HydratedDocument<PersonGraphEdge>;

export enum PersonGraphRelationshipKind {
  KNOWS = 'knows',
  FRIEND = 'friend',
  FAMILY = 'family',
  COLLEAGUE = 'colleague',
  WORKS_WITH = 'works_with',
  COFOUNDER = 'cofounder',
  REPORTS_TO = 'reports_to',
  MANAGES = 'manages',
  ADVISOR_TO = 'advisor_to',
  INVESTOR_IN = 'investor_in',
  CLIENT_OF = 'client_of',
  INTRODUCED = 'introduced',
  OTHER = 'other',
}

export enum PersonGraphEdgeSource {
  MANUAL = 'manual',
  RELATIONSHIP_CONTEXT = 'relationship_context',
}

@Schema({
  timestamps: true,
  collection: 'person_graph_edges',
})
export class PersonGraphEdge {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    index: true,
  })
  sourcePersonId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    index: true,
  })
  targetPersonId: Types.ObjectId;

  @Prop({
    type: String,
    enum: PersonGraphRelationshipKind,
    default: PersonGraphRelationshipKind.KNOWS,
    index: true,
  })
  kind: PersonGraphRelationshipKind;

  @Prop({ trim: true, maxlength: 200 })
  label?: string;

  @Prop({ type: [String], default: [], index: true })
  contexts: string[];

  /**
   * Optional explicit human-entered relationship strength. This is never
   * calculated by HSAKAA and should not be treated as an AI confidence score.
   */
  @Prop({ min: 1, max: 5 })
  strength?: number;

  @Prop({ trim: true, maxlength: 3000 })
  notes?: string;

  @Prop({
    type: String,
    enum: PersonGraphEdgeSource,
    default: PersonGraphEdgeSource.MANUAL,
    index: true,
  })
  source: PersonGraphEdgeSource;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const PersonGraphEdgeSchema =
  SchemaFactory.createForClass(PersonGraphEdge);

PersonGraphEdgeSchema.index(
  {
    sourcePersonId: 1,
    targetPersonId: 1,
    kind: 1,
  },
  {
    name: 'person_graph_active_edge_unique',
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

PersonGraphEdgeSchema.index({ sourcePersonId: 1, isActive: 1, updatedAt: -1 });
PersonGraphEdgeSchema.index({ targetPersonId: 1, isActive: 1, updatedAt: -1 });
