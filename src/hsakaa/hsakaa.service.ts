import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AiAgentResponse, AiService } from '../modules/ai/ai.service';
import { ChatService } from '../modules/chat/chat.service';
import { MemoryVerificationService } from '../modules/memory/memory-verification.service';
import { ConversationQueryDto } from '../modules/chat/dto/conversation-query.dto';
import { ImportMyChatDto } from '../modules/chat/dto/import-my-chat.dto';
import { MyChatQueryDto } from '../modules/chat/dto/my-chat-query.dto';
import { MessageRole } from '../modules/chat/schemas/message.schema';
import { AskHsakaaDto } from './dto/ask-hsakaa.dto';
import { AskPrivateHsakaaDto } from './dto/ask-private-hsakaa.dto';
import { AskVerifiedPersonHsakaaDto } from './dto/ask-verified-person-hsakaa.dto';
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
import {
  HsakaaAgentContextBundle,
  HsakaaAgentContextService,
} from './hsakaa-agent-context.service';
import {
  HsakaaActionService,
  HsakaaClientAction,
} from './hsakaa-action.service';
import { HsakaaBriefService } from './hsakaa-brief.service';
import { HsakaaPatternService } from './hsakaa-pattern.service';
import { HsakaaWeeklyReviewService } from './hsakaa-weekly-review.service';
import { HsakaaDecisionService } from './hsakaa-decision.service';
import { HsakaaDecisionExperimentService } from './hsakaa-decision-experiment.service';
import { HsakaaDecisionAnalyticsService } from './hsakaa-decision-analytics.service';
import {
  ClearHsakaaDailyPrivacyOverrideDto,
  UpdateHsakaaDailyPrivacyDto,
} from './dto/hsakaa-daily-context.dto';
import { HsakaaDailyContextService } from './hsakaa-daily-context.service';
import { HsakaaDailyJournalService } from './hsakaa-daily-journal.service';
import { HsakaaContextService } from './hsakaa-context.service';
import { HsakaaToolsService } from './hsakaa-tools.service';
import { HsakaaVoiceService } from './hsakaa-voice.service';
import { CreateHsakaaVoiceFeedbackDto } from './dto/hsakaa-voice.dto';
import {
  PublicHsakaaSpeechDto,
  VerifiedPersonHsakaaSpeechDto,
} from './dto/hsakaa-speech.dto';
import { HsakaaSpeechService } from './hsakaa-speech.service';
import {
  evaluatePublicHsakaaScope,
  evaluateVerifiedPersonHsakaaScope,
} from './hsakaa-public-scope';

@Injectable()
export class HsakaaService {
  private readonly logger = new Logger(HsakaaService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly chatService: ChatService,
    private readonly contextService: HsakaaContextService,
    private readonly memoryVerificationService: MemoryVerificationService,
    private readonly agentContextService: HsakaaAgentContextService,
    private readonly toolsService: HsakaaToolsService,
    private readonly actionService: HsakaaActionService,
    private readonly briefService: HsakaaBriefService,
    private readonly patternService: HsakaaPatternService,
    private readonly weeklyReviewService: HsakaaWeeklyReviewService,
    private readonly decisionService: HsakaaDecisionService,
    private readonly decisionExperimentService: HsakaaDecisionExperimentService,
    private readonly decisionAnalyticsService: HsakaaDecisionAnalyticsService,
    private readonly dailyContextService: HsakaaDailyContextService,
    private readonly dailyJournalService: HsakaaDailyJournalService,
    private readonly voiceService: HsakaaVoiceService,
    private readonly speechService: HsakaaSpeechService,
  ) {}

