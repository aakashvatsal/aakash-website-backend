import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type HsakaaBriefDocument = HydratedDocument<HsakaaBrief>;

export type HsakaaBriefGenerationSource = 'manual' | 'scheduled';

export interface HsakaaBriefSignal {
  status: 'good' | 'watch' | 'attention' | 'unknown';
  text: string;
}

export interface HsakaaBriefPriority {
  title: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  source: string;
}

export interface HsakaaBriefRisk {
  title: string;
  reason: string;
  severity: 'high' | 'medium' | 'low';
  source: string;
}

export interface HsakaaBriefOpportunity {
  title: string;
  reason: string;
  source: string;
}

export interface HsakaaBriefSuggestedAction {
  title: string;
  reason: string;
  kind: 'task' | 'brain_dump' | 'journal' | 'memory' | 'reminder' | 'none';
  prompt: string;
}

export interface HsakaaDailyBriefContent {
  greeting: string;
  headline: string;
  summary: string;
  signals: {
    tasks: HsakaaBriefSignal;
    reminders: HsakaaBriefSignal;
    health: HsakaaBriefSignal;
    mentalLoad: HsakaaBriefSignal;
  };
  priorities: HsakaaBriefPriority[];
  risks: HsakaaBriefRisk[];
  opportunities: HsakaaBriefOpportunity[];
  suggestedActions: HsakaaBriefSuggestedAction[];
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_briefs',
})
export class HsakaaBrief {
  @Prop({ required: true, unique: true, trim: true })
  dateKey: string;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  content: HsakaaDailyBriefContent;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  usage?: Record<string, number> | null;

  @Prop({ type: [String], default: [] })
  sources: string[];

  @Prop({
    type: String,
    enum: ['manual', 'scheduled'],
    default: 'manual',
  })
  generationSource: HsakaaBriefGenerationSource;

  @Prop({ required: true })
  generatedAt: Date;
}

export const HsakaaBriefSchema = SchemaFactory.createForClass(HsakaaBrief);

HsakaaBriefSchema.index({ generatedAt: -1 });
