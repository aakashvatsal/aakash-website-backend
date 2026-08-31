import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import {
  RunMediaAutopilotDto,
  UpdateMediaAutopilotRecommendationDto,
  UpdateMediaAutopilotSettingsDto,
} from './dto/media-autopilot.dto';
import { MediaCalendarService } from './media-calendar.service';
import { MediaContentDirectorService } from './media-content-director.service';
import { MediaEngagementService } from './media-engagement.service';
import { MediaGrowthService } from './media-growth.service';
import {
  MediaAutopilotPriority,
  MediaAutopilotRecommendation,
  MediaAutopilotRecommendationKind,
  MediaAutopilotRecommendationStatus,
  MediaAutopilotRun,
  MediaAutopilotRunDocument,
  MediaAutopilotRunStatus,
  MediaAutopilotRunType,
  MediaAutopilotSettings,
  MediaAutopilotSettingsDocument,
  MediaAutopilotStrategyReview,
} from './schemas/media-autopilot.schema';
import { MediaGenerationPurpose } from './schemas/media-generation-run.schema';
import { MediaGrowthExperimentStatus } from './schemas/media-growth-experiment.schema';
import { MediaGrowthLearningDirection } from './schemas/media-growth-learning.schema';
import { MediaEngagementPriority } from './schemas/media-engagement-item.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MediaPlatform } from './schemas/media-post.schema';

const MIN_HORIZON_DAYS = 7;
const MAX_OPEN_RECOMMENDATIONS = 80;
const RECENT_GAP_DRAFT_HOURS = 48;

interface StrategyReviewResponse {
  summary: string;
  focusThisWeek: string[];
  avoidThisWeek: string[];
  experimentsToConsider: string[];
  platformPriorities: Array<{
    platform: MediaPlatform;
    priority: string;
    reason: string;
  }>;
}

interface RecommendationDraft extends Omit<
  MediaAutopilotRecommendation,
  'status' | 'metadata'
> {
  metadata?: Record<string, unknown>;
}

@Injectable()
export class MediaAutopilotService {
  constructor(
    @InjectModel(MediaAutopilotRun.name)
    private readonly runModel: Model<MediaAutopilotRunDocument>,
    @InjectModel(MediaAutopilotSettings.name)
    private readonly settingsModel: Model<MediaAutopilotSettingsDocument>,
    private readonly aiService: AiService,
    private readonly calendarService: MediaCalendarService,
    private readonly growthService: MediaGrowthService,
    private readonly engagementService: MediaEngagementService,
    private readonly directorService: MediaContentDirectorService,
  ) {}

  async overview() {
    const [settings, latestDaily, latestWeekly, runs] = await Promise.all([
      this.getSettings(),
      this.runModel
        .findOne({ isActive: true, type: MediaAutopilotRunType.DAILY })
        .sort({ createdAt: -1 })
        .lean(),
      this.runModel
        .findOne({ isActive: true, type: MediaAutopilotRunType.WEEKLY })
        .sort({ createdAt: -1 })
        .lean(),
      this.runModel
        .find({ isActive: true, createdAt: { $gte: this.daysAgo(30) } })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ]);

    const recommendations = runs
      .flatMap((run) =>
        (run.recommendations ?? []).map((recommendation) => ({
          ...recommendation,
          runId: run._id.toString(),
          runType: run.type,
          runCreatedAt: this.readDate(run, 'createdAt'),
        })),
      )
      .filter((item) => item.status === MediaAutopilotRecommendationStatus.OPEN)
      .slice(0, MAX_OPEN_RECOMMENDATIONS);

    return {
      generatedAt: new Date().toISOString(),
      settings,
      latestDaily,
      latestWeekly,
      openRecommendations: recommendations,
      summary: {
        open: recommendations.length,
        urgent: recommendations.filter(
          (item) => item.priority === MediaAutopilotPriority.URGENT,
        ).length,
        high: recommendations.filter(
          (item) => item.priority === MediaAutopilotPriority.HIGH,
        ).length,
        contentDraftsReady: recommendations.filter(
          (item) =>
            item.kind === MediaAutopilotRecommendationKind.CONTENT_CANDIDATE,
        ).length,
      },
      policy: {
        minimumPlanningHorizonDays: MIN_HORIZON_DAYS,
        autopilotMayGenerateDraftCandidates: true,
        autopilotMayAcceptCanonicalContent: false,
        autopilotMaySchedule: false,
        autopilotMayPublish: false,
        autopilotMaySendEngagementReplies: false,
        existingConfirmationActionsRemainAuthoritative: true,
        antiRepetitionRemainsMandatory: true,
        growthLearningsAreEvidenceNotHardRules: true,
      },
    };
  }

