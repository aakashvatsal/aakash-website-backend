import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { MediaGoal, MediaPlatform } from './media-post.schema';

export type MediaAccountDocument = HydratedDocument<MediaAccount>;

export enum MediaAccountConnectionStatus {
  NOT_CONNECTED = 'not_connected',
  CONNECTED = 'connected',
  NEEDS_REAUTH = 'needs_reauth',
  ERROR = 'error',
}

export enum MediaDeliveryProvider {
  AUTO = 'auto',
  BUFFER = 'buffer',
  DIRECT = 'direct',
  MANUAL = 'manual',
}

@Schema({ _id: false })
export class MediaAccountCapabilities {
  @Prop({ default: false })
  canPublish: boolean;

  @Prop({ default: false })
  canSchedule: boolean;

  @Prop({ default: false })
  canReadAnalytics: boolean;

  @Prop({ default: false })
  canReadEngagement: boolean;

  @Prop({ default: false })
  canUploadAssets: boolean;

  @Prop({ default: false })
  requiresManualPublish: boolean;
}

export const MediaAccountCapabilitiesSchema = SchemaFactory.createForClass(
  MediaAccountCapabilities,
);

@Schema({ _id: false })
export class MediaAccountStrategy {
  @Prop({ type: [String], enum: MediaGoal, default: [] })
  goals: MediaGoal[];

  @Prop({ type: [String], default: [] })
  contentPillars: string[];

  @Prop({ type: [String], default: [] })
  audiences: string[];

  @Prop({ min: 7, max: 31, default: 7 })
  planningHorizonDays: number;

  @Prop({ default: 'Asia/Kolkata', trim: true })
  timezone: string;

  @Prop({ type: [Number], default: [] })
  preferredDaysOfWeek: number[];

  @Prop({ type: [String], default: ['09:00'] })
  preferredPublishTimes: string[];

  @Prop({ min: 0, max: 100, default: 0 })
  desiredPublicationsPerWeek: number;

  @Prop({ trim: true })
  positioning?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const MediaAccountStrategySchema =
  SchemaFactory.createForClass(MediaAccountStrategy);

@Schema({ _id: false })
export class MediaBufferConnection {
  @Prop({ required: true, trim: true })
  organizationId: string;

  @Prop({ required: true, trim: true })
  channelId: string;

  @Prop({ required: true, trim: true })
  service: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  displayName?: string;

  @Prop({ trim: true })
  externalLink?: string;

  @Prop({ default: false })
  isDisconnected: boolean;

  @Prop({ default: false })
  isLocked: boolean;

  @Prop({ default: false })
  isQueuePaused: boolean;

  @Prop()
  lastSyncedAt?: Date;
}

export const MediaBufferConnectionSchema = SchemaFactory.createForClass(
  MediaBufferConnection,
);

@Schema({ timestamps: true, collection: 'media_accounts' })
export class MediaAccount {
  @Prop({ type: String, enum: MediaPlatform, required: true, index: true })
  platform: MediaPlatform;

  @Prop({ required: true, trim: true })
  displayName: string;

  @Prop({ trim: true })
  username?: string;

  @Prop({ trim: true, index: true })
  externalAccountId?: string;

  @Prop({
    type: String,
    enum: MediaAccountConnectionStatus,
    default: MediaAccountConnectionStatus.NOT_CONNECTED,
    index: true,
  })
  connectionStatus: MediaAccountConnectionStatus;

  @Prop({ trim: true })
  credentialRef?: string;

  @Prop({
    type: String,
    enum: MediaDeliveryProvider,
    default: MediaDeliveryProvider.AUTO,
    index: true,
  })
  deliveryProvider: MediaDeliveryProvider;

  @Prop({ type: MediaBufferConnectionSchema })
  buffer?: MediaBufferConnection;

  @Prop({ type: MediaAccountCapabilitiesSchema, default: () => ({}) })
  capabilities: MediaAccountCapabilities;

  @Prop({ type: MediaAccountStrategySchema, default: () => ({}) })
  strategy: MediaAccountStrategy;

  @Prop({ default: false })
  isPrimary: boolean;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export const MediaAccountSchema = SchemaFactory.createForClass(MediaAccount);

MediaAccountSchema.index({ platform: 1, isActive: 1, isPrimary: -1 });
MediaAccountSchema.index(
  { platform: 1, externalAccountId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      externalAccountId: { $type: 'string' },
      isActive: true,
    },
  },
);

MediaAccountSchema.index(
  { 'buffer.channelId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      'buffer.channelId': { $type: 'string' },
      isActive: true,
    },
  },
);
