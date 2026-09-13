import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  CreateMediaAccountDto,
  CreateMediaAssetDto,
  CreateMediaAssetUploadIntentDto,
  AttachMediaLibraryAssetDto,
  CreateMediaContentItemDto,
  CreateMediaPublicationDto,
  AcceptMediaDirectorCandidateDto,
  GenerateMediaContentBatchDto,
  RejectMediaDirectorCandidateDto,
  MediaCandidateFingerprintDto,
  MediaIntelligenceBackfillDto,
  RecordRejectedMediaCandidateDto,
  GenerateMediaProductionPackDto,
  UpdateMediaProductionAssetDto,
  UpdateMediaAccountDto,
  ReserveMediaCalendarSlotDto,
  ScheduleMediaPublicationDto,
  PublishMediaNowDto,
  CompleteManualMediaPublishDto,
  RetryMediaPublishDto,
  ConnectBufferChannelDto,
  SyncMediaPublicationMetricsDto,
  MediaGrowthSyncAccountsDto,
  MediaGrowthSyncPublishedDto,
  RecordMediaAccountMetricsDto,
  RebuildMediaGrowthLearningsDto,
  CreateMediaGrowthExperimentDto,
  UpdateMediaGrowthExperimentDto,
} from './dto/media-core.dto';
import {
  BootstrapMediaPresenceDto,
  GenerateMediaPresenceStrategyDto,
  GenerateMediaVoiceProfileDto,
} from './dto/media-presence.dto';
import { GenerateMediaPlanningCycleDto } from './dto/media-planning.dto';
import {
  BootstrapMediaLaunchDto,
  UpdateMediaLaunchProfileDto,
} from './dto/media-launch.dto';
import {
  RunMediaAutopilotDto,
  UpdateMediaAutopilotRecommendationDto,
  UpdateMediaAutopilotSettingsDto,
} from './dto/media-autopilot.dto';
import { MediaBufferService } from './media-buffer.service';
import { MediaContentDirectorService } from './media-content-director.service';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaCoreService } from './media-core.service';
import { MediaProductionService } from './media-production.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaAutopilotService } from './media-autopilot.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaPlanningService } from './media-planning.service';
import { MediaPlanningGenerationService } from './media-planning-generation.service';
import { MediaLearningService } from './media-learning.service';
import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';
import { MediaTodayService } from './media-today.service';
import { MediaOperationsService } from './media-operations.service';
import { MediaLaunchService } from './media-launch.service';
import { MediaExecutionService } from './media-execution.service';
import { MediaAssetLibraryService } from './media-asset-library.service';
import { MediaPreflightService } from './media-preflight.service';
import { MediaReleaseService } from './media-release.service';
import { UpdateMediaExecutionDto } from './dto/media-execution.dto';
import {
  DecideMediaPreflightDto,
  RunMediaPreflightDto,
} from './dto/media-review.dto';
import {
  MediaContentMemoryScope,
  MediaRepetitionRisk,
} from './schemas/media-content-memory.schema';
import { MediaAssetType } from './schemas/media-asset.schema';
import {
  RefreshMediaSocialRecommendationsDto,
  RunMediaSocialPresenceReviewDto,
  SyncMediaSocialProfileDto,
  UpdateMediaSocialRecommendationDto,
} from './dto/media-social-presence.dto';
import { MediaSocialPresenceService } from './media-social-presence.service';

@Controller('media/core')
export class MediaCoreController {
  constructor(
    private readonly service: MediaCoreService,
    private readonly bufferService: MediaBufferService,
    private readonly intelligenceService: MediaContentIntelligenceService,
    private readonly directorService: MediaContentDirectorService,
    private readonly productionService: MediaProductionService,
    private readonly calendarService: MediaCalendarService,
    private readonly growthService: MediaGrowthService,
    private readonly autopilotService: MediaAutopilotService,
    private readonly presenceService: MediaPresenceService,
    private readonly planningService: MediaPlanningService,
    private readonly planningGenerationService: MediaPlanningGenerationService,
    private readonly learningService: MediaLearningService,
    private readonly strategyAdaptationService: MediaStrategyAdaptationService,
    private readonly todayService: MediaTodayService,
    private readonly operationsService: MediaOperationsService,
    private readonly launchService: MediaLaunchService,
    private readonly executionService: MediaExecutionService,
    private readonly assetLibraryService: MediaAssetLibraryService,
    private readonly preflightService: MediaPreflightService,
    private readonly releaseService: MediaReleaseService,
    private readonly socialPresenceService: MediaSocialPresenceService,
  ) {}