  listRuns(limit = 30) {
    const safe = Math.min(Math.max(Math.trunc(limit || 30), 1), 100);
    return this.runModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(safe)
      .lean();
  }

  async getSettings() {
    const defaults = {
      enabled: true,
      dailyEnabled: true,
      weeklyEnabled: true,
      autoDraftCalendarGaps: true,
      planningHorizonDays: MIN_HORIZON_DAYS,
      maxDailyDraftRuns: 3,
      candidateCount: 4,
      timezone: 'Asia/Kolkata',
      isActive: true,
    };

    try {
      const settings = await this.settingsModel.findOneAndUpdate(
        { key: 'primary' },
        { $setOnInsert: defaults },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      if (settings) return settings;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        const existing = await this.settingsModel.findOne({ key: 'primary' });
        if (existing) return existing;
      }
      throw error;
    }

    const existing = await this.settingsModel.findOne({ key: 'primary' });
    if (existing) return existing;
    throw new Error('Media autopilot settings could not be initialized.');
  }

  async updateSettings(dto: UpdateMediaAutopilotSettingsDto) {
    const settings = await this.getSettings();
    if (dto.enabled !== undefined) settings.enabled = dto.enabled;
    if (dto.dailyEnabled !== undefined)
      settings.dailyEnabled = dto.dailyEnabled;
    if (dto.weeklyEnabled !== undefined)
      settings.weeklyEnabled = dto.weeklyEnabled;
    if (dto.autoDraftCalendarGaps !== undefined)
      settings.autoDraftCalendarGaps = dto.autoDraftCalendarGaps;
    if (dto.planningHorizonDays !== undefined)
      settings.planningHorizonDays = Math.max(
        MIN_HORIZON_DAYS,
        dto.planningHorizonDays,
      );
    if (dto.maxDailyDraftRuns !== undefined)
      settings.maxDailyDraftRuns = dto.maxDailyDraftRuns;
    if (dto.candidateCount !== undefined)
      settings.candidateCount = dto.candidateCount;
    await settings.save();
    return settings;
  }

  async run(dto: RunMediaAutopilotDto = {}) {
    const settings = await this.getSettings();
    const type = dto.type ?? MediaAutopilotRunType.MANUAL;
    const now = new Date();
    const horizonDays = Math.max(
      MIN_HORIZON_DAYS,
      settings.planningHorizonDays ?? MIN_HORIZON_DAYS,
    );
    const run = await this.runModel.create({
      type,
      status: MediaAutopilotRunStatus.RUNNING,
      startedAt: now,
      windowStart: now,
      windowEnd: this.addDays(now, horizonDays),
      signals: {},
      recommendations: [],
      generatedDraftRunIds: [],
      runErrors: [],
      isActive: true,
    });

    try {
      await this.calendarService.ensureHorizon();
      const [calendar, growth, engagement, learnings, experiments] =
        await Promise.all([
          this.calendarService.overview(),
          this.growthService.overview(30),
          this.engagementService.overview(14),
          this.growthService.listLearnings(60),
          this.growthService.listExperiments(30),
        ]);

      const recommendations = this.buildRecommendations({
        calendar,
        growth,
        engagement,
        learnings,
        experiments,
      });

      run.signals = this.buildSignals({
        calendar,
        growth,
        engagement,
        learnings,
        experiments,
      });
      run.recommendations = recommendations.map((item) => ({
        ...item,
        status: MediaAutopilotRecommendationStatus.OPEN,
        metadata: item.metadata ?? {},
      }));

      const shouldDraft =
        dto.generateDrafts ??
        (type !== MediaAutopilotRunType.WEEKLY &&
          settings.autoDraftCalendarGaps);
      if (settings.enabled && shouldDraft && settings.autoDraftCalendarGaps) {
        await this.generateGapDrafts(run, calendar.coverage, settings);
      }

      if (type === MediaAutopilotRunType.WEEKLY) {
        run.strategyReview = await this.buildWeeklyStrategyReview({
          calendar,
          growth,
          engagement,
          learnings,
          experiments,
        });
      }

      run.status = run.runErrors.length
        ? MediaAutopilotRunStatus.PARTIAL
        : MediaAutopilotRunStatus.COMPLETED;
      run.completedAt = new Date();
      await run.save();
      return run;
    } catch (error) {
      run.status = MediaAutopilotRunStatus.FAILED;
      run.completedAt = new Date();
      run.runErrors = [this.errorMessage(error)];
      await run.save();
      throw error;
    }
  }

