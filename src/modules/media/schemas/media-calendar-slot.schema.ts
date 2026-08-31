import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import { MediaPlatform } from './media-post.schema';

export type MediaCalendarSlotDocument = HydratedDocument<MediaCalendarSlot>;

export enum MediaCalendarSlotStatus {
  OPEN = 'open',
  RESERVED = 'reserved',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true, collection: 'media_calendar_slots' })
export class MediaCalendarSlot {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MediaAccount',
    required: true,
    index: true,
  })
  accountId: Types.ObjectId;

  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ required: true, index: true })
  startsAt: Date;

  @Prop({ required: true, trim: true, index: true })
  localDate: string;

  @Prop({ required: true, trim: true, unique: true })
  slotKey: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'MediaPublication', index: true })
  publicationId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: MediaCalendarSlotStatus,
    default: MediaCalendarSlotStatus.OPEN,
    index: true,
  })
  status: MediaCalendarSlotStatus;

  @Prop({ default: false })
  autoPublish: boolean;

  @Prop()
  scheduleApprovedAt?: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaCalendarSlotSchema =
  SchemaFactory.createForClass(MediaCalendarSlot);

MediaCalendarSlotSchema.index({ accountId: 1, startsAt: 1 });
MediaCalendarSlotSchema.index({ platform: 1, startsAt: 1, status: 1 });
