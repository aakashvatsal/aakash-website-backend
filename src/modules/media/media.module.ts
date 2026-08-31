import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from '../ai/ai.module';

import { MediaController } from './media.controller';
import { MediaCoreController } from './media-core.controller';
import { MediaCoreService } from './media-core.service';
import { MediaContentDirectorService } from './media-content-director.service';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaProductionService } from './media-production.service';
import { MediaBufferService } from './media-buffer.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaCalendarScheduler } from './media-calendar.scheduler';
import { MediaPublishingService } from './media-publishing.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaGrowthScheduler } from './media-growth.scheduler';
import { MediaEngagementController } from './media-engagement.controller';
import { MediaEngagementWebhookController } from './media-engagement-webhook.controller';
import { MediaEngagementService } from './media-engagement.service';
import { MediaEngagementScheduler } from './media-engagement.scheduler';
import { MediaAutopilotService } from './media-autopilot.service';
import { MediaAutopilotScheduler } from './media-autopilot.scheduler';
import { MediaService } from './media.service';
import {
  MediaAccount,
  MediaAccountSchema,
} from './schemas/media-account.schema';
import { MediaAsset, MediaAssetSchema } from './schemas/media-asset.schema';
import {
  MediaContentItem,
  MediaContentItemSchema,
} from './schemas/media-content-item.schema';
import {
  MediaContentMemory,
  MediaContentMemorySchema,
} from './schemas/media-content-memory.schema';
import {
  MediaGenerationRun,
  MediaGenerationRunSchema,
} from './schemas/media-generation-run.schema';
import {
  MediaMetricSnapshot,
  MediaMetricSnapshotSchema,
} from './schemas/media-metric-snapshot.schema';
import { MediaPost, MediaPostSchema } from './schemas/media-post.schema';
import {
  MediaPublication,
  MediaPublicationSchema,
} from './schemas/media-publication.schema';
import { MediaAnalyticsService } from './services/media-analytics.service';
import {
  MediaCalendarSlot,
  MediaCalendarSlotSchema,
} from './schemas/media-calendar-slot.schema';
import {
  MediaAccountMetricSnapshot,
  MediaAccountMetricSnapshotSchema,
} from './schemas/media-account-metric-snapshot.schema';
import {
  MediaGrowthLearning,
  MediaGrowthLearningSchema,
} from './schemas/media-growth-learning.schema';
import {
  MediaGrowthExperiment,
  MediaGrowthExperimentSchema,
} from './schemas/media-growth-experiment.schema';
import {
  MediaEngagementItem,
  MediaEngagementItemSchema,
} from './schemas/media-engagement-item.schema';
import {
  MediaAutopilotRun,
  MediaAutopilotRunSchema,
  MediaAutopilotSettings,
  MediaAutopilotSettingsSchema,
} from './schemas/media-autopilot.schema';

@Module({
  imports: [
    ConfigModule,
    AiModule,
    MongooseModule.forFeature([
      { name: MediaAccount.name, schema: MediaAccountSchema },
      { name: MediaAsset.name, schema: MediaAssetSchema },
      { name: MediaCalendarSlot.name, schema: MediaCalendarSlotSchema },
      { name: MediaContentItem.name, schema: MediaContentItemSchema },
      { name: MediaContentMemory.name, schema: MediaContentMemorySchema },
      { name: MediaGenerationRun.name, schema: MediaGenerationRunSchema },
      { name: MediaPost.name, schema: MediaPostSchema },
      { name: MediaPublication.name, schema: MediaPublicationSchema },
      { name: MediaMetricSnapshot.name, schema: MediaMetricSnapshotSchema },
      {
        name: MediaAccountMetricSnapshot.name,
        schema: MediaAccountMetricSnapshotSchema,
      },
      { name: MediaGrowthLearning.name, schema: MediaGrowthLearningSchema },
      { name: MediaGrowthExperiment.name, schema: MediaGrowthExperimentSchema },
      { name: MediaEngagementItem.name, schema: MediaEngagementItemSchema },
      { name: MediaAutopilotRun.name, schema: MediaAutopilotRunSchema },
      {
        name: MediaAutopilotSettings.name,
        schema: MediaAutopilotSettingsSchema,
      },
    ]),
  ],
  controllers: [
    MediaCoreController,
    MediaEngagementController,
    MediaEngagementWebhookController,
    MediaController,
  ],
  providers: [
    MediaCoreService,
    MediaContentDirectorService,
    MediaContentIntelligenceService,
    MediaProductionService,
    MediaCalendarService,
    MediaBufferService,
    MediaPublishingService,
    MediaGrowthService,
    MediaGrowthScheduler,
    MediaEngagementService,
    MediaEngagementScheduler,
    MediaAutopilotService,
    MediaAutopilotScheduler,
    MediaCalendarScheduler,
    MediaService,
    MediaAnalyticsService,
  ],
  exports: [
    MediaCoreService,
    MediaContentDirectorService,
    MediaContentIntelligenceService,
    MediaProductionService,
    MediaCalendarService,
    MediaBufferService,
    MediaPublishingService,
    MediaGrowthService,
    MediaGrowthScheduler,
    MediaEngagementService,
    MediaEngagementScheduler,
    MediaAutopilotService,
    MediaAutopilotScheduler,
    MediaCalendarScheduler,
    MediaService,
    MediaAnalyticsService,
  ],
})
export class MediaModule {}
