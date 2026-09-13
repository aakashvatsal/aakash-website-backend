import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { DietService } from '../diet/diet.service';
import { HaircareService } from '../haircare/haircare.service';
import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';
import { IntimateCareService } from '../intimate-care/intimate-care.service';
import { MeditationService } from '../meditation/meditation.service';
import { MeditationStatus } from '../meditation/schemas/meditation-entry.schema';
import { SkincareService } from '../skincare/skincare.service';
import { SupplementsService } from '../supplements/supplements.service';
import {
  Task,
  TaskDocument,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from '../tasks/schemas/task.schema';
import {
  GenerateHealthPlanReviewDto,
  HealthRoutineTaskStatus,
  HealthSubstanceUseStatus,
  UpdateHealthRoutineTaskDto,
  UpsertHealthExecutionFeedbackDto,
} from './dto/health-plan-progress.dto';
import { HealthService } from './health.service';
import { HealthNotificationPreferences } from './schemas/health-notification-preferences.schema';
import { HealthGoal, HealthGoalStatus } from './schemas/health-goal.schema';
import {
  HealthPlanDay,
  HealthPlanDayDocument,
} from './schemas/health-plan-day.schema';
import {
  HealthPlanExecution,
  HealthPlanExecutionDocument,
  HealthPlanExecutionFeedback,
  HealthRoutineTask,
} from './schemas/health-plan-execution.schema';
import {
  HealthPlanReview,
  HealthPlanReviewDocument,
  HealthPlanReviewPeriod,
} from './schemas/health-plan-review.schema';

const TIMEZONE = 'Asia/Kolkata';
const DEFAULT_PROGRESS_DAYS = 30;
const MAX_PROGRESS_DAYS = 90;

const HEALTH_REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'wins',
    'misses',
    'blockers',
    'recommendedChanges',
    'targetProgress',
    'safetyFlags',
    'nextActions',
  ],
  properties: {
    summary: { type: 'string' },
    wins: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    misses: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    blockers: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    recommendedChanges: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 12,
    },
    targetProgress: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 12,
    },
    safetyFlags: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 10,
    },
    nextActions: {
      type: 'array',
      items: { type: 'string' },
      maxItems: 12,
    },
  },
};

type ReviewOutput = {
  summary: string;
  wins: string[];
  misses: string[];
  blockers: string[];
  recommendedChanges: string[];
  targetProgress: string[];
  safetyFlags: string[];
  nextActions: string[];
};

type DomainStatus =
  'met' | 'partial' | 'missed' | 'untracked' | 'not_applicable';

type DomainComparison = {
  score: number | null;
  status: DomainStatus;
  planned: unknown;
  actual: unknown;
  notes: string[];
};

type AutomaticHealthMetrics = {
  sources: string[];
  weightKg: number | null;
  heightCm: number | null;
  maximumHeartRateBpm: number | null;
  recoveryScore: number | null;
  strainScore: number | null;
  sleepHours: number | null;
  sleepNeedMinutes: number | null;
  sleepDebtMinutes: number | null;
  sleepPerformancePercentage: number | null;
  sleepEfficiencyPercentage: number | null;
  sleepConsistencyPercentage: number | null;
  restingHeartRateBpm: number | null;
  heartRateVariabilityMs: number | null;
  bloodOxygenPercentage: number | null;
  skinTemperatureCelsius: number | null;
  respiratoryRateBreathsPerMinute: number | null;
  steps: number | null;
  totalCaloriesBurned: number | null;
};

type DailyComparison = {
  dateKey: string;
  planVersion: number;
  planStatus: string;
  isFinal: boolean;
  overallAdherencePercentage: number;
  trackingCoveragePercentage: number;
  taskCompletionPercentage: number;
  taskTrackingCoveragePercentage: number;
  domains: Record<string, DomainComparison>;
  automaticMetrics: AutomaticHealthMetrics;
  tasks: HealthRoutineTask[];
  feedback: HealthPlanExecutionFeedback;
  computedAt: string;
};

export function resolveHealthRoutineTaskStatus(
  previous: Pick<HealthRoutineTask, 'source' | 'status'> | undefined,
  globalStatus: TaskStatus | undefined,
): HealthRoutineTaskStatus {
  if (previous?.source === 'owner') return previous.status;
  if (globalStatus === TaskStatus.COMPLETED)
    return HealthRoutineTaskStatus.COMPLETED;
  if (globalStatus === TaskStatus.CANCELLED)
    return HealthRoutineTaskStatus.SKIPPED;
  if (globalStatus) return HealthRoutineTaskStatus.PENDING;
  return previous?.status ?? HealthRoutineTaskStatus.PENDING;
}

type RangeSources = {
  healthByDate: Map<
    string,
    Awaited<ReturnType<HealthService['findAll']>>['data'][number]
  >;
  dietByDate: Map<string, Awaited<ReturnType<DietService['findAll']>>[number]>;
  meditationByDate: Map<
    string,
    Awaited<ReturnType<MeditationService['findAll']>>['data']
  >;
  supplementByDate: Map<
    string,
    Awaited<ReturnType<SupplementsService['getLogs']>>[number]
  >;
  skincareByDate: Map<
    string,
    Awaited<ReturnType<SkincareService['getLogs']>>[number]
  >;
  haircareByDate: Map<
    string,
    Awaited<ReturnType<HaircareService['getLogs']>>[number]
  >;
  intimateByDate: Map<
    string,
    Awaited<ReturnType<IntimateCareService['getLogs']>>[number]
  >;
};

@Injectable()
export class HealthProgressService {
  private readonly logger = new Logger(HealthProgressService.name);

  constructor(
    @InjectModel(HealthPlanDay.name)
    private readonly planModel: Model<HealthPlanDayDocument>,
    @InjectModel(HealthPlanExecution.name)
    private readonly executionModel: Model<HealthPlanExecutionDocument>,
    @InjectModel(HealthPlanReview.name)
    private readonly reviewModel: Model<HealthPlanReviewDocument>,
    @InjectModel(HealthGoal.name)
    private readonly goalModel: Model<HealthGoal>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    @InjectModel(HealthNotificationPreferences.name)
    private readonly notificationPreferencesModel: Model<HealthNotificationPreferences>,
    private readonly healthService: HealthService,
    private readonly dietService: DietService,
    private readonly supplementsService: SupplementsService,
    private readonly meditationService: MeditationService,
    private readonly skincareService: SkincareService,
    private readonly haircareService: HaircareService,
    private readonly intimateCareService: IntimateCareService,
    private readonly aiService: AiService,
    private readonly aiUsage: HsakaaAiUsageService,
  ) {}

  async getDaily(dateKey: string) {
    this.assertDateKey(dateKey);

    const [plan, existing] = await Promise.all([
      this.planModel
        .findOne({ dateKey, isActive: true })
        .select({ version: 1 })
        .lean()
        .exec(),
      this.executionModel.findOne({ dateKey, isActive: true }).lean().exec(),
    ]);

    if (!plan) throw new NotFoundException('Health plan day not found.');

    if (this.canServeStoredExecution(existing, plan.version)) {
      return existing.comparison as DailyComparison;
    }

    return this.refreshDaily(dateKey);
  }

  async refreshDaily(dateKey: string) {
    this.assertDateKey(dateKey);
    const execution = await this.captureRange(dateKey, dateKey, true);
    const day = execution[0];
    if (!day) throw new NotFoundException('Health plan day not found.');
    return day;
  }

