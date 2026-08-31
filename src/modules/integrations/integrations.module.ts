import { Module } from '@nestjs/common';

import { ConfigModule } from '@nestjs/config';

import { MongooseModule } from '@nestjs/mongoose';

import { HealthModule } from '../health/health.module';

import { NowModule } from '../now/now.module';

import { MediaModule } from '../media/media.module';

import { IntegrationsController } from './integrations.controller';

import { IntegrationsService } from './integrations.service';

import { Integration, IntegrationSchema } from './schemas/integration.schema';

import {
  WhoopWebhookEvent,
  WhoopWebhookEventSchema,
} from './whoop/schemas/whoop-webhook-event.schema';

import { WhoopService } from './whoop/whoop.service';

import { WhoopSyncScheduler } from './whoop/whoop-sync.scheduler';

import { WhoopWebhookService } from './whoop/whoop-webhook.service';

@Module({
  imports: [
    ConfigModule,

    HealthModule,

    NowModule,

    MediaModule,

    MongooseModule.forFeature([
      {
        name: Integration.name,

        schema: IntegrationSchema,
      },

      {
        name: WhoopWebhookEvent.name,

        schema: WhoopWebhookEventSchema,
      },
    ]),
  ],

  controllers: [IntegrationsController],

  providers: [
    IntegrationsService,

    WhoopService,

    WhoopSyncScheduler,

    WhoopWebhookService,
  ],

  exports: [IntegrationsService, WhoopService],
})
export class IntegrationsModule {}
