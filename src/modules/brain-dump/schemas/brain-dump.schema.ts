import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type BrainDumpDocument = HydratedDocument<BrainDump>;

export enum BrainDumpStatus {
  INBOX = 'inbox',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  DISCARDED = 'discarded',
}

export enum BrainDumpSource {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  VOICE = 'voice',
  INTEGRATION = 'integration',
}

export enum BrainDumpTarget {
  TASK = 'task',
  JOURNAL = 'journal',
  MEMORY = 'memory',
}

@Schema({
  timestamps: true,
  collection: 'brain_dump',
})
export class BrainDump {
  @Prop({
    required: true,
    trim: true,
    maxlength: 12000,
  })
  content: string;

  @Prop({
    trim: true,
    maxlength: 220,
  })
  title?: string;

  @Prop({
    type: String,
    enum: BrainDumpStatus,
    default: BrainDumpStatus.INBOX,
    index: true,
  })
  status: BrainDumpStatus;

  @Prop({
    type: String,
    enum: BrainDumpSource,
    default: BrainDumpSource.MANUAL,
    index: true,
  })
  source: BrainDumpSource;

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    default: false,
    index: true,
  })
  isFavourite: boolean;

  @Prop({
    type: String,
    enum: BrainDumpTarget,
  })
  processedAs?: BrainDumpTarget;

  @Prop({
    type: SchemaTypes.ObjectId,
  })
  processedEntityId?: Types.ObjectId;

  @Prop()
  processedAt?: Date;

  @Prop()
  discardedAt?: Date;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: true,
    index: true,
  })
  isActive: boolean;

  @Prop({
    default: false,
    index: true,
  })
  isArchived: boolean;

  @Prop()
  archivedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BrainDumpSchema = SchemaFactory.createForClass(BrainDump);

BrainDumpSchema.index({ status: 1, isArchived: 1, createdAt: -1 });
BrainDumpSchema.index({ tags: 1, isArchived: 1, createdAt: -1 });
BrainDumpSchema.index({ isFavourite: 1, status: 1, isArchived: 1 });
BrainDumpSchema.index({ content: 'text', title: 'text' });
