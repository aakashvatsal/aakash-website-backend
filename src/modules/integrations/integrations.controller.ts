import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { RawBodyRequest } from '@nestjs/common';

import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';

import { IntegrationsService } from './integrations.service';

import { WhoopWebhookDto } from './whoop/dto/whoop-webhook.dto';

import { WhoopService } from './whoop/whoop.service';

import { WhoopWebhookService } from './whoop/whoop-webhook.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,

    private readonly whoopService: WhoopService,

    private readonly whoopWebhookService: WhoopWebhookService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.integrationsService.getOverview();
  }

  @Get('media-analytics/status')
  getMediaAnalyticsStatus() {
    return this.integrationsService.getMediaAnalyticsStatus();
  }

  @Get('whoop/connect')
  getWhoopConnectUrl() {
    return this.whoopService.getAuthorizationUrl();
  }

  @Get('whoop/callback')
  @Public()
  whoopCallback(
    @Query('code')
    code?: string,

    @Query('state')
    state?: string,

    @Query('error')
    error?: string,

    @Query('error_description')
    errorDescription?: string,
  ) {
    return this.whoopService.handleCallback(
      code,
      state,
      error,
      errorDescription,
    );
  }

  @Get('whoop/status')
  getWhoopStatus() {
    return this.whoopService.getStatus();
  }

  /**
   * Manual sync for a specific period.
   */
  @Post('whoop/sync')
  syncWhoop(
    @Query('startDate')
    startDate?: string,

    @Query('endDate')
    endDate?: string,
  ) {
    return this.whoopService.syncHealth({
      startDate,
      endDate,
    });
  }

  /**
   * Same sync used by the cron.
   *
   * Useful for manual testing.
   */
  @Post('whoop/sync/recent')
  syncRecentWhoop(
    @Query('days')
    days?: string,
  ) {
    const numberOfDays = days ? Number(days) : 3;

    return this.whoopService.syncRecentHealth(numberOfDays);
  }

  /**
   * One-time historical import.
   */
  @Post('whoop/backfill')
  backfillWhoop(
    @Query('startDate')
    startDate: string,

    @Query('endDate')
    endDate: string,
  ) {
    return this.whoopService.backfillHealth(startDate, endDate);
  }

  /**
   * WHOOP webhook receiver.
   *
   * WHOOP sends:
   * - workout.updated
   * - workout.deleted
   * - sleep.updated
   * - sleep.deleted
   * - recovery.updated
   * - recovery.deleted
   */
  @Post('whoop/webhook')
  @Public()
  receiveWhoopWebhook(
    @Body()
    dto: WhoopWebhookDto,

    @Req()
    request: RawBodyRequest<Request>,

    @Headers('x-whoop-signature')
    signature?: string,

    @Headers('x-whoop-signature-timestamp')
    timestamp?: string,
  ) {
    if (!request.rawBody) {
      throw new Error(
        'Raw request body is unavailable. Enable rawBody in NestFactory.',
      );
    }

    return this.whoopWebhookService.acceptWebhook(
      dto,
      request.rawBody,
      signature,
      timestamp,
    );
  }
}