  async updateRecommendation(
    runId: string,
    recommendationKey: string,
    dto: UpdateMediaAutopilotRecommendationDto,
  ) {
    const run = await this.requireRun(runId);
    const recommendation = (run.recommendations ?? []).find(
      (item) => item.key === recommendationKey,
    );
    if (!recommendation) {
      throw new NotFoundException('Media autopilot recommendation not found.');
    }
    recommendation.status = dto.status;
    run.markModified('recommendations');
    await run.save();
    return run;
  }

  private buildRecommendations(input: {
    calendar: Awaited<ReturnType<MediaCalendarService['overview']>>;
    growth: Awaited<ReturnType<MediaGrowthService['overview']>>;
    engagement: Awaited<ReturnType<MediaEngagementService['overview']>>;
    learnings: Awaited<ReturnType<MediaGrowthService['listLearnings']>>;
    experiments: Awaited<ReturnType<MediaGrowthService['listExperiments']>>;
  }): RecommendationDraft[] {
    const recommendations: RecommendationDraft[] = [];

    for (const coverage of input.calendar.coverage) {
      const gap = Math.max(0, coverage.requiredSlots - coverage.assignedSlots);
      if (gap > 0) {
        recommendations.push({
          key: `calendar-gap-${coverage.accountId}`,
          kind: MediaAutopilotRecommendationKind.CALENDAR_GAP,
          priority:
            gap >= 2
              ? MediaAutopilotPriority.HIGH
              : MediaAutopilotPriority.NORMAL,
          platform: coverage.platform,
          accountId: new Types.ObjectId(coverage.accountId),
          title: `${coverage.displayName} is ${gap} post${gap === 1 ? '' : 's'} short`,
          summary: `The rolling ${coverage.horizonDays}-day calendar is ${coverage.coveragePercent}% covered for ${coverage.displayName}.`,
          evidence: [
            `${coverage.assignedSlots}/${coverage.requiredSlots} required slots assigned`,
            `${coverage.openSlots} open calendar slots`,
          ],
          recommendedAction:
            'Review an HSAKAA calendar-fill draft, accept the best candidate, then move it through Production Studio before scheduling.',
          actionLabel: 'Review content drafts',
        });
      }
      if (coverage.productionGaps > 0) {
        recommendations.push({
          key: `production-gap-${coverage.accountId}`,
          kind: MediaAutopilotRecommendationKind.PRODUCTION_GAP,
          priority: MediaAutopilotPriority.HIGH,
          platform: coverage.platform,
          accountId: new Types.ObjectId(coverage.accountId),
          title: `${coverage.productionGaps} ${coverage.displayName} slot${coverage.productionGaps === 1 ? '' : 's'} blocked by production`,
          summary:
            'Calendar space is reserved, but the linked publication is not production-ready yet.',
          evidence: [
            `${coverage.productionGaps} assigned slots have production gaps`,
          ],
          recommendedAction:
            'Open Production Studio and finish the required scripts/assets before the scheduled date.',
          actionLabel: 'Open Production Studio',
        });
      }
    }

    for (const publication of input.calendar.readyUnscheduled.slice(0, 8)) {
      recommendations.push({
        key: `ready-unscheduled-${publication._id.toString()}`,
        kind: MediaAutopilotRecommendationKind.READY_UNSCHEDULED,
        priority: MediaAutopilotPriority.NORMAL,
        platform: publication.platform,
        publicationId: publication._id,
        title: `${publication.title || publication.platform} is ready but unscheduled`,
        summary:
          'Production is ready and this publication can fill an appropriate open calendar slot.',
        evidence: [
          'Production status is ready/complete',
          'No scheduled time is currently assigned',
        ],
        recommendedAction:
          'Choose an open slot and use the normal HSAKAA schedule confirmation flow.',
        actionLabel: 'Schedule',
      });
    }

    for (const publication of input.calendar.publishingQueue) {
      if (publication.deliveryStatus === MediaDeliveryStatus.FAILED) {
        recommendations.push({
          key: `publish-failed-${publication._id.toString()}`,
          kind: MediaAutopilotRecommendationKind.PUBLISHING_FAILURE,
          priority: publication.due
            ? MediaAutopilotPriority.URGENT
            : MediaAutopilotPriority.HIGH,
          platform: publication.platform,
          publicationId: publication._id,
          title: `Publishing failed: ${publication.title || publication.platform}`,
          summary:
            publication.lastPublishError ||
            'The external publishing handoff failed and requires attention.',
          evidence: [
            `${publication.publishAttempts ?? 0} publish attempt(s)`,
            publication.due
              ? 'Publication is already due'
              : 'Publication is scheduled for later',
          ],
          recommendedAction:
            'Review the delivery error, fix the connection/asset issue, then retry through the approved publishing flow.',
          actionLabel: 'Review failure',
        });
      }
      if (
        publication.deliveryStatus === MediaDeliveryStatus.MANUAL_REQUIRED &&
        publication.due
      ) {
        recommendations.push({
          key: `manual-publish-${publication._id.toString()}`,
          kind: MediaAutopilotRecommendationKind.MANUAL_PUBLISH,
          priority: MediaAutopilotPriority.URGENT,
          platform: publication.platform,
          publicationId: publication._id,
          title: `Manual publish is due: ${publication.title || publication.platform}`,
          summary:
            'This publication cannot be delivered automatically and is waiting for manual completion.',
          evidence: [
            'Delivery mode is manual-required',
            'Scheduled time has arrived',
          ],
          recommendedAction:
            'Publish it on the platform and record the external URL/platform ID in the Media Calendar.',
          actionLabel: 'Complete manual publish',
        });
      }
    }

    for (const item of input.engagement.recent.slice(0, 15)) {
      if (!item.needsResponse) continue;
      const urgent = item.priority === MediaEngagementPriority.URGENT;
      const high = item.priority === MediaEngagementPriority.HIGH;
      if (!urgent && !high) continue;
      recommendations.push({
        key: `engagement-${item._id.toString()}`,
        kind: MediaAutopilotRecommendationKind.ENGAGEMENT,
        priority: urgent
          ? MediaAutopilotPriority.URGENT
          : MediaAutopilotPriority.HIGH,
        platform: item.platform,
        engagementId: item._id,
        title: `${urgent ? 'Urgent' : 'High-priority'} ${item.platform} engagement needs a response`,
        summary: item.aiSummary || item.text.slice(0, 220),
        evidence: [
          `Intent: ${item.intent}`,
          `Sentiment: ${item.sentiment}`,
          item.canReply
            ? 'API reply is available'
            : 'Manual reply may be required',
        ],
        recommendedAction:
          'Review HSAKAA’s suggested response and use the existing confirmation flow before sending anything.',
        actionLabel: 'Open engagement',
      });
    }

    const strongLearnings = input.learnings.filter(
      (item) => item.confidence >= 70 && Math.abs(item.liftPercent) >= 10,
    );
    for (const learning of strongLearnings.slice(0, 10)) {
      const positive =
        learning.direction === MediaGrowthLearningDirection.POSITIVE;
      recommendations.push({
        key: `learning-${learning._id.toString()}`,
        kind: positive
          ? MediaAutopilotRecommendationKind.GROWTH_OPPORTUNITY
          : MediaAutopilotRecommendationKind.GROWTH_RISK,
        priority: MediaAutopilotPriority.NORMAL,
        platform: learning.platform,
        title: positive
          ? `Growth pattern worth using: ${learning.value}`
          : `Growth pattern to reduce/test: ${learning.value}`,
        summary: learning.summary,
        evidence: [
          `${learning.confidence}% confidence`,
          `${learning.sampleSize} measured publications`,
          `${learning.liftPercent >= 0 ? '+' : ''}${learning.liftPercent}% lift vs baseline`,
        ],
        recommendedAction: learning.recommendedAction,
        actionLabel: positive ? 'Use as evidence' : 'Review strategy',
      });
    }

    const providers = input.growth.analyticsProviders as Record<
      string,
      { configured?: boolean; mode?: string }
    >;
    for (const platform of [
      MediaPlatform.LINKEDIN,
      MediaPlatform.INSTAGRAM,
      MediaPlatform.YOUTUBE,
      MediaPlatform.X,
    ]) {
      const provider = providers[platform];
      if (provider && provider.configured === false) {
        recommendations.push({
          key: `analytics-gap-${platform}`,
          kind: MediaAutopilotRecommendationKind.ANALYTICS_GAP,
          priority: MediaAutopilotPriority.LOW,
          platform,
          title: `${platform} growth analytics is not fully configured`,
          summary: `HSAKAA cannot learn the strongest ${platform} growth patterns without the platform analytics connection.`,
          evidence: [`Analytics mode: ${provider.mode || 'not configured'}`],
          recommendedAction:
            'Configure the platform analytics credential so 6F can measure and learn from published content.',
          actionLabel: 'Configure analytics',
        });
      }
    }

    if (
      !input.experiments.some(
        (item) => item.status === MediaGrowthExperimentStatus.RUNNING,
      )
    ) {
      const uncertain = input.learnings.find(
        (item) => item.confidence >= 55 && item.confidence < 75,
      );
      if (uncertain) {
        recommendations.push({
          key: `experiment-${uncertain._id.toString()}`,
          kind: MediaAutopilotRecommendationKind.EXPERIMENT,
          priority: MediaAutopilotPriority.LOW,
          platform: uncertain.platform,
          title: `Turn an uncertain learning into an experiment`,
          summary: uncertain.summary,
          evidence: [
            `${uncertain.confidence}% confidence is useful but not decisive`,
            'No growth experiment is currently running',
          ],
          recommendedAction:
            'Create a controlled 6F experiment instead of letting weak evidence become a permanent content rule.',
          actionLabel: 'Create experiment',
        });
      }
    }

    return this.sortRecommendations(recommendations).slice(0, 60);
  }

