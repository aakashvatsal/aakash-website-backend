import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthInterventionDocument = HydratedDocument<HealthIntervention>;

export enum HealthInterventionStatus {
  APPLIED = 'applied',
  FOLLOW_UP_PENDING = 'follow_up_pending',
  IMPROVED = 'improved',
  NOT_IMPROVED = 'not_improved',
  SKIPPED = 'skipped',
}

@Schema({ timestamps: true, collection: 'health_interventions' })
export class HealthIntervention {
  @Prop({ required: true, unique: true, index: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  type: string;

  @Prop({ required: true, trim: true, maxlength: 16, index: true })
  dateKey: string;

  @Prop({ required: true, trim: true, maxlength: 3000 })
  rationale: string;

  @Prop({ required: true, trim: true, maxlength: 3000 })
  changeSummary: string;

  @Prop({ type: Object, default: {} })
  before: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  after: Record<string, unknown>;

  @Prop({
    type: String,
    enum: HealthInterventionStatus,
    default: HealthInterventionStatus.APPLIED,
    index: true,
  })
  status: HealthInterventionStatus;

  @Prop()
  appliedAt: Date;

  @Prop()
  followUpDueAt?: Date;

  @Prop()
  followedUpAt?: Date;

  @Prop({ trim: true, maxlength: 3000 })
  followUpSummary?: string;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthInterventionSchema =
  SchemaFactory.createForClass(HealthIntervention);
