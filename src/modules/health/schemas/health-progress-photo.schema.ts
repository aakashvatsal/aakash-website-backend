import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthProgressPhotoDocument = HydratedDocument<HealthProgressPhoto>;

export enum HealthPhotoCategory {
  BODY = 'body',
  SKIN = 'skin',
  HAIR = 'hair',
}

@Schema({ _id: false })
export class HealthPhotoComparison {
  @Prop({ default: false })
  hasPrevious: boolean;

  @Prop({ trim: true, default: '' })
  comparedToPhotoId: string;

  @Prop({ trim: true, default: '' })
  changeSummary: string;

  @Prop({ type: [String], default: [] })
  visibleChanges: string[];

  @Prop({ type: [String], default: [] })
  consistencyNotes: string[];

  @Prop({ trim: true, default: 'low' })
  confidence: string;
}

export const HealthPhotoComparisonSchema = SchemaFactory.createForClass(
  HealthPhotoComparison,
);

@Schema({ _id: false })
export class HealthPhotoAnalysis {
  @Prop({ trim: true, default: '' })
  summary: string;

  @Prop({ type: [String], default: [] })
  observations: string[];

  @Prop({ type: [String], default: [] })
  improvementOpportunities: string[];

  @Prop({ type: [String], default: [] })
  safetyFlags: string[];

  @Prop({ trim: true, default: '' })
  comparisonGuidance: string;

  @Prop({ type: HealthPhotoComparisonSchema, default: () => ({}) })
  comparison: HealthPhotoComparison;
}

export const HealthPhotoAnalysisSchema =
  SchemaFactory.createForClass(HealthPhotoAnalysis);

@Schema({ timestamps: true, collection: 'health_progress_photos' })
export class HealthProgressPhoto {
  @Prop({
    required: true,
    type: String,
    enum: HealthPhotoCategory,
    index: true,
  })
  category: HealthPhotoCategory;

  @Prop({ required: true, trim: true, index: true })
  angle: string;

  @Prop({ required: true })
  takenAt: Date;

  @Prop({ required: true, trim: true })
  mimeType: string;

  @Prop({ required: true, trim: true })
  originalName: string;

  @Prop({ required: true, min: 1 })
  byteSize: number;

  /** Legacy Mongo binary retained only until S3 migration completes. */
  @Prop({ type: Buffer, select: false, default: undefined })
  data?: Buffer;

  @Prop({ trim: true, default: '' })
  storageProvider: string;

  @Prop({ trim: true, default: '' })
  storageBucket: string;

  @Prop({ trim: true, default: '', index: true })
  storageKey: string;

  @Prop({ trim: true, default: '' })
  storageEtag: string;

  @Prop({ type: Date, default: null })
  storageUploadedAt?: Date | null;

  @Prop({ type: HealthPhotoAnalysisSchema, default: {} })
  analysis: HealthPhotoAnalysis;

  @Prop({ trim: true, default: '' })
  aiModel: string;

  @Prop({ trim: true, default: '' })
  aiResponseId: string;

  @Prop({ type: Date, default: null })
  analyzedAt?: Date | null;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthProgressPhotoSchema =
  SchemaFactory.createForClass(HealthProgressPhoto);
HealthProgressPhotoSchema.index({ category: 1, takenAt: -1 });
