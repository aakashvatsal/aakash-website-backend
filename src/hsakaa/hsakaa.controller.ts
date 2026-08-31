import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { ConversationQueryDto } from '../modules/chat/dto/conversation-query.dto';
import { AskHsakaaDto } from './dto/ask-hsakaa.dto';
import { ConfirmHsakaaActionDto } from './dto/confirm-hsakaa-action.dto';
import { AnalyzeHsakaaDecisionDto } from './dto/analyze-hsakaa-decision.dto';
import {
  EvaluateHsakaaDecisionOutcomeDto,
  RecordHsakaaDecisionCommitmentDto,
} from './dto/review-hsakaa-decision-outcome.dto';
import { RescheduleHsakaaDecisionReviewDto } from './dto/reschedule-hsakaa-decision-review.dto';
import { HsakaaDecisionLearningQueryDto } from './dto/hsakaa-decision-learning-query.dto';
import {
  AddHsakaaDecisionEvidenceDto,
  CompleteHsakaaDecisionExperimentDto,
  CreateHsakaaDecisionExperimentDto,
  ReassessHsakaaDecisionDto,
  UpdateHsakaaDecisionAssumptionDto,
  UpdateHsakaaDecisionExperimentStatusDto,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { AskPrivateHsakaaDto } from './dto/ask-private-hsakaa.dto';
import {
  GenerateHsakaaDailyJournalDto,
  HsakaaDailyContextQueryDto,
  UpdateHsakaaDailyJournalDraftDto,
  UpdateHsakaaDailyPrivacyDto,
  ClearHsakaaDailyPrivacyOverrideDto,
} from './dto/hsakaa-daily-context.dto';
import { HsakaaOwnerSessionGuard } from './guards/hsakaa-owner-session.guard';
import { HsakaaService } from './hsakaa.service';

@Controller('hsakaa')
export class HsakaaController {
  constructor(private readonly hsakaaService: HsakaaService) {}

  @Post('ask')
  @Public()
  ask(@Body() dto: AskHsakaaDto) {
    return this.hsakaaService.ask(dto);
  }

  /**
   * Personal OS HSAKAA.
   * Intended for the single-owner interface.
   * It is not marked @Public(), so it will automatically become protected
   * if/when owner authentication is re-enabled globally.
   */
  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/ask')
  askPrivate(@Body() dto: AskPrivateHsakaaDto) {
    return this.hsakaaService.askPrivate(dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/actions/:actionId/confirm')
  confirmPrivateAction(
    @Param('actionId') actionId: string,
    @Body() dto: ConfirmHsakaaActionDto,
  ) {
    return this.hsakaaService.confirmPrivateAction(
      actionId,
      dto.confirmationToken,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/actions/:actionId/reject')
  rejectPrivateAction(
    @Param('actionId') actionId: string,
    @Body() dto: ConfirmHsakaaActionDto,
  ) {
    return this.hsakaaService.rejectPrivateAction(
      actionId,
      dto.confirmationToken,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/brief/today')
  getTodayPrivateBrief() {
    return this.hsakaaService.getTodayPrivateBrief();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/brief/today/refresh')
  refreshTodayPrivateBrief() {
    return this.hsakaaService.refreshTodayPrivateBrief();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/patterns/current')
  getCurrentPrivatePatterns() {
    return this.hsakaaService.getCurrentPrivatePatterns();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/patterns/current/refresh')
  refreshCurrentPrivatePatterns() {
    return this.hsakaaService.refreshCurrentPrivatePatterns();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/review/week/current')
  getCurrentPrivateWeeklyReview() {
    return this.hsakaaService.getCurrentPrivateWeeklyReview();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/review/week/current/refresh')
  refreshCurrentPrivateWeeklyReview() {
    return this.hsakaaService.refreshCurrentPrivateWeeklyReview();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/analyze')
  analyzePrivateDecision(@Body() dto: AnalyzeHsakaaDecisionDto) {
    return this.hsakaaService.analyzePrivateDecision(dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/daily-context')
  getPrivateDailyContext(@Query() query: HsakaaDailyContextQueryDto) {
    return this.hsakaaService.getPrivateDailyContext(query.dateKey);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-context/refresh')
  refreshPrivateDailyContext(@Body() dto: HsakaaDailyContextQueryDto) {
    return this.hsakaaService.refreshPrivateDailyContext(dto.dateKey);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Patch('private/daily-context/privacy')
  updatePrivateDailyContextPrivacy(@Body() dto: UpdateHsakaaDailyPrivacyDto) {
    return this.hsakaaService.updatePrivateDailyContextPrivacy(dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-context/privacy/clear')
  clearPrivateDailyContextPrivacy(
    @Body() dto: ClearHsakaaDailyPrivacyOverrideDto,
  ) {
    return this.hsakaaService.clearPrivateDailyContextPrivacy(dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-journal/generate')
  generatePrivateDailyJournal(@Body() dto: GenerateHsakaaDailyJournalDto) {
    return this.hsakaaService.generatePrivateDailyJournal(
      dto.dateKey,
      dto.regenerate === true,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Patch('private/daily-journal/:journalEntryId/draft')
  updatePrivateDailyJournalDraft(
    @Param('journalEntryId') journalEntryId: string,
    @Body() dto: UpdateHsakaaDailyJournalDraftDto,
  ) {
    return this.hsakaaService.updatePrivateDailyJournalDraft(
      journalEntryId,
      dto,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-journal/:journalEntryId/approve')
  approvePrivateDailyJournal(@Param('journalEntryId') journalEntryId: string) {
    return this.hsakaaService.approvePrivateDailyJournal(journalEntryId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-journal/:journalEntryId/public/approve')
  approvePublicDailyJournal(@Param('journalEntryId') journalEntryId: string) {
    return this.hsakaaService.approvePublicDailyJournal(journalEntryId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/daily-journal/public/regenerate')
  regeneratePublicDailyJournal(@Body() dto: HsakaaDailyContextQueryDto) {
    return this.hsakaaService.regeneratePublicDailyJournal(dto.dateKey);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/journal-intelligence')
  getPrivateJournalIntelligence(
    @Query('period') period?: 'week' | 'month',
    @Query('dateKey') dateKey?: string,
  ) {
    return this.hsakaaService.getPrivateJournalIntelligence(
      period === 'month' ? 'month' : 'week',
      dateKey,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/recent')
  getRecentPrivateDecisions(@Query('limit') limit?: string) {
    return this.hsakaaService.getRecentPrivateDecisions(limit);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/calibration/summary')
  getPrivateDecisionCalibrationSummary() {
    return this.hsakaaService.getPrivateDecisionCalibrationSummary();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/analytics')
  getPrivateDecisionAnalytics() {
    return this.hsakaaService.getPrivateDecisionAnalytics();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/review-queue')
  getPrivateDecisionReviewQueue() {
    return this.hsakaaService.getPrivateDecisionReviewQueue();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/learnings')
  getPrivateDecisionLearnings(@Query() query: HsakaaDecisionLearningQueryDto) {
    return this.hsakaaService.getPrivateDecisionLearnings(query);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/experiments/queue')
  getPrivateDecisionExperimentQueue() {
    return this.hsakaaService.getPrivateDecisionExperimentQueue();
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/:decisionId/experiments')
  getPrivateDecisionExperimentState(@Param('decisionId') decisionId: string) {
    return this.hsakaaService.getPrivateDecisionExperimentState(decisionId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/:decisionId/assumptions')
  getPrivateDecisionAssumptions(@Param('decisionId') decisionId: string) {
    return this.hsakaaService.getPrivateDecisionAssumptions(decisionId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/experiments')
  createPrivateDecisionExperiment(
    @Param('decisionId') decisionId: string,
    @Body() dto: CreateHsakaaDecisionExperimentDto,
  ) {
    return this.hsakaaService.createPrivateDecisionExperiment(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Patch('private/decisions/:decisionId/experiments/:experimentId/status')
  updatePrivateDecisionExperimentStatus(
    @Param('decisionId') decisionId: string,
    @Param('experimentId') experimentId: string,
    @Body() dto: UpdateHsakaaDecisionExperimentStatusDto,
  ) {
    return this.hsakaaService.updatePrivateDecisionExperimentStatus(
      decisionId,
      experimentId,
      dto,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/evidence')
  addPrivateDecisionEvidence(
    @Param('decisionId') decisionId: string,
    @Body() dto: AddHsakaaDecisionEvidenceDto,
  ) {
    return this.hsakaaService.addPrivateDecisionEvidence(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Patch('private/decisions/:decisionId/assumptions/:assumptionId')
  updatePrivateDecisionAssumption(
    @Param('decisionId') decisionId: string,
    @Param('assumptionId') assumptionId: string,
    @Body() dto: UpdateHsakaaDecisionAssumptionDto,
  ) {
    return this.hsakaaService.updatePrivateDecisionAssumption(
      decisionId,
      assumptionId,
      dto,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/experiments/:experimentId/complete')
  completePrivateDecisionExperiment(
    @Param('decisionId') decisionId: string,
    @Param('experimentId') experimentId: string,
    @Body() dto: CompleteHsakaaDecisionExperimentDto,
  ) {
    return this.hsakaaService.completePrivateDecisionExperiment(
      decisionId,
      experimentId,
      dto,
    );
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/reassess')
  reassessPrivateDecision(
    @Param('decisionId') decisionId: string,
    @Body() dto: ReassessHsakaaDecisionDto,
  ) {
    return this.hsakaaService.reassessPrivateDecision(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/decisions/:decisionId')
  getPrivateDecision(@Param('decisionId') decisionId: string) {
    return this.hsakaaService.getPrivateDecision(decisionId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/commitment')
  recordPrivateDecisionCommitment(
    @Param('decisionId') decisionId: string,
    @Body() dto: RecordHsakaaDecisionCommitmentDto,
  ) {
    return this.hsakaaService.recordPrivateDecisionCommitment(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Patch('private/decisions/:decisionId/review-date')
  reschedulePrivateDecisionReview(
    @Param('decisionId') decisionId: string,
    @Body() dto: RescheduleHsakaaDecisionReviewDto,
  ) {
    return this.hsakaaService.reschedulePrivateDecisionReview(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/outcome/evaluate')
  evaluatePrivateDecisionOutcome(
    @Param('decisionId') decisionId: string,
    @Body() dto: EvaluateHsakaaDecisionOutcomeDto,
  ) {
    return this.hsakaaService.evaluatePrivateDecisionOutcome(decisionId, dto);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Post('private/decisions/:decisionId/reanalyze')
  reanalyzePrivateDecision(@Param('decisionId') decisionId: string) {
    return this.hsakaaService.reanalyzePrivateDecision(decisionId);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/conversations')
  getPrivateConversations(@Query() query: ConversationQueryDto) {
    return this.hsakaaService.getPrivateConversations(query);
  }

  @UseGuards(HsakaaOwnerSessionGuard)
  @Get('private/conversations/:conversationId')
  getPrivateConversation(@Param('conversationId') conversationId: string) {
    return this.hsakaaService.getPrivateConversation(conversationId);
  }
}
