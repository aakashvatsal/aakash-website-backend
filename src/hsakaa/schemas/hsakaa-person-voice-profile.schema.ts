import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type HsakaaPersonVoiceProfileDocument =
  HydratedDocument<HsakaaPersonVoiceProfile>;

@Schema({ timestamps: true, collection: 'hsakaa_person_voice_profiles' })
export class HsakaaPersonVoiceProfile {
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'MemoryPerson',
    required: true,
    unique: true,
    index: true,
  })
  personId: Types.ObjectId;

  @Prop({ min: 0, default: 0 })
  sampleCount: number;

  @Prop({ min: 0, max: 1, default: 0 })
  confidence: number;

  @Prop({ trim: true, maxlength: 1800, default: '' })
  styleSummary: string;

  @Prop({ type: [String], default: [] })
  responseHabits: string[];

  @Prop({ type: [String], default: [] })
  vocabularyMarkers: string[];

  @Prop({ type: [String], default: [] })
  avoidPatterns: string[];

  @Prop({ type: [String], default: [] })
  syntheticExamples: string[];

  @Prop({ trim: true })
  corpusSignature?: string;

  @Prop()
  lastLearnedAt?: Date;
}

export const HsakaaPersonVoiceProfileSchema = SchemaFactory.createForClass(
  HsakaaPersonVoiceProfile,
);
