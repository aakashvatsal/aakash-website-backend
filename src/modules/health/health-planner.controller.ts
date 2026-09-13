import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  CreateHealthGoalDto,
  GenerateHealthStrategyDto,
  HealthPhotoQueryDto,
  HealthPhotoUploadQueryDto,
  HealthSourceReportUploadQueryDto,
  ResolveHealthLocationDto,
  UpdateHealthSourceReportFollowUpDto,
  UpdateHealthGoalDto,
  UpsertHealthBaselineDto,
} from './dto/health-planner-setup.dto';
import {
  EnsureHealthPlanDto,
  HealthPlanWindowQueryDto,
  UpdateHealthPlanDayDto,
} from './dto/health-plan.dto';
import {
  GenerateHealthPlanReviewDto,
  HealthIntelligenceQueryDto,
  HealthPlanReviewsQueryDto,
  HealthProgressSummaryQueryDto,
  UpdateHealthRoutineTaskDto,
  UpsertHealthExecutionFeedbackDto,
} from './dto/health-plan-progress.dto';
import {
  CreateHealthOwnerUpdateDto,
  HealthOwnerUpdatesQueryDto,
} from './dto/health-owner-update.dto';
import { HealthIntelligenceService } from './health-intelligence.service';
import { HealthEvidenceService } from './health-evidence.service';
import { UpdateHealthEvidenceSettingsDto } from './dto/health-evidence.dto';
import {
  HealthAttentionQueryDto,
  RunHealthProactiveDto,
  UpdateHealthNotificationPreferencesDto,
} from './dto/health-proactive.dto';
import { HealthPlannerService } from './health-planner.service';
import { HealthProactiveService } from './health-proactive.service';
import { HealthProgressService } from './health-progress.service';
import { HealthPlanReviewPeriod } from './schemas/health-plan-review.schema';

type UploadedHealthPhoto = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/health-planner')
export class HealthPlannerController {
  constructor(
    private readonly healthPlannerService: HealthPlannerService,
    private readonly healthProgressService: HealthProgressService,
    private readonly healthIntelligenceService: HealthIntelligenceService,
    private readonly healthEvidenceService: HealthEvidenceService,
    private readonly healthProactiveService: HealthProactiveService,
  ) {}

  @Get('policy')
  getPolicy() {
    return this.healthPlannerService.getPolicy();
  }

  @Get('setup')
  getSetup() {
    return this.healthPlannerService.getSetup();
  }

  @Get('storage/status')
  getStorageStatus() {
    return this.healthPlannerService.getStorageStatus();
  }

  @Post('storage/migrate-legacy')
  migrateLegacyStorage() {
    return this.healthPlannerService.migrateLegacyStorage();
  }

  @Post('location/resolve')
  resolveLocation(@Body() dto: ResolveHealthLocationDto) {
    return this.healthPlannerService.resolveLocation(dto);
  }

  @Put('baseline')
  upsertBaseline(@Body() dto: UpsertHealthBaselineDto) {
    return this.healthPlannerService.upsertBaseline(dto);
  }

  @Post('goals')
  createGoal(@Body() dto: CreateHealthGoalDto) {
    return this.healthPlannerService.createGoal(dto);
  }

  @Patch('goals/:id')
  updateGoal(@Param('id') id: string, @Body() dto: UpdateHealthGoalDto) {
    return this.healthPlannerService.updateGoal(id, dto);
  }

  @Delete('goals/:id')
  removeGoal(@Param('id') id: string) {
    return this.healthPlannerService.removeGoal(id);
  }

  @Get('photos')
  listPhotos(@Query() query: HealthPhotoQueryDto) {
    return this.healthPlannerService.listPhotos(query.category);
  }

