import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HsakaaActionDocument = HydratedDocument<HsakaaAction>;

export enum HsakaaActionType {
  TASK_CREATE = 'task.create',
  TASK_UPDATE = 'task.update',
  TASK_STATUS = 'task.status',
  TASK_COMPLETE = 'task.complete',
  TASK_REOPEN = 'task.reopen',
  TASK_ARCHIVE = 'task.archive',
  BRAIN_DUMP_CREATE = 'brain_dump.create',
  BRAIN_DUMP_PROCESS = 'brain_dump.process',
  BRAIN_DUMP_DISCARD = 'brain_dump.discard',
  BRAIN_DUMP_REOPEN = 'brain_dump.reopen',
  BRAIN_DUMP_ARCHIVE = 'brain_dump.archive',
  JOURNAL_CREATE = 'journal.create',
  JOURNAL_UPDATE = 'journal.update',
  JOURNAL_APPEND = 'journal.append',
  JOURNAL_ARCHIVE = 'journal.archive',
  JOURNAL_RESTORE = 'journal.restore',
  MEMORY_CREATE = 'memory.create',
  MEMORY_UPDATE = 'memory.update',
  MEMORY_ARCHIVE = 'memory.archive',
  MEMORY_RESTORE = 'memory.restore',
  REMINDER_CREATE = 'reminder.create',
  REMINDER_SYNC = 'reminder.sync',
  REMINDER_SNOOZE = 'reminder.snooze',
  REMINDER_ACKNOWLEDGE = 'reminder.acknowledge',
  REMINDER_DISMISS = 'reminder.dismiss',
  REMINDER_REOPEN = 'reminder.reopen',
  DECISION_EXPERIMENT_CREATE = 'decision.experiment.create',
  DECISION_EVIDENCE_ADD = 'decision.evidence.add',
  DECISION_EXPERIMENT_COMPLETE = 'decision.experiment.complete',
  DECISION_REASSESS = 'decision.reassess',
  MEDIA_CANDIDATE_ACCEPT = 'media.candidate.accept',
  MEDIA_CANDIDATE_REJECT = 'media.candidate.reject',
  MEDIA_PRODUCTION_GENERATE = 'media.production.generate',
  MEDIA_PUBLICATION_SCHEDULE = 'media.publication.schedule',
  MEDIA_PUBLICATION_PUBLISH = 'media.publication.publish',
  MEDIA_ENGAGEMENT_REPLY = 'media.engagement.reply',
}

export enum HsakaaActionStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  EXECUTED = 'executed',
  REJECTED = 'rejected',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum HsakaaActionRisk {
  LOW = 'low',
  MEDIUM = 'medium',
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_actions',
})
export class HsakaaAction {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true,
  })
  conversationId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  requestId: string;

  @Prop({
    type: String,
    enum: HsakaaActionType,
    required: true,
    index: true,
  })
  actionType: HsakaaActionType;

  @Prop({
    type: String,
    enum: HsakaaActionStatus,
    default: HsakaaActionStatus.PENDING,
    index: true,
  })
  status: HsakaaActionStatus;

  @Prop({
    type: String,
    enum: HsakaaActionRisk,
    default: HsakaaActionRisk.LOW,
  })
  risk: HsakaaActionRisk;

  @Prop({ required: true, trim: true, maxlength: 500 })
  summary: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  preview: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  payload: Record<string, unknown>;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Task', index: true })
  targetTaskId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'BrainDump', index: true })
  targetBrainDumpId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'JournalEntry', index: true })
  targetJournalEntryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Memory', index: true })
  targetMemoryId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reminder', index: true })
  targetReminderId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'HsakaaDecisionCase', index: true })
  targetDecisionId?: Types.ObjectId;

  @Prop({ required: true, select: false })
  confirmationTokenHash: string;

  @Prop({ required: true, index: true })
  expiresAt: Date;

  @Prop()
  confirmedAt?: Date;

  @Prop()
  rejectedAt?: Date;

  @Prop()
  executedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed })
  result?: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 2000 })
  error?: string;
}

export const HsakaaActionSchema = SchemaFactory.createForClass(HsakaaAction);

HsakaaActionSchema.index({
  conversationId: 1,
  status: 1,
  createdAt: -1,
});

HsakaaActionSchema.index({
  requestId: 1,
  createdAt: -1,
});
