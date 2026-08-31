import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type HsakaaPatternDocument = HydratedDocument<HsakaaPatternReport>;

export type HsakaaPatternCategory =
  | 'tasks'
  | 'journal'
  | 'memory'
  | 'health'
  | 'brain_dump'
  | 'now'
  | 'reminders'
  | 'cross_domain';

export interface HsakaaPatternEvidence {
  source: string;
  label: string;
  detail: string;
  occurredAt?: string | null;
}

export interface HsakaaPatternInsight {
  title: string;
  category: HsakaaPatternCategory;
  confidence: number;
  significance: 'high' | 'medium' | 'low';
  observation: string;
  implication: string;
  evidence: HsakaaPatternEvidence[];
  suggestedPrompt: string;
}

export interface HsakaaPatternCorrelation {
  title: string;
  confidence: number;
  relationship: string;
  caution: string;
  evidence: HsakaaPatternEvidence[];
}

export interface HsakaaPatternContent {
  headline: string;
  overview: string;
  patterns: HsakaaPatternInsight[];
  correlations: HsakaaPatternCorrelation[];
  recurringThemes: string[];
  suggestedPrompts: string[];
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_pattern_reports',
})
export class HsakaaPatternReport {
  @Prop({ required: true, trim: true })
  dateKey: string;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone: string;

  @Prop({ required: true, min: 7, max: 90 })
  windowDays: number;

  @Prop({ required: true })
  windowStart: Date;

  @Prop({ required: true })
  windowEnd: Date;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  content: HsakaaPatternContent;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  usage?: Record<string, number> | null;

  @Prop({ type: [String], default: [] })
  sources: string[];

  @Prop({ required: true })
  generatedAt: Date;
}

export const HsakaaPatternReportSchema =
  SchemaFactory.createForClass(HsakaaPatternReport);

HsakaaPatternReportSchema.index(
  { dateKey: 1, windowDays: 1 },
  { unique: true },
);
HsakaaPatternReportSchema.index({ generatedAt: -1 });