  @Get('overview') overview() {
    return this.service.overview();
  }

  @Get('buffer/status') bufferStatus() {
    return this.bufferService.status();
  }

  @Post('buffer/sync') syncBufferAccounts() {
    return this.bufferService.syncAccounts();
  }

  @Get('buffer/insights') bufferInsights(@Query('limit') limit?: string) {
    return this.bufferService.insights(limit ? Number(limit) : 20);
  }

  @Post('buffer/recalibrate') async recalibrateFromBuffer() {
    const accounts = await this.bufferService.syncAccounts();
    const latest = await this.growthService.syncPublished(100);
    const lifecycle = await this.growthService.syncLifecycle(150);
    const learning = await this.learningService.rebuildAll(90);
    const adaptation = await this.strategyAdaptationService.generate({
      force: true,
      notes:
        'Recalibrated from the latest Buffer post metrics. Preserve voice and anti-repetition safeguards; treat small samples cautiously.',
    });
    return {
      generatedAt: new Date().toISOString(),
      accounts,
      latest,
      lifecycle,
      learning,
      adaptation,
      insights: await this.bufferService.insights(20),
    };
  }

  @Post('buffer/accounts/:accountId/connect') connectBufferAccount(
    @Param('accountId') accountId: string,
    @Body() dto: ConnectBufferChannelDto,
  ) {
    return this.bufferService.connectAccount(accountId, dto);
  }

  @Post('buffer/accounts/:accountId/disconnect') disconnectBufferAccount(
    @Param('accountId') accountId: string,
  ) {
    return this.bufferService.disconnectAccount(accountId);
  }

  @Post('buffer/reconcile') reconcileBufferPublications() {
    return this.calendarService.reconcileBufferPublications();
  }

  @Get('accounts') accounts() {
    return this.service.listAccounts();
  }

  @Post('accounts') createAccount(@Body() dto: CreateMediaAccountDto) {
    return this.service.createAccount(dto);
  }

  @Patch('accounts/:accountId') updateAccount(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateMediaAccountDto,
  ) {
    return this.calendarService.updateAccount(accountId, dto);
  }

  @Get('social-presence/overview') socialPresenceOverview() {
    return this.socialPresenceService.overview();
  }

  @Post('social-presence/sync') syncSocialPresence(
    @Body() dto: SyncMediaSocialProfileDto,
  ) {
    return this.socialPresenceService.syncAll(dto?.syncNetwork ?? true);
  }

  @Post('social-presence/accounts/:accountId/sync') syncSocialPresenceAccount(
    @Param('accountId') accountId: string,
    @Body() dto: SyncMediaSocialProfileDto,
  ) {
    return this.socialPresenceService.syncAccount(
      accountId,
      dto?.syncNetwork ?? true,
    );
  }

  @Post('social-presence/recommendations/refresh') refreshSocialRecommendations(
    @Body() dto: RefreshMediaSocialRecommendationsDto,
  ) {
    return this.socialPresenceService.refreshRecommendations(
      dto?.force ?? false,
    );
  }

  @Patch('social-presence/recommendations/:recommendationId')
  updateSocialRecommendation(
    @Param('recommendationId') recommendationId: string,
    @Body() dto: UpdateMediaSocialRecommendationDto,
  ) {
    return this.socialPresenceService.updateRecommendation(
      recommendationId,
      dto.status,
    );
  }

  @Post('social-presence/review/run') runSocialPresenceReview(
    @Body() dto: RunMediaSocialPresenceReviewDto,
  ) {
    return this.socialPresenceService.runWeeklyReview(dto?.force ?? true);
  }

  @Get('calendar/overview') calendarOverview() {
    return this.calendarService.overview();
  }

  @Post('calendar/ensure') ensureCalendar() {
    return this.calendarService.ensureHorizon();
  }

