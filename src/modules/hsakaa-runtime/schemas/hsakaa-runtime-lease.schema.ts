import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type HsakaaRuntimeLeaseDocument = HydratedDocument<HsakaaRuntimeLease>;

@Schema({ timestamps: true, collection: 'hsakaa_runtime_leases' })
export class HsakaaRuntimeLease {
  @Prop({ required: true, trim: true, unique: true, index: true })
  key: string;

  @Prop({ required: true, trim: true, index: true })
  ownerToken: string;

  @Prop({ required: true, index: true })
  acquiredAt: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;
}

export const HsakaaRuntimeLeaseSchema =
  SchemaFactory.createForClass(HsakaaRuntimeLease);

HsakaaRuntimeLeaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
