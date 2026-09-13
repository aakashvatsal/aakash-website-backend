import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { AiModule } from '../ai/ai.module';
import { DietModule } from '../diet/diet.module';
import { HaircareModule } from '../haircare/haircare.module';
import { HealthReportsModule } from '../health-reports/health-reports.module';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { IntimateCareModule } from '../intimate-care/intimate-care.module';
import { MeditationModule } from '../meditation/meditation.module';
import { ProductsModule } from '../products/products.module';
import { SkincareModule } from '../skincare/skincare.module';
import { SupplementsModule } from '../supplements/supplements.module';
import { TasksModule } from '../tasks/tasks.module';
import { HealthController } from './health.controller';
import { HealthDashboardService } from './health-dashboard.service';
import { HealthEvidenceService } from './health-evidence.service';
import { HealthIntelligenceService } from './health-intelligence.service';
import { HealthMarketResearchService } from './health-market-research.service';
import { HealthObjectStorageService } from './health-object-storage.service';
import { HealthPlannerController } from './health-planner.controller';
import { HealthProactiveService } from './health-proactive.service';
import { HealthProgressService } from './health-progress.service';
import { HealthPlannerService } from './health-planner.service';
import { HealthService } from './health.service';
import {
  HealthAttentionItem,
  HealthAttentionItemSchema,
} from './schemas/health-attention-item.schema';
import { HealthVisionService } from './health-vision.service';
import { WhoopHealthService } from './integrations/whoop-health.service';
import {
  HealthBaseline,
  HealthBaselineSchema,
} from './schemas/health-baseline.schema';
import { HealthEntry, HealthEntrySchema } from './schemas/health-entry.schema';
import {
  HealthEvidenceSettings,
  HealthEvidenceSettingsSchema,
} from './schemas/health-evidence-settings.schema';
import {
  HealthIntervention,
  HealthInterventionSchema,
} from './schemas/health-intervention.schema';
import { HealthGoal, HealthGoalSchema } from './schemas/health-goal.schema';
import {
  HealthNotificationPreferences,
  HealthNotificationPreferencesSchema,
} from './schemas/health-notification-preferences.schema';
import {
  HealthOwnerUpdate,
  HealthOwnerUpdateSchema,
} from './schemas/health-owner-update.schema';
import {
  HealthPlanDay,
  HealthPlanDaySchema,
} from './schemas/health-plan-day.schema';
import {
  HealthPlanExecution,
  HealthPlanExecutionSchema,
} from './schemas/health-plan-execution.schema';
import {
  HealthPlanReview,
  HealthPlanReviewSchema,
} from './schemas/health-plan-review.schema';
import {
  HealthProgressPhoto,
  HealthProgressPhotoSchema,
} from './schemas/health-progress-photo.schema';
import {
  HealthSourceReport,
  HealthSourceReportSchema,
} from './schemas/health-source-report.schema';
import {
  HealthStrategy,
  HealthStrategySchema,
} from './schemas/health-strategy.schema';

@Module({
  imports: [
    AiModule,
    DietModule,
    SupplementsModule,
    MeditationModule,
    ProductsModule,
    HealthReportsModule,
    SkincareModule,
    HaircareModule,
    IntimateCareModule,
    TasksModule,
    HsakaaRuntimeModule,
    HsakaaObservabilityModule,
    MongooseModule.forFeature([
      { name: HealthEntry.name, schema: HealthEntrySchema },
      {
        name: HealthEvidenceSettings.name,
        schema: HealthEvidenceSettingsSchema,
      },
      { name: HealthPlanDay.name, schema: HealthPlanDaySchema },
      { name: HealthAttentionItem.name, schema: HealthAttentionItemSchema },
      { name: HealthIntervention.name, schema: HealthInterventionSchema },
      {
        name: HealthNotificationPreferences.name,
        schema: HealthNotificationPreferencesSchema,
      },
      { name: HealthPlanExecution.name, schema: HealthPlanExecutionSchema },
      { name: HealthOwnerUpdate.name, schema: HealthOwnerUpdateSchema },
      { name: HealthPlanReview.name, schema: HealthPlanReviewSchema },
      { name: HealthBaseline.name, schema: HealthBaselineSchema },
      { name: HealthGoal.name, schema: HealthGoalSchema },
      { name: HealthProgressPhoto.name, schema: HealthProgressPhotoSchema },
      { name: HealthSourceReport.name, schema: HealthSourceReportSchema },
      { name: HealthStrategy.name, schema: HealthStrategySchema },
    ]),
  ],
  controllers: [HealthController, HealthPlannerController],
  providers: [
    HealthService,
    HealthDashboardService,
    HealthEvidenceService,
    WhoopHealthService,
    HealthPlannerService,
    HealthProgressService,
    HealthIntelligenceService,
    HealthMarketResearchService,
    HealthObjectStorageService,
    HealthProactiveService,
    HealthVisionService,
    HsakaaOwnerSessionGuard,
  ],
  exports: [
    HealthService,
    HealthDashboardService,
    HealthEvidenceService,
    WhoopHealthService,
    HealthPlannerService,
    HealthProgressService,
    HealthIntelligenceService,
    HealthMarketResearchService,
    HealthObjectStorageService,
    HealthProactiveService,
    MongooseModule,
  ],
})
export class HealthModule {}
