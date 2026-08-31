import { BadRequestException, Injectable } from '@nestjs/common';
import type { FunctionTool } from 'openai/resources/responses/responses';

import { AiAgentTool } from '../modules/ai/ai.service';
import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import {
  BrainDumpStatus,
  BrainDumpTarget,
} from '../modules/brain-dump/schemas/brain-dump.schema';
import { CompaniesService } from '../modules/companies/companies.service';
import { HealthDashboardService } from '../modules/health/health-dashboard.service';
import { JournalService } from '../modules/journal/journal.service';
import {
  JournalEntryType,
  JournalMood,
} from '../modules/journal/schemas/journal-entry.schema';
import { LibraryService } from '../modules/library/library.service';
import { MediaContentDirectorService } from '../modules/media/media-content-director.service';
import { MediaCoreService } from '../modules/media/media-core.service';
import { MediaContentIntelligenceService } from '../modules/media/media-content-intelligence.service';
import { MediaProductionService } from '../modules/media/media-production.service';
import { MediaCalendarService } from '../modules/media/media-calendar.service';
import { MediaGrowthService } from '../modules/media/media-growth.service';
import { MediaEngagementService } from '../modules/media/media-engagement.service';
import { MediaAutopilotService } from '../modules/media/media-autopilot.service';
import {
  MediaGoal,
  MediaPlatform,
  MediaPostType,
} from '../modules/media/schemas/media-post.schema';
import { MediaGenerationPurpose } from '../modules/media/schemas/media-generation-run.schema';
import {
  MediaEngagementIntent,
  MediaEngagementPriority,
  MediaEngagementStatus,
} from '../modules/media/schemas/media-engagement-item.schema';
import { MemoryService } from '../modules/memory/memory.service';
import { MemoryPeopleService } from '../modules/memory/memory-people.service';
import { PersonGraphService } from '../modules/memory/person-graph.service';
import { PersonOpenLoopsService } from '../modules/memory/person-open-loops.service';
import { PersonRelationshipContextService } from '../modules/memory/person-relationship-context.service';
import { PersonTimelineService } from '../modules/memory/person-timeline.service';
import { MemoryRecallIntent } from '../modules/memory/dto/memory-recall-query.dto';
import { MemoryReviewService } from '../modules/memory/memory-review.service';
import { MemoryInboxService } from '../modules/memory/memory-inbox.service';
import {
  MEMORY_CANONICAL_TYPES,
  MEMORY_TYPE_SEMANTICS,
  MemoryAccessLevel,
  MemoryDurability,
  MemoryEntityType,
  MemoryPersonRelation,
  MemoryScope,
  MemorySensitivity,
  MemoryType,
} from '../modules/memory/schemas/memory.schema';
import {
  PersonOpenLoopKind,
  PersonOpenLoopStatus,
} from '../modules/memory/schemas/person-open-loop.schema';
import { NowService } from '../modules/now/now.service';
import { RemindersService } from '../modules/reminders/reminders.service';
import {
  ReminderSourceType,
  ReminderStatus,
} from '../modules/reminders/schemas/reminder.schema';
import { TaskPriority, TaskStatus } from '../modules/tasks/schemas/task.schema';
import { TasksService } from '../modules/tasks/tasks.service';
import { HsakaaMode } from './dto/ask-hsakaa.dto';
import { HsakaaDecisionHorizon } from './dto/analyze-hsakaa-decision.dto';
import { HSAKAA_DECISION_LEARNING_CALIBRATIONS } from './dto/hsakaa-decision-learning-query.dto';
import { HsakaaDecisionOutcomeStatus } from './dto/review-hsakaa-decision-outcome.dto';
import {
  HsakaaDecisionEvidenceKind,
  HsakaaDecisionEvidenceStance,
  HsakaaDecisionExperimentResult,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { HsakaaPatternService } from './hsakaa-pattern.service';
import { HsakaaWeeklyReviewService } from './hsakaa-weekly-review.service';
import { HsakaaDecisionService } from './hsakaa-decision.service';
import { HsakaaDecisionExperimentService } from './hsakaa-decision-experiment.service';
import { HsakaaDecisionAnalyticsService } from './hsakaa-decision-analytics.service';
import { HsakaaDailyContextService } from './hsakaa-daily-context.service';
import {
  HsakaaActionService,
  HsakaaClientAction,
} from './hsakaa-action.service';

type ToolArguments = Record<string, unknown>;

export interface HsakaaToolActionContext {
  conversationId: string;
  requestId: string;
  collect: (action: HsakaaClientAction) => void;
}

@Injectable()
export class HsakaaToolsService {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly memoryPeopleService: MemoryPeopleService,
    private readonly personGraphService: PersonGraphService,
    private readonly personOpenLoopsService: PersonOpenLoopsService,
    private readonly personRelationshipContextService: PersonRelationshipContextService,
    private readonly personTimelineService: PersonTimelineService,
    private readonly memoryInboxService: MemoryInboxService,
    private readonly memoryReviewService: MemoryReviewService,
    private readonly nowService: NowService,
    private readonly tasksService: TasksService,
    private readonly remindersService: RemindersService,
    private readonly brainDumpService: BrainDumpService,
    private readonly companiesService: CompaniesService,
    private readonly journalService: JournalService,
    private readonly libraryService: LibraryService,
    private readonly healthDashboardService: HealthDashboardService,
    private readonly mediaCoreService: MediaCoreService,
    private readonly mediaContentDirectorService: MediaContentDirectorService,
    private readonly mediaContentIntelligenceService: MediaContentIntelligenceService,
    private readonly mediaProductionService: MediaProductionService,
    private readonly mediaCalendarService: MediaCalendarService,
    private readonly mediaGrowthService: MediaGrowthService,
    private readonly mediaEngagementService: MediaEngagementService,
    private readonly mediaAutopilotService: MediaAutopilotService,
    private readonly patternService: HsakaaPatternService,
    private readonly weeklyReviewService: HsakaaWeeklyReviewService,
    private readonly decisionService: HsakaaDecisionService,
    private readonly decisionExperimentService: HsakaaDecisionExperimentService,
    private readonly decisionAnalyticsService: HsakaaDecisionAnalyticsService,
    private readonly dailyContextService: HsakaaDailyContextService,
    private readonly actionService: HsakaaActionService,
  ) {}

  getPrivateTools(
    mode: HsakaaMode,
    actionContext?: HsakaaToolActionContext,
  ): AiAgentTool[] {
    const taskProposalTools = actionContext
      ? this.getTaskProposalTools(actionContext)
      : [];
    const brainDumpProposalTools = actionContext
      ? this.getBrainDumpProposalTools(actionContext)
      : [];
    const journalProposalTools = actionContext
      ? this.getJournalProposalTools(actionContext)
      : [];
    const memoryProposalTools = actionContext
      ? this.getMemoryProposalTools(actionContext)
      : [];
    const reminderProposalTools = actionContext
      ? this.getReminderProposalTools(actionContext)
      : [];
    const decisionProposalTools = actionContext
      ? this.getDecisionProposalTools(actionContext)
      : [];
    const mediaProposalTools = actionContext
      ? this.getMediaProposalTools(actionContext)
      : [];

    const base = [
      this.getNowTool(),
      this.searchPeopleTool(),
      this.getPersonProfileTool(),
      this.getPersonRelationshipContextTool(),
      this.getPersonConnectionsTool(),
      this.getPeopleMutualConnectionsTool(),
      this.findPeopleConnectionPathTool(),
      this.getPeopleGraphOverviewTool(),
      this.getPeopleContactGapsTool(),
      this.findPeopleByRelationshipContextTool(),
      this.getPersonTimelineTool(),
      this.getPeopleOpenLoopsTool(),
      this.getPersonOpenLoopsTool(),
      this.searchMemoryTool(),
      this.searchPersonMemoryTool(),
      this.getTaskSummaryTool(),
      this.searchTasksTool(),
      this.getRemindersTodayTool(),
      this.searchRemindersTool(),
      this.searchBrainDumpTool(),
      this.getPatternIntelligenceTool(),
      this.getWeeklyReviewTool(),
      this.getDecisionAnalysesTool(),
      this.getDecisionCalibrationTool(),
      this.getDecisionAnalyticsTool(),
      this.getDecisionReviewQueueTool(),
      this.getDecisionLearningsTool(),
      this.getDecisionExperimentsTool(),
      this.getDecisionAssumptionsTool(),
      this.getMemoryInboxTool(),
      this.getMemoryReviewQueueTool(),
      this.getDailyContextTool(),
      this.captureMemoryCandidateTool(actionContext),
      ...decisionProposalTools,
      ...taskProposalTools,
      ...brainDumpProposalTools,
      ...reminderProposalTools,
    ];

    switch (mode) {
      case HsakaaMode.COMPANIES:
        return [...base, this.searchCompaniesTool()];

      case HsakaaMode.JOURNAL:
        return [...base, this.searchJournalTool(), ...journalProposalTools];

      case HsakaaMode.LIBRARY:
        return [...base, this.searchLibraryTool()];

      case HsakaaMode.HEALTH:
        return [...base, this.getHealthDashboardTool()];

      case HsakaaMode.MEDIA:
        return [
          ...base,
          this.searchMediaTool(),
          this.getMediaIntelligenceTool(),
          this.checkMediaRepetitionTool(),
          this.getMediaDirectorOverviewTool(),
          this.getMediaGenerationRunTool(),
          this.generateMediaContentBatchTool(),
          this.getMediaProductionStudioTool(),
          this.getMediaProductionPackTool(),
          this.getMediaCalendarCoverageTool(),
          this.getMediaPublishingQueueTool(),
          this.getMediaGrowthAnalyticsTool(),
          this.getMediaGrowthLearningsTool(),
          this.getMediaGrowthExperimentsTool(),
          this.getMediaEngagementOverviewTool(),
          this.searchMediaEngagementTool(),
          this.getMediaAutopilotOverviewTool(),
          ...mediaProposalTools,
        ];

      case HsakaaMode.MEMORY:
        return [
          this.getNowTool(),
          this.searchPeopleTool(),
          this.getPersonProfileTool(),
          this.getPersonRelationshipContextTool(),
          this.getPeopleContactGapsTool(),
          this.findPeopleByRelationshipContextTool(),
          this.getPersonTimelineTool(),
          this.getPeopleOpenLoopsTool(),
          this.getPersonOpenLoopsTool(),
          this.searchMemoryTool(),
          this.searchPersonMemoryTool(),
          this.searchTasksTool(),
          this.getRemindersTodayTool(),
          this.searchRemindersTool(),
          this.searchBrainDumpTool(),
          this.getPatternIntelligenceTool(),
          this.getWeeklyReviewTool(),
          this.getDecisionAnalysesTool(),
          this.getDecisionCalibrationTool(),
          this.getDecisionAnalyticsTool(),
          this.getDecisionReviewQueueTool(),
          this.getDecisionLearningsTool(),
          this.getDecisionExperimentsTool(),
          this.getDecisionAssumptionsTool(),
          this.getMemoryInboxTool(),
          this.getMemoryReviewQueueTool(),
          this.getDailyContextTool(),
          this.captureMemoryCandidateTool(actionContext),
          ...decisionProposalTools,
          ...taskProposalTools,
          ...brainDumpProposalTools,
          ...reminderProposalTools,
          ...memoryProposalTools,
        ];

      case HsakaaMode.CHAT:
      default:
        return [
          ...base,
          this.searchCompaniesTool(),
          this.searchJournalTool(),
          this.searchLibraryTool(),
          this.getHealthDashboardTool(),
          this.searchMediaTool(),
          this.getMediaIntelligenceTool(),
          this.checkMediaRepetitionTool(),
          this.getMediaDirectorOverviewTool(),
          this.getMediaGenerationRunTool(),
          this.generateMediaContentBatchTool(),
          this.getMediaProductionStudioTool(),
          this.getMediaProductionPackTool(),
          this.getMediaCalendarCoverageTool(),
          this.getMediaPublishingQueueTool(),
          this.getMediaGrowthAnalyticsTool(),
          this.getMediaGrowthLearningsTool(),
          this.getMediaGrowthExperimentsTool(),
          this.getMediaEngagementOverviewTool(),
          this.searchMediaEngagementTool(),
          this.getMediaAutopilotOverviewTool(),
          ...mediaProposalTools,
          this.getBrainDumpInboxTool(),
          ...journalProposalTools,
          ...memoryProposalTools,
        ];
    }
  }

  private getDecisionAnalysesTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_recent_decision_analyses',
        description:
          'Get HSAKAA Decision Lab analyses that Aakash explicitly ran recently. Use this when the user asks about a previously analyzed decision, the recommendation, trade-offs, risks, assumptions or what could change the recommendation. This reads stored analyses and does not re-run AI.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.decisionService.listRecent(5),
    );
  }

  private getDecisionCalibrationTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_calibration',
        description:
          'Get stored HSAKAA decision follow-through and outcome calibration: what Aakash chose, reviewed outcomes, whether recommendations were followed, confidence calibration and recent lessons. This is deterministic over stored Decision Lab reviews and does not run AI.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.decisionService.getCalibrationSummary(),
    );
  }

  private getDecisionAnalyticsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_analytics',
        description:
          'Get deterministic Decision Intelligence analytics across stored analyses, commitments, final outcome reviews, calibration, confidence bands, decision speed, experiments, failed assumptions, performance by horizon/reversibility and historical caution signals. Use this when the user asks how their decision process or HSAKAA recommendations are performing over time. Read-only and makes zero OpenAI calls.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.decisionAnalyticsService.getAnalytics(),
    );
  }

  private getDecisionReviewQueueTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_review_queue',
        description:
          'Get pending HSAKAA Decision Lab reviews grouped into overdue, due today, upcoming and unscheduled. Includes deterministic horizon-based suggested review dates and evidence prompts derived from the frozen original analysis. This is read-only, uses stored data only and does not run AI.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.decisionService.getDecisionReviewQueue(),
    );
  }

  private getDecisionLearningsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_learnings',
        description:
          'Search reusable lessons from completed HSAKAA Decision Lab outcome reviews. Use this for questions like “Have I made a similar decision before?”, “What have I learned?”, “Where has HSAKAA been wrong?” or “What happened when I ignored the recommendation?”. Retrieval is deterministic over stored final reviews, excludes too-early/abandoned outcomes, is read-only and does not run AI.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            horizon: {
              type: 'string',
              enum: Object.values(HsakaaDecisionHorizon),
            },
            status: {
              type: 'string',
              enum: [
                HsakaaDecisionOutcomeStatus.POSITIVE,
                HsakaaDecisionOutcomeStatus.MIXED,
                HsakaaDecisionOutcomeStatus.NEGATIVE,
              ],
            },
            calibration: {
              type: 'string',
              enum: HSAKAA_DECISION_LEARNING_CALIBRATIONS,
            },
            recommendationFollowed: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 50 },
          },
          required: [],
          additionalProperties: false,
        },
      },
      async (args) => {
        const recommendationFollowed = this.booleanArg(
          args,
          'recommendationFollowed',
        );
        return this.decisionService.getDecisionLearnings({
          ...(this.stringArg(args, 'search')
            ? { search: this.stringArg(args, 'search') }
            : {}),
          ...(this.enumArg(
            args,
            'horizon',
            Object.values(HsakaaDecisionHorizon),
          )
            ? {
                horizon: this.enumArg(
                  args,
                  'horizon',
                  Object.values(HsakaaDecisionHorizon),
                ) as HsakaaDecisionHorizon,
              }
            : {}),
          ...(this.enumArg(args, 'status', [
            HsakaaDecisionOutcomeStatus.POSITIVE,
            HsakaaDecisionOutcomeStatus.MIXED,
            HsakaaDecisionOutcomeStatus.NEGATIVE,
          ])
            ? {
                status: this.enumArg(args, 'status', [
                  HsakaaDecisionOutcomeStatus.POSITIVE,
                  HsakaaDecisionOutcomeStatus.MIXED,
                  HsakaaDecisionOutcomeStatus.NEGATIVE,
                ]) as
                  | HsakaaDecisionOutcomeStatus.POSITIVE
                  | HsakaaDecisionOutcomeStatus.MIXED
                  | HsakaaDecisionOutcomeStatus.NEGATIVE,
              }
            : {}),
          ...(this.enumArg(
            args,
            'calibration',
            HSAKAA_DECISION_LEARNING_CALIBRATIONS,
          )
            ? {
                calibration: this.enumArg(
                  args,
                  'calibration',
                  HSAKAA_DECISION_LEARNING_CALIBRATIONS,
                ) as (typeof HSAKAA_DECISION_LEARNING_CALIBRATIONS)[number],
              }
            : {}),
          ...(recommendationFollowed !== undefined
            ? {
                recommendationFollowed: recommendationFollowed
                  ? ('true' as const)
                  : ('false' as const),
              }
            : {}),
          limit: this.limitArg(args, 10, 50),
        });
      },
    );
  }

  private getDecisionExperimentsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_experiments',
        description:
          'Get tracked HSAKAA decision experiments and the experiment queue. With decisionId, returns that decision’s assumptions, experiments, evidence and reassessment history. Without decisionId, returns active, awaiting-result, due, completed and invalidated-assumption queue groups. Read-only; no AI call.',
        strict: false,
        parameters: {
          type: 'object',
          properties: { decisionId: { type: 'string' } },
          required: [],
          additionalProperties: false,
        },
      },
      async (args) => {
        const decisionId = this.stringArg(args, 'decisionId');
        return decisionId
          ? this.decisionExperimentService.getDecisionState(decisionId)
          : this.decisionExperimentService.getExperimentQueue();
      },
    );
  }

  private getDecisionAssumptionsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_decision_assumptions',
        description:
          'Get the Assumption Register for a specific Decision Lab case, including current status and linked supporting/contradicting evidence. Read-only and deterministic; no AI call.',
        strict: true,
        parameters: {
          type: 'object',
          properties: { decisionId: { type: 'string' } },
          required: ['decisionId'],
          additionalProperties: false,
        },
      },
      async (args) =>
        this.decisionExperimentService.getAssumptions(
          this.stringArg(args, 'decisionId') ?? '',
        ),
    );
  }

  private getWeeklyReviewTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_weekly_review',
        description:
          'Get HSAKAA’s latest cached weekly review and decision intelligence. Use this for wins, misses, decisions, lessons, unresolved items and next-week priorities. It reads the latest cached review and does not regenerate it during chat.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () =>
        (await this.weeklyReviewService.getLatestCached()) ?? {
          available: false,
          message:
            'No Weekly Review has been generated yet. Open HSAKAA Intelligence and generate one first.',
        },
    );
  }

  private getPatternIntelligenceTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_pattern_intelligence',
        description:
          'Get HSAKAA’s latest cached rolling pattern analysis across Aakash’s Personal OS. Use this for recurring blockers, repeated themes, cross-domain patterns and evidence-backed correlations. It does not regenerate analysis during chat.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () =>
        (await this.patternService.getLatestCached()) ?? {
          available: false,
          message:
            'No Pattern Intelligence report has been generated yet. Open HSAKAA Intelligence and generate one first.',
        },
    );
  }

  private getNowTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_now_status',
        description:
          'Get Aakash’s current private Now status: present focus, priorities, current state and active context.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.nowService.getCurrent(),
    );
  }

  private searchPeopleTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_people',
        description:
          'Search the saved People Directory deterministically by name, preferred name, alias, relationship, company, role, department, location, tag, email or phone. Use this to identify or disambiguate a person before discussing person-specific context. Read-only and makes zero OpenAI calls.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 25 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.memoryPeopleService.searchDirectory(
          this.stringArg(args, 'query'),
          this.limitArg(args, 10, 25),
        ),
    );
  }

  private getPersonProfileTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_person_profile',
        description:
          'Resolve exactly one saved person by full name, preferred name or alias and return their authoritative private People Directory profile. If the name is ambiguous, returns candidate identities instead of guessing. Use personId-bearing results as identity evidence; do not merge two people with the same name.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }
        return this.memoryPeopleService.resolveExactPerson(person);
      },
    );
  }

  private getPersonRelationshipContextTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_person_relationship_context',
        description:
          'Resolve exactly one saved person and return deterministic relationship context: who introduced Aakash to them, how they met, connection contexts such as 8lete, recorded last contact (or explicitly that no contact is recorded), how long the person has been known, recent discussion summaries/topics, unresolved commitments and preferred contact cadence. Use this for questions like “When did I last speak to X?”, “What did we discuss recently?”, “What commitments do I have with X?” or “Who introduced me to X?”.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }

        const resolved =
          await this.memoryPeopleService.resolveExactPerson(person);
        const resolvedPerson =
          'person' in resolved ? resolved.person : undefined;

        if (resolved.status !== 'resolved' || !resolvedPerson) {
          return resolved;
        }

        return this.personRelationshipContextService.getForPerson(
          resolvedPerson.personId,
        );
      },
    );
  }

  private getPersonConnectionsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_person_connections',
        description:
          'Resolve exactly one saved person and return their evidence-backed People Graph connections. Includes explicit Person-to-Person relationships plus deterministic introducer edges from Relationship Context. Use this for questions like “Who does X know?”, “Who is connected to X?” or “What is X’s network around me?”. Read-only and never invents social links.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }
        const resolved =
          await this.memoryPeopleService.resolveExactPerson(person);
        const resolvedPerson =
          'person' in resolved ? resolved.person : undefined;
        if (resolved.status !== 'resolved' || !resolvedPerson) {
          return resolved;
        }
        return this.personGraphService.getForPerson(resolvedPerson.personId);
      },
    );
  }

  private getPeopleMutualConnectionsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_people_mutual_connections',
        description:
          'Resolve two saved people and return only the direct mutual connections that exist in Aakash’s People Graph. Use for “Who connects X and Y?” or “What mutual connections do X and Y have?”. It uses saved/derived graph evidence only and does not infer friendships from text.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {
            firstPerson: { type: 'string' },
            secondPerson: { type: 'string' },
          },
          required: ['firstPerson', 'secondPerson'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const firstPerson = this.stringArg(args, 'firstPerson');
        const secondPerson = this.stringArg(args, 'secondPerson');
        if (!firstPerson || !secondPerson) {
          throw new BadRequestException('Two person names are required.');
        }

        const firstResolved =
          await this.memoryPeopleService.resolveExactPerson(firstPerson);
        const first =
          'person' in firstResolved ? firstResolved.person : undefined;
        if (firstResolved.status !== 'resolved' || !first) {
          return { unresolved: 'firstPerson', resolution: firstResolved };
        }

        const secondResolved =
          await this.memoryPeopleService.resolveExactPerson(secondPerson);
        const second =
          'person' in secondResolved ? secondResolved.person : undefined;
        if (secondResolved.status !== 'resolved' || !second) {
          return { unresolved: 'secondPerson', resolution: secondResolved };
        }

        return this.personGraphService.getMutualConnections(
          first.personId,
          second.personId,
        );
      },
    );
  }

  private findPeopleConnectionPathTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'find_people_connection_path',
        description:
          'Resolve two saved people and find the shortest evidence-backed People Graph path between them, up to a small configurable depth. Use this for “How are X and Y connected?” or “What is the connection path from X to Y?”. Directional relationship labels are preserved, but traversal is network-based in either direction. No text-based or AI-inferred edges are added.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            fromPerson: { type: 'string' },
            toPerson: { type: 'string' },
            maxDepth: { type: 'integer', minimum: 1, maximum: 6 },
          },
          required: ['fromPerson', 'toPerson'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const fromPerson = this.stringArg(args, 'fromPerson');
        const toPerson = this.stringArg(args, 'toPerson');
        if (!fromPerson || !toPerson) {
          throw new BadRequestException('Two person names are required.');
        }

        const fromResolved =
          await this.memoryPeopleService.resolveExactPerson(fromPerson);
        const from = 'person' in fromResolved ? fromResolved.person : undefined;
        if (fromResolved.status !== 'resolved' || !from) {
          return { unresolved: 'fromPerson', resolution: fromResolved };
        }

        const toResolved =
          await this.memoryPeopleService.resolveExactPerson(toPerson);
        const to = 'person' in toResolved ? toResolved.person : undefined;
        if (toResolved.status !== 'resolved' || !to) {
          return { unresolved: 'toPerson', resolution: toResolved };
        }

        return this.personGraphService.findPath(
          from.personId,
          to.personId,
          this.integerArg(args, 'maxDepth', 4, 6),
        );
      },
    );
  }

  private getPeopleGraphOverviewTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_people_graph_overview',
        description:
          'Return a deterministic overview of Aakash’s People Graph: saved nodes, explicit versus derived connections, isolated people, connected components, and people with the highest direct connection count. Optionally restrict to a context such as 8lete. Use for network-level questions like “Who is most connected in my network?” or “Show my 8lete people graph.” Degree is a simple connection count, not an AI relationship score.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 300 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.personGraphService.getOverview({
          context: this.stringArg(args, 'context'),
          limit: this.limitArg(args, 150, 300),
        }),
    );
  }

  private getPeopleContactGapsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_people_contact_gaps',
        description:
          'Return saved active people whose relationship has been quiet for a configurable number of days, optionally restricted to a context such as 8lete. Recorded contact gaps and people with no recorded contact are explicitly distinguished: never-contacted people may qualify by first-met/directory-created age but are never described as having a fabricated last-contact date. Use this for questions like “Who have I not spoken to in 60 days?” or “Which 8lete relationships have gone quiet?”. Deterministic and read-only.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 3650 },
            context: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.personRelationshipContextService.getContactGaps({
          days: this.integerArg(args, 'days', 60, 3650),
          context: this.stringArg(args, 'context'),
          limit: this.limitArg(args, 50, 100),
        }),
    );
  }

  private findPeopleByRelationshipContextTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'find_people_by_relationship_context',
        description:
          'Find saved active people connected to a named relationship context such as 8lete or Frayto. It deterministically matches explicit relationship contexts plus directory organization/tags. Use this when Aakash asks who is connected to a company, project or stable relationship context.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            context: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['context'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const context = this.stringArg(args, 'context');
        if (!context) {
          throw new BadRequestException('Relationship context is required.');
        }

        return this.personRelationshipContextService.findPeopleByContext({
          context,
          limit: this.limitArg(args, 50, 100),
        });
      },
    );
  }

  private getPersonTimelineTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_person_timeline',
        description:
          'Get one saved person’s deterministic chronological relationship history across explicitly linked interactions, memories, commitments, journal entries, tasks, media and Decision Intelligence. Identity is resolved exactly first; ambiguous names return candidates and no timeline. No event is attached merely because the person’s name appears in free text. Read-only and makes zero OpenAI calls.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 200 },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }
        const resolved =
          await this.memoryPeopleService.resolveExactPerson(person);
        const resolvedPerson =
          'person' in resolved ? resolved.person : undefined;
        if (resolved.status !== 'resolved' || !resolvedPerson) {
          return resolved;
        }
        return this.personTimelineService.getTimeline(resolvedPerson.personId, {
          limit: this.limitArg(args, 50, 200),
        });
      },
    );
  }

  private getPeopleOpenLoopsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_people_open_loops',
        description:
          'Get Aakash’s unresolved relationship open loops across saved people: promises he made, promises made to him, unanswered questions, pending introductions, meetings to schedule, things he wanted to ask and follow-ups. Use this for questions such as “Who am I forgetting to follow up with?” Results are deterministic and read-only.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: Object.values(PersonOpenLoopKind),
            },
            overdueOnly: { type: 'boolean' },
            dueBefore: {
              type: 'string',
              description: 'Optional ISO-8601 upper bound for due date.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.personOpenLoopsService.getOpenQueue({
          kind: this.enumArg(
            args,
            'kind',
            Object.values(PersonOpenLoopKind),
          ) as PersonOpenLoopKind | undefined,
          overdueOnly: this.booleanArg(args, 'overdueOnly'),
          dueBefore: this.stringArg(args, 'dueBefore'),
          limit: this.limitArg(args, 50, 100),
        }),
    );
  }

  private getPersonOpenLoopsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_person_open_loops',
        description:
          'Resolve exactly one saved person and return unresolved relationship open loops attached to that Person ID. Use this when Aakash asks what is still pending with a specific person. Ambiguous names return candidate identities rather than guessing. Read-only and deterministic.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
            kind: {
              type: 'string',
              enum: Object.values(PersonOpenLoopKind),
            },
            overdueOnly: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }

        const resolved =
          await this.memoryPeopleService.resolveExactPerson(person);
        const resolvedPerson =
          'person' in resolved ? resolved.person : undefined;

        if (resolved.status !== 'resolved' || !resolvedPerson) {
          return resolved;
        }

        return this.personOpenLoopsService.findForPerson(
          resolvedPerson.personId,
          {
            status: PersonOpenLoopStatus.OPEN,
            kind: this.enumArg(
              args,
              'kind',
              Object.values(PersonOpenLoopKind),
            ) as PersonOpenLoopKind | undefined,
            overdueOnly: this.booleanArg(args, 'overdueOnly'),
            limit: this.limitArg(args, 50, 100),
          },
        );
      },
    );
  }

  private searchMemoryTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_memory',
        description:
          'Deterministically recall Aakash’s private Personal OS memories. Results are ranked by query match, memory type, recency, importance, confidence and verification without an OpenAI retrieval call. Current truth is returned separately from historical context. Set includeHistorical only when Aakash explicitly asks what changed, what used to be true or otherwise requests history. Forgotten memories are never surfaced. For a specific named person, use search_person_memory instead.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'The actual recall question or search phrase. Pass the user’s meaningful wording rather than reducing it to one keyword.',
            },
            intent: {
              type: 'string',
              enum: Object.values(MemoryRecallIntent),
              description:
                'Optional retrieval intent. Usually omit and allow deterministic inference from the query.',
            },
            type: {
              type: 'string',
              enum: Object.values(MemoryType),
              description:
                'Optional explicit semantic memory-type filter. Use only when the question clearly asks for that type.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 15,
            },
            includeHistorical: {
              type: 'boolean',
              description:
                'Use only when Aakash explicitly asks for old, previous, changed, superseded or historical memory. Forgotten memories remain excluded.',
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.memoryService.recall({
          ...(this.stringArg(args, 'query')
            ? { query: this.stringArg(args, 'query') }
            : {}),
          ...(this.stringArg(args, 'intent')
            ? {
                intent: this.stringArg(args, 'intent') as MemoryRecallIntent,
              }
            : {}),
          ...(this.stringArg(args, 'type')
            ? { type: this.stringArg(args, 'type') as MemoryType }
            : {}),
          ...(this.booleanArg(args, 'includeHistorical')
            ? { includeHistorical: true }
            : {}),
          limit: this.limitArg(args, 8, 15),
        }),
    );
  }

  private searchPersonMemoryTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_person_memory',
        description:
          'Resolve one saved person by exact name/preferred name/alias and deterministically rank only memories explicitly linked to that exact Person ID. Individual, group and mention/source context are kept separate so attribution cannot leak across people. Set includeHistorical only for explicit historical questions; forgotten memories are never returned. If identity is ambiguous, no memories are returned until the person is disambiguated.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            person: { type: 'string' },
            query: {
              type: 'string',
              description:
                'Optional topic/question to rank this exact person’s memories, e.g. pricing, follow-up, preferences or what they said about a project.',
            },
            type: {
              type: 'string',
              enum: Object.values(MemoryType),
              description:
                'Optional explicit semantic memory-type filter, for example preference, commitment, belief or lesson.',
            },
            limit: { type: 'integer', minimum: 1, maximum: 20 },
            includeHistorical: {
              type: 'boolean',
              description:
                'Include separately labeled old/superseded/contradicted/expired/archived/disputed memories only for explicit historical questions.',
            },
          },
          required: ['person'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const person = this.stringArg(args, 'person');
        if (!person) {
          throw new BadRequestException('Person name is required.');
        }

        return this.memoryService.findPersonMemoryContext(
          person,
          this.limitArg(args, 12, 20),
          this.stringArg(args, 'type') as MemoryType | undefined,
          this.booleanArg(args, 'includeHistorical'),
          this.stringArg(args, 'query'),
        );
      },
    );
  }

  private getMemoryReviewQueueTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_memory_review_queue',
        description:
          'Read Aakash’s deterministic Memory Review queue: disputed, contradicted, stale, old preferences, uncertain memories and likely duplicates. Read-only, changes no memory state, and makes zero OpenAI calls.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.memoryReviewService.getQueue(),
    );
  }

  private getDailyContextTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_daily_context',
        description:
          'Get Aakash’s deterministic Personal OS daily context for a day: tasks, brain dumps, journal activity, books/highlights, memory, decisions/experiments, health, media, companies and private HSAKAA activity. Returns what happened and significant changes with privacy labels. Read-only and makes zero OpenAI calls.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            dateKey: {
              type: 'string',
              description:
                'Optional Asia/Kolkata date in YYYY-MM-DD format. Omit for today.',
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.dailyContextService.get(this.stringArg(args, 'dateKey')),
    );
  }

  private getMemoryInboxTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_memory_inbox',
        description:
          'Read pending Memory Inbox proposals that have not yet become active memories. Use this when Aakash asks what HSAKAA has suggested remembering or what still needs memory review. Read-only and makes zero OpenAI calls.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.memoryInboxService.getPendingForHsakaa(
          this.limitArg(args, 10, 20),
        ),
    );
  }

  private captureMemoryCandidateTool(
    context?: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'capture_memory_candidate',
        description:
          'Stage a non-sensitive owner-only candidate in the Memory Inbox when the current conversation reveals stable context that is likely to be useful in future conversations. This does NOT create active memory and does not affect recall until Aakash accepts it. Do not stage secrets, medical details, highly personal/sensitive facts, fleeting states, or guesses. Avoid duplicates and use sparingly.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            scope: {
              type: 'string',
              enum: Object.values(MemoryScope),
              description:
                'Use general when no person is the subject, individual for one primary person, and group when two or more people jointly own the memory context.',
            },
            people: {
              type: 'array',
              description:
                'Saved people linked to this memory. Subject/participant links determine whose memory it is; mentioned/source/related links are contextual only.',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  relation: {
                    type: 'string',
                    enum: Object.values(MemoryPersonRelation),
                  },
                },
                required: ['name', 'relation'],
                additionalProperties: false,
              },
            },
            type: {
              type: 'string',
              enum: MEMORY_CANONICAL_TYPES,
              description: `Choose the most precise semantic class. ${MEMORY_CANONICAL_TYPES.map(
                (memoryType) =>
                  `${memoryType}: ${MEMORY_TYPE_SEMANTICS[memoryType] ?? ''}`,
              ).join(' ')}`,
            },
            categories: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            importance: { type: 'number', minimum: 0, maximum: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            durability: {
              type: 'string',
              enum: Object.values(MemoryDurability),
            },
            sensitivity: {
              type: 'string',
              enum: [MemorySensitivity.NORMAL, MemorySensitivity.PERSONAL],
            },
            happenedAt: {
              type: 'string',
              description:
                'Optional ISO-8601 time when the remembered event happened.',
            },
            proposalReason: {
              type: 'string',
              description: 'Brief reason this context could be useful later.',
            },
            entities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: Object.values(MemoryEntityType),
                  },
                  name: { type: 'string' },
                  externalId: { type: 'string' },
                },
                required: ['type', 'name'],
                additionalProperties: false,
              },
            },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const content = this.stringArg(args, 'content');
        if (!content) {
          throw new BadRequestException(
            'Memory candidate content is required.',
          );
        }

        const type = this.enumArg(args, 'type', MEMORY_CANONICAL_TYPES);
        const durability = this.enumArg(
          args,
          'durability',
          Object.values(MemoryDurability),
        );
        const sensitivity = this.enumArg(args, 'sensitivity', [
          MemorySensitivity.NORMAL,
          MemorySensitivity.PERSONAL,
        ]);
        const scope = this.enumArg(args, 'scope', Object.values(MemoryScope));
        const personLinksByName = this.memoryPeopleArg(args);
        const personLinks = personLinksByName?.length
          ? await this.memoryService.resolvePersonLinksByNames(
              personLinksByName,
            )
          : undefined;
        const primary = personLinks?.find(
          (link) => link.relation === MemoryPersonRelation.PRIMARY_SUBJECT,
        );

        return this.memoryInboxService.captureFromHsakaa({
          content,
          ...(scope ? { scope: scope as MemoryScope } : {}),
          ...(personLinks ? { personLinks } : {}),
          ...(scope === MemoryScope.INDIVIDUAL && primary
            ? { personId: primary.personId }
            : {}),
          ...(type ? { type: type as MemoryType } : {}),
          categories: this.stringArrayArg(args, 'categories', 12),
          tags: this.stringArrayArg(args, 'tags', 20),
          ...(typeof args.importance === 'number'
            ? { importance: Math.min(Math.max(args.importance, 0), 1) }
            : {}),
          ...(typeof args.confidence === 'number'
            ? { confidence: Math.min(Math.max(args.confidence, 0), 1) }
            : {}),
          ...(durability ? { durability: durability as MemoryDurability } : {}),
          ...(sensitivity
            ? { sensitivity: sensitivity as MemorySensitivity }
            : {}),
          ...(this.stringArg(args, 'happenedAt')
            ? { happenedAt: this.stringArg(args, 'happenedAt') }
            : {}),
          ...(this.stringArg(args, 'proposalReason')
            ? { proposalReason: this.stringArg(args, 'proposalReason') }
            : {}),
          ...(context
            ? {
                sourceReference: {
                  entityType: 'hsakaa_request',
                  externalId: `${context.conversationId}:${context.requestId}`,
                },
              }
            : {}),
          entities: this.memoryEntitiesArg(args),
        });
      },
    );
  }

  private getTaskSummaryTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_task_summary',
        description:
          'Get the current task pulse including open, overdue, due-today and status counts.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.tasksService.getSummary(),
    );
  }

  private searchTasksTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_tasks',
        description:
          'Search Aakash’s current tasks. Use for what he needs to do, priorities, deadlines, blockers, overdue work or tasks in a specific area.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(TaskStatus),
            },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
            },
            dueToday: { type: 'boolean' },
            overdue: { type: 'boolean' },
            area: { type: 'string' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.tasksService.findAll({
          ...(this.stringArg(args, 'query')
            ? { search: this.stringArg(args, 'query') }
            : {}),
          ...(this.enumArg(args, 'status', Object.values(TaskStatus))
            ? {
                status: this.enumArg(
                  args,
                  'status',
                  Object.values(TaskStatus),
                ) as TaskStatus,
              }
            : {}),
          ...(this.enumArg(args, 'priority', Object.values(TaskPriority))
            ? {
                priority: this.enumArg(
                  args,
                  'priority',
                  Object.values(TaskPriority),
                ) as TaskPriority,
              }
            : {}),
          ...(this.booleanArg(args, 'dueToday') !== undefined
            ? { dueToday: this.booleanArg(args, 'dueToday') }
            : {}),
          ...(this.booleanArg(args, 'overdue') !== undefined
            ? { overdue: this.booleanArg(args, 'overdue') }
            : {}),
          ...(this.stringArg(args, 'area')
            ? { area: this.stringArg(args, 'area') }
            : {}),
          page: 1,
          limit: this.limitArg(args, 10, 20),
          sortBy: 'dueAt',
          sortOrder: 'asc',
        }),
    );
  }

  private getRemindersTodayTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_today_reminders',
        description:
          'Get today’s Personal OS reminders across tasks and supported care routines.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.remindersService.getToday(),
    );
  }

  private searchRemindersTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_reminders',
        description:
          'Search Personal OS reminders so HSAKAA can identify the exact reminderId before proposing snooze, acknowledge, dismiss or reopen.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(ReminderStatus),
            },
            sourceType: {
              type: 'string',
              enum: Object.values(ReminderSourceType),
            },
            dueOnly: { type: 'boolean' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 30,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) => {
        const result = await this.remindersService.findAll({
          ...(this.enumArg(args, 'status', Object.values(ReminderStatus))
            ? {
                status: this.enumArg(
                  args,
                  'status',
                  Object.values(ReminderStatus),
                ) as ReminderStatus,
              }
            : {}),
          ...(this.enumArg(
            args,
            'sourceType',
            Object.values(ReminderSourceType),
          )
            ? {
                sourceType: this.enumArg(
                  args,
                  'sourceType',
                  Object.values(ReminderSourceType),
                ) as ReminderSourceType,
              }
            : {}),
          ...(this.booleanArg(args, 'dueOnly') !== undefined
            ? { dueOnly: this.booleanArg(args, 'dueOnly') }
            : {}),
          page: 1,
          limit: this.limitArg(args, 12, 30),
        });

        const query = this.stringArg(args, 'query')?.toLowerCase();
        if (!query) return result;

        return {
          ...result,
          data: result.data.filter((reminder) => {
            const title =
              typeof reminder.title === 'string'
                ? reminder.title.toLowerCase()
                : '';
            const message =
              typeof reminder.message === 'string'
                ? reminder.message.toLowerCase()
                : '';
            return title.includes(query) || message.includes(query);
          }),
        };
      },
    );
  }

  private searchCompaniesTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_companies',
        description:
          'Search Aakash’s private company records, including current company context, status and operating information.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.companiesService.findAll({
          ...(this.stringArg(args, 'query')
            ? { search: this.stringArg(args, 'query') }
            : {}),
          page: 1,
          limit: this.limitArg(args, 6, 12),
        }),
    );
  }

  private searchJournalTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_journal',
        description:
          'Search private journal entries for reflections, decisions, lessons, mood, failures, patterns and personal growth.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.journalService.findAll({
          ...(this.stringArg(args, 'query')
            ? { search: this.stringArg(args, 'query') }
            : {}),
          page: 1,
          limit: this.limitArg(args, 6, 12),
        }),
    );
  }

  private searchLibraryTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_library',
        description:
          'Search Aakash’s private library for books, notes, highlights, reading status and recorded lessons.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.libraryService.findAll(
          {
            ...(this.stringArg(args, 'query')
              ? { search: this.stringArg(args, 'query') }
              : {}),
            page: 1,
            limit: this.limitArg(args, 6, 12),
          },
          false,
        ),
    );
  }

  private getHealthDashboardTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_health_dashboard',
        description:
          'Get Aakash’s current private Health OS dashboard and recent tracked health signals.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.healthDashboardService.getDashboard(),
    );
  }

  private getMediaIntelligenceTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_content_memory',
        description:
          'Read the Media anti-repetition memory status: indexing coverage, remembered rejected ideas, high-risk repeated content and similarity policy. Use this before claiming content is novel or before planning a new content batch.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaContentIntelligenceService.overview(),
    );
  }

  private checkMediaRepetitionTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'check_media_repetition',
        description:
          'Check a proposed content idea or platform execution against saved and rejected Media memory. This AI-backed check compares semantic meaning plus topic, angle, hook pattern, story/example, structure and CTA similarity. Use before recommending content as new. It does not save the candidate.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            thesis: { type: 'string' },
            whyNow: { type: 'string' },
            canonicalBody: { type: 'string' },
            story: { type: 'string' },
            platform: {
              type: 'string',
              enum: Object.values(MediaPlatform),
            },
            format: {
              type: 'string',
              enum: Object.values(MediaPostType),
            },
            hook: { type: 'string' },
            caption: { type: 'string' },
            script: { type: 'string' },
            description: { type: 'string' },
            cta: { type: 'string' },
            intentionalRepurpose: { type: 'boolean' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaContentIntelligenceService.checkCandidate({
          title: this.stringArg(args, 'title') ?? '',
          ...(this.stringArg(args, 'thesis')
            ? { thesis: this.stringArg(args, 'thesis') }
            : {}),
          ...(this.stringArg(args, 'whyNow')
            ? { whyNow: this.stringArg(args, 'whyNow') }
            : {}),
          ...(this.stringArg(args, 'canonicalBody')
            ? { canonicalBody: this.stringArg(args, 'canonicalBody') }
            : {}),
          ...(this.stringArg(args, 'story')
            ? { story: this.stringArg(args, 'story') }
            : {}),
          ...(this.enumArg(args, 'platform', Object.values(MediaPlatform))
            ? {
                platform: this.enumArg(
                  args,
                  'platform',
                  Object.values(MediaPlatform),
                ) as MediaPlatform,
              }
            : {}),
          ...(this.enumArg(args, 'format', Object.values(MediaPostType))
            ? {
                format: this.enumArg(
                  args,
                  'format',
                  Object.values(MediaPostType),
                ) as MediaPostType,
              }
            : {}),
          ...(this.stringArg(args, 'hook')
            ? { hook: this.stringArg(args, 'hook') }
            : {}),
          ...(this.stringArg(args, 'caption')
            ? { caption: this.stringArg(args, 'caption') }
            : {}),
          ...(this.stringArg(args, 'script')
            ? { script: this.stringArg(args, 'script') }
            : {}),
          ...(this.stringArg(args, 'description')
            ? { description: this.stringArg(args, 'description') }
            : {}),
          ...(this.stringArg(args, 'cta')
            ? { cta: this.stringArg(args, 'cta') }
            : {}),
          ...(this.booleanArg(args, 'intentionalRepurpose') !== undefined
            ? {
                intentionalRepurpose: this.booleanArg(
                  args,
                  'intentionalRepurpose',
                ),
              }
            : {}),
        }),
    );
  }

  private getMediaDirectorOverviewTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_content_director',
        description:
          'Get HSAKAA Content Director state: generation runs, configured growth platforms and the approval/anti-repetition policy. Read this before directing a new content batch.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaContentDirectorService.overview(),
    );
  }

  private getMediaGenerationRunTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_generation_run',
        description:
          'Read one HSAKAA Media generation run and its ranked draft candidates, critic scores, native platform executions and acceptance/rejection state. Use an exact runId returned by generate_media_content_batch.',
        strict: true,
        parameters: {
          type: 'object',
          properties: { runId: { type: 'string' } },
          required: ['runId'],
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaContentDirectorService.getRun(
          this.stringArg(args, 'runId') ?? '',
        ),
    );
  }

  private generateMediaContentBatchTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'generate_media_content_batch',
        description:
          'Generate a HSAKAA Content Director draft batch when Aakash explicitly asks for content ideas, a content plan, platform adaptations or candidate generation. This runs a multi-stage AI pipeline, checks every candidate against anti-repetition memory, critiques/ranks the batch, and stores only a generation run. It does NOT create canonical Media content, schedule or publish anything. Accepted content requires a separate confirmation card.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            brief: { type: 'string' },
            purpose: {
              type: 'string',
              enum: Object.values(MediaGenerationPurpose),
            },
            platforms: {
              type: 'array',
              items: { type: 'string', enum: Object.values(MediaPlatform) },
            },
            candidateCount: { type: 'integer', minimum: 2, maximum: 8 },
            goals: {
              type: 'array',
              items: { type: 'string', enum: Object.values(MediaGoal) },
            },
            contentPillars: { type: 'array', items: { type: 'string' } },
            audiences: { type: 'array', items: { type: 'string' } },
            whyNow: { type: 'string' },
            constraints: { type: 'array', items: { type: 'string' } },
            sourceContentItemId: { type: 'string' },
            intentionalRepurpose: { type: 'boolean' },
            contextSummary: {
              type: 'string',
              description:
                'Concise factual Personal OS context that materially informed this content direction. Do not invent context.',
            },
          },
          required: ['brief'],
          additionalProperties: false,
        },
      },
      async (args) => {
        const platforms = this.stringArrayArg(args, 'platforms', 7)?.filter(
          (value): value is MediaPlatform =>
            Object.values(MediaPlatform).includes(value as MediaPlatform),
        );
        const goals = this.stringArrayArg(args, 'goals', 12)?.filter(
          (value): value is MediaGoal =>
            Object.values(MediaGoal).includes(value as MediaGoal),
        );
        return this.mediaContentDirectorService.generate({
          brief: this.stringArg(args, 'brief') ?? '',
          ...(this.enumArg(
            args,
            'purpose',
            Object.values(MediaGenerationPurpose),
          )
            ? {
                purpose: this.enumArg(
                  args,
                  'purpose',
                  Object.values(MediaGenerationPurpose),
                ) as MediaGenerationPurpose,
              }
            : {}),
          ...(platforms?.length ? { platforms } : {}),
          candidateCount: this.integerArg(args, 'candidateCount', 4, 8),
          ...(goals?.length ? { goals } : {}),
          ...(this.stringArrayArg(args, 'contentPillars', 20)
            ? {
                contentPillars: this.stringArrayArg(args, 'contentPillars', 20),
              }
            : {}),
          ...(this.stringArrayArg(args, 'audiences', 20)
            ? { audiences: this.stringArrayArg(args, 'audiences', 20) }
            : {}),
          ...(this.stringArg(args, 'whyNow')
            ? { whyNow: this.stringArg(args, 'whyNow') }
            : {}),
          ...(this.stringArrayArg(args, 'constraints', 20)
            ? { constraints: this.stringArrayArg(args, 'constraints', 20) }
            : {}),
          ...(this.stringArg(args, 'sourceContentItemId')
            ? {
                sourceContentItemId: this.stringArg(
                  args,
                  'sourceContentItemId',
                ),
              }
            : {}),
          ...(this.booleanArg(args, 'intentionalRepurpose') !== undefined
            ? {
                intentionalRepurpose: this.booleanArg(
                  args,
                  'intentionalRepurpose',
                ),
              }
            : {}),
          ...(this.stringArg(args, 'contextSummary')
            ? { contextSummary: this.stringArg(args, 'contextSummary') }
            : {}),
        });
      },
    );
  }

  private getMediaProductionStudioTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_production_studio',
        description:
          'Read Media Production Studio readiness: how many accepted platform publications still need production, assets, review or are ready for the seven-day calendar. This never generates or changes content.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaProductionService.overview(),
    );
  }

  private getMediaProductionPackTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_production_pack',
        description:
          'Read one exact canonical Media publication production pack, linked assets and readiness. Use the exact publicationId from Media Core, a generation acceptance result or production listings.',
        strict: true,
        parameters: {
          type: 'object',
          properties: { publicationId: { type: 'string' } },
          required: ['publicationId'],
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaProductionService.getPack(
          this.stringArg(args, 'publicationId') ?? '',
        ),
    );
  }

  private getMediaCalendarCoverageTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_calendar_coverage',
        description:
          'Read the rolling Media calendar coverage, minimum seven-day horizon, open slots, production gaps and ready-but-unscheduled content across configured accounts. Use this before claiming the calendar is covered.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaCalendarService.overview(),
    );
  }

  private getMediaPublishingQueueTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_publishing_queue',
        description:
          'Read scheduled, due, failed and manual-required Media deliveries. This is read-only and never publishes anything.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaCalendarService.getPublishingQueue(),
    );
  }

  private getMediaGrowthAnalyticsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_growth_analytics',
        description:
          'Read normalized Media growth analytics across measured publications and accounts: platform performance, top content, weak content, audience growth and provider coverage. Use this before claiming which content is actually growing an account.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 7, maximum: 365 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaGrowthService.overview(
          this.integerArg(args, 'days', 30, 365),
        ),
    );
  }

  private getMediaGrowthLearningsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_growth_learnings',
        description:
          'Read evidence-backed Media growth learnings derived from multiple measured publications: formats, pillars, hooks, CTAs and posting windows that are outperforming or underperforming relevant platform baselines. These are evidence, not hard rules.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaGrowthService.listLearnings(
          this.integerArg(args, 'limit', 30, 100),
        ),
    );
  }

  private getMediaGrowthExperimentsTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_growth_experiments',
        description:
          'Read planned, running and completed Media growth experiments, including hypotheses, control/variant definitions, winners, measured lift and next actions.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaGrowthService.listExperiments(
          this.integerArg(args, 'limit', 30, 100),
        ),
    );
  }

  private getMediaAutopilotOverviewTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_growth_autopilot',
        description:
          'Read HSAKAA Media Growth Autopilot state: seven-day coverage pressure, production/publishing blockers, urgent engagement, evidence-backed growth opportunities/risks, draft candidate runs and the latest weekly strategy review. This tool is read-only. Autopilot may generate draft candidates but cannot accept content, schedule, publish or send replies.',
        strict: true,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
      },
      async () => this.mediaAutopilotService.overview(),
    );
  }

  private getMediaEngagementOverviewTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_media_engagement_inbox',
        description:
          'Read the unified Media engagement inbox across LinkedIn, Instagram, YouTube, X and WhatsApp: new/open/drafted/replied counts, urgent items, response needs and recent actionable conversations. This is read-only and never sends a reply.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 365 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaEngagementService.overview(
          this.integerArg(args, 'days', 30, 365),
        ),
    );
  }

  private searchMediaEngagementTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_media_engagement',
        description:
          'Search and filter specific audience comments, mentions, DMs and WhatsApp messages in the unified engagement inbox. Use this before referring to an exact engagement or proposing a reply.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: Object.values(MediaPlatform) },
            status: {
              type: 'string',
              enum: Object.values(MediaEngagementStatus),
            },
            priority: {
              type: 'string',
              enum: Object.values(MediaEngagementPriority),
            },
            intent: {
              type: 'string',
              enum: Object.values(MediaEngagementIntent),
            },
            needsResponse: { type: 'boolean' },
            search: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaEngagementService.list({
          ...(this.enumArg(args, 'platform', Object.values(MediaPlatform))
            ? {
                platform: this.enumArg(
                  args,
                  'platform',
                  Object.values(MediaPlatform),
                ) as MediaPlatform,
              }
            : {}),
          ...(this.enumArg(args, 'status', Object.values(MediaEngagementStatus))
            ? {
                status: this.enumArg(
                  args,
                  'status',
                  Object.values(MediaEngagementStatus),
                ) as MediaEngagementStatus,
              }
            : {}),
          ...(this.enumArg(
            args,
            'priority',
            Object.values(MediaEngagementPriority),
          )
            ? {
                priority: this.enumArg(
                  args,
                  'priority',
                  Object.values(MediaEngagementPriority),
                ) as MediaEngagementPriority,
              }
            : {}),
          ...(this.enumArg(args, 'intent', Object.values(MediaEngagementIntent))
            ? {
                intent: this.enumArg(
                  args,
                  'intent',
                  Object.values(MediaEngagementIntent),
                ) as MediaEngagementIntent,
              }
            : {}),
          ...(this.booleanArg(args, 'needsResponse') !== undefined
            ? { needsResponse: this.booleanArg(args, 'needsResponse') }
            : {}),
          ...(this.stringArg(args, 'search')
            ? { search: this.stringArg(args, 'search') }
            : {}),
          limit: this.integerArg(args, 'limit', 50, 100),
        }),
    );
  }

  private getMediaProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeAcceptMediaCandidateTool(context),
      this.proposeRejectMediaCandidateTool(context),
      this.proposeGenerateMediaProductionTool(context),
      this.proposeScheduleMediaPublicationTool(context),
      this.proposePublishMediaPublicationTool(context),
      this.proposeMediaEngagementReplyTool(context),
    ];
  }

  private proposeAcceptMediaCandidateTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_accept_media_candidate',
        description:
          'Propose accepting one exact HSAKAA Media candidate after Aakash explicitly chooses it. Use get_media_generation_run first to obtain the exact runId and candidateKey. Confirmation creates the canonical MediaContentItem and selected platform MediaPublication drafts using the same schemas as manual content. It does not schedule or publish.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            candidateKey: { type: 'string' },
            platforms: {
              type: 'array',
              items: { type: 'string', enum: Object.values(MediaPlatform) },
            },
          },
          required: ['runId', 'candidateKey'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeMediaCandidateAccept(context, args),
    );
  }

  private proposeGenerateMediaProductionTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_generate_media_production_pack',
        description:
          'Propose preparing or regenerating the production pack for one exact accepted Media publication after Aakash explicitly asks to make it production-ready. Confirmation writes final scripts, shot/design direction, asset requirements and readiness into the same canonical MediaPublication schema. It never schedules or publishes.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            publicationId: { type: 'string' },
            instructions: { type: 'string' },
            force: { type: 'boolean' },
          },
          required: ['publicationId'],
          additionalProperties: false,
        },
      },
      context,
      (args) =>
        this.actionService.proposeMediaProductionGenerate(context, args),
    );
  }

  private proposeScheduleMediaPublicationTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_schedule_media_publication',
        description:
          'Propose scheduling one exact production-ready Media publication into a calendar slot or exact ISO time. Use only after Aakash explicitly chooses the timing. Confirmation is mandatory. autoPublish=true is allowed only for an API-capable account and never for WhatsApp Status.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            publicationId: { type: 'string' },
            slotId: { type: 'string' },
            scheduledAt: { type: 'string' },
            autoPublish: { type: 'boolean' },
          },
          required: ['publicationId'],
          additionalProperties: false,
        },
      },
      context,
      (args) =>
        this.actionService.proposeMediaPublicationSchedule(context, args),
    );
  }

  private proposePublishMediaPublicationTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_publish_media_publication_now',
        description:
          'Propose publishing one exact production-ready Media publication now after Aakash explicitly asks to publish it. Confirmation is mandatory before any external API call. Unsupported or uncredentialed executions move to the manual-publish queue rather than pretending to publish.',
        strict: false,
        parameters: {
          type: 'object',
          properties: { publicationId: { type: 'string' } },
          required: ['publicationId'],
          additionalProperties: false,
        },
      },
      context,
      (args) =>
        this.actionService.proposeMediaPublicationPublish(context, args),
    );
  }

  private proposeMediaEngagementReplyTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_media_engagement_reply',
        description:
          'Propose sending a reply to one exact Media engagement item after Aakash explicitly chooses or approves the response. Use search_media_engagement first to identify the exact engagementId. Confirmation is mandatory before any public comment, DM, mention reply or WhatsApp message is sent.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            engagementId: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['engagementId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeMediaEngagementReply(context, args),
    );
  }

  private proposeRejectMediaCandidateTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_reject_media_candidate',
        description:
          'Propose rejecting one exact HSAKAA Media candidate after Aakash explicitly says it is not suitable. Confirmation saves the rejection into anti-repetition memory so HSAKAA is less likely to resurface the same concept later.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            runId: { type: 'string' },
            candidateKey: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['runId', 'candidateKey'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeMediaCandidateReject(context, args),
    );
  }

  private searchMediaTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_media',
        description:
          'Search Aakash’s private media/content records for posts, scripts, ideas, content pillars and publishing history.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.mediaCoreService.search(
          this.stringArg(args, 'query'),
          this.limitArg(args, 6, 12),
        ),
    );
  }

  private searchBrainDumpTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'search_brain_dump',
        description:
          'Search Brain Dump items across inbox, discarded and processed states. Use this to identify the exact brainDumpId before proposing processing, discard, reopen or archive actions.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(BrainDumpStatus),
            },
            isArchived: { type: 'boolean' },
            limit: { type: 'integer', minimum: 1, maximum: 20 },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.brainDumpService.findAll({
          ...(this.stringArg(args, 'query')
            ? { search: this.stringArg(args, 'query') }
            : {}),
          ...(this.enumArg(args, 'status', Object.values(BrainDumpStatus))
            ? {
                status: this.enumArg(
                  args,
                  'status',
                  Object.values(BrainDumpStatus),
                ) as BrainDumpStatus,
              }
            : {}),
          ...(this.booleanArg(args, 'isArchived') !== undefined
            ? { isArchived: this.booleanArg(args, 'isArchived') }
            : {}),
          page: 1,
          limit: this.limitArg(args, 10, 20),
        }),
    );
  }

  private getBrainDumpInboxTool(): AiAgentTool {
    return this.tool(
      {
        type: 'function',
        name: 'get_brain_dump_inbox',
        description:
          'Get unprocessed Brain Dump inbox items when Aakash asks what is on his mind, what still needs processing, or wants ideas organized.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 15,
            },
          },
          additionalProperties: false,
        },
      },
      async (args) =>
        this.brainDumpService.findAll({
          status: BrainDumpStatus.INBOX,
          page: 1,
          limit: this.limitArg(args, 8, 15),
        }),
    );
  }

  private getBrainDumpProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeCaptureBrainDumpTool(context),
      this.proposeProcessBrainDumpTool(context),
      this.proposeDiscardBrainDumpTool(context),
      this.proposeReopenBrainDumpTool(context),
      this.proposeArchiveBrainDumpTool(context),
    ];
  }

  private proposeCaptureBrainDumpTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_capture_brain_dump',
        description:
          'Propose capturing a new Brain Dump item after Aakash explicitly asks to save/capture/dump a thought or idea. This does NOT write anything until the confirmation card is approved.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            isFavourite: { type: 'boolean' },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeBrainDumpCreate(context, args),
    );
  }

  private proposeProcessBrainDumpTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_process_brain_dump',
        description:
          'Propose processing one existing Brain Dump inbox item into a Task, Journal entry or Memory. Use search_brain_dump first to identify the exact brainDumpId. Confirmation is required and no target entity is created before confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            brainDumpId: { type: 'string' },
            target: {
              type: 'string',
              enum: Object.values(BrainDumpTarget),
            },
            title: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
            },
            area: { type: 'string' },
            dueAt: {
              type: 'string',
              description: 'ISO-8601 deadline when processing into a Task.',
            },
            journalType: {
              type: 'string',
              enum: Object.values(JournalEntryType),
            },
            memoryType: {
              type: 'string',
              enum: Object.values(MemoryType),
            },
            memoryAccessLevel: {
              type: 'string',
              enum: Object.values(MemoryAccessLevel),
            },
            memorySensitivity: {
              type: 'string',
              enum: Object.values(MemorySensitivity),
            },
          },
          required: ['brainDumpId', 'target'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeBrainDumpProcess(context, args),
    );
  }

  private proposeDiscardBrainDumpTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleBrainDumpProposalTool(
      context,
      'propose_discard_brain_dump',
      'Propose discarding an unprocessed Brain Dump item after Aakash explicitly asks. Use search_brain_dump first. Discard is reversible through reopen and requires confirmation.',
      (args) => this.actionService.proposeBrainDumpDiscard(context, args),
    );
  }

  private proposeReopenBrainDumpTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleBrainDumpProposalTool(
      context,
      'propose_reopen_brain_dump',
      'Propose reopening a discarded Brain Dump item. Use search_brain_dump first to identify the exact item. Confirmation is required.',
      (args) => this.actionService.proposeBrainDumpReopen(context, args),
    );
  }

  private proposeArchiveBrainDumpTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleBrainDumpProposalTool(
      context,
      'propose_archive_brain_dump',
      'Propose archiving a Brain Dump item after Aakash explicitly asks. Use search_brain_dump first. This is a medium-risk action and requires confirmation.',
      (args) => this.actionService.proposeBrainDumpArchive(context, args),
    );
  }

  private simpleBrainDumpProposalTool(
    context: HsakaaToolActionContext,
    name: string,
    description: string,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name,
        description,
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            brainDumpId: { type: 'string' },
          },
          required: ['brainDumpId'],
          additionalProperties: false,
        },
      },
      context,
      propose,
    );
  }

  private getJournalProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeCreateJournalTool(context),
      this.proposeUpdateJournalTool(context),
      this.proposeAppendJournalTool(context),
      this.proposeArchiveJournalTool(context),
      this.proposeRestoreJournalTool(context),
    ];
  }

  private proposeCreateJournalTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_create_journal',
        description:
          'Propose creating a new PRIVATE, unpublished journal entry only after Aakash explicitly asks to journal/save a reflection, decision, idea, lesson or note. This never publishes and does not write until the confirmation card is approved.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: { type: 'string' },
            date: {
              type: 'string',
              description: 'ISO-8601 date/time. Omit for now.',
            },
            type: { type: 'string', enum: Object.values(JournalEntryType) },
            highlight: { type: 'string' },
            mood: { type: 'string', enum: Object.values(JournalMood) },
            moodScore: { type: 'number', minimum: 1, maximum: 10 },
            energyScore: { type: 'number', minimum: 0, maximum: 10 },
            productivityScore: { type: 'number', minimum: 0, maximum: 10 },
            stressScore: { type: 'number', minimum: 0, maximum: 10 },
            tags: { type: 'array', items: { type: 'string' } },
            lessons: { type: 'array', items: { type: 'string' } },
            decisions: { type: 'array', items: { type: 'string' } },
            ideas: { type: 'array', items: { type: 'string' } },
            gratitude: { type: 'array', items: { type: 'string' } },
            challenges: { type: 'array', items: { type: 'string' } },
            wins: { type: 'array', items: { type: 'string' } },
            isFavourite: { type: 'boolean' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeJournalCreate(context, args),
    );
  }

  private proposeUpdateJournalTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_update_journal',
        description:
          'Propose editing an existing private journal entry after Aakash explicitly asks. Use search_journal first to identify the exact journalEntryId. This cannot publish the entry and requires confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            journalEntryId: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            highlight: { type: 'string' },
            type: { type: 'string', enum: Object.values(JournalEntryType) },
            mood: { type: 'string', enum: Object.values(JournalMood) },
            moodScore: { type: 'number', minimum: 1, maximum: 10 },
            energyScore: { type: 'number', minimum: 0, maximum: 10 },
            productivityScore: { type: 'number', minimum: 0, maximum: 10 },
            stressScore: { type: 'number', minimum: 0, maximum: 10 },
            tags: { type: 'array', items: { type: 'string' } },
            lessons: { type: 'array', items: { type: 'string' } },
            decisions: { type: 'array', items: { type: 'string' } },
            ideas: { type: 'array', items: { type: 'string' } },
            gratitude: { type: 'array', items: { type: 'string' } },
            challenges: { type: 'array', items: { type: 'string' } },
            wins: { type: 'array', items: { type: 'string' } },
            isFavourite: { type: 'boolean' },
          },
          required: ['journalEntryId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeJournalUpdate(context, args),
    );
  }

  private proposeAppendJournalTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_append_journal',
        description:
          'Propose appending new text to an existing journal entry after Aakash explicitly asks to add/append a reflection or note. Use search_journal first. Existing content is preserved. Confirmation is required.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            journalEntryId: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['journalEntryId', 'content'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeJournalAppend(context, args),
    );
  }

  private proposeArchiveJournalTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleJournalProposalTool(
      context,
      'propose_archive_journal',
      'Propose archiving a journal entry after Aakash explicitly asks. Use search_journal first. Archiving is medium risk and requires confirmation.',
      (args) => this.actionService.proposeJournalArchive(context, args),
    );
  }

  private proposeRestoreJournalTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleJournalProposalTool(
      context,
      'propose_restore_journal',
      'Propose restoring an archived journal entry after Aakash explicitly asks. Confirmation is required.',
      (args) => this.actionService.proposeJournalRestore(context, args),
    );
  }

  private simpleJournalProposalTool(
    context: HsakaaToolActionContext,
    name: string,
    description: string,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name,
        description,
        strict: false,
        parameters: {
          type: 'object',
          properties: { journalEntryId: { type: 'string' } },
          required: ['journalEntryId'],
          additionalProperties: false,
        },
      },
      context,
      propose,
    );
  }

  private getMemoryProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeCreateMemoryTool(context),
      this.proposeUpdateMemoryTool(context),
      this.proposeArchiveMemoryTool(context),
      this.proposeRestoreMemoryTool(context),
    ];
  }

  private proposeCreateMemoryTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_create_memory',
        description:
          'Propose saving a new persistent memory only when Aakash explicitly asks HSAKAA to remember/save/store something. Do not autonomously save inferred facts. New memories default to owner-only and require confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            type: { type: 'string', enum: Object.values(MemoryType) },
            tags: { type: 'array', items: { type: 'string' } },
            categories: { type: 'array', items: { type: 'string' } },
            entities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: Object.values(MemoryEntityType),
                  },
                  name: { type: 'string' },
                  externalId: { type: 'string' },
                },
                required: ['type', 'name'],
                additionalProperties: false,
              },
            },
            importance: { type: 'number', minimum: 0, maximum: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            durability: {
              type: 'string',
              enum: Object.values(MemoryDurability),
            },
            happenedAt: { type: 'string' },
            accessLevel: {
              type: 'string',
              enum: Object.values(MemoryAccessLevel),
              description:
                'Omit unless Aakash explicitly requests something other than owner-only.',
            },
            sensitivity: {
              type: 'string',
              enum: Object.values(MemorySensitivity),
            },
            expiresAt: {
              type: 'string',
              description: 'Optional ISO-8601 expiry.',
            },
          },
          required: ['content'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeMemoryCreate(context, args),
    );
  }

  private proposeUpdateMemoryTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_update_memory',
        description:
          'Propose editing an existing memory only after Aakash explicitly asks. Use search_memory first to identify the exact memoryId. Persistent-memory changes are medium risk and require confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            memoryId: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string', enum: Object.values(MemoryType) },
            tags: { type: 'array', items: { type: 'string' } },
            importance: { type: 'number', minimum: 0, maximum: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            accessLevel: {
              type: 'string',
              enum: Object.values(MemoryAccessLevel),
            },
            sensitivity: {
              type: 'string',
              enum: Object.values(MemorySensitivity),
            },
            expiresAt: { type: 'string' },
          },
          required: ['memoryId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeMemoryUpdate(context, args),
    );
  }

  private proposeArchiveMemoryTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleMemoryProposalTool(
      context,
      'propose_archive_memory',
      'Propose archiving a persistent memory after Aakash explicitly asks. Use search_memory first. This is medium risk and requires confirmation.',
      (args) => this.actionService.proposeMemoryArchive(context, args),
    );
  }

  private proposeRestoreMemoryTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleMemoryProposalTool(
      context,
      'propose_restore_memory',
      'Propose restoring an archived memory after Aakash explicitly asks. Confirmation is required.',
      (args) => this.actionService.proposeMemoryRestore(context, args),
    );
  }

  private simpleMemoryProposalTool(
    context: HsakaaToolActionContext,
    name: string,
    description: string,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name,
        description,
        strict: false,
        parameters: {
          type: 'object',
          properties: { memoryId: { type: 'string' } },
          required: ['memoryId'],
          additionalProperties: false,
        },
      },
      context,
      propose,
    );
  }

  private getReminderProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeCreateReminderTool(context),
      this.proposeSyncRemindersTool(context),
      this.proposeSnoozeReminderTool(context),
      this.proposeAcknowledgeReminderTool(context),
      this.proposeDismissReminderTool(context),
      this.proposeReopenReminderTool(context),
    ];
  }

  private proposeCreateReminderTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_create_reminder',
        description:
          'Propose creating a Personal OS reminder after Aakash explicitly asks to be reminded. Personal OS reminders are task-backed: confirmation creates a Task with reminderAt, then syncs reminders. This does NOT create anything before confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            reminderAt: {
              type: 'string',
              description: 'Future ISO-8601 timestamp for the reminder.',
            },
            description: { type: 'string' },
            dueAt: { type: 'string' },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
            },
            area: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'reminderAt'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeReminderCreate(context, args),
    );
  }

  private proposeSyncRemindersTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_sync_reminders',
        description:
          'Propose syncing/generating Personal OS reminders from Tasks and supported care routines. Confirmation is required because this writes reminder records.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 14 },
          },
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeReminderSync(context, args),
    );
  }

  private proposeSnoozeReminderTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_snooze_reminder',
        description:
          'Propose snoozing a specific pending/snoozed reminder after Aakash explicitly asks. Use search_reminders first to identify reminderId. Confirmation is required.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            reminderId: { type: 'string' },
            minutes: { type: 'integer', minimum: 1, maximum: 10080 },
            until: { type: 'string' },
          },
          required: ['reminderId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeReminderSnooze(context, args),
    );
  }

  private proposeAcknowledgeReminderTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleReminderProposalTool(
      context,
      'propose_acknowledge_reminder',
      'Propose acknowledging a specific reminder after Aakash explicitly says it is done/handled. Use search_reminders first. Confirmation is required.',
      (args) => this.actionService.proposeReminderAcknowledge(context, args),
    );
  }

  private proposeDismissReminderTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleReminderProposalTool(
      context,
      'propose_dismiss_reminder',
      'Propose dismissing a specific reminder after Aakash explicitly asks to dismiss/ignore it. Use search_reminders first. Confirmation is required.',
      (args) => this.actionService.proposeReminderDismiss(context, args),
    );
  }

  private proposeReopenReminderTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleReminderProposalTool(
      context,
      'propose_reopen_reminder',
      'Propose reopening an acknowledged/dismissed reminder after Aakash explicitly asks. Use search_reminders first. Confirmation is required.',
      (args) => this.actionService.proposeReminderReopen(context, args),
    );
  }

  private simpleReminderProposalTool(
    context: HsakaaToolActionContext,
    name: string,
    description: string,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name,
        description,
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            reminderId: { type: 'string' },
          },
          required: ['reminderId'],
          additionalProperties: false,
        },
      },
      context,
      propose,
    );
  }

  private getTaskProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeCreateTaskTool(context),
      this.proposeUpdateTaskTool(context),
      this.proposeTaskStatusTool(context),
      this.proposeCompleteTaskTool(context),
      this.proposeReopenTaskTool(context),
      this.proposeArchiveTaskTool(context),
    ];
  }

  private proposeCreateTaskTool(context: HsakaaToolActionContext): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_create_task',
        description:
          'Propose creating a task because Aakash explicitly asked to add/create/remember a task. This does NOT create the task; it creates a confirmation card for Aakash. Do not call for hypothetical suggestions.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            status: {
              type: 'string',
              enum: [
                TaskStatus.INBOX,
                TaskStatus.TODO,
                TaskStatus.IN_PROGRESS,
                TaskStatus.WAITING,
                TaskStatus.BLOCKED,
              ],
            },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
            },
            area: { type: 'string' },
            startAt: {
              type: 'string',
              description:
                'ISO-8601 date/time if Aakash specified a start time.',
            },
            dueAt: {
              type: 'string',
              description: 'ISO-8601 date/time if Aakash specified a deadline.',
            },
            reminderAt: {
              type: 'string',
              description: 'ISO-8601 date/time if Aakash specified a reminder.',
            },
            estimatedMinutes: { type: 'integer', minimum: 0 },
            tags: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeTaskCreate(context, args),
    );
  }

  private proposeUpdateTaskTool(context: HsakaaToolActionContext): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_update_task',
        description:
          'Propose editing an existing task after Aakash explicitly asks for a change. Use search_tasks first to identify the exact taskId. This does NOT edit the task until Aakash confirms the card.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            priority: {
              type: 'string',
              enum: Object.values(TaskPriority),
            },
            area: { type: 'string' },
            startAt: { type: 'string' },
            dueAt: { type: 'string' },
            reminderAt: { type: 'string' },
            estimatedMinutes: { type: 'integer', minimum: 0 },
            tags: { type: 'array', items: { type: 'string' } },
            notes: { type: 'string' },
          },
          required: ['taskId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeTaskUpdate(context, args),
    );
  }

  private proposeTaskStatusTool(context: HsakaaToolActionContext): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_change_task_status',
        description:
          'Propose changing an existing task status after Aakash explicitly asks. Use search_tasks first to identify the exact taskId. Confirmation is required before execution.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            status: {
              type: 'string',
              enum: Object.values(TaskStatus),
            },
          },
          required: ['taskId', 'status'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeTaskStatus(context, args),
    );
  }

  private proposeCompleteTaskTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleTaskProposalTool(
      context,
      'propose_complete_task',
      'Propose completing a specific task after Aakash explicitly asks to mark it done. Use search_tasks first. Confirmation is required.',
      (args) => this.actionService.proposeTaskComplete(context, args),
    );
  }

  private proposeReopenTaskTool(context: HsakaaToolActionContext): AiAgentTool {
    return this.simpleTaskProposalTool(
      context,
      'propose_reopen_task',
      'Propose reopening a completed/cancelled task after Aakash explicitly asks. Use search_tasks first. Confirmation is required.',
      (args) => this.actionService.proposeTaskReopen(context, args),
    );
  }

  private proposeArchiveTaskTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.simpleTaskProposalTool(
      context,
      'propose_archive_task',
      'Propose archiving a task after Aakash explicitly asks to archive/remove it. Use search_tasks first. This is a medium-risk action and requires confirmation.',
      (args) => this.actionService.proposeTaskArchive(context, args),
    );
  }

  private simpleTaskProposalTool(
    context: HsakaaToolActionContext,
    name: string,
    description: string,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name,
        description,
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
          },
          required: ['taskId'],
          additionalProperties: false,
        },
      },
      context,
      propose,
    );
  }

  private getDecisionProposalTools(
    context: HsakaaToolActionContext,
  ): AiAgentTool[] {
    return [
      this.proposeDecisionExperimentCreateTool(context),
      this.proposeDecisionEvidenceAddTool(context),
      this.proposeDecisionExperimentCompleteTool(context),
      this.proposeDecisionReassessTool(context),
    ];
  }

  private proposeDecisionExperimentCreateTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_create_decision_experiment',
        description:
          'Propose creating a tracked experiment for an existing Decision Lab case after Aakash explicitly asks. Use get_recent_decision_analyses/get_decision_assumptions first to obtain exact IDs. Requires confirmation; does not execute immediately.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            decisionId: { type: 'string' },
            title: { type: 'string' },
            hypothesis: { type: 'string' },
            description: { type: 'string' },
            successCriteria: { type: 'string' },
            failureCriteria: { type: 'string' },
            assumptionIds: { type: 'array', items: { type: 'string' } },
            supportsOptionIds: { type: 'array', items: { type: 'string' } },
            startAt: { type: 'string' },
            targetReviewAt: { type: 'string' },
          },
          required: [
            'decisionId',
            'title',
            'hypothesis',
            'successCriteria',
            'failureCriteria',
          ],
          additionalProperties: false,
        },
      },
      context,
      (args) =>
        this.actionService.proposeDecisionExperimentCreate(context, args),
    );
  }

  private proposeDecisionEvidenceAddTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_add_decision_evidence',
        description:
          'Propose appending factual evidence to a Decision Lab case. Evidence is append-only and separate from AI interpretation. Requires confirmation before writing.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            decisionId: { type: 'string' },
            kind: {
              type: 'string',
              enum: Object.values(HsakaaDecisionEvidenceKind),
            },
            stance: {
              type: 'string',
              enum: Object.values(HsakaaDecisionEvidenceStance),
            },
            detail: { type: 'string' },
            sourceReference: { type: 'string' },
            metricLabel: { type: 'string' },
            metricValue: { type: 'string' },
            occurredAt: { type: 'string' },
            experimentId: { type: 'string' },
            assumptionIds: { type: 'array', items: { type: 'string' } },
          },
          required: ['decisionId', 'kind', 'stance', 'detail'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeDecisionEvidenceAdd(context, args),
    );
  }

  private proposeDecisionExperimentCompleteTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_complete_decision_experiment',
        description:
          'Propose completing a tracked Decision Lab experiment with a result and conclusion. Completed experiments remain historical records. Requires confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            decisionId: { type: 'string' },
            experimentId: { type: 'string' },
            result: {
              type: 'string',
              enum: Object.values(HsakaaDecisionExperimentResult),
            },
            conclusion: { type: 'string' },
            completedAt: { type: 'string' },
          },
          required: ['decisionId', 'experimentId', 'result', 'conclusion'],
          additionalProperties: false,
        },
      },
      context,
      (args) =>
        this.actionService.proposeDecisionExperimentComplete(context, args),
    );
  }

  private proposeDecisionReassessTool(
    context: HsakaaToolActionContext,
  ): AiAgentTool {
    return this.proposalTool(
      {
        type: 'function',
        name: 'propose_reassess_decision',
        description:
          'Propose a new versioned Decision Lab reassessment using tracked evidence. The original analysis and frozen commitment baseline remain untouched. This AI-generating write requires confirmation.',
        strict: false,
        parameters: {
          type: 'object',
          properties: {
            decisionId: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['decisionId'],
          additionalProperties: false,
        },
      },
      context,
      (args) => this.actionService.proposeDecisionReassess(context, args),
    );
  }

  private proposalTool(
    definition: FunctionTool,
    context: HsakaaToolActionContext,
    propose: (args: ToolArguments) => Promise<HsakaaClientAction>,
  ): AiAgentTool {
    return this.tool(definition, async (args) => {
      const action = await propose(args);
      context.collect(action);

      return {
        id: action.id,
        type: action.type,
        status: action.status,
        risk: action.risk,
        summary: action.summary,
        preview: action.preview,
        expiresAt: action.expiresAt,
        confirmationRequired: true,
        instruction:
          'The proposal is pending. Do not claim it was executed. Tell Aakash to use the confirmation card.',
      };
    });
  }

  private tool(
    definition: FunctionTool,
    execute: (args: ToolArguments) => Promise<unknown>,
  ): AiAgentTool {
    return { definition, execute };
  }

  private stringArg(args: ToolArguments, key: string) {
    const value = args[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private booleanArg(args: ToolArguments, key: string) {
    return typeof args[key] === 'boolean' ? args[key] : undefined;
  }

  private stringArrayArg(args: ToolArguments, key: string, maximum: number) {
    const value = args[key];
    if (!Array.isArray(value)) return undefined;

    const cleaned = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maximum);

    return cleaned.length ? cleaned : undefined;
  }

  private memoryEntitiesArg(args: ToolArguments) {
    if (!Array.isArray(args.entities)) return undefined;

    return args.entities
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => {
        const type =
          typeof item.type === 'string' &&
          Object.values(MemoryEntityType).includes(
            item.type as MemoryEntityType,
          )
            ? (item.type as MemoryEntityType)
            : undefined;
        const name =
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : undefined;

        if (!type || !name) return null;

        return {
          type,
          name,
          ...(typeof item.externalId === 'string' && item.externalId.trim()
            ? { externalId: item.externalId.trim() }
            : {}),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 12);
  }

  private memoryPeopleArg(args: ToolArguments) {
    if (!Array.isArray(args.people)) return undefined;

    const values = args.people
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
      .map((item) => {
        const name =
          typeof item.name === 'string' && item.name.trim()
            ? item.name.trim()
            : undefined;
        const relation =
          typeof item.relation === 'string' &&
          Object.values(MemoryPersonRelation).includes(
            item.relation as MemoryPersonRelation,
          )
            ? (item.relation as MemoryPersonRelation)
            : undefined;

        return name && relation ? { name, relation } : null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 12);

    return values.length ? values : undefined;
  }

  private limitArg(args: ToolArguments, fallback: number, maximum: number) {
    const value = args.limit;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(value), 1), maximum);
  }

  private integerArg(
    args: ToolArguments,
    key: string,
    fallback: number,
    maximum: number,
  ) {
    const value = args[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(value), 1), maximum);
  }

  private enumArg(
    args: ToolArguments,
    key: string,
    allowed: readonly string[],
  ) {
    const value = args[key];
    return typeof value === 'string' && allowed.includes(value)
      ? value
      : undefined;
  }
}
