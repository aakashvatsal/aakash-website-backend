import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PersonRelationshipContextDocument =
  HydratedDocument<PersonRelationshipContext>;

@Schema({
  timestamps: true,
  collection: 'person_relationship_contexts',
})
export class PersonRelationshipContext {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    unique: true,
    index: true,
  })
  personId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
  })
  introducedByPersonId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 2000 })
  howWeMet?: string;

  @Prop({ type: [String], default: [], index: true })
  connectionContexts: string[];

  @Prop({ min: 1, max: 3650 })
  preferredContactCadenceDays?: number;

  @Prop({ trim: true, maxlength: 5000 })
  relationshipNotes?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const PersonRelationshipContextSchema = SchemaFactory.createForClass(
  PersonRelationshipContext,
);

PersonRelationshipContextSchema.index({ introducedByPersonId: 1 });
PersonRelationshipContextSchema.index({ connectionContexts: 1, personId: 1 });