  @Get('calendar/publishing-queue') publishingQueue() {
    return this.calendarService.getPublishingQueue();
  }

  @Post('calendar/slots/:slotId/reserve') reserveCalendarSlot(
    @Param('slotId') slotId: string,
    @Body() dto: ReserveMediaCalendarSlotDto,
  ) {
    return this.calendarService.reserveSlot(slotId, dto);
  }

  @Post('calendar/publications/:publicationId/schedule') schedulePublication(
    @Param('publicationId') publicationId: string,
    @Body() dto: ScheduleMediaPublicationDto,
  ) {
    return this.calendarService.schedulePublication(publicationId, dto);
  }

  @Post('calendar/publications/:publicationId/publish-now') publishNow(
    @Param('publicationId') publicationId: string,
    @Body() _dto: PublishMediaNowDto,
  ) {
    void _dto;
    return this.calendarService.publishNow(publicationId);
  }

  @Post('calendar/publications/:publicationId/retry') retryPublish(
    @Param('publicationId') publicationId: string,
    @Body() dto: RetryMediaPublishDto,
  ) {
    return this.calendarService.retryPublish(
      publicationId,
      dto.publishNow ?? true,
    );
  }

  @Post('calendar/publications/:publicationId/manual-complete')
  completeManualPublish(
    @Param('publicationId') publicationId: string,
    @Body() dto: CompleteManualMediaPublishDto,
  ) {
    return this.calendarService.completeManualPublish(publicationId, dto);
  }

  @Get('review/overview') reviewOverview() {
    return this.preflightService.overview();
  }

  @Get('review/publications/:publicationId') publicationReview(
    @Param('publicationId') publicationId: string,
  ) {
    return this.preflightService.get(publicationId);
  }

  @Post('review/publications/:publicationId/run') runPublicationReview(
    @Param('publicationId') publicationId: string,
    @Body() dto: RunMediaPreflightDto,
  ) {
    return this.preflightService.run(publicationId, dto?.force ?? false);
  }

  @Patch('review/publications/:publicationId/decision') decidePublicationReview(
    @Param('publicationId') publicationId: string,
    @Body() dto: DecideMediaPreflightDto,
  ) {
    return this.preflightService.decide(publicationId, dto.decision, dto.note);
  }

  @Get('release/overview') releaseOverview() {
    return this.releaseService.overview();
  }

  @Post('release/repair-safe') releaseRepairSafeState() {
    return this.releaseService.repairSafeState();
  }

  @Get('operations/overview') operationsOverview() {
    return this.operationsService.overview();
  }

  @Post('operations/repair-safe') repairMediaOperationsSafeState() {
    return this.operationsService.repairSafeState();
  }

  @Get('launch/overview') launchOverview() {
    return this.launchService.overview();
  }

  @Post('launch/bootstrap') async bootstrapLaunch(
    @Body() dto: BootstrapMediaLaunchDto,
  ) {
    const launch = await this.launchService.bootstrap(dto ?? {});
    const plan = await this.planningService.generate({
      force: true,
      startDate: dto?.startDate,
      notes: dto?.notes?.trim()
        ? `Day-1 launch calibration: ${dto.notes.trim()}`
        : 'Day-1 launch calibration bootstrap.',
    });
    return { launch, plan };
  }

  @Patch('launch/profile') updateLaunchProfile(
    @Body() dto: UpdateMediaLaunchProfileDto,
  ) {
    return this.launchService.updateProfileApplied(dto.platform, dto.applied);
  }

  @Get('presence/overview') presenceOverview() {
    return this.presenceService.overview();
  }

  @Get('presence/context') presenceContext(@Query('days') days?: string) {
    return this.presenceService.worldContext(days ? Number(days) : 120);
  }

  @Post('presence/bootstrap') bootstrapPresence(
    @Body() dto: BootstrapMediaPresenceDto,
  ) {
    return this.presenceService.bootstrap(dto);
  }

  @Post('presence/strategy/generate') generatePresenceStrategy(
    @Body() dto: GenerateMediaPresenceStrategyDto,
  ) {
    return this.presenceService.generateStrategy(dto);
  }

