import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type PersonalOsRuntimeRunDocument =
  HydratedDocument<PersonalOsRuntimeRun>;

export enum PersonalOsRuntimeRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  PARTIAL = 'partial',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'personal_os_runtime_runs' })
export class PersonalOsRuntimeRun {
  @Prop({ required: true, trim: true, unique: true, index: true })
  runId: string;

  @Prop({ required: true, trim: true, default: 'manual', index: true })
  mode: 'manual';

  @Prop({
    type: String,
    enum: PersonalOsRuntimeRunStatus,
    required: true,
    default: PersonalOsRuntimeRunStatus.RUNNING,
    index: true,
  })
  status: PersonalOsRuntimeRunStatus;

  @Prop({ required: true, default: Date.now, index: true })
  requestedAt: Date;

  @Prop({ required: true, default: Date.now })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  options: Record<string, unknown>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  stages: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  summary: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 4000 })
  error?: string;
}

export const PersonalOsRuntimeRunSchema =
  SchemaFactory.createForClass(PersonalOsRuntimeRun);

PersonalOsRuntimeRunSchema.index({ startedAt: -1, status: 1 });
