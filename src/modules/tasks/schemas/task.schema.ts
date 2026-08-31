import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

export enum TaskStatus {
  INBOX = 'inbox',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  WAITING = 'waiting',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TaskSource {
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  SYSTEM = 'system',
  INTEGRATION = 'integration',
  BRAIN_DUMP = 'brain_dump',
}

export enum TaskRecurrenceFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Schema({
  _id: false,
})
export class TaskRecurrence {
  @Prop({
    default: false,
  })
  enabled: boolean;

  @Prop({
    type: String,
    enum: TaskRecurrenceFrequency,
  })
  frequency?: TaskRecurrenceFrequency;

  @Prop({
    min: 1,
    max: 365,
    default: 1,
  })
  interval: number;

  @Prop()
  endAt?: Date;
}

export const TaskRecurrenceSchema =
  SchemaFactory.createForClass(TaskRecurrence);

@Schema({
  timestamps: true,
  collection: 'tasks',
})
export class Task {
  @Prop({
    required: true,
    trim: true,
    maxlength: 200,
    index: true,
  })
  title: string;

  @Prop({
    trim: true,
    maxlength: 5000,
  })
  description?: string;

  @Prop({
    type: String,
    enum: TaskStatus,
    default: TaskStatus.TODO,
    index: true,
  })
  status: TaskStatus;

  @Prop({
    type: String,
    enum: TaskPriority,
    default: TaskPriority.MEDIUM,
    index: true,
  })
  priority: TaskPriority;

  @Prop({
    trim: true,
    maxlength: 100,
    index: true,
  })
  area?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Company',
    index: true,
  })
  companyId?: Types.ObjectId;

  @Prop()
  startAt?: Date;

  @Prop({
    index: true,
  })
  dueAt?: Date;

  @Prop()
  reminderAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop({
    min: 0,
  })
  estimatedMinutes?: number;

  @Prop({
    min: 0,
  })
  actualMinutes?: number;

  @Prop({
    type: [String],
    default: [],
  })
  tags: string[];

  @Prop({
    type: TaskRecurrenceSchema,
    default: {
      enabled: false,
      interval: 1,
    },
  })
  recurrence: TaskRecurrence;

  @Prop({
    trim: true,
    index: true,
  })
  recurrenceSeriesId?: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Task',
    index: true,
  })
  parentTaskId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: TaskSource,
    default: TaskSource.MANUAL,
    index: true,
  })
  source: TaskSource;

  @Prop({
    trim: true,
  })
  sourceExternalId?: string;

  @Prop({
    trim: true,
  })
  sourceUrl?: string;

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'Memory',
    default: [],
  })
  memoryIds: Types.ObjectId[];

  @Prop({
    trim: true,
    maxlength: 5000,
  })
  notes?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: false,
    index: true,
  })
  isFavourite: boolean;

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
}

export const TaskSchema = SchemaFactory.createForClass(Task);

TaskSchema.index({
  status: 1,
  isArchived: 1,
  dueAt: 1,
});

TaskSchema.index({
  companyId: 1,
  status: 1,
  isArchived: 1,
});

TaskSchema.index({
  priority: 1,
  status: 1,
  isArchived: 1,
});

TaskSchema.index({
  tags: 1,
  isArchived: 1,
});

TaskSchema.index({
  title: 'text',
  description: 'text',
  tags: 'text',
});