  @Post('photos')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    }),
  )
  uploadPhoto(
    @UploadedFile() file: UploadedHealthPhoto | undefined,
    @Query() query: HealthPhotoUploadQueryDto,
  ) {
    return this.healthPlannerService.uploadPhoto({
      file,
      category: query.category,
      angle: query.angle,
      takenAt: query.takenAt,
    });
  }

  @Get('photos/:id/content')
  async getPhotoContent(@Param('id') id: string, @Res() response: Response) {
    const photo = await this.healthPlannerService.getPhotoContent(id);
    response.setHeader('Content-Type', photo.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(photo.data);
  }

  @Delete('photos/:id')
  removePhoto(@Param('id') id: string) {
    return this.healthPlannerService.removePhoto(id);
  }

  @Get('reports')
  listSourceReports() {
    return this.healthPlannerService.listSourceReports();
  }

  @Post('reports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 16 * 1024 * 1024, files: 1 },
    }),
  )
  uploadSourceReport(
    @UploadedFile() file: UploadedHealthPhoto | undefined,
    @Query() query: HealthSourceReportUploadQueryDto,
  ) {
    return this.healthPlannerService.uploadSourceReport({
      file,
      label: query.label,
      reportDate: query.reportDate,
    });
  }

  @Post('reports/:id/reanalyze')
  reanalyzeSourceReport(@Param('id') id: string) {
    return this.healthPlannerService.reanalyzeSourceReport(id);
  }

  @Patch('reports/:id/follow-ups/:index')
  updateSourceReportFollowUp(
    @Param('id') id: string,
    @Param('index') index: string,
    @Body() dto: UpdateHealthSourceReportFollowUpDto,
  ) {
    return this.healthPlannerService.updateSourceReportFollowUp(
      id,
      Number(index),
      dto,
    );
  }

  @Get('reports/:id/content')
  async getSourceReportContent(
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const report = await this.healthPlannerService.getSourceReportContent(id);
    response.setHeader('Content-Type', report.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(report.originalName)}`,
    );
    response.send(report.data);
  }

  @Delete('reports/:id')
  removeSourceReport(@Param('id') id: string) {
    return this.healthPlannerService.removeSourceReport(id);
  }

  @Post('strategy/generate')
  generateStrategy(@Body() body: GenerateHealthStrategyDto) {
    return this.healthPlannerService.generateStrategy(body.force === true);
  }

  @Get('window')
  getWindow(@Query() query: HealthPlanWindowQueryDto) {
    return this.healthPlannerService.getWindow(query.aheadDays);
  }

  @Post('ensure')
  ensure(@Body() dto: EnsureHealthPlanDto) {
    return this.healthPlannerService.ensureRollingWindow({
      aheadDays: dto.aheadDays,
      forceRefresh: dto.forceRefresh,
      refreshStale: dto.forceRefresh === true,
      reason: dto.forceRefresh ? 'owner_refresh' : 'owner_ensure',
    });
  }

  @Get('progress/daily/:dateKey')
  getDailyProgress(@Param('dateKey') dateKey: string) {
    return this.healthProgressService.getDaily(dateKey);
  }

  @Patch('progress/daily/:dateKey/tasks/:taskKey')
  updateDailyTask(
    @Param('dateKey') dateKey: string,
    @Param('taskKey') taskKey: string,
    @Body() dto: UpdateHealthRoutineTaskDto,
  ) {
    return this.healthProgressService.updateRoutineTask(dateKey, taskKey, dto);
  }

  @Put('progress/daily/:dateKey/feedback')
  saveDailyFeedback(
    @Param('dateKey') dateKey: string,
    @Body() dto: UpsertHealthExecutionFeedbackDto,
  ) {
    return this.healthProgressService.upsertFeedback(dateKey, dto);
  }

  @Get('progress/summary')
  getProgressSummary(@Query() query: HealthProgressSummaryQueryDto) {
    return this.healthProgressService.getSummary(query.days);
  }

  @Get('progress/intelligence')
  getHealthIntelligence(@Query() query: HealthIntelligenceQueryDto) {
    return this.healthIntelligenceService.getIntelligence(query.days);
  }

  @Get('evidence')
  getEvidenceOverview() {
    return this.healthEvidenceService.getOverview();
  }

  @Get('evidence/settings')
  getEvidenceSettings() {
    return this.healthEvidenceService.getSettings();
  }

  @Patch('evidence/settings')
  updateEvidenceSettings(@Body() dto: UpdateHealthEvidenceSettingsDto) {
    return this.healthEvidenceService.updateSettings(dto);
  }

  @Post('evidence/baseline/review')
  markEvidenceBaselineReviewed() {
    return this.healthEvidenceService.markBaselineReviewed();
  }

  @Get('proactive/preferences')
  getNotificationPreferences() {
    return this.healthProactiveService.getPreferences();
  }

  @Patch('proactive/preferences')
  updateNotificationPreferences(
    @Body() dto: UpdateHealthNotificationPreferencesDto,
  ) {
    return this.healthProactiveService.updatePreferences(dto);
  }

  @Get('proactive/morning-brief')
  getMorningBrief() {
    return this.healthProactiveService.getMorningBrief();
  }

  @Get('proactive/attention')
  getAttention(@Query() query: HealthAttentionQueryDto) {
    return this.healthProactiveService.listAttention(query.status, query.limit);
  }

  @Patch('proactive/attention/:id/resolve')
  resolveAttention(@Param('id') id: string) {
    return this.healthProactiveService.resolveAttention(id);
  }

  @Patch('proactive/attention/:id/dismiss')
  dismissAttention(@Param('id') id: string) {
    return this.healthProactiveService.dismissAttention(id);
  }

  @Get('proactive/interventions')
  getInterventions(@Query('limit') limit?: string) {
    const parsed = Number(limit ?? 50);
    return this.healthProactiveService.listInterventions(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Post('proactive/run')
  runProactive(@Body() dto: RunHealthProactiveDto) {
    return this.healthProactiveService.runProactive(dto.force === true);
  }

  @Get('progress/reviews')
  listProgressReviews(@Query() query: HealthPlanReviewsQueryDto) {
    return this.healthProgressService.listReviews(
      query.periodType,
      query.limit,
    );
  }

  @Post('progress/reviews/:periodType/generate')
  generateProgressReview(
    @Param('periodType') periodType: HealthPlanReviewPeriod,
    @Body() dto: GenerateHealthPlanReviewDto,
  ) {
    return this.healthProgressService.generateReview(periodType, dto);
  }

  @Get('updates')
  listOwnerUpdates(@Query() query: HealthOwnerUpdatesQueryDto) {
    return this.healthPlannerService.listOwnerUpdates(
      query.domain,
      query.limit,
    );
  }

  @Post('updates')
  createOwnerUpdate(@Body() dto: CreateHealthOwnerUpdateDto) {
    return this.healthPlannerService.createOwnerUpdate(dto);
  }

  @Post('days/:dateKey/regenerate')
  regenerateDay(@Param('dateKey') dateKey: string) {
    return this.healthPlannerService.regenerateDay(dateKey);
  }

  @Patch('days/:dateKey')
  updateDay(
    @Param('dateKey') dateKey: string,
    @Body() dto: UpdateHealthPlanDayDto,
  ) {
    return this.healthPlannerService.updateDay(dateKey, dto);
  }
}
