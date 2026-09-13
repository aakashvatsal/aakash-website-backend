import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { PersonalOsRuntimeRunStatus } from './personal-os-runtime-run.schema';

export type PersonalOsMorningRunDocument =
  HydratedDocument<PersonalOsMorningRun>;

@Schema({ timestamps: true, collection: 'personal_os_morning_runs' })
export class PersonalOsMorningRun {
  @Prop({ required: true, trim: true, unique: true, index: true })
  runId: string;

  @Prop({ required: true, trim: true, default: 'morning_manual', index: true })
  mode: 'morning_manual';

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
  snapshot: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  summary: Record<string, unknown>;

  @Prop({ trim: true, maxlength: 4000 })
  error?: string;
}

export const PersonalOsMorningRunSchema =
  SchemaFactory.createForClass(PersonalOsMorningRun);

PersonalOsMorningRunSchema.index({ startedAt: -1, status: 1 });
