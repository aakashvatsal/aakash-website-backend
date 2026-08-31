import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PersonInteractionDocument = HydratedDocument<PersonInteraction>;

export enum PersonInteractionType {
  MEETING = 'meeting',
  CALL = 'call',
  MESSAGE = 'message',
  EMAIL = 'email',
  NOTE = 'note',
  INTRODUCTION = 'introduction',
  SHARED_ACTIVITY = 'shared_activity',
}

export enum PersonInteractionChannel {
  IN_PERSON = 'in_person',
  PHONE = 'phone',
  VIDEO = 'video',
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  SLACK = 'slack',
  LINKEDIN = 'linkedin',
  CALENDAR = 'calendar',
  OTHER = 'other',
}

export enum PersonInteractionDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
  MUTUAL = 'mutual',
}

@Schema({
  timestamps: true,
  collection: 'person_interactions',
})
export class PersonInteraction {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    index: true,
  })
  primaryPersonId: Types.ObjectId;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'MemoryPerson',
    required: true,
    default: [],
    index: true,
  })
  participantIds: Types.ObjectId[];

  @Prop({
    type: String,
    enum: PersonInteractionType,
    required: true,
    index: true,
  })
  type: PersonInteractionType;

  @Prop({
    type: String,
    enum: PersonInteractionChannel,
    default: PersonInteractionChannel.OTHER,
    index: true,
  })
  channel: PersonInteractionChannel;

  @Prop({
    type: String,
    enum: PersonInteractionDirection,
    default: PersonInteractionDirection.MUTUAL,
  })
  direction: PersonInteractionDirection;

  @Prop({ required: true, index: true })
  occurredAt: Date;

  @Prop({ min: 0, max: 24 * 60 })
  durationMinutes?: number;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  summary: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Memory' })
  linkedMemoryId?: Types.ObjectId;

  @Prop({ trim: true, maxlength: 200 })
  sourceLabel?: string;

  @Prop({ trim: true, maxlength: 2000 })
  sourceUrl?: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const PersonInteractionSchema =
  SchemaFactory.createForClass(PersonInteraction);

PersonInteractionSchema.index({ participantIds: 1, occurredAt: -1 });
PersonInteractionSchema.index({ primaryPersonId: 1, occurredAt: -1 });
PersonInteractionSchema.index({ type: 1, occurredAt: -1 });
