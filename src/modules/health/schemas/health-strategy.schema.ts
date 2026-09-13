import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthStrategyDocument = HydratedDocument<HealthStrategy>;

@Schema({ _id: false })
export class HealthProductRecommendation {
  @Prop({ required: true, enum: ['skincare', 'haircare', 'bodycare'] })
  domain: 'skincare' | 'haircare' | 'bodycare';

  @Prop({ required: true, enum: ['keep', 'add', 'replace', 'review'] })
  action: 'keep' | 'add' | 'replace' | 'review';

  @Prop({ required: true, trim: true })
  slot: string;

  @Prop({ trim: true, default: '' })
  currentProduct: string;

  @Prop({ trim: true, default: '' })
  suggestedProductName: string;

  @Prop({ trim: true, default: '' })
  suggestedBrand: string;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ required: true, trim: true })
  usageGuidance: string;

  @Prop({ type: [String], default: [] })
  concerns: string[];

  @Prop({
    required: true,
    enum: ['verified_local', 'verified_india', 'unverified', 'not_checked'],
    default: 'not_checked',
  })
  availabilityStatus:
    'verified_local' | 'verified_india' | 'unverified' | 'not_checked';

  @Prop({ trim: true, default: '' })
  availabilitySummary: string;

  @Prop({ type: [String], default: [] })
  availabilitySources: string[];

  @Prop({ default: true })
  requiresApproval: boolean;
}

export const HealthProductRecommendationSchema = SchemaFactory.createForClass(
  HealthProductRecommendation,
);

@Schema({ _id: false })
export class HealthSupplementRecommendation {
  @Prop({
    required: true,
    enum: ['keep', 'add', 'replace', 'review', 'review_stop'],
  })
  action: 'keep' | 'add' | 'replace' | 'review' | 'review_stop';

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ trim: true, default: '' })
  currentSupplement: string;

  @Prop({ trim: true, default: '' })
  suggestedProductName: string;

  @Prop({ trim: true, default: '' })
  suggestedBrand: string;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ type: [String], default: [] })
  selectionCriteria: string[];

  @Prop({
    required: true,
    enum: ['verified_local', 'verified_india', 'unverified', 'not_checked'],
    default: 'not_checked',
  })
  availabilityStatus:
    'verified_local' | 'verified_india' | 'unverified' | 'not_checked';

  @Prop({ trim: true, default: '' })
  availabilitySummary: string;

  @Prop({ type: [String], default: [] })
  availabilitySources: string[];

  @Prop({ default: true })
  requiresApproval: boolean;

  @Prop({ default: false })
  requiresProfessionalReview: boolean;
}

export const HealthSupplementRecommendationSchema =
  SchemaFactory.createForClass(HealthSupplementRecommendation);

@Schema({ timestamps: true, collection: 'health_strategies' })
export class HealthStrategy {
  @Prop({ required: true, unique: true, default: 'owner' })
  key: string;

  @Prop({ required: true, trim: true })
  summary: string;

  @Prop({ type: [String], default: [] })
  priorities: string[];

  @Prop({ trim: true, default: '' })
  trainingStrategy: string;

  @Prop({ trim: true, default: '' })
  nutritionStrategy: string;

  @Prop({ trim: true, default: '' })
  recoveryStrategy: string;

  @Prop({ trim: true, default: '' })
  meditationStrategy: string;

  @Prop({ trim: true, default: '' })
  skinStrategy: string;

  @Prop({ trim: true, default: '' })
  hairStrategy: string;

  @Prop({ trim: true, default: '' })
  bodyCareStrategy: string;

  @Prop({ trim: true, default: '' })
  intimateCareStrategy: string;

  @Prop({ type: [HealthProductRecommendationSchema], default: [] })
  productRecommendations: HealthProductRecommendation[];

  @Prop({ type: [HealthSupplementRecommendationSchema], default: [] })
  supplementRecommendations: HealthSupplementRecommendation[];

  @Prop({ type: [String], default: [] })
  measurementPlan: string[];

  @Prop({ type: [String], default: [] })
  safetyEscalations: string[];

  @Prop({ required: true, trim: true, index: true })
  contextHash: string;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ required: true, trim: true })
  aiResponseId: string;

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({ min: 1, default: 1 })
  version: number;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthStrategySchema =
  SchemaFactory.createForClass(HealthStrategy);
