import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import {
  ProactiveSignalCategory,
  ProactiveSignalSeverity,
  ProactiveSignalStatus,
} from '../dto/proactive.dto';

export type ProactiveSignalDocument = HydratedDocument<ProactiveSignal>;

export type ProactiveSignalEvidence = {
  citationId: string;
  nodeKey: string;
  type: string;
  label: string;
  sourceCollection: string;
  sourceId: string;
  occurredAt?: Date | null;
};

export type ProactiveProposedAction = {
  label: string;
  kind: string;
  targetDomain: string;
  targetNodeKey?: string;
  reason: string;
  consequential: boolean;
  requiresConfirmation: boolean;
  status: 'pending_confirmation' | 'approved' | 'rejected' | 'not_required';
  decidedAt?: Date;
};

@Schema({ timestamps: true, collection: 'hsakaa_proactive_signals' })
export class ProactiveSignal {
  @Prop({ required: true, trim: true, unique: true, index: true })
  fingerprint: string;

  @Prop({
    type: String,
    enum: ProactiveSignalCategory,
    required: true,
    index: true,
  })
  category: ProactiveSignalCategory;

  @Prop({ required: true, trim: true, maxlength: 240 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  summary: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  whyNow: string;

  @Prop({
    type: String,
    enum: ProactiveSignalSeverity,
    default: ProactiveSignalSeverity.MEDIUM,
    index: true,
  })
  severity: ProactiveSignalSeverity;

  @Prop({
    type: String,
    enum: ProactiveSignalStatus,
    default: ProactiveSignalStatus.OPEN,
    index: true,
  })
  status: ProactiveSignalStatus;

  @Prop({ min: 0, max: 1, default: 0.5 })
  confidence: number;

  @Prop({ min: 0, max: 1, default: 0.5, index: true })
  priorityScore: number;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  evidence: ProactiveSignalEvidence[];

  @Prop({ type: SchemaTypes.Mixed })
  proposedAction?: ProactiveProposedAction;

  @Prop({ required: true, default: Date.now, index: true })
  firstDetectedAt: Date;

  @Prop({ required: true, default: Date.now, index: true })
  lastDetectedAt: Date;

  @Prop({ default: 1, min: 1 })
  timesDetected: number;

  @Prop({ index: true })
  snoozedUntil?: Date;

  @Prop({ trim: true, enum: ['ai', 'fallback'], default: 'ai' })
  generatedBy: 'ai' | 'fallback';

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const ProactiveSignalSchema =
  SchemaFactory.createForClass(ProactiveSignal);

ProactiveSignalSchema.index({
  status: 1,
  priorityScore: -1,
  lastDetectedAt: -1,
});
ProactiveSignalSchema.index({ category: 1, status: 1, lastDetectedAt: -1 });
