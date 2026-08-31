import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type HsakaaWeeklyReviewDocument = HydratedDocument<HsakaaWeeklyReview>;

export interface HsakaaWeeklyEvidence {
  source: string;
  label: string;
  detail: string;
  occurredAt?: string | null;
}

export interface HsakaaWeeklyReviewItem {
  title: string;
  detail: string;
  significance: 'high' | 'medium' | 'low';
  evidence: HsakaaWeeklyEvidence[];
}

export interface HsakaaWeeklyDecision {
  title: string;
  decision: string;
  status: 'made' | 'pending' | 'revisit';
  rationale: string;
  evidence: HsakaaWeeklyEvidence[];
}

export interface HsakaaWeeklyLesson {
  title: string;
  lesson: string;
  evidence: HsakaaWeeklyEvidence[];
}

export interface HsakaaWeeklyUnresolved {
  title: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  evidence: HsakaaWeeklyEvidence[];
}

export interface HsakaaWeeklyPriority {
  title: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  source: string;
  prompt: string;
  evidence: HsakaaWeeklyEvidence[];
}

export interface HsakaaWeeklyReviewContent {
  headline: string;
  summary: string;
  wins: HsakaaWeeklyReviewItem[];
  misses: HsakaaWeeklyReviewItem[];
  decisions: HsakaaWeeklyDecision[];
  lessons: HsakaaWeeklyLesson[];
  unresolved: HsakaaWeeklyUnresolved[];
  nextWeekPriorities: HsakaaWeeklyPriority[];
  questions: string[];
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_weekly_reviews',
})
export class HsakaaWeeklyReview {
  @Prop({ required: true, trim: true })
  weekKey: string;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone: string;

  @Prop({ required: true })
  weekStart: Date;

  @Prop({ required: true })
  weekEnd: Date;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  content: HsakaaWeeklyReviewContent;

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

export const HsakaaWeeklyReviewSchema =
  SchemaFactory.createForClass(HsakaaWeeklyReview);

HsakaaWeeklyReviewSchema.index({ weekKey: 1 }, { unique: true });
HsakaaWeeklyReviewSchema.index({ generatedAt: -1 });
