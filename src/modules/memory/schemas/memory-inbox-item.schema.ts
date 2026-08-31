import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

import {
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryEntityReference,
  MemoryEntityReferenceSchema,
  MemoryPersonLink,
  MemoryPersonLinkSchema,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
  MemorySourceReference,
  MemorySourceReferenceSchema,
  MemoryType,
  MemoryVerificationStatus,
} from './memory.schema';

export type MemoryInboxItemDocument = HydratedDocument<MemoryInboxItem>;

export enum MemoryInboxStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({
  timestamps: true,
  collection: 'memory_inbox',
})
export class MemoryInboxItem {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    default: null,
    index: true,
  })
  personId?: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: MemoryScope,
    default: MemoryScope.GENERAL,
    index: true,
  })
  scope: MemoryScope;

  @Prop({ type: [MemoryPersonLinkSchema], default: [] })
  personLinks: MemoryPersonLink[];

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ required: true, trim: true, select: false })
  contentHash: string;

  @Prop({
    type: String,
    enum: MemoryType,
    default: MemoryType.FACT,
    index: true,
  })
  type: MemoryType;

  @Prop({
    type: String,
    enum: MemorySource,
    default: MemorySource.MANUAL,
    index: true,
  })
  source: MemorySource;

  @Prop({
    type: MemorySourceReferenceSchema,
    default: undefined,
  })
  sourceReference?: MemorySourceReference;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [], index: true })
  categories: string[];

  @Prop({ type: [MemoryEntityReferenceSchema], default: [] })
  entities: MemoryEntityReference[];

  @Prop({ min: 0, max: 1, default: 0.5 })
  importance: number;

  @Prop({ min: 0, max: 1, default: 0.5 })
  confidence: number;

  @Prop({
    type: String,
    enum: MemoryVerificationStatus,
    default: MemoryVerificationStatus.UNVERIFIED,
    index: true,
  })
  verificationStatus: MemoryVerificationStatus;

  @Prop({
    type: String,
    enum: MemoryAccessLevel,
    default: MemoryAccessLevel.OWNER_ONLY,
    index: true,
  })
  accessLevel: MemoryAccessLevel;

  @Prop({
    type: String,
    enum: MemorySensitivity,
    default: MemorySensitivity.PERSONAL,
    index: true,
  })
  sensitivity: MemorySensitivity;

  @Prop({
    type: String,
    enum: MemoryDurability,
    default: MemoryDurability.DURABLE,
    index: true,
  })
  durability: MemoryDurability;

  @Prop({
    type: String,
    enum: MemoryCaptureOrigin,
    default: MemoryCaptureOrigin.MANUAL,
    index: true,
  })
  captureOrigin: MemoryCaptureOrigin;

  @Prop({ default: Date.now, index: true })
  capturedAt: Date;

  @Prop({ index: true })
  happenedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  proposalReason?: string;

  @Prop({
    type: String,
    enum: MemoryInboxStatus,
    default: MemoryInboxStatus.PENDING,
    index: true,
  })
  status: MemoryInboxStatus;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Memory',
    index: true,
  })
  acceptedMemoryId?: Types.ObjectId;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  @Prop({ trim: true, maxlength: 1000 })
  rejectionReason?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MemoryInboxItemSchema =
  SchemaFactory.createForClass(MemoryInboxItem);

MemoryInboxItemSchema.index({
  status: 1,
  capturedAt: -1,
  isActive: 1,
});

MemoryInboxItemSchema.index({
  scope: 1,
  'personLinks.personId': 1,
  status: 1,
  isActive: 1,
});

MemoryInboxItemSchema.index({
  contentHash: 1,
  type: 1,
  status: 1,
  isActive: 1,
});
