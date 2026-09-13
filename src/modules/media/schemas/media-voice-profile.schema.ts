import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MediaVoiceProfileDocument = HydratedDocument<MediaVoiceProfile>;

@Schema({ timestamps: true, collection: 'media_voice_profiles' })
export class MediaVoiceProfile {
  @Prop({ required: true, default: 'primary', unique: true, index: true })
  key: string;

  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  principles: string[];

  @Prop({ required: true, trim: true })
  sentenceRhythm: string;

  @Prop({ required: true, trim: true })
  vocabulary: string;

  @Prop({ required: true, trim: true })
  humour: string;

  @Prop({ required: true, trim: true })
  profanity: string;

  @Prop({ required: true, trim: true })
  technicalDepth: string;

  @Prop({ required: true, trim: true })
  emotionalOpenness: string;

  @Prop({ required: true, trim: true })
  storytelling: string;

  @Prop({ type: [String], default: [] })
  doMore: string[];

  @Prop({ type: [String], default: [] })
  doNot: string[];

  @Prop({ type: [String], default: [] })
  avoidPhrases: string[];

  @Prop({ type: [String], default: [] })
  authenticityChecks: string[];

  @Prop({ required: true, min: 0, max: 100 })
  confidence: number;

  @Prop({ required: true, min: 0 })
  sourceSampleCount: number;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ required: true, trim: true })
  sourceFingerprint: string;

  @Prop({ required: true, default: Date.now })
  generatedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const MediaVoiceProfileSchema =
  SchemaFactory.createForClass(MediaVoiceProfile);
MediaVoiceProfileSchema.index({ generatedAt: -1 });
