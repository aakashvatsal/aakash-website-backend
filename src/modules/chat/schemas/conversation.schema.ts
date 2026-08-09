import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({
  timestamps: true,
  collection: 'conversations',
})
export class Conversation {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    default: 'New conversation',
  })
  title: string;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop()
  lastMessageAt?: Date;
}

export const ConversationSchema =
  SchemaFactory.createForClass(Conversation);