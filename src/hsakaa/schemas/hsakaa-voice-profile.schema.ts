import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type HsakaaVoiceProfileDocument = HydratedDocument<HsakaaVoiceProfile>;

export enum HsakaaVoiceContext {
  GENERAL = 'general',
  CASUAL = 'casual',
  WORK = 'work',
  REFLECTIVE = 'reflective',
  BOOKS = 'books',
  RELATIONSHIP = 'relationship',
  SPOKEN = 'spoken',
}

@Schema({ _id: false })
export class HsakaaVoiceContextGuide {
  @Prop({ type: String, enum: HsakaaVoiceContext, required: true })
  context: HsakaaVoiceContext;

  @Prop({ required: true, trim: true, maxlength: 1200 })
  guidance: string;
}

export const HsakaaVoiceContextGuideSchema = SchemaFactory.createForClass(
  HsakaaVoiceContextGuide,
);

@Schema({ _id: false })
export class HsakaaVoiceSyntheticExample {
  @Prop({ type: String, enum: HsakaaVoiceContext, required: true })
  context: HsakaaVoiceContext;

  @Prop({ required: true, trim: true, maxlength: 800 })
  text: string;
}

export const HsakaaVoiceSyntheticExampleSchema = SchemaFactory.createForClass(
  HsakaaVoiceSyntheticExample,
);

@Schema({ timestamps: true, collection: 'hsakaa_voice_profiles' })
export class HsakaaVoiceProfile {
  @Prop({ required: true, unique: true, default: 'aakash', index: true })
  key: string;

  @Prop({ min: 1, default: 1 })
  version: number;

  @Prop({ min: 0, default: 0 })
  sampleCount: number;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  sourceCounts: Record<string, number>;

  @Prop({ min: 0, max: 1, default: 0 })
  confidence: number;

  @Prop({ trim: true, maxlength: 2400, default: '' })
  styleSummary: string;

  @Prop({ type: [String], default: [] })
  coreTraits: string[];

  @Prop({ type: [String], default: [] })
  sentencePatterns: string[];

  @Prop({ type: [String], default: [] })
  vocabularyMarkers: string[];

  @Prop({ type: [String], default: [] })
  humourPatterns: string[];

  @Prop({ type: [String], default: [] })
  punctuationPatterns: string[];

  @Prop({ type: [String], default: [] })
  emojiPatterns: string[];

  @Prop({ type: [String], default: [] })
  responseHabits: string[];

  @Prop({ type: [String], default: [] })
  avoidPatterns: string[];

  @Prop({ type: [HsakaaVoiceContextGuideSchema], default: [] })
  contextGuides: HsakaaVoiceContextGuide[];

  @Prop({ type: [HsakaaVoiceSyntheticExampleSchema], default: [] })
  syntheticExamples: HsakaaVoiceSyntheticExample[];

  @Prop({ trim: true })
  corpusSignature?: string;

  @Prop()
  lastSampleAt?: Date;

  @Prop()
  lastLearnedAt?: Date;
}

export const HsakaaVoiceProfileSchema =
  SchemaFactory.createForClass(HsakaaVoiceProfile);
