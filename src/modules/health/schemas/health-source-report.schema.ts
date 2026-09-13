import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthSourceReportDocument = HydratedDocument<HealthSourceReport>;

@Schema({ _id: false })
export class HealthSourceReportMeasurement {
  @Prop({ trim: true, default: '' })
  name: string;

  @Prop({ trim: true, default: '' })
  value: string;

  @Prop({ trim: true, default: '' })
  unit: string;

  @Prop({ trim: true, default: '' })
  referenceRange: string;

  @Prop({ trim: true, default: 'unknown' })
  flag: string;
}

export const HealthSourceReportMeasurementSchema = SchemaFactory.createForClass(
  HealthSourceReportMeasurement,
);

export enum HealthSourceReportFollowUpStatus {
  SCHEDULED = 'scheduled',
  NEEDS_CONFIRMATION = 'needs_confirmation',
  COMPLETED = 'completed',
  DISMISSED = 'dismissed',
}

@Schema({ _id: false })
export class HealthSourceReportFollowUp {
  @Prop({ required: true, trim: true })
  testName: string;

  @Prop({ trim: true, default: '' })
  timingText: string;

  @Prop({ type: Date, default: null })
  dueAt?: Date | null;

  @Prop({ trim: true, default: '' })
  reason: string;

  @Prop({ required: true, enum: ['report_explicit', 'owner_confirmed'] })
  source: 'report_explicit' | 'owner_confirmed';

  @Prop({
    type: String,
    enum: HealthSourceReportFollowUpStatus,
    default: HealthSourceReportFollowUpStatus.NEEDS_CONFIRMATION,
  })
  status: HealthSourceReportFollowUpStatus;

  @Prop({ default: true })
  reminderEnabled: boolean;
}

export const HealthSourceReportFollowUpSchema = SchemaFactory.createForClass(
  HealthSourceReportFollowUp,
);

@Schema({ _id: false })
export class HealthSourceReportAnalysis {
  @Prop({ trim: true, default: '' })
  summary: string;

  @Prop({ type: [String], default: [] })
  findings: string[];

  @Prop({ type: [String], default: [] })
  measurements: string[];

  @Prop({ type: [HealthSourceReportMeasurementSchema], default: [] })
  structuredMeasurements: HealthSourceReportMeasurement[];

  @Prop({ type: [String], default: [] })
  planningImplications: string[];

  @Prop({ type: [String], default: [] })
  professionalInstructions: string[];

  @Prop({ type: [String], default: [] })
  safetyFlags: string[];

  @Prop({ type: [HealthSourceReportFollowUpSchema], default: [] })
  followUpTests: HealthSourceReportFollowUp[];
}

export const HealthSourceReportAnalysisSchema = SchemaFactory.createForClass(
  HealthSourceReportAnalysis,
);

@Schema({ timestamps: true, collection: 'health_source_reports' })
export class HealthSourceReport {
  @Prop({ trim: true, default: '' })
  label: string;

  @Prop({ required: true, index: true })
  reportDate: Date;

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

  @Prop({ type: HealthSourceReportAnalysisSchema, default: {} })
  analysis: HealthSourceReportAnalysis;

  @Prop({ trim: true, default: '' })
  aiModel: string;

  @Prop({ trim: true, default: '' })
  aiResponseId: string;

  @Prop({ type: Date, default: null })
  analyzedAt?: Date | null;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthSourceReportSchema =
  SchemaFactory.createForClass(HealthSourceReport);

HealthSourceReportSchema.index({ reportDate: -1, isActive: 1 });

HealthSourceReportSchema.index({
  'analysis.followUpTests.dueAt': 1,
  isActive: 1,
});
