import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument, SchemaTypes } from 'mongoose';

export type IntegrationDocument = HydratedDocument<Integration>;

export enum IntegrationProvider {
  WHOOP = 'whoop',
}

export enum IntegrationStatus {
  CONNECTED = 'connected',
  EXPIRED = 'expired',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

@Schema({
  timestamps: true,
  collection: 'integrations',
})
export class Integration {
  @Prop({
    type: String,
    enum: IntegrationProvider,
    required: true,
  })
  provider: IntegrationProvider;

  @Prop({
    type: String,
    enum: IntegrationStatus,
    default: IntegrationStatus.CONNECTED,
  })
  status: IntegrationStatus;

  @Prop()
  accessToken?: string;

  @Prop()
  refreshToken?: string;

  @Prop()
  accessTokenExpiresAt?: Date;

  @Prop({
    type: [String],
    default: [],
  })
  scopes: string[];

  @Prop()
  externalUserId?: string;

  @Prop()
  connectedAt?: Date;

  @Prop()
  lastRefreshedAt?: Date;

  @Prop()
  lastSyncedAt?: Date;

  @Prop()
  lastSyncError?: string;

  @Prop({
    type: SchemaTypes.Mixed,
    default: {},
  })
  metadata: Record<string, unknown>;

  @Prop({
    default: true,
  })
  isActive: boolean;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);

IntegrationSchema.index(
  {
    provider: 1,
  },
  {
    unique: true,
  },
);

IntegrationSchema.index({
  status: 1,
  isActive: 1,
});