  @Post('presence/voice/generate') generateVoiceProfile(
    @Body() dto: GenerateMediaVoiceProfileDto,
  ) {
    return this.presenceService.generateVoiceProfile(dto);
  }

  @Get('presence-os/overview') presenceOsOverview() {
    return this.strategyAdaptationService.overview();
  }

  @Post('presence-os/adapt') adaptPresenceStrategy(
    @Body() body: { force?: boolean; notes?: string },
  ) {
    return this.strategyAdaptationService.generate(body ?? {});
  }

  @Get('presence-os/today') presenceToday(@Query('date') date?: string) {
    return this.todayService.overview(date);
  }

  @Patch('presence-os/executions/:key') updatePresenceExecution(
    @Param('key') key: string,
    @Body() dto: UpdateMediaExecutionDto,
  ) {
    return this.executionService.update(key, dto);
  }

  @Get('autopilot/overview') autopilotOverview() {
    return this.autopilotService.overview();
  }

  @Get('autopilot/runs') autopilotRuns(@Query('limit') limit?: string) {
    return this.autopilotService.listRuns(limit ? Number(limit) : 30);
  }

  @Post('autopilot/run') runAutopilot(@Body() dto: RunMediaAutopilotDto) {
    return this.autopilotService.run(dto);
  }

  @Patch('autopilot/settings') updateAutopilotSettings(
    @Body() dto: UpdateMediaAutopilotSettingsDto,
  ) {
    return this.autopilotService.updateSettings(dto);
  }

  @Patch('autopilot/runs/:runId/recommendations/:recommendationKey')
  updateAutopilotRecommendation(
    @Param('runId') runId: string,
    @Param('recommendationKey') recommendationKey: string,
    @Body() dto: UpdateMediaAutopilotRecommendationDto,
  ) {
    return this.autopilotService.updateRecommendation(
      runId,
      recommendationKey,
      dto,
    );
  }

  @Get('learning/overview') learningOverview(@Query('days') days?: string) {
    return this.learningService.overview(days ? Number(days) : 90);
  }

  @Post('learning/rebuild') rebuildLearning(@Body() body: { days?: number }) {
    return this.learningService.rebuildAll(body?.days ?? 90);
  }

  @Post('learning/performance/rebuild') rebuildPerformanceLearning(
    @Body() body: { days?: number },
  ) {
    return this.learningService.rebuildPerformance(body?.days ?? 90);
  }

  @Post('learning/audience/rebuild') rebuildAudienceLearning(
    @Body() body: { days?: number },
  ) {
    return this.learningService.rebuildAudience(body?.days ?? 60);
  }

  @Post('growth/lifecycle/sync') syncLifecycleGrowth() {
    return this.growthService.syncLifecycle(150);
  }

  @Get('growth/overview') growthOverview(@Query('days') days?: string) {
    return this.growthService.overview(days ? Number(days) : 30);
  }

  @Post('growth/sync') syncGrowthMetrics(
    @Body() dto: MediaGrowthSyncPublishedDto,
  ) {
    return this.growthService.syncPublished(dto.limit ?? 50, dto.period);
  }

  @Post('growth/accounts/sync') syncGrowthAccounts(
    @Body() dto: MediaGrowthSyncAccountsDto,
  ) {
    return this.growthService.syncAccounts(dto.limit ?? 50);
  }

  @Post('growth/publications/:publicationId/sync') syncPublicationGrowth(
    @Param('publicationId') publicationId: string,
    @Body() dto: SyncMediaPublicationMetricsDto,
  ) {
    return this.growthService.syncPublicationMetrics(publicationId, dto.period);
  }

  @Get('growth/publications/:publicationId') publicationGrowth(
    @Param('publicationId') publicationId: string,
  ) {
    return this.growthService.publicationPerformance(publicationId);
  }

  @Post('growth/accounts/:accountId/snapshots') recordAccountGrowth(
    @Param('accountId') accountId: string,
    @Body() dto: RecordMediaAccountMetricsDto,
  ) {
    return this.growthService.recordAccountMetrics(accountId, dto);
  }

