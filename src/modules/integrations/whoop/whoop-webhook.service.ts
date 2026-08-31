import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { InjectModel } from '@nestjs/mongoose';

import { createHmac, timingSafeEqual } from 'crypto';

import { Model } from 'mongoose';

import {
  NowActivityType,
  NowAvailability,
  NowSource,
  NowVisibility,
} from '../../now/schemas/now-status.schema';

import { NowService } from '../../now/now.service';

import { WhoopWebhookDto } from './dto/whoop-webhook.dto';

import {
  WhoopWebhookEvent,
  WhoopWebhookEventDocument,
  WhoopWebhookEventType,
  WhoopWebhookProcessingStatus,
} from './schemas/whoop-webhook-event.schema';

import { WhoopService } from './whoop.service';

@Injectable()
export class WhoopWebhookService {
  private readonly logger = new Logger(WhoopWebhookService.name);

  constructor(
    @InjectModel(WhoopWebhookEvent.name)
    private readonly webhookEventModel: Model<WhoopWebhookEventDocument>,

    private readonly configService: ConfigService,

    private readonly whoopService: WhoopService,

    private readonly nowService: NowService,
  ) {}

  async acceptWebhook(
    dto: WhoopWebhookDto,

    rawBody: Buffer,

    signature?: string,

    timestamp?: string,
  ) {
    this.validateSignature(rawBody, signature, timestamp);

    const existing = await this.webhookEventModel
      .findOne({
        traceId: dto.trace_id,
      })
      .select({
        _id: 1,
        status: 1,
      })
      .lean();

    if (existing) {
      return {
        accepted: true,

        duplicate: true,
      };
    }

    try {
      const event = await this.webhookEventModel.create({
        traceId: dto.trace_id,

        whoopUserId: dto.user_id,

        resourceId: dto.id,

        eventType: dto.type,

        status: WhoopWebhookProcessingStatus.PENDING,

        receivedAt: new Date(),

        attempts: 0,

        payload: {
          ...dto,
        },
      });

      setImmediate(() => {
        void this.processWebhook(event._id.toString());
      });

      return {
        accepted: true,

        duplicate: false,
      };
    } catch (error: any) {
      if (error?.code === 11000) {
        return {
          accepted: true,

          duplicate: true,
        };
      }

      throw error;
    }
  }

  async processWebhook(eventId: string) {
    const event = await this.webhookEventModel.findById(eventId);

    if (!event) {
      return;
    }

    if (
      event.status === WhoopWebhookProcessingStatus.PROCESSED ||
      event.status === WhoopWebhookProcessingStatus.IGNORED
    ) {
      return;
    }

    event.status = WhoopWebhookProcessingStatus.PROCESSING;

    event.attempts = (event.attempts ?? 0) + 1;

    await event.save();

    try {
      switch (event.eventType) {
        case WhoopWebhookEventType.WORKOUT_UPDATED:
          await this.handleWorkoutUpdated(event.resourceId);

          break;

        case WhoopWebhookEventType.SLEEP_UPDATED:
          await this.handleSleepUpdated(event.resourceId);

          break;

        case WhoopWebhookEventType.RECOVERY_UPDATED:
          await this.handleRecoveryUpdated();

          break;

        case WhoopWebhookEventType.WORKOUT_DELETED:
        case WhoopWebhookEventType.SLEEP_DELETED:
        case WhoopWebhookEventType.RECOVERY_DELETED:
          await this.handleDeletedEvent(event.eventType);

          break;

        default:
          event.status = WhoopWebhookProcessingStatus.IGNORED;

          event.processedAt = new Date();

          await event.save();

          return;
      }

      event.status = WhoopWebhookProcessingStatus.PROCESSED;

      event.processedAt = new Date();

      event.errorMessage = undefined;

      await event.save();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown WHOOP webhook processing error.';

      event.status = WhoopWebhookProcessingStatus.FAILED;

      event.errorMessage = message;

      await event.save();

      this.logger.error(`WHOOP webhook ${event.traceId} failed: ${message}`);
    }
  }