  async upsertFeedback(dateKey: string, dto: UpsertHealthExecutionFeedbackDto) {
    this.assertDateKey(dateKey);
    const plan = await this.planModel
      .findOne({ dateKey, isActive: true })
      .lean()
      .exec();
    if (!plan) throw new NotFoundException('Health plan day not found.');

    const feedback = this.normalizeFeedback(dto);
    await this.executionModel
      .findOneAndUpdate(
        { dateKey },
        {
          $set: {
            dateKey,
            date: this.dateFromKey(dateKey),
            planVersion: plan.version,
            feedback,
            isActive: true,
          },
          $setOnInsert: {
            overallAdherencePercentage: 0,
            trackingCoveragePercentage: 0,
            taskCompletionPercentage: 0,
            taskTrackingCoveragePercentage: 0,
            comparison: {},
            sourceFingerprint: 'feedback_pending_recompute',
            computedAt: new Date(0),
            isFinal: dateKey < this.getIstDateKey(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return this.getDaily(dateKey);
  }

  async updateRoutineTask(
    dateKey: string,
    taskKey: string,
    dto: UpdateHealthRoutineTaskDto,
  ) {
    this.assertDateKey(dateKey);
    if (!taskKey?.trim())
      throw new BadRequestException('Health task key is required.');

    await this.captureRange(dateKey, dateKey, true);
    const execution = await this.executionModel
      .findOne({ dateKey, isActive: true })
      .exec();
    if (!execution)
      throw new NotFoundException('Health plan execution was not found.');

    const task = execution.tasks.find((item) => item.key === taskKey);
    if (!task)
      throw new NotFoundException('Health routine task was not found.');

    task.status = dto.status;
    task.source = 'owner';
    task.updatedAt = new Date();
    task.completedAt =
      dto.status === HealthRoutineTaskStatus.COMPLETED ? new Date() : undefined;

    const taskScoring = this.scoreTasks(execution.tasks);
    execution.taskCompletionPercentage = taskScoring.completion;
    execution.taskTrackingCoveragePercentage = taskScoring.coverage;
    execution.sourceFingerprint = 'owner_task_update_pending_recompute';
    await execution.save();

    const globalTaskFilter = task.globalTaskId
      ? { _id: task.globalTaskId, isArchived: false }
      : {
          source: TaskSource.HSAKAA,
          sourceExternalId: task.key,
          isArchived: false,
        };
    const globalTaskSet: Record<string, unknown> = {
      status: this.globalTaskStatus(dto.status),
    };
    const globalTaskUnset: Record<string, 1> = {};
    if (dto.status === HealthRoutineTaskStatus.COMPLETED) {
      globalTaskSet.completedAt = task.completedAt;
      globalTaskUnset.cancelledAt = 1;
    } else if (dto.status === HealthRoutineTaskStatus.SKIPPED) {
      globalTaskSet.cancelledAt = task.updatedAt;
      globalTaskUnset.completedAt = 1;
    } else {
      globalTaskUnset.completedAt = 1;
      globalTaskUnset.cancelledAt = 1;
    }

    await this.taskModel
      .findOneAndUpdate(globalTaskFilter, {
        $set: globalTaskSet,
        ...(Object.keys(globalTaskUnset).length
          ? { $unset: globalTaskUnset }
          : {}),
      })
      .exec();

    return this.getDaily(dateKey);
  }

  async getSummary(days = DEFAULT_PROGRESS_DAYS) {
    const safeDays = Math.min(
      MAX_PROGRESS_DAYS,
      Math.max(7, Math.round(days || DEFAULT_PROGRESS_DAYS)),
    );
    const today = this.getIstDateKey();
    const startDateKey = this.addDays(today, -(safeDays - 1));
    const executions = await this.captureRange(startDateKey, today, true);
    const finalExecutions = executions.filter((item) => item.isFinal);
    const averageAdherence = this.average(
      finalExecutions.map((item) => item.overallAdherencePercentage),
    );
    const averageTrackingCoverage = this.average(
      finalExecutions.map((item) => item.trackingCoveragePercentage),
    );
    const domainKeys = [
      'training',
      'nutrition',
      'sleep',
      'steps',
      'meditation',
      'supplements',
      'skincare',
      'haircare',
      'intimateCare',
    ];
    const domainAverages = Object.fromEntries(
      domainKeys.map((key) => [
        key,
        this.average(
          finalExecutions
            .map((item) => item.domains[key]?.score)
            .filter((value): value is number => typeof value === 'number'),
        ),
      ]),
    );
    const recentFinal = [...finalExecutions].sort((a, b) =>
      b.dateKey.localeCompare(a.dateKey),
    );
    let adherenceStreak = 0;
    for (const item of recentFinal) {
      if (item.overallAdherencePercentage < 80) break;
      adherenceStreak += 1;
    }
    const reviews = await this.reviewModel
      .find({ isActive: true })
      .sort({ generatedAt: -1 })
      .limit(6)
      .lean()
      .exec();

    return {
      range: { startDateKey, endDateKey: today, days: safeDays },
      totals: {
        plannedDays: executions.length,
        finalizedDays: finalExecutions.length,
        daysAtOrAbove80: finalExecutions.filter(
          (item) => item.overallAdherencePercentage >= 80,
        ).length,
        adherenceStreak,
      },
      averages: {
        adherencePercentage: averageAdherence,
        trackingCoveragePercentage: averageTrackingCoverage,
        domains: domainAverages,
      },
      executions: executions.slice(-14),
      reviews,
    };
  }

  async getExecutionHistory(days = DEFAULT_PROGRESS_DAYS) {
    const safeDays = Math.min(
      MAX_PROGRESS_DAYS,
      Math.max(7, Math.round(days || DEFAULT_PROGRESS_DAYS)),
    );
    const today = this.getIstDateKey();
    const startDateKey = this.addDays(today, -(safeDays - 1));
    return this.captureRange(startDateKey, today, true);
  }

  async listReviews(periodType?: HealthPlanReviewPeriod, limit = 12) {
    const safeLimit = Math.min(24, Math.max(1, Math.round(limit || 12)));
    const filter: Record<string, unknown> = { isActive: true };
    if (periodType) filter.periodType = periodType;
    return this.reviewModel
      .find(filter)
      .sort({ generatedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
  }

  async generateReview(
    periodType: HealthPlanReviewPeriod,
    dto: GenerateHealthPlanReviewDto,
  ) {
    if (!Object.values(HealthPlanReviewPeriod).includes(periodType))
      throw new BadRequestException('Invalid Health review period.');
    const anchorDateKey = dto.anchorDateKey?.trim() || this.getIstDateKey();
    this.assertDateKey(anchorDateKey);
    const period = this.resolveReviewPeriod(periodType, anchorDateKey);
    const executions = await this.captureRange(
      period.startDateKey,
      period.endDateKey,
      true,
    );
    if (!executions.length)
      throw new BadRequestException(
        'No Health plan execution evidence exists for this review period.',
      );

    const goals = await this.goalModel
      .find({ status: HealthGoalStatus.ACTIVE, isActive: true })
      .sort({ priority: -1, createdAt: 1 })
      .lean()
      .exec();
    const evidence = {
      period,
      goals: goals.map((goal) => ({
        category: goal.category,
        title: goal.title,
        currentValue: goal.currentValue,
        targetValue: goal.targetValue,
        unit: goal.unit,
        targetDate: goal.targetDate,
        successCriteria: goal.successCriteria,
      })),
      executions: executions.map((item) => ({
        dateKey: item.dateKey,
        overallAdherencePercentage: item.overallAdherencePercentage,
        trackingCoveragePercentage: item.trackingCoveragePercentage,
        domains: item.domains,
        feedback: item.feedback,
      })),
    };
    const evidenceJson = this.compactJson(evidence, 48_000);
    const evidenceHash = this.hash(evidenceJson);
    const existing = await this.reviewModel
      .findOne({ periodType, periodKey: period.periodKey, isActive: true })
      .lean()
      .exec();
    if (existing && existing.evidenceHash === evidenceHash && !dto.force)
      return existing;

    const startedAt = Date.now();
    try {
      await this.aiUsage.assertBudget(HsakaaAiUsageFeature.HEALTH_PLANNER);
      const result =
        await this.aiService.generateStructuredResponse<ReviewOutput>({
          name: `hsakaa_health_${periodType}_execution_review_v1`,
          schema: HEALTH_REVIEW_SCHEMA,
          verbosity: 'medium',
          reasoningEffort: 'low',
          maxOutputTokens: 5000,
          instructions: this.reviewInstructions(periodType),
          input: evidenceJson,
        });
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt,
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
        metadata: {
          operation: 'health_execution_review',
          periodType,
          periodKey: period.periodKey,
        },
      });
      const generatedAt = new Date();
      return this.reviewModel
        .findOneAndUpdate(
          { periodType, periodKey: period.periodKey },
          {
            $set: {
              ...result.data,
              periodType,
              periodKey: period.periodKey,
              startDateKey: period.startDateKey,
              endDateKey: period.endDateKey,
              evidenceHash,
              aiModel: result.model,
              aiResponseId: result.responseId,
              generatedAt,
              version: (existing?.version ?? 0) + 1,
              isActive: true,
            },
          },
          { upsert: true, new: true, runValidators: true },
        )
        .lean()
        .exec();
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.HEALTH_PLANNER,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.ERROR,
        startedAt,
        metadata: {
          operation: 'health_execution_review',
          periodType,
          periodKey: period.periodKey,
        },
        error,
      });
      this.logger.error(
        `Health ${periodType} review failed: ${this.errorMessage(error)}`,
      );
      throw new ServiceUnavailableException(
        'HSAKAA could not generate the Health progress review. Existing reviews were kept unchanged.',
      );
    }
  }

  async getPlanningEvidence(days = 14) {
    const today = this.getIstDateKey();
    const startDateKey = this.addDays(today, -(Math.max(1, days) - 1));
    const [executions, reviews] = await Promise.all([
      this.executionModel
        .find({
          dateKey: { $gte: startDateKey, $lte: today },
          isActive: true,
        })
        .sort({ dateKey: -1 })
        .lean()
        .exec(),
      this.reviewModel
        .find({ isActive: true })
        .sort({ generatedAt: -1 })
        .limit(4)
        .lean()
        .exec(),
    ]);
    return {
      executions: executions.map((item) => ({
        dateKey: item.dateKey,
        overallAdherencePercentage: item.overallAdherencePercentage,
        trackingCoveragePercentage: item.trackingCoveragePercentage,
        comparison: item.comparison,
        feedback: item.feedback,
        isFinal: item.isFinal,
      })),
      reviews: reviews.map((review) => ({
        periodType: review.periodType,
        periodKey: review.periodKey,
        summary: review.summary,
        blockers: review.blockers,
        recommendedChanges: review.recommendedChanges,
        targetProgress: review.targetProgress,
        safetyFlags: review.safetyFlags,
        nextActions: review.nextActions,
      })),
    };
  }

  async syncPlanTasksForDates(dateKeys: string[]) {
    const safeKeys = [...new Set(dateKeys.filter(Boolean))].sort();
    if (!safeKeys.length) return { synced: 0 };
    safeKeys.forEach((dateKey) => this.assertDateKey(dateKey));
    await this.captureRange(safeKeys[0], safeKeys[safeKeys.length - 1], true);
    return { synced: safeKeys.length };
  }

  @Cron('0 10 5 * * *', { timeZone: TIMEZONE })
  async finalizeYesterdayCron() {
    const yesterday = this.addDays(this.getIstDateKey(), -1);
    try {
      await this.captureRange(yesterday, yesterday, true, true);
    } catch (error) {
      this.logger.warn(
        `Daily Health execution finalization skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  @Cron('0 40 5 * * 1', { timeZone: TIMEZONE })
  async weeklyReviewCron() {
    const yesterday = this.addDays(this.getIstDateKey(), -1);
    try {
      await this.generateReview(HealthPlanReviewPeriod.WEEKLY, {
        anchorDateKey: yesterday,
        force: false,
      });
    } catch (error) {
      this.logger.warn(
        `Weekly Health execution review skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  @Cron('0 45 5 1 * *', { timeZone: TIMEZONE })
  async monthlyReviewCron() {
    const yesterday = this.addDays(this.getIstDateKey(), -1);
    try {
      await this.generateReview(HealthPlanReviewPeriod.MONTHLY, {
        anchorDateKey: yesterday,
        force: false,
      });
    } catch (error) {
      this.logger.warn(
        `Monthly Health execution review skipped: ${this.errorMessage(error)}`,
      );
    }
  }

  private async captureRange(
    startDateKey: string,
    endDateKey: string,
    persist: boolean,
    forceFinal = false,
  ): Promise<DailyComparison[]> {
    this.assertDateKey(startDateKey);
    this.assertDateKey(endDateKey);
    if (startDateKey > endDateKey)
      throw new BadRequestException('Invalid Health progress date range.');

    const [plans, sources, existingExecutions] = await Promise.all([
      this.planModel
        .find({
          dateKey: { $gte: startDateKey, $lte: endDateKey },
          isActive: true,
        })
        .sort({ dateKey: 1 })
        .lean()
        .exec(),
      this.loadRangeSources(startDateKey, endDateKey),
      this.executionModel
        .find({
          dateKey: { $gte: startDateKey, $lte: endDateKey },
          isActive: true,
        })
        .lean()
        .exec(),
    ]);
    const existingByDate = new Map(
      existingExecutions.map((item) => [item.dateKey, item]),
    );
    const today = this.getIstDateKey();
    const results: DailyComparison[] = [];

    for (const plan of plans) {
      const existing = existingByDate.get(plan.dateKey);
      const feedback = existing?.feedback ?? this.emptyFeedback();
      const actual = {
        health: sources.healthByDate.get(plan.dateKey) ?? null,
        diet: sources.dietByDate.get(plan.dateKey) ?? null,
        meditation: sources.meditationByDate.get(plan.dateKey) ?? [],
        supplements: sources.supplementByDate.get(plan.dateKey) ?? null,
        skincare: sources.skincareByDate.get(plan.dateKey) ?? null,
        haircare: sources.haircareByDate.get(plan.dateKey) ?? null,
        intimateCare: sources.intimateByDate.get(plan.dateKey) ?? null,
      };
      const isFinal = forceFinal || plan.dateKey < today;
      const tasks = await this.buildAndSyncTasks(plan, existing?.tasks ?? []);
      const domains = this.applyTaskFallbacks(
        this.compareDomains(plan, actual, isFinal),
        tasks,
        isFinal,
      );
      const domainScoring = this.scoreDomains(domains, isFinal);
      const taskScoring = this.scoreTasks(tasks);
      const overall =
        taskScoring.coverage > 0
          ? this.average([
              domainScoring.overall * 0.75,
              taskScoring.completion * 0.25,
            ])
          : domainScoring.overall;
      const trackingCoverage =
        tasks.length > 0
          ? this.average([
              domainScoring.coverage * 0.75,
              taskScoring.coverage * 0.25,
            ])
          : domainScoring.coverage;
      const automaticMetrics = this.extractAutomaticMetrics(actual.health);
      const computedAt = new Date();
      const sourceFingerprint = this.hash(
        this.compactJson(
          { planVersion: plan.version, actual, feedback, tasks, isFinal },
          100_000,
        ),
      );
      const comparison: DailyComparison = {
        dateKey: plan.dateKey,
        planVersion: plan.version,
        planStatus: plan.status,
        isFinal,
        overallAdherencePercentage: overall,
        trackingCoveragePercentage: trackingCoverage,
        taskCompletionPercentage: taskScoring.completion,
        taskTrackingCoveragePercentage: taskScoring.coverage,
        domains,
        automaticMetrics,
        tasks,
        feedback,
        computedAt: computedAt.toISOString(),
      };
      results.push(comparison);
      if (persist) {
        await this.executionModel
          .findOneAndUpdate(
            { dateKey: plan.dateKey },
            {
              $set: {
                dateKey: plan.dateKey,
                date: this.dateFromKey(plan.dateKey),
                planVersion: plan.version,
                overallAdherencePercentage: overall,
                trackingCoveragePercentage: trackingCoverage,
                taskCompletionPercentage: taskScoring.completion,
                taskTrackingCoveragePercentage: taskScoring.coverage,
                comparison,
                feedback,
                tasks,
                sourceFingerprint,
                computedAt,
                isFinal,
                isActive: true,
              },
            },
            { upsert: true, new: true, runValidators: true },
          )
          .exec();
      }
    }
    return results;
  }

  private canServeStoredExecution(
    execution:
      | (HealthPlanExecution & {
          comparison?: Record<string, unknown>;
        })
      | null,
    planVersion: number,
  ): execution is HealthPlanExecution & {
    comparison: Record<string, unknown>;
  } {
    if (!execution) return false;
    if (execution.planVersion !== planVersion) return false;
    if (!execution.comparison || typeof execution.comparison !== 'object')
      return false;
    if (!Array.isArray(execution.tasks) || execution.tasks.length === 0)
      return false;
    if (
      execution.sourceFingerprint === 'feedback_pending_recompute' ||
      execution.sourceFingerprint === 'owner_task_update_pending_recompute'
    )
      return false;

    const comparison = execution.comparison as Partial<DailyComparison>;
    return (
      comparison.dateKey === execution.dateKey &&
      comparison.planVersion === execution.planVersion &&
      Array.isArray(comparison.tasks)
    );
  }

  private async loadRangeSources(
    startDateKey: string,
    endDateKey: string,
  ): Promise<RangeSources> {
    const [
      health,
      diet,
      meditation,
      supplements,
      skincare,
      haircare,
      intimateCare,
    ] = await Promise.all([
      this.healthService.findAll({
        startDate: startDateKey,
        endDate: endDateKey,
        page: 1,
        limit: 100,
      }),
      this.dietService.findAll(startDateKey, endDateKey),
      this.meditationService.findAll({
        startDate: startDateKey,
        endDate: endDateKey,
        page: 1,
        limit: 100,
      }),
      this.supplementsService.getLogs(startDateKey, endDateKey),
      this.skincareService.getLogs(startDateKey, endDateKey),
      this.haircareService.getLogs(startDateKey, endDateKey),
      this.intimateCareService.getLogs(startDateKey, endDateKey),
    ]);

    const meditationByDate = new Map<
      string,
      Awaited<ReturnType<MeditationService['findAll']>>['data']
    >();
    for (const entry of meditation.data) {
      const key = this.dateKeyFromUnknown(entry.date);
      const bucket = meditationByDate.get(key) ?? [];
      bucket.push(entry);
      meditationByDate.set(key, bucket);
    }

    return {
      healthByDate: new Map(
        health.data.map((entry) => [
          this.dateKeyFromUnknown(entry.date),
          entry,
        ]),
      ),
      dietByDate: new Map(
        diet.map((entry) => [this.dateKeyFromUnknown(entry.date), entry]),
      ),
      meditationByDate,
      supplementByDate: new Map(
        supplements.map((entry) => [
          this.dateKeyFromUnknown(entry.date),
          entry,
        ]),
      ),
      skincareByDate: new Map(
        skincare.map((entry) => [this.dateKeyFromUnknown(entry.date), entry]),
      ),
      haircareByDate: new Map(
        haircare.map((entry) => [this.dateKeyFromUnknown(entry.date), entry]),
      ),
      intimateByDate: new Map(
        intimateCare.map((entry) => [
          this.dateKeyFromUnknown(entry.date),
          entry,
        ]),
      ),
    };
  }

  private compareDomains(
    plan: HealthPlanDay,
    actual: {
      health: RangeSources['healthByDate'] extends Map<string, infer V>
        ? V | null
        : never;
      diet: RangeSources['dietByDate'] extends Map<string, infer V>
        ? V | null
        : never;
      meditation: RangeSources['meditationByDate'] extends Map<string, infer V>
        ? V
        : never;
      supplements: RangeSources['supplementByDate'] extends Map<string, infer V>
        ? V | null
        : never;
      skincare: RangeSources['skincareByDate'] extends Map<string, infer V>
        ? V | null
        : never;
      haircare: RangeSources['haircareByDate'] extends Map<string, infer V>
        ? V | null
        : never;
      intimateCare: RangeSources['intimateByDate'] extends Map<string, infer V>
        ? V | null
        : never;
    },
    isFinal: boolean,
  ) {
    return {
      training: this.compareTraining(plan, actual.health, isFinal),
      nutrition: this.compareNutrition(plan, actual.diet, isFinal),
      sleep: this.compareSleep(plan, actual.health, isFinal),
      steps: this.compareSteps(plan, actual.health, isFinal),
      meditation: this.compareMeditation(plan, actual.meditation, isFinal),
      supplements: this.compareRoutineAdherence(
        plan.supplementSchedule.length > 0,
        actual.supplements?.adherencePercentage,
        plan.supplementSchedule,
        actual.supplements,
        isFinal,
      ),
      skincare: this.compareRoutineAdherence(
        plan.skincare.morning.length +
          plan.skincare.evening.length +
          plan.skincare.other.length >
          0,
        actual.skincare?.adherencePercentage,
        plan.skincare,
        actual.skincare,
        isFinal,
      ),
      haircare: this.compareRoutineAdherence(
        plan.haircare.routine.length > 0 || plan.haircare.washDay,
        actual.haircare?.adherencePercentage,
        plan.haircare,
        actual.haircare,
        isFinal,
      ),
      intimateCare: this.compareRoutineAdherence(
        plan.intimateCare.routine.length > 0,
        actual.intimateCare?.adherencePercentage,
        plan.intimateCare,
        actual.intimateCare,
        isFinal,
      ),
    };
  }

  private compareTraining(
    plan: HealthPlanDay,
    health: RangeSources['healthByDate'] extends Map<string, infer V>
      ? V | null
      : never,
    isFinal: boolean,
  ): DomainComparison {
    const plannedExercises = plan.training.exercises ?? [];
    const plannedCardioMinutes = plan.training.cardio?.durationMinutes ?? 0;
    const applicable = plannedExercises.length > 0 || plannedCardioMinutes > 0;
    const workouts = health?.workouts ?? [];
    if (!applicable) {
      return {
        score: null,
        status: 'not_applicable',
        planned: plan.training,
        actual: { workouts },
        notes: ['Planned recovery/rest day; training adherence is not scored.'],
      };
    }
    if (!workouts.length) {
      return this.untracked(plan.training, { workouts: [] }, isFinal);
    }

    const actualExercises = workouts.flatMap(
      (workout) => workout.exercises ?? [],
    );
    const matchedExercises = plannedExercises.map((exercise) => {
      const normalized = this.normalizeExerciseName(exercise.name);
      const match = actualExercises.find(
        (candidate) =>
          this.normalizeExerciseName(candidate.name) === normalized,
      );
      const completedSets = (match?.sets ?? []).filter(
        (set) =>
          set.completed === true ||
          (set.repetitions ?? 0) > 0 ||
          (set.weightKg ?? 0) > 0 ||
          (set.durationSeconds ?? 0) > 0 ||
          (set.distanceMetres ?? 0) > 0,
      );
      return {
        name: exercise.name,
        plannedSets: exercise.sets,
        completedSets: completedSets.length,
        actualSets: completedSets.map((set) => ({
          setNumber: set.setNumber,
          repetitions: set.repetitions,
          weightKg: set.weightKg,
          perceivedExertion: set.perceivedExertion,
          durationSeconds: set.durationSeconds,
          distanceMetres: set.distanceMetres,
        })),
      };
    });
    const hasSetLevelData = matchedExercises.some(
      (exercise) => exercise.completedSets > 0,
    );
    const anyWorkoutCompleted = workouts.some((workout) => workout.completed);
    let exerciseScore: number | null = null;
    if (plannedExercises.length) {
      if (hasSetLevelData) {
        exerciseScore = this.average(
          matchedExercises.map((exercise) =>
            exercise.plannedSets > 0
              ? this.percent(exercise.completedSets, exercise.plannedSets)
              : 100,
          ),
        );
      } else if (anyWorkoutCompleted) {
        exerciseScore = 100;
      } else {
        exerciseScore = 0;
      }
    }
    const actualCardioMinutes = workouts.reduce((total, workout) => {
      const cardioMinutes = workout.cardio?.durationMinutes ?? 0;
      return total + cardioMinutes;
    }, 0);
    const cardioScore = plannedCardioMinutes
      ? this.percent(actualCardioMinutes, plannedCardioMinutes)
      : null;
    const scores = [exerciseScore, cardioScore].filter(
      (value): value is number => typeof value === 'number',
    );
    const score = scores.length
      ? this.average(scores)
      : anyWorkoutCompleted
        ? 100
        : 0;
    return {
      score,
      status: this.statusFromScore(score),
      planned: plan.training,
      actual: {
        completedWorkoutCount: workouts.filter((workout) => workout.completed)
          .length,
        workouts: workouts.map((workout) => ({
          title: workout.title,
          type: workout.type,
          durationMinutes: workout.durationMinutes,
          perceivedExertion: workout.perceivedExertion,
          strainScore: workout.strainScore,
          completed: workout.completed,
        })),
        matchedExercises,
        cardioMinutes: actualCardioMinutes,
      },
      notes: hasSetLevelData
        ? ['Exercise-level actuals were matched to the planned exercise names.']
        : anyWorkoutCompleted
          ? [
              'Workout was marked completed, but set-level exercise actuals were not logged.',
            ]
          : [
              'Workout evidence exists but the planned training was not completed.',
            ],
    };
  }

  private compareNutrition(
    plan: HealthPlanDay,
    diet: RangeSources['dietByDate'] extends Map<string, infer V>
      ? V | null
      : never,
    isFinal: boolean,
  ): DomainComparison {
    const planned = plan.nutrition;
    if (!diet) return this.untracked(planned, null, isFinal);
    const score = this.clampPercent(diet.adherence?.overallPercentage ?? 0);
    return {
      score,
      status: this.statusFromScore(score),
      planned,
      actual: {
        calories: diet.actuals?.nutrition?.calories ?? 0,
        proteinGrams: diet.actuals?.nutrition?.proteinGrams ?? 0,
        carbsGrams: diet.actuals?.nutrition?.carbohydratesGrams ?? 0,
        fatGrams: diet.actuals?.nutrition?.fatGrams ?? 0,
        hydrationLitres: diet.actuals?.waterLitres ?? 0,
        mealsCompleted: diet.actuals?.mealsCompleted ?? 0,
        mealsSkipped: diet.actuals?.mealsSkipped ?? 0,
        adherence: diet.adherence,
      },
      notes: [],
    };
  }

  private compareSleep(
    plan: HealthPlanDay,
    health: RangeSources['healthByDate'] extends Map<string, infer V>
      ? V | null
      : never,
    isFinal: boolean,
  ): DomainComparison {
    const target = plan.sleep.targetHours;
    if (!target)
      return {
        score: null,
        status: 'not_applicable',
        planned: plan.sleep,
        actual: health?.sleep ?? null,
        notes: [],
      };
    const actualHours = health?.sleep?.durationHours;
    if (typeof actualHours !== 'number')
      return this.untracked(plan.sleep, health?.sleep ?? null, isFinal);
    const score = this.percent(actualHours, target);
    return {
      score,
      status: this.statusFromScore(score),
      planned: plan.sleep,
      actual: health?.sleep ?? null,
      notes: [],
    };
  }

  private compareSteps(
    plan: HealthPlanDay,
    health: RangeSources['healthByDate'] extends Map<string, infer V>
      ? V | null
      : never,
    isFinal: boolean,
  ): DomainComparison {
    if (!plan.stepsTarget)
      return {
        score: null,
        status: 'not_applicable',
        planned: { stepsTarget: 0 },
        actual: { steps: health?.steps ?? null },
        notes: [],
      };
    if (typeof health?.steps !== 'number')
      return this.untracked(
        { stepsTarget: plan.stepsTarget },
        { steps: null },
        isFinal,
      );
    const score = this.percent(health.steps, plan.stepsTarget);
    return {
      score,
      status: this.statusFromScore(score),
      planned: { stepsTarget: plan.stepsTarget },
      actual: { steps: health.steps },
      notes: [],
    };
  }

  private compareMeditation(
    plan: HealthPlanDay,
    entries: RangeSources['meditationByDate'] extends Map<string, infer V>
      ? V
      : never,
    isFinal: boolean,
  ): DomainComparison {
    const targetMinutes = plan.meditation.durationMinutes;
    if (!targetMinutes)
      return {
        score: null,
        status: 'not_applicable',
        planned: plan.meditation,
        actual: entries,
        notes: [],
      };
    if (!entries.length) return this.untracked(plan.meditation, [], isFinal);
    const completed = entries.filter(
      (entry) => entry.status === MeditationStatus.COMPLETED,
    );
    const actualMinutes = completed.reduce(
      (total, entry) => total + (entry.actualDurationMinutes ?? 0),
      0,
    );
    const score = this.percent(actualMinutes, targetMinutes);
    return {
      score,
      status: this.statusFromScore(score),
      planned: plan.meditation,
      actual: {
        completedSessions: completed.length,
        actualMinutes,
        sessions: entries.map((entry) => ({
          title: entry.title,
          type: entry.type,
          status: entry.status,
          actualDurationMinutes: entry.actualDurationMinutes,
          focusScore: entry.focusScore,
          satisfactionScore: entry.satisfactionScore,
          skippedReason: entry.skippedReason,
          abandonedReason: entry.abandonedReason,
        })),
      },
      notes: [],
    };
  }

  private compareRoutineAdherence(
    applicable: boolean,
    adherence: number | undefined,
    planned: unknown,
    actual: unknown,
    isFinal: boolean,
  ): DomainComparison {
    if (!applicable)
      return {
        score: null,
        status: 'not_applicable',
        planned,
        actual,
        notes: [],
      };
    if (typeof adherence !== 'number')
      return this.untracked(planned, actual, isFinal);
    const score = this.clampPercent(adherence);
    return {
      score,
      status: this.statusFromScore(score),
      planned,
      actual,
      notes: [],
    };
  }

  private scoreDomains(
    domains: Record<string, DomainComparison>,
    isFinal: boolean,
  ) {
    const applicable = Object.values(domains).filter(
      (domain) => domain.status !== 'not_applicable',
    );
    const observed = applicable.filter(
      (domain) => typeof domain.score === 'number',
    );
    const scoringValues = isFinal
      ? applicable.map((domain) => domain.score ?? 0)
      : observed.map((domain) => domain.score as number);
    return {
      overall: scoringValues.length ? this.average(scoringValues) : 0,
      coverage: applicable.length
        ? this.clampPercent((observed.length / applicable.length) * 100)
        : 100,
    };
  }

  private async buildAndSyncTasks(
    plan: HealthPlanDay,
    existingTasks: HealthRoutineTask[],
  ): Promise<HealthRoutineTask[]> {
    const existingByKey = new Map(
      (existingTasks ?? []).map((task) => [task.key, task]),
    );
    const now = new Date();
    const notificationPreferences = await this.ensureNotificationPreferences();
    const definitions: Array<{
      key: string;
      domain: string;
      label: string;
      detail: string;
      scheduledTime: string;
    }> = [];
    const add = (
      suffix: string,
      domain: string,
      label: string,
      detail = '',
      scheduledTime = '',
    ) => {
      if (!label.trim()) return;
      definitions.push({
        key: `health:${plan.dateKey}:${suffix}`,
        domain,
        label: label.trim(),
        detail: detail.trim(),
        scheduledTime: scheduledTime.trim(),
      });
    };

    if (plan.morningConditioning?.durationMinutes > 0) {
      add(
        'morning-conditioning',
        'training',
        `${plan.morningConditioning.durationMinutes} min ${plan.morningConditioning.type || 'morning walk/run/jog'}`,
        `${plan.morningConditioning.intensity} · ${plan.morningConditioning.notes}`.trim(),
        plan.morningConditioning.when || '07:00',
      );
    }

    const trainingDetail = [
      plan.training.exercises?.length
        ? `${plan.training.exercises.length} exercises`
        : '',
      plan.training.durationMinutes
        ? `${plan.training.durationMinutes} min`
        : '',
      plan.training.cardio?.durationMinutes
        ? `${plan.training.cardio.durationMinutes} min cardio`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    add(
      'training',
      'training',
      plan.training.exercises?.length || plan.training.cardio?.durationMinutes
        ? plan.training.title || 'Complete today’s training'
        : 'Follow today’s recovery / rest plan',
      trainingDetail,
      plan.training.when || '19:00',
    );

    if (plan.normalWalk?.durationMinutes > 0) {
      add(
        'normal-walk',
        'training',
        `${plan.normalWalk.durationMinutes} min normal walk`,
        `${plan.normalWalk.intensity} · ${plan.normalWalk.notes}`.trim(),
        plan.normalWalk.when || '20:30',
      );
    }

    for (const [index, meal] of (plan.nutrition.meals ?? []).entries()) {
      add(
        `nutrition-meal-${index}`,
        'nutrition',
        meal.label || `Meal ${index + 1}`,
        meal.guidance,
        meal.time,
      );
    }
    if (plan.nutrition.hydrationLitres > 0) {
      add(
        'nutrition-hydration',
        'nutrition',
        `Reach ${plan.nutrition.hydrationLitres} L hydration`,
        plan.nutrition.focus,
      );
    }
    if (plan.stepsTarget > 0) {
      add('steps', 'steps', `Reach ${plan.stepsTarget.toLocaleString()} steps`);
    }
    if (plan.meditation.durationMinutes > 0) {
      add(
        'meditation',
        'meditation',
        `${plan.meditation.durationMinutes} min ${plan.meditation.type || 'meditation'}`,
        plan.meditation.intention,
        plan.meditation.when,
      );
    }
    for (const [index, item] of (plan.supplementSchedule ?? []).entries()) {
      add(
        `supplement-${index}`,
        'supplements',
        item,
        'Use the configured owner-approved schedule only.',
      );
    }
    for (const [index, item] of (
      plan.nutrition.performanceNutrition ?? []
    ).entries()) {
      if (
        item.status === 'pending_approval' ||
        item.status === 'review_required'
      ) {
        add(
          `performance-nutrition-review-${index}`,
          'supplements',
          `${item.status === 'pending_approval' ? 'Review / buy' : 'Review'}: ${item.item || item.category.replaceAll('_', ' ')}`,
          item.guidance,
          item.when,
        );
      }
    }
    if (plan.skincare.morning?.length) {
      add(
        'skincare-am',
        'skincare',
        'Morning skincare',
        plan.skincare.morning.join(' → '),
        'morning',
      );
    }
    if (plan.skincare.evening?.length) {
      add(
        'skincare-pm',
        'skincare',
        'Evening skincare',
        plan.skincare.evening.join(' → '),
        'evening',
      );
    }
    if (plan.skincare.other?.length) {
      add(
        'skincare-other',
        'skincare',
        'Other skincare step',
        plan.skincare.other.join(' → '),
      );
    }
    if (plan.bodyCare?.morning?.length) {
      add(
        'body-care-am',
        'bodycare',
        'Morning body care',
        plan.bodyCare.morning.join(' → '),
        'morning',
      );
    }
    if (plan.bodyCare?.evening?.length) {
      add(
        'body-care-pm',
        'bodycare',
        'Evening body care',
        plan.bodyCare.evening.join(' → '),
        'evening',
      );
    }
    if (plan.bodyCare?.other?.length) {
      add(
        'body-care-other',
        'bodycare',
        'Other body-care step',
        plan.bodyCare.other.join(' → '),
      );
    }
    if (plan.haircare.routine?.length || plan.haircare.washDay) {
      add(
        'haircare',
        'haircare',
        plan.haircare.washDay ? 'Haircare + wash day' : 'Haircare routine',
        plan.haircare.routine.join(' → '),
      );
    }
    if (plan.intimateCare.routine?.length) {
      add(
        'intimate-care',
        'intimateCare',
        'Private care routine',
        plan.intimateCare.routine.join(' → '),
      );
    }
    for (const [index, item] of (plan.labFollowUps ?? []).entries()) {
      const dueTime = item.dueAt
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: TIMEZONE,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(item.dueAt))
        : '09:00';
      add(
        `lab-follow-up-${index}`,
        'lab',
        `Lab follow-up: ${item.testName}`,
        item.reason || 'Repeat test/follow-up from uploaded report.',
        dueTime,
      );
    }

    if (plan.sleep.targetHours > 0) {
      add(
        'sleep',
        'sleep',
        `Target ${plan.sleep.targetHours} h sleep`,
        [plan.sleep.bedtimeWindow, plan.sleep.wakeWindow]
          .filter(Boolean)
          .join(' · '),
        plan.sleep.bedtimeWindow,
      );
    }
    if (plan.checkIns?.length) {
      add(
        'check-in',
        'checkIn',
        'Complete daily Health check-in',
        plan.checkIns.join(' · '),
      );
    }

    const keys = definitions.map((item) => item.key);
    const globalTasks = keys.length
      ? await this.taskModel
          .find({
            source: TaskSource.HSAKAA,
            sourceExternalId: { $in: keys },
            isArchived: false,
          })
          .lean()
          .exec()
      : [];
    const globalByKey = new Map(
      globalTasks.map((task) => [task.sourceExternalId ?? '', task]),
    );
    const tasks: HealthRoutineTask[] = [];

    for (const definition of definitions) {
      const previous = existingByKey.get(definition.key);
      const global = globalByKey.get(definition.key);
      const status = resolveHealthRoutineTaskStatus(previous, global?.status);
      const effectiveTime = this.effectiveTaskTime(
        definition.key,
        definition.domain,
        definition.scheduledTime,
        definition.label,
        notificationPreferences,
      );
      const dueAt = this.taskDueAt(plan.dateKey, effectiveTime);
      const reminderAt = this.taskReminderAt(
        plan.dateKey,
        definition.key,
        definition.domain,
        effectiveTime,
        status,
        notificationPreferences,
      );
      const globalTask = await this.taskModel
        .findOneAndUpdate(
          {
            source: TaskSource.HSAKAA,
            sourceExternalId: definition.key,
            isArchived: false,
          },
          {
            $set: {
              title: definition.label,
              description: definition.detail,
              status: this.globalTaskStatus(status),
              priority: TaskPriority.MEDIUM,
              area: 'health',
              dueAt,
              reminderAt,
              source: TaskSource.HSAKAA,
              sourceExternalId: definition.key,
              tags: ['health', 'routine', definition.domain.toLowerCase()],
              metadata: {
                healthDateKey: plan.dateKey,
                healthTaskKey: definition.key,
                healthDomain: definition.domain,
                planVersion: plan.version,
              },
              isActive: true,
              isArchived: false,
              completedAt:
                status === HealthRoutineTaskStatus.COMPLETED
                  ? (global?.completedAt ?? previous?.completedAt ?? now)
                  : undefined,
              cancelledAt:
                status === HealthRoutineTaskStatus.SKIPPED
                  ? (global?.cancelledAt ?? now)
                  : undefined,
            },
            $setOnInsert: {
              recurrence: { enabled: false, interval: 1 },
              memoryIds: [],
              isFavourite: false,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();

      tasks.push({
        ...definition,
        status,
        source: previous?.source ?? (global ? 'task' : 'plan'),
        globalTaskId: globalTask?._id?.toString() ?? '',
        completedAt:
          status === HealthRoutineTaskStatus.COMPLETED
            ? (globalTask?.completedAt ?? previous?.completedAt ?? now)
            : undefined,
        updatedAt: previous?.updatedAt ?? now,
      });
    }

    await this.taskModel
      .updateMany(
        {
          source: TaskSource.HSAKAA,
          area: 'health',
          sourceExternalId: {
            $regex: `^health:${plan.dateKey}:`,
            ...(keys.length ? { $nin: keys } : {}),
          },
          status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          isArchived: false,
        },
        { $set: { status: TaskStatus.CANCELLED, cancelledAt: now } },
      )
      .exec();

    return tasks;
  }

  private applyTaskFallbacks(
    domains: Record<string, DomainComparison>,
    tasks: HealthRoutineTask[],
    isFinal: boolean,
  ) {
    const domainMap: Record<string, string[]> = {
      training: ['training'],
      nutrition: ['nutrition'],
      sleep: ['sleep'],
      steps: ['steps'],
      meditation: ['meditation'],
      supplements: ['supplements'],
      skincare: ['skincare'],
      haircare: ['haircare'],
      intimateCare: ['intimateCare'],
    };
    for (const [domainKey, taskDomains] of Object.entries(domainMap)) {
      const current = domains[domainKey];
      if (!current || current.status !== 'untracked') continue;
      const relevant = tasks.filter((task) =>
        taskDomains.includes(task.domain),
      );
      if (!relevant.length) continue;
      const tracked = relevant.filter(
        (task) => task.status !== HealthRoutineTaskStatus.PENDING,
      );
      if (!tracked.length && !isFinal) continue;
      const denominator = isFinal ? relevant.length : tracked.length;
      if (!denominator) continue;
      const completed = relevant.filter(
        (task) => task.status === HealthRoutineTaskStatus.COMPLETED,
      ).length;
      const score = this.clampPercent((completed / denominator) * 100);
      domains[domainKey] = {
        ...current,
        score,
        status: this.statusFromScore(score),
        actual: {
          source: 'health_routine_tasks',
          completed,
          tracked: tracked.length,
          total: relevant.length,
          tasks: relevant,
        },
        notes: [
          ...current.notes,
          'Structured actuals were unavailable, so owner task completion was used as the execution signal.',
        ],
      };
    }
    return domains;
  }

  private scoreTasks(tasks: HealthRoutineTask[]) {
    if (!tasks.length) return { completion: 100, coverage: 100 };
    const completed = tasks.filter(
      (task) => task.status === HealthRoutineTaskStatus.COMPLETED,
    ).length;
    const tracked = tasks.filter(
      (task) => task.status !== HealthRoutineTaskStatus.PENDING,
    ).length;
    return {
      completion: this.clampPercent((completed / tasks.length) * 100),
      coverage: this.clampPercent((tracked / tasks.length) * 100),
    };
  }

  private extractAutomaticMetrics(
    health: RangeSources['healthByDate'] extends Map<string, infer V>
      ? V | null
      : never,
  ): AutomaticHealthMetrics {
    return {
      sources: (health?.sources ?? []).map(String),
      weightKg: health?.bodyMeasurement?.weightKg ?? null,
      heightCm: health?.bodyMeasurement?.heightCm ?? null,
      maximumHeartRateBpm: health?.bodyMeasurement?.maximumHeartRateBpm ?? null,
      recoveryScore: health?.recovery?.recoveryScore ?? null,
      strainScore: health?.strainScore ?? null,
      sleepHours: health?.sleep?.durationHours ?? null,
      sleepNeedMinutes: health?.sleep?.sleepNeedMinutes ?? null,
      sleepDebtMinutes: health?.sleep?.sleepDebtMinutes ?? null,
      sleepPerformancePercentage:
        health?.sleep?.sleepPerformancePercentage ?? null,
      sleepEfficiencyPercentage:
        health?.sleep?.sleepEfficiencyPercentage ?? null,
      sleepConsistencyPercentage:
        health?.sleep?.sleepConsistencyPercentage ?? null,
      restingHeartRateBpm: health?.recovery?.restingHeartRateBpm ?? null,
      heartRateVariabilityMs: health?.recovery?.heartRateVariabilityMs ?? null,
      bloodOxygenPercentage: health?.recovery?.bloodOxygenPercentage ?? null,
      skinTemperatureCelsius: health?.recovery?.skinTemperatureCelsius ?? null,
      respiratoryRateBreathsPerMinute:
        health?.recovery?.respiratoryRateBreathsPerMinute ?? null,
      steps: health?.steps ?? null,
      totalCaloriesBurned: health?.totalCaloriesBurned ?? null,
    };
  }

  private healthTaskStatus(status: TaskStatus): HealthRoutineTaskStatus {
    if (status === TaskStatus.COMPLETED)
      return HealthRoutineTaskStatus.COMPLETED;
    if (status === TaskStatus.CANCELLED) return HealthRoutineTaskStatus.SKIPPED;
    return HealthRoutineTaskStatus.PENDING;
  }

  private globalTaskStatus(status: HealthRoutineTaskStatus): TaskStatus {
    if (status === HealthRoutineTaskStatus.COMPLETED)
      return TaskStatus.COMPLETED;
    if (status === HealthRoutineTaskStatus.SKIPPED) return TaskStatus.CANCELLED;
    return TaskStatus.TODO;
  }

  private async ensureNotificationPreferences() {
    return this.notificationPreferencesModel
      .findOneAndUpdate(
        { ownerKey: 'owner' },
        {
          $setOnInsert: { ownerKey: 'owner', isActive: true },
          $set: { importantAlertsEnabled: true },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }

  private effectiveTaskTime(
    key: string,
    domain: string,
    scheduledTime: string,
    label: string,
    preferences: HealthNotificationPreferences,
  ) {
    const explicit =
      this.normalizeClockTime(scheduledTime) ?? this.normalizeClockTime(label);
    if (explicit) return explicit;
    const lower = scheduledTime.toLowerCase();
    if (domain === 'training') return preferences.defaultWorkoutTime;
    if (domain === 'lab') return '09:00';
    if (domain === 'meditation') {
      if (lower.includes('morning')) return '08:00';
      if (lower.includes('evening') || lower.includes('night')) return '21:00';
    }
    if (key.endsWith('skincare-am')) return '08:00';
    if (key.endsWith('skincare-pm')) return '22:00';
    if (domain === 'haircare' || domain === 'intimateCare') return '21:30';
    if (domain === 'checkIn') return '21:15';
    if (domain === 'sleep') {
      return this.normalizeClockTime(scheduledTime) ?? '23:00';
    }
    return scheduledTime;
  }

  private taskReminderAt(
    dateKey: string,
    key: string,
    domain: string,
    scheduledTime: string,
    status: HealthRoutineTaskStatus,
    preferences: HealthNotificationPreferences,
  ) {
    if (status !== HealthRoutineTaskStatus.PENDING) return null;
    const enabled =
      domain === 'training'
        ? preferences.workoutRemindersEnabled
        : domain === 'nutrition'
          ? preferences.mealRemindersEnabled
          : domain === 'supplements'
            ? preferences.supplementRemindersEnabled
            : domain === 'meditation'
              ? preferences.meditationRemindersEnabled
              : domain === 'skincare'
                ? preferences.skincareRemindersEnabled
                : domain === 'haircare'
                  ? preferences.haircareRemindersEnabled
                  : domain === 'intimateCare'
                    ? preferences.intimateCareRemindersEnabled
                    : domain === 'sleep'
                      ? preferences.sleepRemindersEnabled
                      : domain === 'lab'
                        ? preferences.importantAlertsEnabled
                        : false;
    if (!enabled) return null;

    const time = this.normalizeClockTime(scheduledTime);
    if (!time) return null;
    const dueAt = this.dateAtIstTime(dateKey, time);
    const leadMinutes =
      domain === 'training'
        ? preferences.workoutLeadMinutes
        : domain === 'sleep'
          ? preferences.sleepLeadMinutes
          : 0;
    const reminderAt = new Date(
      dueAt.getTime() - Math.max(0, leadMinutes) * 60_000,
    );
    if (
      this.isQuietTime(
        reminderAt,
        preferences.quietHoursStart,
        preferences.quietHoursEnd,
      )
    ) {
      return null;
    }
    return reminderAt;
  }

  private normalizeClockTime(value: string) {
    const text = value.trim();
    if (!text) return null;
    const twentyFour = text.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
    if (twentyFour) {
      return `${String(twentyFour[1]).padStart(2, '0')}:${twentyFour[2]}`;
    }
    const twelveHour = text.match(
      /(?:^|\s)(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)(?:\s|$)/i,
    );
    if (!twelveHour) return null;
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3].toLowerCase() === 'pm') hour += 12;
    return `${String(hour).padStart(2, '0')}:${twelveHour[2] ?? '00'}`;
  }

  private dateAtIstTime(dateKey: string, time: string) {
    return new Date(`${dateKey}T${time}:00+05:30`);
  }

  private isQuietTime(date: Date, start: string, end: string) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const current = formatter.format(date);
    if (start === end) return false;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
  }

  private taskDueAt(dateKey: string, scheduledTime: string) {
    const match = scheduledTime.match(
      /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/,
    );
    const time = match
      ? `${String(match[1]).padStart(2, '0')}:${match[2]}:00`
      : '23:59:00';
    return new Date(`${dateKey}T${time}+05:30`);
  }

  private untracked(
    planned: unknown,
    actual: unknown,
    isFinal: boolean,
  ): DomainComparison {
    return {
      score: null,
      status: 'untracked',
      planned,
      actual,
      notes: [
        isFinal
          ? 'No completed actual was recorded for this planned domain.'
          : 'Actual data has not been recorded yet.',
      ],
    };
  }

  private statusFromScore(score: number): DomainStatus {
    if (score >= 90) return 'met';
    if (score >= 50) return 'partial';
    return 'missed';
  }

  private normalizeFeedback(
    dto: UpsertHealthExecutionFeedbackDto,
  ): HealthPlanExecutionFeedback {
    return {
      energyScore: dto.energyScore,
      fatigueScore: dto.fatigueScore,
      sorenessScore: dto.sorenessScore,
      stressScore: dto.stressScore,
      hungerScore: dto.hungerScore,
      planDifficultyScore: dto.planDifficultyScore,
      smoking: {
        status: dto.smokingStatus ?? HealthSubstanceUseStatus.UNTRACKED,
        quantity:
          dto.smokingStatus === HealthSubstanceUseStatus.YES
            ? dto.smokingQuantity
            : undefined,
        unit: dto.smokingUnit?.trim() ?? '',
        type: dto.smokingType?.trim() ?? '',
      },
      alcohol: {
        status: dto.alcoholStatus ?? HealthSubstanceUseStatus.UNTRACKED,
        quantity:
          dto.alcoholStatus === HealthSubstanceUseStatus.YES
            ? dto.alcoholQuantity
            : undefined,
        unit: dto.alcoholUnit?.trim() ?? '',
        type: dto.alcoholType?.trim() ?? '',
      },
      whatWorked: this.cleanStrings(dto.whatWorked),
      blockers: this.cleanStrings(dto.blockers),
      requestedChanges: this.cleanStrings(dto.requestedChanges),
      notes: dto.notes?.trim() ?? '',
      submittedAt: new Date(),
    };
  }

  private emptyFeedback(): HealthPlanExecutionFeedback {
    return {
      smoking: {
        status: HealthSubstanceUseStatus.UNTRACKED,
        unit: '',
        type: '',
      },
      alcohol: {
        status: HealthSubstanceUseStatus.UNTRACKED,
        unit: '',
        type: '',
      },
      whatWorked: [],
      blockers: [],
      requestedChanges: [],
      notes: '',
    };
  }

  private resolveReviewPeriod(
    periodType: HealthPlanReviewPeriod,
    anchorDateKey: string,
  ) {
    const today = this.getIstDateKey();
    if (periodType === HealthPlanReviewPeriod.WEEKLY) {
      const anchorNoon = new Date(`${anchorDateKey}T12:00:00+05:30`);
      const daysFromMonday = (anchorNoon.getUTCDay() + 6) % 7;
      const startDateKey = this.addDays(anchorDateKey, -daysFromMonday);
      const naturalEnd = this.addDays(startDateKey, 6);
      const endDateKey = naturalEnd > today ? today : naturalEnd;
      return {
        periodType,
        periodKey: `week-${startDateKey}`,
        startDateKey,
        endDateKey,
      };
    }
    const month = anchorDateKey.slice(0, 7);
    const startDateKey = `${month}-01`;
    const nextMonth = new Date(`${startDateKey}T12:00:00+05:30`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const naturalEnd = this.addDays(this.getIstDateKey(nextMonth), -1);
    const endDateKey = naturalEnd > today ? today : naturalEnd;
    return {
      periodType,
      periodKey: `month-${month}`,
      startDateKey,
      endDateKey,
    };
  }

  private reviewInstructions(periodType: HealthPlanReviewPeriod) {
    return [
      `You are HSAKAA reviewing the owner's ${periodType} Health execution against the generated plan.`,
      'Use only the supplied plan-vs-actual comparisons, owner feedback and active goals.',
      'Separate execution problems from plan-design problems. If tracking coverage is poor, say that evidence is incomplete rather than inventing conclusions.',
      'Identify repeated blockers, unrealistic scheduling, recovery problems, pain signals, nutrition adherence patterns and routine consistency.',
      'Recommended changes may adjust normal training structure, meal practicality, recovery, meditation and routine scheduling.',
      'Do not diagnose a condition. Do not start/stop medication. Do not change prescription medication or supplement doses/timing.',
      'Do not silently replace skincare/haircare/intimate-care products. Recommend review where evidence supports it.',
      'Target progress must distinguish measured progress from adherence/process progress.',
      'Safety flags should be conservative and recommend clinician/physio/dietitian/dermatologist review when appropriate without making a diagnosis.',
      'Next actions should be concrete and useful for the next rolling-plan refresh.',
    ].join('\n');
  }

  private normalizeExerciseName(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private cleanStrings(values?: string[]) {
    return (values ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  private percent(actual: number, target: number) {
    if (!target) return 100;
    return this.clampPercent((actual / target) * 100);
  }

  private clampPercent(value: number) {
    return Number(Math.min(100, Math.max(0, value)).toFixed(1));
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return Number(
      (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(
        1,
      ),
    );
  }

  private dateKeyFromUnknown(value: unknown) {
    const date = value instanceof Date ? value : new Date(String(value));
    return this.getIstDateKey(date);
  }

  private getIstDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private addDays(dateKey: string, days: number) {
    const date = new Date(`${dateKey}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate() + days);
    return this.getIstDateKey(date);
  }

  private dateFromKey(dateKey: string) {
    return new Date(`${dateKey}T00:00:00+05:30`);
  }

  private assertDateKey(value: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(this.dateFromKey(value).getTime())
    )
      throw new BadRequestException('Invalid Health progress date.');
  }

  private compactJson(value: unknown, maxChars: number) {
    const json = JSON.stringify(value);
    return json.length <= maxChars ? json : json.slice(0, maxChars);
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