  private buildSignals(input: {
    calendar: Awaited<ReturnType<MediaCalendarService['overview']>>;
    growth: Awaited<ReturnType<MediaGrowthService['overview']>>;
    engagement: Awaited<ReturnType<MediaEngagementService['overview']>>;
    learnings: Awaited<ReturnType<MediaGrowthService['listLearnings']>>;
    experiments: Awaited<ReturnType<MediaGrowthService['listExperiments']>>;
  }) {
    return {
      calendar: {
        fullyCovered: input.calendar.fullyCovered,
        horizonEnd: input.calendar.horizonEnd,
        accountsUnderCovered: input.calendar.coverage.filter(
          (item) => !item.covered,
        ).length,
        productionGaps: input.calendar.coverage.reduce(
          (sum, item) => sum + item.productionGaps,
          0,
        ),
        readyUnscheduled: input.calendar.readyUnscheduled.length,
        publishingFailures: input.calendar.publishingQueue.filter(
          (item) => item.deliveryStatus === MediaDeliveryStatus.FAILED,
        ).length,
      },
      engagement: {
        urgent: input.engagement.urgent,
        needsResponse: input.engagement.needsResponse,
        new: input.engagement.new,
      },
      growth: {
        publicationsMeasured: input.growth.publicationsMeasured,
        averagePerformanceScore: input.growth.averagePerformanceScore,
        followersGained: input.growth.totalFollowersGained,
        positiveLearnings: input.learnings.filter(
          (item) => item.direction === MediaGrowthLearningDirection.POSITIVE,
        ).length,
        negativeLearnings: input.learnings.filter(
          (item) => item.direction === MediaGrowthLearningDirection.NEGATIVE,
        ).length,
        experimentsRunning: input.experiments.filter(
          (item) => item.status === MediaGrowthExperimentStatus.RUNNING,
        ).length,
      },
    };
  }

