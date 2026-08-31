import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UniversalSearchEmbeddingDocument =
  HydratedDocument<UniversalSearchEmbedding>;

@Schema({ timestamps: true, collection: 'universal_search_embeddings' })
export class UniversalSearchEmbedding {
  @Prop({ required: true, trim: true, unique: true, index: true })
  nodeKey: string;

  @Prop({ required: true, trim: true, index: true })
  embeddingModel: string;

  @Prop({ required: true, trim: true, index: true })
  fingerprint: string;

  @Prop({ type: [Number], required: true, select: false })
  embedding: number[];

  @Prop({ required: true, default: Date.now, index: true })
  indexedAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const UniversalSearchEmbeddingSchema = SchemaFactory.createForClass(
  UniversalSearchEmbedding,
);

UniversalSearchEmbeddingSchema.index({
  embeddingModel: 1,
  isActive: 1,
  indexedAt: -1,
});
