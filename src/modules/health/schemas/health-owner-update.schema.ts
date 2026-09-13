import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { HealthOwnerUpdateDomain } from '../dto/health-owner-update.dto';

export type HealthOwnerUpdateDocument = HydratedDocument<HealthOwnerUpdate>;

@Schema({ timestamps: true, collection: 'health_owner_updates' })
export class HealthOwnerUpdate {
  @Prop({
    required: true,
    type: String,
    enum: HealthOwnerUpdateDomain,
    index: true,
  })
  domain: HealthOwnerUpdateDomain;

  @Prop({ required: true, trim: true })
  update: string;

  @Prop({ required: true, default: Date.now, index: true })
  effectiveAt: Date;

  @Prop({ default: true, index: true })
  isActive: boolean;
}

export const HealthOwnerUpdateSchema =
  SchemaFactory.createForClass(HealthOwnerUpdate);
HealthOwnerUpdateSchema.index({ domain: 1, effectiveAt: -1 });
