import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FundCaseDocument = HydratedDocument<FundCase>;

export enum FundCaseStatus {
  COLLECTING = 'collecting',
  REVIEW_READY = 'review_ready',
  NEEDS_INFORMATION = 'needs_information',
  APPROVED = 'approved',
  NOT_APPROVED = 'not_approved',
  PAID = 'paid',
}

export enum FundCauseCategory {
  UNCLASSIFIED = 'unclassified',
  MEDICAL_HEALTH = 'medical_health',
  EDUCATION_LEARNING = 'education_learning',
  ESSENTIAL_LIVING = 'essential_living',
  LIVELIHOOD_EMPLOYMENT = 'livelihood_employment',
  FAMILY_EMERGENCY = 'family_emergency',
  ACCESSIBILITY_SUPPORT = 'accessibility_support',
  TOOLS_EQUIPMENT = 'tools_equipment',
  OTHER = 'other',
}

export enum FundMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum FundDecisionType {
  APPROVE = 'approve',
  NEEDS_MORE_INFORMATION = 'needs_more_information',
  NOT_APPROVE = 'not_approve',
}

export enum FundDeliveryStatus {
  NOT_ATTEMPTED = 'not_attempted',
  SENT = 'sent',
  FAILED = 'failed',
  NOT_CONFIGURED = 'not_configured',
}

@Schema({ _id: false })
export class FundMessage {
  @Prop({ required: true, trim: true })
  id: string;

  @Prop({ required: true, type: String, enum: FundMessageRole })
  role: FundMessageRole;

  @Prop({ required: true })
  contentEncrypted: string;

  @Prop({ required: true })
  createdAt: Date;
}

export const FundMessageSchema = SchemaFactory.createForClass(FundMessage);

@Schema({ _id: false })
export class FundRiskSignal {
  @Prop({ required: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ required: true, enum: ['low', 'medium', 'high'] })
  severity: 'low' | 'medium' | 'high';
}

export const FundRiskSignalSchema =
  SchemaFactory.createForClass(FundRiskSignal);

@Schema({ _id: false })
export class FundDeliveryState {
  @Prop({
    type: String,
    enum: FundDeliveryStatus,
    default: FundDeliveryStatus.NOT_ATTEMPTED,
  })
  emailStatus: FundDeliveryStatus;

  @Prop({
    type: String,
    enum: FundDeliveryStatus,
    default: FundDeliveryStatus.NOT_ATTEMPTED,
  })
  whatsappStatus: FundDeliveryStatus;

  @Prop({ default: false })
  manualContactRequired: boolean;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  lastError?: string;
}

export const FundDeliveryStateSchema =
  SchemaFactory.createForClass(FundDeliveryState);

@Schema({ _id: false })
export class FundDecision {
  @Prop({ type: String, enum: FundDecisionType })
  type?: FundDecisionType;

  @Prop()
  reasonEncrypted?: string;

  @Prop({ min: 0 })
  assistanceAmount?: number;

  @Prop()
  decidedAt?: Date;

  @Prop()
  decisionMonthKey?: string;

  @Prop({ type: FundDeliveryStateSchema, default: () => ({}) })
  delivery: FundDeliveryState;
}

export const FundDecisionSchema = SchemaFactory.createForClass(FundDecision);

@Schema({ timestamps: true, collection: 'fund_cases' })
export class FundCase {
  @Prop({ required: true, unique: true, index: true, trim: true })
  caseReference: string;

  @Prop({ required: true, index: true })
  publicSessionHash: string;

  @Prop({ index: true })
  publicConversationId?: string;

  @Prop({
    required: true,
    type: String,
    enum: FundCaseStatus,
    default: FundCaseStatus.COLLECTING,
    index: true,
  })
  status: FundCaseStatus;

  @Prop({ type: [FundMessageSchema], default: [] })
  messages: FundMessage[];

  @Prop()
  contactEncrypted?: string;

  @Prop({ type: Object, default: () => ({}) })
  contactHashes: {
    phone?: string;
    email?: string;
  };

  @Prop()
  paymentEncrypted?: string;

  @Prop({ type: Object, default: () => ({}) })
  paymentHashes: {
    upi?: string;
    bankAccount?: string;
  };

  @Prop({ min: 0 })
  requestedAmount?: number;

  @Prop({ min: 0 })
  suggestedAmount?: number;

  @Prop({
    type: String,
    enum: FundCauseCategory,
    default: FundCauseCategory.UNCLASSIFIED,
    index: true,
  })
  causeCategory: FundCauseCategory;

  @Prop({ min: 0, max: 100, default: 0 })
  causeConfidence: number;

  @Prop({ trim: true, maxlength: 500 })
  causeSummary?: string;

  @Prop({ min: 0, max: 100, default: 0 })
  caseConfidence: number;

  @Prop({ min: 0, max: 100, default: 0 })
  evidenceConfidence: number;

  @Prop({ min: 0, max: 100, default: 50 })
  consistency: number;

  @Prop({ type: [FundRiskSignalSchema], default: [] })
  riskSignals: FundRiskSignal[];

  @Prop({ type: [String], default: [] })
  whyMaySucceed: string[];

  @Prop({ type: [String], default: [] })
  whyMayNot: string[];

  @Prop({ type: [String], default: [] })
  missingVerification: string[];

  @Prop()
  contactCapturedAt?: Date;

  @Prop({ index: true })
  reviewTargetAt?: Date;

  @Prop({ type: FundDecisionSchema, default: () => ({ delivery: {} }) })
  decision: FundDecision;

  @Prop()
  paymentReferenceEncrypted?: string;

  @Prop()
  paidAt?: Date;

  @Prop({ min: 0 })
  paidAmount?: number;

  @Prop({ default: false })
  prelaunchCase: boolean;
}

export const FundCaseSchema = SchemaFactory.createForClass(FundCase);
FundCaseSchema.index({ 'contactHashes.phone': 1 });
FundCaseSchema.index({ 'contactHashes.email': 1 });
FundCaseSchema.index({ 'paymentHashes.upi': 1 });
FundCaseSchema.index({ 'paymentHashes.bankAccount': 1 });
FundCaseSchema.index({ 'decision.decisionMonthKey': 1, status: 1 });
FundCaseSchema.index({ createdAt: -1 });
FundCaseSchema.index({ causeCategory: 1, createdAt: -1 });
FundCaseSchema.index({ publicConversationId: 1, publicSessionHash: 1 });
