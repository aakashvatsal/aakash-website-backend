import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { HsakaaVoiceContext } from './hsakaa-voice-profile.schema';

export type HsakaaVoiceFeedbackDocument = HydratedDocument<HsakaaVoiceFeedback>;

@Schema({ timestamps: true, collection: 'hsakaa_voice_feedback' })
export class HsakaaVoiceFeedback {
  @Prop({ trim: true, maxlength: 5000 })
  originalResponse?: string;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  correctedText: string;

  @Prop({ trim: true, maxlength: 1500 })
  instruction?: string;

  @Prop({
    type: String,
    enum: HsakaaVoiceContext,
    default: HsakaaVoiceContext.GENERAL,
  })
  context: HsakaaVoiceContext;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HsakaaVoiceFeedbackSchema =
  SchemaFactory.createForClass(HsakaaVoiceFeedback);