  async askVerifiedPerson(
    dto: AskVerifiedPersonHsakaaDto,
    rawSessionToken: string,
  ) {
    const message = dto.message.trim();
    const identity =
      await this.memoryVerificationService.validateSession(rawSessionToken);
    const conversation =
      await this.chatService.getOrCreateVerifiedPersonConversation({
        conversationId: dto.conversationId,
        personId: identity.personId,
        mode: dto.mode,
        firstMessage: message,
      });

    const previousMessages =
      await this.chatService.getRecentVerifiedPersonMessages(
        conversation._id,
        identity.personId,
        12,
      );

    const scopeDecision = evaluateVerifiedPersonHsakaaScope(
      dto.mode,
      message,
      previousMessages.length > 0,
    );

    if (!scopeDecision.allowed) {
      const answer = this.voiceService.sanitizeRenderedText(
        scopeDecision.answer!,
      );

      await this.chatService.appendMessage({
        conversationId: conversation._id,
        role: MessageRole.USER,
        content: message,
        metadata: {
          mode: dto.mode,
          scope: 'verified_person',
          personId: identity.personId.toString(),
        },
      });
      const assistantMessage = await this.chatService.appendMessage({
        conversationId: conversation._id,
        role: MessageRole.ASSISTANT,
        content: answer,
        metadata: {
          mode: dto.mode,
          scope: 'verified_person',
          personId: identity.personId.toString(),
          scopeDecision: scopeDecision.scope,
          retrievedMemoryCount: 0,
        },
      });

      return {
        answer,
        conversationId: conversation._id.toString(),
        messageId: assistantMessage._id.toString(),
        scope: 'verified_person',
      };
    }

    const context = await this.contextService.buildVerifiedPersonContext(
      dto.mode,
      message,
      rawSessionToken,
    );
    const voiceContext = await this.voiceService.getRenderContext(
      dto.mode,
      message,
      identity.personId.toString(),
    );

    let answer: string;
    try {
      answer = await this.aiService.generateResponse({
        message,
        mode: dto.mode,
        scope: 'verified_person',
        contextSections: [...context.sections, voiceContext],
        previousMessages,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Aakash is temporarily unavailable. Please try again shortly.',
      );
    }

    if (!answer) {
      throw new ServiceUnavailableException(
        'Aakash did not return a response. Please try again.',
      );
    }

    answer = this.voiceService.sanitizeRenderedText(answer);

    await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.USER,
      content: message,
      metadata: {
        mode: dto.mode,
        scope: 'verified_person',
        personId: identity.personId.toString(),
      },
    });
    const assistantMessage = await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.ASSISTANT,
      content: answer,
      memoryIds: context.memoryIds,
      metadata: {
        mode: dto.mode,
        scope: 'verified_person',
        personId: identity.personId.toString(),
        retrievedMemoryCount: context.retrievedMemoryCount,
        personSpecificMemoryEnabled: context.memoryAccessConsentGranted,
      },
    });

    return {
      answer,
      conversationId: conversation._id.toString(),
      messageId: assistantMessage._id.toString(),
      scope: 'verified_person',
    };
  }

  async speakPublic(dto: PublicHsakaaSpeechDto) {
    const message = await this.chatService.getPublicAssistantMessageForSpeech({
      conversationId: dto.conversationId,
      messageId: dto.messageId,
      sessionId: dto.sessionId,
    });

    return this.speechService.synthesize(message.content);
  }

  async speakVerifiedPerson(
    dto: VerifiedPersonHsakaaSpeechDto,
    rawSessionToken: string,
  ) {
    const identity =
      await this.memoryVerificationService.validateSession(rawSessionToken);
    const message =
      await this.chatService.getVerifiedPersonAssistantMessageForSpeech({
        conversationId: dto.conversationId,
        messageId: dto.messageId,
        personId: identity.personId,
      });

    return this.speechService.synthesize(message.content);
  }

  async askPrivate(dto: AskPrivateHsakaaDto) {
    const message = dto.message.trim();
    const conversation = await this.chatService.getOrCreateOwnerConversation({
      conversationId: dto.conversationId,
      mode: dto.mode,
      firstMessage: message,
    });

    const previousMessages = await this.chatService.getRecentOwnerMessages(
      conversation._id,
      18,
    );

    const requestId = randomUUID();
    const proposedActions: HsakaaClientAction[] = [];

    let context = await this.agentContextService.build(dto.mode, message);
    let agentResult: AiAgentResponse | null = null;
    let answer = '';
    let agentFallback = false;

    try {
      agentResult = await this.aiService.generateAgentResponse({
        message,
        mode: dto.mode,
        scope: 'private',
        contextSections: context.sections,
        previousMessages,
        tools: this.toolsService.getPrivateTools(dto.mode, {
          conversationId: conversation._id.toString(),
          requestId,
          collect: (action) => proposedActions.push(action),
        }),
      });
      answer = agentResult.text;
    } catch (error) {
      agentFallback = true;
      this.logger.warn(
        `Private HSAKAA agent failed; falling back to context-only generation: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      try {
        context = await this.contextService.buildPrivateContext(
          dto.mode,
          message,
        );
        answer = await this.aiService.generateResponse({
          message,
          mode: dto.mode,
          scope: 'private',
          contextSections: context.sections,
          previousMessages,
        });
      } catch {
        throw new ServiceUnavailableException(
          'HSAKAA is temporarily unavailable. Please try again shortly.',
        );
      }
    }

    if (!answer) {
      throw new ServiceUnavailableException(
        'HSAKAA did not return a response. Please try again.',
      );
    }

    answer = this.voiceService.sanitizeRenderedText(answer);

    await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.USER,
      content: message,
      metadata: { mode: dto.mode, scope: 'private' },
    });

    await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.ASSISTANT,
      content: answer,
      memoryIds: context.memoryIds,
      metadata: this.buildPrivateAssistantMetadata(
        dto.mode,
        context,
        agentResult,
        agentFallback,
        proposedActions,
      ),
    });

    return {
      answer,
      conversationId: conversation._id.toString(),
      scope: 'private',
      ai: {
        model: agentResult?.model ?? this.aiService.getModel(),
        toolsUsed: agentResult?.toolsUsed ?? [],
        toolCallCount: agentResult?.toolCallCount ?? 0,
        usage: agentResult?.usage ?? null,
        fallback: agentFallback,
      },
      proposedActions,
    };
  }

  confirmPrivateAction(actionId: string, confirmationToken: string) {
    return this.actionService.confirm(actionId, confirmationToken);
  }

  rejectPrivateAction(actionId: string, confirmationToken: string) {
    return this.actionService.reject(actionId, confirmationToken);
  }

  getTodayPrivateBrief() {
    return this.briefService.getToday();
  }

  refreshTodayPrivateBrief() {
    return this.briefService.refreshToday();
  }

  getCurrentPrivatePatterns() {
    return this.patternService.getCurrent();
  }

  refreshCurrentPrivatePatterns() {
    return this.patternService.refreshCurrent();
  }

  getCurrentPrivateWeeklyReview() {
    return this.weeklyReviewService.getCurrent();
  }

  refreshCurrentPrivateWeeklyReview() {
    return this.weeklyReviewService.refreshCurrent();
  }

  analyzePrivateDecision(dto: AnalyzeHsakaaDecisionDto) {
    return this.decisionService.analyze(dto);
  }

  getRecentPrivateDecisions(rawLimit?: string) {
    const parsed = Number.parseInt(rawLimit ?? '', 10);
    const limit = Number.isFinite(parsed) ? parsed : 8;
    return this.decisionService.listRecent(limit);
  }

  getPrivateDecision(decisionId: string) {
    return this.decisionService.getOne(decisionId);
  }

  getPrivateDecisionCalibrationSummary() {
    return this.decisionService.getCalibrationSummary();
  }

  getPrivateDecisionAnalytics() {
    return this.decisionAnalyticsService.getAnalytics();
  }

  getPrivateDailyContext(dateKey?: string) {
    return this.dailyJournalService.getForDate(dateKey);
  }

  refreshPrivateDailyContext(dateKey?: string) {
    return this.dailyContextService.capture(dateKey);
  }

  updatePrivateDailyContextPrivacy(dto: UpdateHsakaaDailyPrivacyDto) {
    return this.dailyContextService.updatePrivacy(
      dto.dateKey,
      dto.itemId,
      dto.privacy,
      dto.reason,
    );
  }

  clearPrivateDailyContextPrivacy(dto: ClearHsakaaDailyPrivacyOverrideDto) {
    return this.dailyContextService.clearPrivacyOverride(
      dto.dateKey,
      dto.itemId,
    );
  }

  upsertPrivateDailyJournalPointer(input: {
    dateKey: string;
    category: string;
    note: string;
    privacy?: import('./schemas/hsakaa-daily-context.schema').HsakaaDailyContextPrivacy;
  }) {
    return this.dailyContextService.upsertOwnerNote(
      input.dateKey,
      input.category,
      input.note,
      input.privacy,
    );
  }

  removePrivateDailyJournalPointer(input: {
    dateKey: string;
    category: string;
  }) {
    return this.dailyContextService.removeOwnerNote(
      input.dateKey,
      input.category,
    );
  }

  generatePrivateDailyJournal(dateKey?: string, regenerate = false) {
    return this.dailyJournalService.generate(dateKey, regenerate);
  }

  updatePrivateDailyJournalDraft(
    journalEntryId: string,
    input: { title?: string; content?: string; highlight?: string },
  ) {
    return this.dailyJournalService.updateDraft(journalEntryId, input);
  }

  approvePrivateDailyJournal(journalEntryId: string) {
    return this.dailyJournalService.approve(journalEntryId);
  }

  approvePublicDailyJournal(journalEntryId: string) {
    return this.dailyJournalService.approvePublic(journalEntryId);
  }

  approveAndPublishDailyJournalPair(dateKey?: string) {
    return this.dailyJournalService.approveAndPublishPair(dateKey);
  }

  regeneratePublicDailyJournal(dateKey?: string) {
    return this.dailyJournalService.regeneratePublic(dateKey);
  }

  getPrivateJournalIntelligence(period: 'week' | 'month', dateKey?: string) {
    return this.dailyJournalService.getIntelligence(period, dateKey);
  }

  getPrivateDecisionReviewQueue() {
    return this.decisionService.getDecisionReviewQueue();
  }

  getPrivateDecisionLearnings(query: HsakaaDecisionLearningQueryDto) {
    return this.decisionService.getDecisionLearnings(query);
  }

  getPrivateDecisionExperimentQueue() {
    return this.decisionExperimentService.getExperimentQueue();
  }

  getPrivateDecisionExperimentState(decisionId: string) {
    return this.decisionExperimentService.getDecisionState(decisionId);
  }

  getPrivateDecisionAssumptions(decisionId: string) {
    return this.decisionExperimentService.getAssumptions(decisionId);
  }

  createPrivateDecisionExperiment(
    decisionId: string,
    dto: CreateHsakaaDecisionExperimentDto,
  ) {
    return this.decisionExperimentService.createExperiment(decisionId, dto);
  }

  updatePrivateDecisionExperimentStatus(
    decisionId: string,
    experimentId: string,
    dto: UpdateHsakaaDecisionExperimentStatusDto,
  ) {
    return this.decisionExperimentService.updateExperimentStatus(
      decisionId,
      experimentId,
      dto,
    );
  }

  addPrivateDecisionEvidence(
    decisionId: string,
    dto: AddHsakaaDecisionEvidenceDto,
  ) {
    return this.decisionExperimentService.addEvidence(decisionId, dto);
  }

  updatePrivateDecisionAssumption(
    decisionId: string,
    assumptionId: string,
    dto: UpdateHsakaaDecisionAssumptionDto,
  ) {
    return this.decisionExperimentService.updateAssumption(
      decisionId,
      assumptionId,
      dto,
    );
  }

  completePrivateDecisionExperiment(
    decisionId: string,
    experimentId: string,
    dto: CompleteHsakaaDecisionExperimentDto,
  ) {
    return this.decisionExperimentService.completeExperiment(
      decisionId,
      experimentId,
      dto,
    );
  }

  reassessPrivateDecision(decisionId: string, dto: ReassessHsakaaDecisionDto) {
    return this.decisionExperimentService.reassess(decisionId, dto);
  }

  recordPrivateDecisionCommitment(
    decisionId: string,
    dto: RecordHsakaaDecisionCommitmentDto,
  ) {
    return this.decisionService.recordCommitment(decisionId, dto);
  }

  reschedulePrivateDecisionReview(
    decisionId: string,
    dto: RescheduleHsakaaDecisionReviewDto,
  ) {
    return this.decisionService.rescheduleReview(decisionId, dto);
  }

  evaluatePrivateDecisionOutcome(
    decisionId: string,
    dto: EvaluateHsakaaDecisionOutcomeDto,
  ) {
    return this.decisionService.evaluateOutcome(decisionId, dto);
  }

  reanalyzePrivateDecision(decisionId: string) {
    return this.decisionService.reanalyze(decisionId);
  }

  getPrivateConversations(query: ConversationQueryDto) {
    return this.chatService.getOwnerConversations(query);
  }

  getPrivateConversation(conversationId: string) {
    return this.chatService.getOwnerConversation(conversationId);
  }

  getMyChats(query: MyChatQueryDto) {
    return this.chatService.getMyChats(query);
  }

  getMyChat(threadId: string) {
    return this.chatService.getMyChat(threadId);
  }

  async importMyChat(dto: ImportMyChatDto) {
    const imported = await this.chatService.importMyChat(dto);
    const learning: Record<string, unknown> = {};

    try {
      learning.global = await this.voiceService.refreshProfile();
    } catch (error) {
      this.logger.warn(
        `Imported chat saved but global communication profile refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      learning.global = { refreshed: false, reason: 'refresh_failed' };
    }

    if (dto.personId) {
      try {
        learning.person = await this.voiceService.refreshPersonProfile(
          dto.personId,
        );
      } catch (error) {
        this.logger.warn(
          `Imported chat saved but person communication profile refresh failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        learning.person = { refreshed: false, reason: 'refresh_failed' };
      }
    }

    return { ...imported, learning };
  }

  archiveMyChat(threadId: string) {
    return this.chatService.archiveMyChat(threadId);
  }

  async refreshMyChatLearning(personId?: string) {
    const global = await this.voiceService.refreshProfile();
    const person = personId
      ? await this.voiceService.refreshPersonProfile(personId)
      : null;
    return { global, person };
  }

  async ask(dto: AskHsakaaDto) {
    const message = dto.message.trim();

    const conversation = await this.chatService.getOrCreatePublicConversation({
      conversationId: dto.conversationId,
      sessionId: dto.sessionId,
      mode: dto.mode,
      firstMessage: message,
    });

    const previousMessages = await this.chatService.getRecentMessages(
      conversation._id,
      dto.sessionId,
      12,
    );

    const scopeDecision = evaluatePublicHsakaaScope(
      dto.mode,
      message,
      previousMessages.length > 0,
    );

    if (!scopeDecision.allowed) {
      const answer = this.voiceService.sanitizeRenderedText(
        scopeDecision.answer!,
      );

      await this.chatService.appendMessage({
        conversationId: conversation._id,
        role: MessageRole.USER,
        content: message,
        metadata: { mode: dto.mode, scope: 'public' },
      });

      const assistantMessage = await this.chatService.appendMessage({
        conversationId: conversation._id,
        role: MessageRole.ASSISTANT,
        content: answer,
        metadata: {
          mode: dto.mode,
          scope: 'public',
          scopeDecision: scopeDecision.scope,
          retrievedMemoryCount: 0,
        },
      });

      return {
        answer,
        conversationId: conversation._id.toString(),
        messageId: assistantMessage._id.toString(),
      };
    }

    const context = await this.contextService.buildPublicContext(
      dto.mode,
      message,
    );
    const voiceContext = await this.voiceService.getRenderContext(
      dto.mode,
      message,
    );

    let answer: string;

    try {
      answer = await this.aiService.generateResponse({
        message,
        mode: dto.mode,
        contextSections: [...context.sections, voiceContext],
        previousMessages,
      });
    } catch {
      throw new ServiceUnavailableException(
        'HSAKAA is temporarily unavailable. Please try again shortly.',
      );
    }

    if (!answer) {
      throw new ServiceUnavailableException(
        'HSAKAA did not return a response. Please try again.',
      );
    }

    answer = this.voiceService.sanitizeRenderedText(answer);

    await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.USER,
      content: message,
      metadata: {
        mode: dto.mode,
      },
    });

    const assistantMessage = await this.chatService.appendMessage({
      conversationId: conversation._id,
      role: MessageRole.ASSISTANT,
      content: answer,
      memoryIds: context.memoryIds,
      metadata: {
        mode: dto.mode,
        scope: 'public',
        retrievedMemoryCount: context.retrievedMemoryCount,
      },
    });

    return {
      answer,
      conversationId: conversation._id.toString(),
      messageId: assistantMessage._id.toString(),
    };
  }

  getPrivateVoiceProfile() {
    return this.voiceService.getProfile();
  }

  refreshPrivateVoiceProfile() {
    return this.voiceService.refreshProfile();
  }

  addPrivateVoiceFeedback(dto: CreateHsakaaVoiceFeedbackDto) {
    return this.voiceService.addFeedback(dto);
  }

  private buildPrivateAssistantMetadata(
    mode: AskPrivateHsakaaDto['mode'],
    context: HsakaaAgentContextBundle,
    agentResult: AiAgentResponse | null,
    agentFallback: boolean,
    proposedActions: HsakaaClientAction[],
  ) {
    return {
      mode,
      scope: 'private',
      retrievedMemoryCount: context.retrievedMemoryCount,
      aiModel: agentResult?.model ?? this.aiService.getModel(),
      aiResponseId: agentResult?.responseId,
      toolsUsed: agentResult?.toolsUsed ?? [],
      toolCallCount: agentResult?.toolCallCount ?? 0,
      usage: agentResult?.usage,
      agentFallback,
      proposedActionIds: proposedActions.map((action) => action.id),
    };
  }
}
