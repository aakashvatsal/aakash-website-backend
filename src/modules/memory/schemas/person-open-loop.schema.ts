import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PersonOpenLoopDocument = HydratedDocument<PersonOpenLoop>;

export enum PersonOpenLoopKind {
  PROMISE_I_MADE = 'promise_i_made',
  PROMISE_THEY_MADE = 'promise_they_made',
  UNANSWERED_QUESTION = 'unanswered_question',
  PENDING_INTRODUCTION = 'pending_introduction',
  MEETING_TO_SCHEDULE = 'meeting_to_schedule',
  THING_TO_ASK = 'thing_to_ask',
  FOLLOW_UP = 'follow_up',
  OTHER = 'other',
}

export enum PersonOpenLoopStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Schema({
  timestamps: true,
  collection: 'person_open_loops',
})
export class PersonOpenLoop {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    index: true,
  })
  personId: Types.ObjectId;

  @Prop({
    type: String,
    enum: PersonOpenLoopKind,
    required: true,
    index: true,
  })
  kind: PersonOpenLoopKind;

  @Prop({
    type: String,
    enum: PersonOpenLoopStatus,
    default: PersonOpenLoopStatus.OPEN,
    index: true,
  })
  status: PersonOpenLoopStatus;

  @Prop({ required: true, trim: true, maxlength: 500 })
  title: string;

  @Prop({ trim: true, maxlength: 5000 })
  details?: string;

  @Prop({ index: true })
  dueAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'PersonInteraction' })
  sourceInteractionId?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  dismissedAt?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  resolutionNote?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const PersonOpenLoopSchema =
  SchemaFactory.createForClass(PersonOpenLoop);

PersonOpenLoopSchema.index({ personId: 1, status: 1, dueAt: 1 });
PersonOpenLoopSchema.index({ status: 1, dueAt: 1, createdAt: -1 });
PersonOpenLoopSchema.index({ kind: 1, status: 1, dueAt: 1 });
