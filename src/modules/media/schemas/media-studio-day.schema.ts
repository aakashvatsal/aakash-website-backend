import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'media_studio_days' })
export class MediaStudioDay {
  @Prop({ required: true, unique: true, index: true })
  date: string;
  @Prop({ type: [Object], default: [] })
  posts: Array<Record<string, unknown>>;
  @Prop({ type: String, default: 'pending' })
  status: 'pending' | 'generating' | 'complete' | 'needs_attention';
  @Prop({ type: String, default: '' })
  lastError?: string;
  @Prop({ type: Object, default: {} })
  generationUsage?: Record<string, number>;
  @Prop({ type: Date })
  generatedAt?: Date;
}
export const MediaStudioDaySchema = SchemaFactory.createForClass(MediaStudioDay);