  private async handleWorkoutUpdated(workoutId: string) {
    await this.whoopService.syncRecentHealth(3);

    const workout = await this.whoopService.getWorkoutById(workoutId);

    const isCurrent = this.isIntervalActiveNow(workout.start, workout.end);

    if (!isCurrent) {
      return;
    }

    const canReplace = await this.nowService.canAutomaticSourceReplaceCurrent();

    if (!canReplace) {
      return;
    }

    const activityName = this.resolveWorkoutName(workout);

    const durationMinutes = this.getDurationMinutes(workout.start, workout.end);

    await this.nowService.create({
      activityType: NowActivityType.EXERCISING,

      activity: activityName ? `${activityName} workout` : 'Working out',

      headline: activityName ? `Training · ${activityName}` : 'Training',

      currentFocus: 'Physical training',

      availability: NowAvailability.BUSY,

      health: {
        activity: activityName ?? 'Workout',

        workoutDurationMinutes: durationMinutes,

        strainScore: this.numberOrUndefined(workout.score?.strain),
      },

      tags: ['health', 'training', 'whoop'],

      visibility: NowVisibility.PUBLIC,

      showLocation: false,

      showAvailability: true,

      showMood: false,

      showHealth: true,

      source: NowSource.WHOOP,

      sourceExternalId: workoutId,

      startedAt: workout.start,

      expiresAt: workout.end,

      lastActivityAt: new Date().toISOString(),

      metadata: {
        whoopWorkoutId: workoutId,

        sportId: workout.sport_id,
      },
    });
  }

  private async handleSleepUpdated(sleepId: string) {
    await this.whoopService.syncRecentHealth(3);

    const sleep = await this.whoopService.getSleepById(sleepId);

    if (sleep.nap === true) {
      return;
    }

    const isCurrent = this.isIntervalActiveNow(sleep.start, sleep.end);

    if (!isCurrent) {
      return;
    }

    const canReplace = await this.nowService.canAutomaticSourceReplaceCurrent();

    if (!canReplace) {
      return;
    }

    await this.nowService.create({
      activityType: NowActivityType.SLEEPING,

      activity: 'Sleeping',

      headline: 'Offline · Sleeping',

      currentFocus: 'Rest and recovery',

      availability: NowAvailability.OFFLINE,

      tags: ['sleep', 'health', 'whoop'],

      visibility: NowVisibility.PUBLIC,

      showLocation: false,

      showAvailability: true,

      showMood: false,

      showHealth: true,

      source: NowSource.WHOOP,

      sourceExternalId: sleepId,

      startedAt: sleep.start,

      expiresAt: sleep.end,

      lastActivityAt: new Date().toISOString(),

      metadata: {
        whoopSleepId: sleepId,
      },
    });
  }

  private async handleRecoveryUpdated() {
    await this.whoopService.syncRecentHealth(3);

    /**
     * Recovery changes the health
     * snapshot, not the primary
     * Now activity.
     */
  }

  private async handleDeletedEvent(eventType: WhoopWebhookEventType) {
    await this.whoopService.syncRecentHealth(3);

    this.logger.log(`WHOOP deletion webhook processed: ${eventType}`);
  }

  private validateSignature(
    rawBody: Buffer,

    signature?: string,

    timestamp?: string,
  ) {
    if (!signature || !timestamp) {
      throw new UnauthorizedException(
        'WHOOP webhook signature headers are missing.',
      );
    }

    const clientSecret = this.configService.get<string>('WHOOP_CLIENT_SECRET');

    if (!clientSecret) {
      throw new UnauthorizedException('WHOOP_CLIENT_SECRET is not configured.');
    }

    const signedContent = Buffer.concat([
      Buffer.from(timestamp, 'utf8'),

      rawBody,
    ]);

    const expectedSignature = createHmac('sha256', clientSecret)
      .update(signedContent)
      .digest('base64');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    const providedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      throw new UnauthorizedException('Invalid WHOOP webhook signature.');
    }

    const valid = timingSafeEqual(expectedBuffer, providedBuffer);

    if (!valid) {
      throw new UnauthorizedException('Invalid WHOOP webhook signature.');
    }
  }

  private isIntervalActiveNow(
    startValue?: string,

    endValue?: string,
  ) {
    if (!startValue) {
      return false;
    }

    const now = Date.now();

    const start = new Date(startValue).getTime();

    if (Number.isNaN(start)) {
      return false;
    }

    if (start > now) {
      return false;
    }

    if (!endValue) {
      return true;
    }

    const end = new Date(endValue).getTime();

    if (Number.isNaN(end)) {
      return false;
    }

    return start <= now && end >= now;
  }

  private getDurationMinutes(
    startValue?: string,

    endValue?: string,
  ) {
    if (!startValue || !endValue) {
      return undefined;
    }

    const start = new Date(startValue).getTime();

    const end = new Date(endValue).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      return undefined;
    }

    return Number(((end - start) / 60000).toFixed(2));
  }

  private resolveWorkoutName(workout: {
    sport_name?: string;
    sport_id?: number;
  }) {
    if (workout.sport_name) {
      return workout.sport_name;
    }

    if (workout.sport_id !== undefined) {
      return `Sport ${workout.sport_id}`;
    }

    return undefined;
  }

  private numberOrUndefined(value: unknown) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return undefined;
    }

    return value;
  }
}
