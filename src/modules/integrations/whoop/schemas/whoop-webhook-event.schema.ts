import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';

import {
  HydratedDocument,
  SchemaTypes,
} from 'mongoose';

export type WhoopWebhookEventDocument =
  HydratedDocument<WhoopWebhookEvent>;

export enum WhoopWebhookEventType {
  WORKOUT_UPDATED =
    'workout.updated',

  WORKOUT_DELETED =
    'workout.deleted',

  SLEEP_UPDATED =
    'sleep.updated',

  SLEEP_DELETED =
    'sleep.deleted',

  RECOVERY_UPDATED =
    'recovery.updated',

  RECOVERY_DELETED =
    'recovery.deleted',
}

export enum WhoopWebhookProcessingStatus {
  PENDING =
    'pending',

  PROCESSING =
    'processing',

  PROCESSED =
    'processed',

  FAILED =
    'failed',

  IGNORED =
    'ignored',
}

@Schema({
  timestamps: true,

  collection:
    'whoop_webhook_events',
})
export class WhoopWebhookEvent {
  @Prop({
    required: true,

    unique: true,

    index: true,

    trim: true,
  })
  traceId:
    string;

  @Prop({
    required: true,
  })
  whoopUserId:
    number;

  @Prop({
    required: true,

    trim: true,

    index: true,
  })
  resourceId:
    string;

  @Prop({
    type: String,

    enum:
      WhoopWebhookEventType,

    required: true,

    index: true,
  })
  eventType:
    WhoopWebhookEventType;

  @Prop({
    type: String,

    enum:
      WhoopWebhookProcessingStatus,

    default:
      WhoopWebhookProcessingStatus.PENDING,

    index: true,
  })
  status:
    WhoopWebhookProcessingStatus;

  @Prop()
  receivedAt:
    Date;

  @Prop()
  processedAt?: Date;

  @Prop({
    trim: true,
  })
  errorMessage?: string;

  @Prop({
    type:
      SchemaTypes.Mixed,

    default: {},
  })
  payload:
    Record<
      string,
      unknown
    >;

  @Prop({
    default: 0,
  })
  attempts:
    number;
}

export const WhoopWebhookEventSchema =
  SchemaFactory.createForClass(
    WhoopWebhookEvent,
  );

WhoopWebhookEventSchema.index({
  eventType: 1,

  receivedAt: -1,
});

WhoopWebhookEventSchema.index({
  status: 1,

  receivedAt: 1,
});

WhoopWebhookEventSchema.index({
  resourceId: 1,

  eventType: 1,
});