  private async generateGapDrafts(
    run: MediaAutopilotRunDocument,
    coverage: Awaited<ReturnType<MediaCalendarService['overview']>>['coverage'],
    settings: MediaAutopilotSettingsDocument,
  ) {
    const gaps = coverage
      .filter((item) => item.requiredSlots > item.assignedSlots)
      .sort(
        (a, b) =>
          b.requiredSlots -
          b.assignedSlots -
          (a.requiredSlots - a.assignedSlots),
      );
    let generated = 0;

    for (const gap of gaps) {
      if (generated >= settings.maxDailyDraftRuns) break;
      if (!(await this.shouldGenerateGapDraft(gap.platform))) continue;
      try {
        const missing = gap.requiredSlots - gap.assignedSlots;
        const generation = await this.directorService.generate({
          brief: `Fill the next ${gap.horizonDays}-day ${gap.platform} calendar gap for ${gap.displayName}. We are ${missing} publication slot${missing === 1 ? '' : 's'} short. Generate genuinely distinct, growth-aware content candidates that can cover this gap without repeating prior topics, hooks, stories, examples or structures.`,
          purpose: MediaGenerationPurpose.CALENDAR_FILL,
          platforms: [gap.platform],
          candidateCount: settings.candidateCount,
          whyNow: `The rolling Media calendar is only ${gap.coveragePercent}% covered for ${gap.displayName}.`,
          constraints: [
            'Do not accept, schedule or publish anything automatically.',
            'Use 6F growth learnings as evidence but keep 6B anti-repetition authoritative.',
            'Prefer specific Personal OS/building context over generic creator advice.',
            'Each candidate must use a meaningfully different angle, hook and example.',
          ],
          contextSummary: `6H Growth Autopilot detected ${missing} uncovered ${gap.platform} slot${missing === 1 ? '' : 's'} inside the rolling planning horizon.`,
        });
        run.generatedDraftRunIds.push(generation._id);
        run.recommendations.push({
          key: `content-candidate-${gap.platform}-${generation._id.toString()}`,
          kind: MediaAutopilotRecommendationKind.CONTENT_CANDIDATE,
          priority: MediaAutopilotPriority.HIGH,
          platform: gap.platform,
          accountId: new Types.ObjectId(gap.accountId),
          generationRunId: generation._id,
          title: `HSAKAA drafted ${gap.platform} candidates for the calendar gap`,
          summary: `${generation.candidateCount} candidates are ready for review. Nothing has been accepted or scheduled.`,
          evidence: [
            `${missing} uncovered calendar slot${missing === 1 ? '' : 's'}`,
            'Candidates passed the Content Director anti-repetition pipeline',
          ],
          recommendedAction:
            'Review the ranked candidates in Content Director and accept only the one(s) you want to move into canonical Media.',
          actionLabel: 'Review candidates',
          status: MediaAutopilotRecommendationStatus.OPEN,
          metadata: { source: 'autopilot_calendar_fill' },
        });
        generated += 1;
      } catch (error) {
        run.runErrors.push(
          `${gap.platform} calendar-fill generation: ${this.errorMessage(error)}`,
        );
      }
    }
  }

