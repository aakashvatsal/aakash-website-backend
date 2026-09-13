import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { Company, CompanySchema } from '../companies/schemas/company.schema';
import {
  HsakaaDailyContext,
  HsakaaDailyContextSchema,
} from '../../hsakaa/schemas/hsakaa-daily-context.schema';
import {
  HsakaaWeeklyReview,
  HsakaaWeeklyReviewSchema,
} from '../../hsakaa/schemas/hsakaa-weekly-review.schema';
import {
  HsakaaBrief,
  HsakaaBriefSchema,
} from '../../hsakaa/schemas/hsakaa-brief.schema';

import { AiModule } from '../ai/ai.module';
import { HobbiesModule } from '../hobbies/hobbies.module';

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
import { MediaWorldContextService } from './media-world-context.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaPlanningService } from './media-planning.service';
import { MediaPlanningGenerationService } from './media-planning-generation.service';
import { MediaLearningService } from './media-learning.service';
import { MediaLearningScheduler } from './media-learning.scheduler';
import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';
import { MediaTodayService } from './media-today.service';
import { MediaOperationsService } from './media-operations.service';
import { MediaLaunchService } from './media-launch.service';
import { MediaExecutionService } from './media-execution.service';
import { MediaAssetStorageService } from './media-asset-storage.service';
import { MediaAssetLibraryService } from './media-asset-library.service';
import { MediaPresenceOsScheduler } from './media-presence-os.scheduler';
import { MediaPreflightService } from './media-preflight.service';
import { MediaReleaseService } from './media-release.service';
import { MediaService } from './media.service';
import { MediaSocialPresenceService } from './media-social-presence.service';
import { MediaSocialPresenceScheduler } from './media-social-presence.scheduler';
import {
  MediaSocialProfile,
  MediaSocialProfileSchema,
} from './schemas/media-social-profile.schema';
import {
  MediaSocialFollowing,
  MediaSocialFollowingSchema,
} from './schemas/media-social-following.schema';
import {
  MediaSocialRecommendation,
  MediaSocialRecommendationSchema,
} from './schemas/media-social-recommendation.schema';
import {
  MediaSocialPresenceReview,
  MediaSocialPresenceReviewSchema,
} from './schemas/media-social-presence-review.schema';
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
  MediaPresenceStrategy,
  MediaPresenceStrategySchema,
} from './schemas/media-presence-strategy.schema';
import {
  MediaVoiceProfile,
  MediaVoiceProfileSchema,
} from './schemas/media-voice-profile.schema';
import {
  MediaPlanningCycle,
  MediaPlanningCycleSchema,
} from './schemas/media-planning-cycle.schema';
import {
  MediaPerformanceInsight,
  MediaPerformanceInsightSchema,
} from './schemas/media-performance-insight.schema';
import {
  MediaAudienceInsight,
  MediaAudienceInsightSchema,
} from './schemas/media-audience-insight.schema';
import {
  MediaPresenceReview,
  MediaPresenceReviewSchema,
} from './schemas/media-presence-review.schema';
import {
  MediaLaunchState,
  MediaLaunchStateSchema,
} from './schemas/media-launch-state.schema';
import {
  MediaDailyExecution,
  MediaDailyExecutionSchema,
} from './schemas/media-daily-execution.schema';
import {
  MediaPublicationReview,
  MediaPublicationReviewSchema,
} from './schemas/media-publication-review.schema';
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
    HobbiesModule,
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: HsakaaDailyContext.name, schema: HsakaaDailyContextSchema },
      { name: HsakaaWeeklyReview.name, schema: HsakaaWeeklyReviewSchema },
      { name: HsakaaBrief.name, schema: HsakaaBriefSchema },
      { name: MediaPresenceStrategy.name, schema: MediaPresenceStrategySchema },
      { name: MediaVoiceProfile.name, schema: MediaVoiceProfileSchema },
      { name: MediaPlanningCycle.name, schema: MediaPlanningCycleSchema },
      {
        name: MediaPerformanceInsight.name,
        schema: MediaPerformanceInsightSchema,
      },
      { name: MediaAudienceInsight.name, schema: MediaAudienceInsightSchema },
      { name: MediaPresenceReview.name, schema: MediaPresenceReviewSchema },
      { name: MediaLaunchState.name, schema: MediaLaunchStateSchema },
      { name: MediaDailyExecution.name, schema: MediaDailyExecutionSchema },
      {
        name: MediaPublicationReview.name,
        schema: MediaPublicationReviewSchema,
      },
      { name: MediaAccount.name, schema: MediaAccountSchema },
      { name: MediaSocialProfile.name, schema: MediaSocialProfileSchema },
      { name: MediaSocialFollowing.name, schema: MediaSocialFollowingSchema },
      {
        name: MediaSocialRecommendation.name,
        schema: MediaSocialRecommendationSchema,
      },
      {
        name: MediaSocialPresenceReview.name,
        schema: MediaSocialPresenceReviewSchema,
      },
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
    MediaWorldContextService,
    MediaPresenceService,
    MediaPlanningService,
    MediaPlanningGenerationService,
    MediaLearningService,
    MediaLearningScheduler,
    MediaStrategyAdaptationService,
    MediaTodayService,
    MediaOperationsService,
    MediaLaunchService,
    MediaExecutionService,
    MediaAssetStorageService,
    MediaAssetLibraryService,
    MediaPreflightService,
    MediaReleaseService,
    MediaPresenceOsScheduler,
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
    MediaSocialPresenceService,
    MediaSocialPresenceScheduler,
    MediaAnalyticsService,
  ],
  exports: [
    MediaCoreService,
    MediaWorldContextService,
    MediaPresenceService,
    MediaPlanningService,
    MediaPlanningGenerationService,
    MediaLearningService,
    MediaLearningScheduler,
    MediaStrategyAdaptationService,
    MediaTodayService,
    MediaOperationsService,
    MediaLaunchService,
    MediaExecutionService,
    MediaAssetStorageService,
    MediaAssetLibraryService,
    MediaPreflightService,
    MediaReleaseService,
    MediaPresenceOsScheduler,
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
    MediaSocialPresenceService,
    MediaAnalyticsService,
  ],
})
export class MediaModule {}
