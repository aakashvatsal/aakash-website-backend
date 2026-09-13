import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

export enum ConversationChannel {
  PUBLIC = 'public',
  OWNER = 'owner',
  VERIFIED_PERSON = 'verified_person',
}

@Schema({
  timestamps: true,
  collection: 'conversations',
})
export class Conversation {
  @Prop({
    trim: true,
    index: true,
  })
  sessionId?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    default: null,
    index: true,
  })
  personId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: ConversationChannel,
    default: ConversationChannel.PUBLIC,
    index: true,
  })
  channel: ConversationChannel;

  @Prop({
    trim: true,
    default: 'Chat',
  })
  mode: string;

  @Prop({
    default: 'New conversation',
    trim: true,
  })
  title: string;

  @Prop({
    default: true,
    index: true,
  })
  isActive: boolean;

  @Prop()
  lastMessageAt?: Date;

  @Prop({
    default: 0,
    min: 0,
  })
  messageCount: number;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({
  sessionId: 1,
  channel: 1,
  isActive: 1,
  lastMessageAt: -1,
});

ConversationSchema.index({
  personId: 1,
  channel: 1,
  isActive: 1,
  lastMessageAt: -1,
});
