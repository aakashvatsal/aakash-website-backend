import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type MediaGenerationRunDocument = HydratedDocument<MediaGenerationRun>;

export enum MediaGenerationPurpose {
  IDEATION = 'ideation',
  REPURPOSE = 'repurpose',
  PLATFORM_ADAPTATION = 'platform_adaptation',
  REWRITE = 'rewrite',
  CALENDAR_FILL = 'calendar_fill',
  PRODUCTION = 'production',
  PLANNING = 'planning',
}

export enum MediaGenerationRunStatus {
  GENERATING = 'generating',
  GENERATED = 'generated',
  PARTIALLY_ACCEPTED = 'partially_accepted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  FAILED = 'failed',
}

@Schema({ timestamps: true, collection: 'media_generation_runs' })
export class MediaGenerationRun {
  @Prop({
    type: String,
    enum: MediaGenerationPurpose,
    required: true,
    index: true,
  })
  purpose: MediaGenerationPurpose;

  @Prop({
    type: String,
    enum: MediaGenerationRunStatus,
    default: MediaGenerationRunStatus.GENERATED,
    index: true,
  })
  status: MediaGenerationRunStatus;

  @Prop({ trim: true })
  aiModel?: string;

  @Prop({ trim: true })
  responseId?: string;

  @Prop({ trim: true })
  promptVersion?: string;

  @Prop({ trim: true })
  contextSummary?: string;

  @Prop({ trim: true })
  brief?: string;

  @Prop({ type: [String], default: [] })
  requestedPlatforms: string[];

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  strategySnapshot: Record<string, unknown>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  candidates: Array<Record<string, unknown>>;

  @Prop({ type: [String], default: [] })
  rankedCandidateKeys: string[];

  @Prop({ default: 0, min: 0 })
  candidateCount: number;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'MediaContentItem', default: [] })
  acceptedContentItemIds: Types.ObjectId[];

  @Prop({
    type: [SchemaTypes.ObjectId],
    ref: 'MediaContentMemory',
    default: [],
  })
  rejectedMemoryIds: Types.ObjectId[];

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaGenerationRunSchema =
  SchemaFactory.createForClass(MediaGenerationRun);

MediaGenerationRunSchema.index({ createdAt: -1 });
MediaGenerationRunSchema.index({ purpose: 1, status: 1, createdAt: -1 });
