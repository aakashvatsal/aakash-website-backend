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
import {
  MediaContentMemoryScope,
  MediaRepetitionRisk,
} from './schemas/media-content-memory.schema';

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
}
