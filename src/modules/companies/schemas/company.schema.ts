import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  HydratedDocument,
  SchemaTypes,
  Types,
} from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

export enum CompanyStatus {
  IDEA = 'idea',
  BUILDING = 'building',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ACQUIRED = 'acquired',
  CLOSED = 'closed',
}

export enum CompanyRole {
  FOUNDER = 'founder',
  CO_FOUNDER = 'co_founder',
  CEO = 'ceo',
  CTO = 'cto',
  ADVISOR = 'advisor',
  INVESTOR = 'investor',
  EMPLOYEE = 'employee',
}

export enum CompanyStage {
  IDEA = 'idea',
  PRE_SEED = 'pre_seed',
  SEED = 'seed',
  EARLY_STAGE = 'early_stage',
  GROWTH = 'growth',
  MATURE = 'mature',
}

@Schema({ _id: false })
export class CompanyLink {
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true })
  url: string;
}

export const CompanyLinkSchema =
  SchemaFactory.createForClass(CompanyLink);

@Schema({ _id: false })
export class CompanyMetric {
  @Prop({ required: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  value: string | number | boolean;

  @Prop({ trim: true })
  unit?: string;

  @Prop()
  measuredAt?: Date;
}

export const CompanyMetricSchema =
  SchemaFactory.createForClass(CompanyMetric);

@Schema({ _id: false })
export class CompanyGoal {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ min: 0, max: 100, default: 0 })
  progressPercentage: number;

  @Prop()
  targetDate?: Date;

  @Prop({ default: false })
  completed: boolean;
}

export const CompanyGoalSchema =
  SchemaFactory.createForClass(CompanyGoal);

@Schema({ _id: false })
export class CompanyFounder {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  designation?: string;

  @Prop({ default: false })
  isPrimary: boolean;
}

export const CompanyFounderSchema =
  SchemaFactory.createForClass(CompanyFounder);

@Schema({
  timestamps: true,
  collection: 'companies',
})
export class Company {
  // @Prop({
  //   type: SchemaTypes.ObjectId,
  //   ref: 'User',
  //   required: true,
  //   index: true,
  // })
  // userId: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    index: true,
  })
  name: string;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
  })
  slug: string;

  @Prop({
    trim: true,
  })
  legalName?: string;

  @Prop({
    trim: true,
  })
  tagline?: string;

  @Prop({
    trim: true,
  })
  description?: string;

  @Prop({
    type: String,
    enum: CompanyStatus,
    default: CompanyStatus.ACTIVE,
    index: true,
  })
  status: CompanyStatus;

  @Prop({
    type: String,
    enum: CompanyStage,
    default: CompanyStage.EARLY_STAGE,
  })
  stage: CompanyStage;

  @Prop({
    type: [String],
    enum: CompanyRole,
    default: [],
  })
  roles: CompanyRole[];

  @Prop({
    type: [String],
    default: [],
  })
  industries: string[];

  @Prop({
    type: [String],
    default: [],
  })
  products: string[];

  @Prop({
    type: [String],
    default: [],
  })
  markets: string[];

  @Prop({
    trim: true,
  })
  headquarters?: string;

  @Prop({
    trim: true,
  })
  website?: string;

  @Prop({
    trim: true,
  })
  logoUrl?: string;

  @Prop({
    trim: true,
  })
  coverImageUrl?: string;

  @Prop({
    type: [CompanyFounderSchema],
    default: [],
  })
  founders: CompanyFounder[];

  @Prop({
    type: [CompanyLinkSchema],
    default: [],
  })
  links: CompanyLink[];

  @Prop({
    type: [CompanyMetricSchema],
    default: [],
  })
  metrics: CompanyMetric[];

  @Prop({
    type: [CompanyGoalSchema],
    default: [],
  })
  goals: CompanyGoal[];

  @Prop({
    type: [String],
    default: [],
  })
  principles: string[];

  @Prop({
    type: [String],
    default: [],
  })
  currentPriorities: string[];

  @Prop({
    type: [String],
    default: [],
  })
  challenges: string[];

  @Prop({
    trim: true,
  })
  currentFocus?: string;

  @Prop({
    trim: true,
  })
  businessModel?: string;

  @Prop({
    trim: true,
  })
  targetCustomer?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop()
  foundedAt?: Date;

  @Prop()
  lastReviewedAt?: Date;

  @Prop({
    default: false,
  })
  isFeatured: boolean;

  @Prop({
    default: false,
  })
  isArchived: boolean;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const CompanySchema =
  SchemaFactory.createForClass(Company);

CompanySchema.index(
  {
    userId: 1,
    slug: 1,
  },
  {
    unique: true,
  },
);

CompanySchema.index({
  userId: 1,
  status: 1,
  isActive: 1,
});

CompanySchema.index({
  name: 'text',
  legalName: 'text',
  tagline: 'text',
  description: 'text',
  industries: 'text',
  products: 'text',
  markets: 'text',
  currentFocus: 'text',
});