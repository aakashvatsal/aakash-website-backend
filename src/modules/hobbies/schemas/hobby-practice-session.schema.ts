import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HobbyPracticeSessionDocument =
  HydratedDocument<HobbyPracticeSession>;

export enum HobbyPracticeStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum HobbyPracticeSource {
  TIMER = 'timer',
  MANUAL = 'manual',
  HSAKAA = 'hsakaa',
  TASK = 'task',
  CALENDAR = 'calendar',
  IMPORT = 'import',
}

export enum HobbyEvidenceType {
  AUDIO = 'audio',
  VIDEO = 'video',
  PHOTO = 'photo',
  NOTE = 'note',
  FILE = 'file',
  OTHER = 'other',
}

@Schema({ _id: false })
export class HobbyPracticeEvidence {
  @Prop({ type: String, enum: HobbyEvidenceType, required: true })
  type: HobbyEvidenceType;

  @Prop({ trim: true })
  url?: string;

  @Prop({ trim: true })
  description?: string;
}

export const HobbyPracticeEvidenceSchema = SchemaFactory.createForClass(
  HobbyPracticeEvidence,
);

@Schema({ timestamps: true, collection: 'hobby_practice_sessions' })
export class HobbyPracticeSession {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'Hobby',
    required: true,
    index: true,
  })
  hobbyId: Types.ObjectId;

  @Prop({
    type: String,
    enum: HobbyPracticeStatus,
    default: HobbyPracticeStatus.IN_PROGRESS,
    index: true,
  })
  status: HobbyPracticeStatus;

  @Prop({ required: true, default: Date.now, index: true })
  startedAt: Date;

  @Prop()
  endedAt?: Date;

  @Prop({ min: 0, default: 0 })
  durationMinutes: number;

  @Prop({ trim: true, maxlength: 1000 })
  focus?: string;

  @Prop({ trim: true, maxlength: 4000 })
  notes?: string;

  @Prop({ trim: true, maxlength: 4000 })
  reflection?: string;

  @Prop({ min: 1, max: 5 })
  difficulty?: number;

  @Prop({ min: 1, max: 5 })
  enjoyment?: number;

  @Prop({ type: [HobbyPracticeEvidenceSchema], default: [] })
  evidence: HobbyPracticeEvidence[];

  @Prop({
    type: String,
    enum: HobbyPracticeSource,
    default: HobbyPracticeSource.MANUAL,
  })
  source: HobbyPracticeSource;

  @Prop({ default: false, index: true })
  ownerConfirmed: boolean;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Task' })
  taskId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'NowStatus' })
  nowStatusId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const HobbyPracticeSessionSchema =
  SchemaFactory.createForClass(HobbyPracticeSession);

HobbyPracticeSessionSchema.index({ hobbyId: 1, startedAt: -1 });
HobbyPracticeSessionSchema.index({ status: 1, startedAt: -1 });
