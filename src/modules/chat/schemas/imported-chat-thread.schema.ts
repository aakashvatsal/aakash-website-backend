import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ImportedChatThreadDocument = HydratedDocument<ImportedChatThread>;

export enum ImportedChatChannel {
  WHATSAPP = 'whatsapp',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  X = 'x',
  SLACK = 'slack',
  SMS = 'sms',
  OTHER = 'other',
}

@Schema({ timestamps: true, collection: 'imported_chat_threads' })
export class ImportedChatThread {
  @Prop({ required: true, trim: true, maxlength: 240 })
  title: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    default: null,
    index: true,
  })
  personId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: ImportedChatChannel,
    default: ImportedChatChannel.OTHER,
    index: true,
  })
  channel: ImportedChatChannel;

  @Prop({ trim: true, maxlength: 200 })
  sourceLabel?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ min: 0, default: 0 })
  messageCount: number;

  @Prop({ min: 0, default: 0 })
  ownerMessageCount: number;

  @Prop({ index: true })
  lastMessageAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const ImportedChatThreadSchema =
  SchemaFactory.createForClass(ImportedChatThread);

ImportedChatThreadSchema.index({ isActive: 1, lastMessageAt: -1 });
ImportedChatThreadSchema.index({ personId: 1, isActive: 1, lastMessageAt: -1 });
