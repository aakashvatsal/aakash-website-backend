import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HealthAttentionItemDocument = HydratedDocument<HealthAttentionItem>;

export enum HealthAttentionPriority {
  INFO = 'info',
  ACTION = 'action',
  IMPORTANT = 'important',
  REVIEW = 'review',
  PROFESSIONAL_REVIEW = 'professional_review',
}

export enum HealthAttentionStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Schema({ timestamps: true, collection: 'health_attention_items' })
export class HealthAttentionItem {
  @Prop({ required: true, unique: true, index: true, trim: true })
  key: string;

  @Prop({
    required: true,
    type: String,
    enum: HealthAttentionPriority,
    index: true,
  })
  priority: HealthAttentionPriority;

  @Prop({
    type: String,
    enum: HealthAttentionStatus,
    default: HealthAttentionStatus.OPEN,
    index: true,
  })
  status: HealthAttentionStatus;

  @Prop({ required: true, trim: true, maxlength: 220 })
  title: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  message: string;

  @Prop({ required: true, trim: true, maxlength: 2000 })
  action: string;

  @Prop({ trim: true, maxlength: 80, index: true })
  domain?: string;

  @Prop({ trim: true, maxlength: 80 })
  sourceType?: string;

  @Prop({ trim: true, maxlength: 160 })
  sourceKey?: string;

  @Prop({ type: Object, default: {} })
  evidence: Record<string, unknown>;

  @Prop({ index: true })
  firstSeenAt: Date;

  @Prop({ index: true })
  lastSeenAt: Date;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  dismissedAt?: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthAttentionItemSchema =
  SchemaFactory.createForClass(HealthAttentionItem);
