import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type FundEvidenceDocument = HydratedDocument<FundEvidence>;

@Schema({ timestamps: true, collection: 'fund_evidence' })
export class FundEvidence {
  @Prop({ required: true, type: SchemaTypes.ObjectId, index: true })
  caseId: Types.ObjectId;

  @Prop({ required: true, trim: true, unique: true, index: true })
  evidenceId: string;

  @Prop({ required: true })
  filenameEncrypted: string;

  @Prop({ required: true, trim: true })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  size: number;

  @Prop({ required: true, trim: true, index: true })
  sha256: string;

  @Prop({ required: true })
  payloadEncrypted: string;

  @Prop()
  analysisEncrypted?: string;

  @Prop({ default: false })
  analysisFailed: boolean;

  @Prop()
  analyzedAt?: Date;
}

export const FundEvidenceSchema = SchemaFactory.createForClass(FundEvidence);
FundEvidenceSchema.index({ caseId: 1, createdAt: -1 });