  private async shouldGenerateGapDraft(platform: MediaPlatform) {
    const recent = await this.runModel
      .findOne({
        isActive: true,
        createdAt: { $gte: this.hoursAgo(RECENT_GAP_DRAFT_HOURS) },
        recommendations: {
          $elemMatch: {
            kind: MediaAutopilotRecommendationKind.CONTENT_CANDIDATE,
            platform,
            status: MediaAutopilotRecommendationStatus.OPEN,
          },
        },
      })
      .lean();
    return !recent;
  }

  private async buildWeeklyStrategyReview(input: {
    calendar: Awaited<ReturnType<MediaCalendarService['overview']>>;
    growth: Awaited<ReturnType<MediaGrowthService['overview']>>;
    engagement: Awaited<ReturnType<MediaEngagementService['overview']>>;
    learnings: Awaited<ReturnType<MediaGrowthService['listLearnings']>>;
    experiments: Awaited<ReturnType<MediaGrowthService['listExperiments']>>;
  }): Promise<MediaAutopilotStrategyReview> {
    const fallback: MediaAutopilotStrategyReview = {
      summary: `The calendar is ${input.calendar.fullyCovered ? 'covered' : 'not fully covered'} for the next seven days, with ${input.engagement.needsResponse} engagement item(s) needing a response and ${input.growth.publicationsMeasured} measured publication(s) informing growth decisions.`,
      focusThisWeek: input.learnings
        .filter(
          (item) =>
            item.direction === MediaGrowthLearningDirection.POSITIVE &&
            item.confidence >= 70,
        )
        .slice(0, 3)
        .map((item) => item.recommendedAction || item.summary),
      avoidThisWeek: input.learnings
        .filter(
          (item) =>
            item.direction === MediaGrowthLearningDirection.NEGATIVE &&
            item.confidence >= 70,
        )
        .slice(0, 3)
        .map((item) => item.recommendedAction || item.summary),
      experimentsToConsider: input.experiments
        .filter((item) => item.status === MediaGrowthExperimentStatus.PLANNED)
        .slice(0, 3)
        .map((item) => item.title),
      platformPriorities: input.calendar.coverage
        .slice()
        .sort((a, b) => a.coveragePercent - b.coveragePercent)
        .slice(0, 5)
        .map((item) => ({
          platform: item.platform,
          priority: item.covered ? 'maintain' : 'fill_gap',
          reason: `${item.coveragePercent}% calendar coverage with ${item.productionGaps} production gap(s).`,
        })),
    };

    try {
      const response =
        await this.aiService.generateStructuredResponse<StrategyReviewResponse>(
          {
            name: 'hsakaa_media_weekly_autopilot_review',
            instructions: [
              'You are HSAKAA acting as Aakash’s evidence-driven Content Director.',
              'Produce a concise weekly Media strategy review using only the supplied signals.',
              'Growth learnings are evidence, not hard rules. Never recommend repeating the same topic, hook, example or structure just because it performed well.',
              'Prioritize maintaining at least seven days of calendar coverage, clearing production/publishing blockers, responding to important engagement and running useful experiments.',
              'Do not claim anything was accepted, scheduled, published or replied to. This review is advisory only.',
            ].join('\n'),
            input: JSON.stringify({
              calendar: input.calendar.coverage,
              growth: {
                platformSummaries: input.growth.platformSummaries,
                accountGrowth: input.growth.accountGrowth,
                topContent: input.growth.topContent.slice(0, 5),
              },
              engagement: {
                urgent: input.engagement.urgent,
                needsResponse: input.engagement.needsResponse,
                byPlatform: input.engagement.byPlatform,
              },
              learnings: input.learnings.slice(0, 20),
              experiments: input.experiments.slice(0, 10),
            }),
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                focusThisWeek: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 5,
                },
                avoidThisWeek: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 5,
                },
                experimentsToConsider: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 5,
                },
                platformPriorities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      platform: {
                        type: 'string',
                        enum: Object.values(MediaPlatform),
                      },
                      priority: { type: 'string' },
                      reason: { type: 'string' },
                    },
                    required: ['platform', 'priority', 'reason'],
                    additionalProperties: false,
                  },
                  maxItems: 7,
                },
              },
              required: [
                'summary',
                'focusThisWeek',
                'avoidThisWeek',
                'experimentsToConsider',
                'platformPriorities',
              ],
              additionalProperties: false,
            },
          },
        );
      return response.data;
    } catch {
      return fallback;
    }
  }

  private sortRecommendations(items: RecommendationDraft[]) {
    const weight: Record<MediaAutopilotPriority, number> = {
      [MediaAutopilotPriority.URGENT]: 4,
      [MediaAutopilotPriority.HIGH]: 3,
      [MediaAutopilotPriority.NORMAL]: 2,
      [MediaAutopilotPriority.LOW]: 1,
    };
    return items
      .slice()
      .sort((a, b) => weight[b.priority] - weight[a.priority]);
  }

  private async requireRun(runId: string) {
    if (!Types.ObjectId.isValid(runId)) {
      throw new NotFoundException('Media autopilot run not found.');
    }
    const run = await this.runModel.findOne({ _id: runId, isActive: true });
    if (!run) throw new NotFoundException('Media autopilot run not found.');
    return run;
  }

  private readDate(value: object, key: string) {
    const candidate = (value as Record<string, unknown>)[key];
    return candidate instanceof Date
      ? candidate
      : typeof candidate === 'string'
        ? candidate
        : undefined;
  }

  private isDuplicateKeyError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    return (error as { code?: unknown }).code === 11000;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown Media autopilot error.';
  }

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 86_400_000);
  }

  private hoursAgo(hours: number) {
    return new Date(Date.now() - hours * 3_600_000);
  }

  private addDays(value: Date, days: number) {
    return new Date(value.getTime() + days * 86_400_000);
  }
}