  @Get('growth/accounts/:accountId') accountGrowth(
    @Param('accountId') accountId: string,
    @Query('days') days?: string,
  ) {
    return this.growthService.accountGrowth(
      accountId,
      days ? Number(days) : 90,
    );
  }

  @Get('growth/learnings') growthLearnings(@Query('limit') limit?: string) {
    return this.growthService.listLearnings(limit ? Number(limit) : 50);
  }

  @Post('growth/learnings/rebuild') rebuildGrowthLearnings(
    @Body() dto: RebuildMediaGrowthLearningsDto,
  ) {
    return this.growthService.rebuildLearnings(dto);
  }

  @Get('growth/experiments') growthExperiments(@Query('limit') limit?: string) {
    return this.growthService.listExperiments(limit ? Number(limit) : 50);
  }

  @Post('growth/experiments') createGrowthExperiment(
    @Body() dto: CreateMediaGrowthExperimentDto,
  ) {
    return this.growthService.createExperiment(dto);
  }

  @Patch('growth/experiments/:experimentId') updateGrowthExperiment(
    @Param('experimentId') experimentId: string,
    @Body() dto: UpdateMediaGrowthExperimentDto,
  ) {
    return this.growthService.updateExperiment(experimentId, dto);
  }

  @Get('content') content(@Query('search') search?: string) {
    return this.service.listContent(search);
  }

  @Post('content') createContent(@Body() dto: CreateMediaContentItemDto) {
    return this.service.createContent(dto);
  }

  @Get('publications') publications() {
    return this.service.listPublications();
  }

  @Post('publications') createPublication(
    @Body() dto: CreateMediaPublicationDto,
  ) {
    return this.service.createPublication(dto);
  }

  @Get('assets') assets() {
    return this.service.listAssets();
  }

  @Post('assets') createAsset(@Body() dto: CreateMediaAssetDto) {
    return this.service.createAsset(dto);
  }

  @Get('asset-library/storage') assetLibraryStorage() {
    return this.assetLibraryService.storageStatus();
  }

