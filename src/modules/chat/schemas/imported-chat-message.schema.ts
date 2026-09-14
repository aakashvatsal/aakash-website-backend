import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ImportedChatMessageDocument = HydratedDocument<ImportedChatMessage>;

export enum ImportedChatAuthor {
  OWNER = 'owner',
  PERSON = 'person',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'imported_chat_messages' })
export class ImportedChatMessage {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'ImportedChatThread',
    required: true,
    index: true,
  })
  threadId: Types.ObjectId;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    default: null,
    index: true,
  })
  personId?: Types.ObjectId | null;

  @Prop({ type: String, enum: ImportedChatAuthor, required: true, index: true })
  author: ImportedChatAuthor;

  @Prop({ required: true, trim: true, maxlength: 12000 })
  content: string;

  @Prop({ required: true, index: true })
  sentAt: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const ImportedChatMessageSchema =
  SchemaFactory.createForClass(ImportedChatMessage);

ImportedChatMessageSchema.index({ threadId: 1, sentAt: 1 });
ImportedChatMessageSchema.index({ personId: 1, author: 1, sentAt: -1 });