  @Get('asset-library') assetLibrary(
    @Query('search') search?: string,
    @Query('type') type?: MediaAssetType,
    @Query('limit') limit?: string,
  ) {
    return this.assetLibraryService.list({
      search,
      type,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('asset-library/upload-intent') createAssetUploadIntent(
    @Body() dto: CreateMediaAssetUploadIntentDto,
  ) {
    return this.assetLibraryService.createUploadIntent(dto);
  }

  @Post('asset-library/:assetId/complete') completeAssetUpload(
    @Param('assetId') assetId: string,
  ) {
    return this.assetLibraryService.completeUpload(assetId);
  }

  @Post('asset-library/:assetId/archive') archiveAssetLibraryItem(
    @Param('assetId') assetId: string,
  ) {
    return this.assetLibraryService.archive(assetId);
  }

  @Get('migration') migrationStatus() {
    return this.service.migrationStatus();
  }

  @Post('migration') migrate() {
    return this.service.migrateLegacy();
  }

  @Get('director/overview') directorOverview() {
    return this.directorService.overview();
  }

  @Get('director/runs') directorRuns(@Query('limit') limit?: string) {
    return this.directorService.listRuns(limit ? Number(limit) : 20);
  }

  @Get('director/runs/:runId') directorRun(@Param('runId') runId: string) {
    return this.directorService.getRun(runId);
  }

  @Post('director/generate') generateDirectorBatch(
    @Body() dto: GenerateMediaContentBatchDto,
  ) {
    return this.directorService.generate(dto);
  }

  @Post('director/runs/:runId/candidates/:candidateKey/accept')
  acceptDirectorCandidate(
    @Param('runId') runId: string,
    @Param('candidateKey') candidateKey: string,
    @Body() dto: AcceptMediaDirectorCandidateDto,
  ) {
    return this.directorService.acceptCandidate(runId, candidateKey, dto);
  }

  @Post('director/runs/:runId/candidates/:candidateKey/reject')
  rejectDirectorCandidate(
    @Param('runId') runId: string,
    @Param('candidateKey') candidateKey: string,
    @Body() dto: RejectMediaDirectorCandidateDto,
  ) {
    return this.directorService.rejectCandidate(runId, candidateKey, dto);
  }

  @Get('production/overview') productionOverview() {
    return this.productionService.overview();
  }

  @Get('production/publications') productionPublications() {
    return this.productionService.listStudio();
  }

  @Get('production/publications/:publicationId') productionPublication(
    @Param('publicationId') publicationId: string,
  ) {
    return this.productionService.getPack(publicationId);
  }

  @Post('production/publications/:publicationId/generate') generateProduction(
    @Param('publicationId') publicationId: string,
    @Body() dto: GenerateMediaProductionPackDto,
  ) {
    return this.productionService.generate(publicationId, dto);
  }

  @Post('production/publications/:publicationId/complete') completeProduction(
    @Param('publicationId') publicationId: string,
  ) {
    return this.productionService.markComplete(publicationId);
  }

  @Patch('production/assets/:assetId') updateProductionAsset(
    @Param('assetId') assetId: string,
    @Body() dto: UpdateMediaProductionAssetDto,
  ) {
    return this.productionService.updateAsset(assetId, dto);
  }

  @Get('production/publications/:publicationId/asset-suggestions')
  productionAssetSuggestions(@Param('publicationId') publicationId: string) {
    return this.productionService.assetSuggestions(publicationId);
  }

  @Post('production/assets/:assetId/attach-library')
  attachProductionLibraryAsset(
    @Param('assetId') assetId: string,
    @Body() dto: AttachMediaLibraryAssetDto,
  ) {
    return this.productionService.attachLibraryAsset(
      assetId,
      dto.libraryAssetId,
    );
  }

  @Get('intelligence/overview') intelligenceOverview() {
    return this.intelligenceService.overview();
  }

  @Get('intelligence/memories') intelligenceMemories(
    @Query('scope') scope?: MediaContentMemoryScope,
    @Query('risk') risk?: MediaRepetitionRisk,
    @Query('limit') limit?: string,
  ) {
    return this.intelligenceService.listMemories({
      scope,
      risk,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('intelligence/check') checkCandidate(
    @Body() dto: MediaCandidateFingerprintDto,
  ) {
    return this.intelligenceService.checkCandidate(dto);
  }

  @Post('intelligence/rejected') rememberRejectedCandidate(
    @Body() dto: RecordRejectedMediaCandidateDto,
  ) {
    return this.intelligenceService.recordRejectedCandidate(dto);
  }

  @Post('intelligence/backfill') backfillIntelligence(
    @Body() dto: MediaIntelligenceBackfillDto,
  ) {
    return this.intelligenceService.backfill(dto);
  }

  @Post('content/:contentItemId/intelligence') analyzeContent(
    @Param('contentItemId') contentItemId: string,
    @Body() body?: { refresh?: boolean },
  ) {
    return this.intelligenceService.analyzeContentItem(
      contentItemId,
      body?.refresh ?? false,
    );
  }

  @Post('publications/:publicationId/intelligence') analyzePublication(
    @Param('publicationId') publicationId: string,
    @Body() body?: { refresh?: boolean },
  ) {
    return this.intelligenceService.analyzePublication(
      publicationId,
      body?.refresh ?? false,
    );
  }

  @Get('planning/overview') planningOverview() {
    return this.planningService.overview();
  }

  @Get('planning/cycles') listPlanningCycles(@Query('limit') limit?: string) {
    return this.planningService.list(limit ? Number(limit) : 12);
  }

  @Get('planning/archive') planningArchive(@Query('days') days?: string) {
    return this.planningService.archive(days ? Number(days) : 90);
  }

  @Post('planning/generate-async') startPlanningGeneration(
    @Body() dto: GenerateMediaPlanningCycleDto,
  ) {
    return this.planningGenerationService.start(dto);
  }

  @Get('planning/generation/latest') latestPlanningGeneration() {
    return this.planningGenerationService.latest();
  }

  @Get('planning/generation/:jobId') planningGenerationStatus(
    @Param('jobId') jobId: string,
  ) {
    return this.planningGenerationService.get(jobId);
  }

  @Post('planning/generate') generatePlanningCycle(
    @Body() dto: GenerateMediaPlanningCycleDto,
  ) {
    return this.planningService.generate(dto);
  }
}
