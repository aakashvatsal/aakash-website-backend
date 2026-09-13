import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';

import {
  Task,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from '../tasks/schemas/task.schema';
import { UpdateHealthNotificationPreferencesDto } from './dto/health-proactive.dto';
import { HealthIntelligenceService } from './health-intelligence.service';
import { HealthPlannerService } from './health-planner.service';
import { HealthProgressService } from './health-progress.service';
import {
  HealthAttentionItem,
  HealthAttentionPriority,
  HealthAttentionStatus,
} from './schemas/health-attention-item.schema';
import {
  HealthIntervention,
  HealthInterventionStatus,
} from './schemas/health-intervention.schema';
import { HealthNotificationPreferences } from './schemas/health-notification-preferences.schema';
import {
  HealthPlanDay,
  HealthPlanIntensity,
} from './schemas/health-plan-day.schema';

const TIMEZONE = 'Asia/Kolkata';
const DEFAULT_OWNER_KEY = 'owner';

@Injectable()
export class HealthProactiveService {
  private readonly logger = new Logger(HealthProactiveService.name);

  constructor(
    private readonly intelligenceService: HealthIntelligenceService,
    private readonly progressService: HealthProgressService,
    private readonly plannerService: HealthPlannerService,
    @InjectModel(HealthNotificationPreferences.name)
    private readonly preferencesModel: Model<HealthNotificationPreferences>,
    @InjectModel(HealthAttentionItem.name)
    private readonly attentionModel: Model<HealthAttentionItem>,
    @InjectModel(HealthIntervention.name)
    private readonly interventionModel: Model<HealthIntervention>,
    @InjectModel(HealthPlanDay.name)
    private readonly planModel: Model<HealthPlanDay>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<Task>,
  ) {}

  async getPreferences() {
    return this.ensurePreferences();
  }

  async updatePreferences(dto: UpdateHealthNotificationPreferencesDto) {
    const update = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    const preferences = await this.preferencesModel
      .findOneAndUpdate(
        { ownerKey: DEFAULT_OWNER_KEY },
        {
          $set: { ...update, importantAlertsEnabled: true, isActive: true },
          $setOnInsert: { ownerKey: DEFAULT_OWNER_KEY },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
    const window = await this.plannerService.getWindow(7).catch(() => null);
    if (window?.days?.length) {
      await this.progressService.syncPlanTasksForDates(
        window.days.map((day) => day.dateKey),
      );
    }
    await this.syncMorningBriefTask();
    return preferences;
  }

  async getMorningBrief() {
    const today = this.getIstDateKey();
    const [
      progress,
      intelligence,
      window,
      attention,
      preferences,
      interventions,
    ] = await Promise.all([
      this.progressService.getDaily(today).catch(() => null),
      this.intelligenceService.getIntelligence(30),
      this.plannerService.getWindow(7).catch(() => null),
      this.listAttention(HealthAttentionStatus.OPEN, 10),
      this.ensurePreferences(),
      this.interventionModel
        .find({ isActive: true, dateKey: today })
        .sort({ appliedAt: -1 })
        .lean()
        .exec(),
    ]);
    const day = window?.days?.find((item) => item.dateKey === today) ?? null;
    return {
      dateKey: today,
      generatedAt: new Date().toISOString(),
      preferences,
      automaticMetrics: progress?.automaticMetrics ?? null,
      plan: day,
      tasks: progress?.tasks ?? [],
      taskCompletionPercentage: progress?.taskCompletionPercentage ?? 0,
      headline: intelligence.headline,
      observations: intelligence.cards.slice(0, 5),
      goals: intelligence.goals.slice(0, 4),
      attention: attention.items.slice(0, 5),
      interventions,
      changedOvernight: interventions.map((item) => item.changeSummary),
    };
  }

  async listAttention(status = HealthAttentionStatus.OPEN, limit = 50) {
    await this.syncAttention();
    const items = await this.attentionModel
      .find({ isActive: true, status })
      .sort({ priority: -1, lastSeenAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean()
      .exec();
    return {
      items,
      counts: await this.attentionCounts(),
    };
  }

  async resolveAttention(id: string) {
    const item = await this.attentionModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: HealthAttentionStatus.RESOLVED,
            resolvedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!item) throw new NotFoundException('Health attention item not found.');
    await this.cancelAttentionTask(item.key);
    return item;
  }

  async dismissAttention(id: string) {
    const item = await this.attentionModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: HealthAttentionStatus.DISMISSED,
            dismissedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    if (!item) throw new NotFoundException('Health attention item not found.');
    await this.cancelAttentionTask(item.key);
    return item;
  }

  async listInterventions(limit = 50) {
    return this.interventionModel
      .find({ isActive: true })
      .sort({ appliedAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean()
      .exec();
  }

  async runProactive(force = false) {
    const today = this.getIstDateKey();
    const [attention, intervention, followUps] = await Promise.all([
      this.syncAttention(),
      this.applyAutomaticIntervention(today, force),
      this.followUpInterventions(today),
    ]);
    await this.syncMorningBriefTask();
    return {
      dateKey: today,
      attention,
      intervention,
      followUps,
    };
  }

  @Cron('0 45 6 * * *', { timeZone: TIMEZONE })
  async proactiveMorningCron() {
    try {
      await this.runProactive(false);
    } catch (error) {
      this.logger.warn(
        `Proactive Health run skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @Cron('0 0 7 * * *', { timeZone: TIMEZONE })
  async morningBriefCron() {
    try {
      await this.syncMorningBriefTask();
    } catch (error) {
      this.logger.warn(
        `Health morning brief reminder skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async applyAutomaticIntervention(dateKey: string, force: boolean) {
    const [progress, intelligence, current] = await Promise.all([
      this.progressService.getDaily(dateKey).catch(() => null),
      this.intelligenceService.getIntelligence(30),
      this.planModel.findOne({ dateKey, isActive: true }).lean().exec(),
    ]);
    if (!progress || !current || current.lockedByOwner) return null;

    const recovery = progress.automaticMetrics.recoveryScore;
    const sleepDebt = progress.automaticMetrics.sleepDebtMinutes;
    const criticalRecovery =
      (typeof recovery === 'number' && recovery < 30) ||
      (typeof sleepDebt === 'number' && sleepDebt >= 180);
    const lowRecovery =
      criticalRecovery ||
      (typeof recovery === 'number' && recovery < 50) ||
      (typeof sleepDebt === 'number' && sleepDebt >= 120);

    if (lowRecovery) {
      const type = criticalRecovery ? 'recovery_day' : 'reduced_training_load';
      const key = `${dateKey}:${type}`;
      const existing = await this.interventionModel
        .findOne({ key, isActive: true })
        .lean()
        .exec();
      if (existing && !force) return existing;

      const training = this.safeTrainingOverride(
        current.training,
        criticalRecovery,
      );
      const rationale = criticalRecovery
        ? 'Automatic recovery-first intervention because current recovery/sleep-debt evidence does not support a normal hard session.'
        : 'Automatic training-load reduction because recovery/sleep-debt evidence is below the threshold for normal progression.';
      const changeSummary = criticalRecovery
        ? 'Changed today to a recovery-focused session with mobility/easy cardio and removed loaded working sets.'
        : 'Reduced today’s working-set volume and capped exertion while preserving the planned movement pattern.';

      const updated = await this.planModel
        .findOneAndUpdate(
          { dateKey, isActive: true, lockedByOwner: false },
          {
            $set: {
              training,
              focus: criticalRecovery
                ? `Recovery first · ${current.focus}`
                : current.focus,
              rationale: `${current.rationale} ${rationale}`.trim(),
              generationReason: `proactive_${type}`,
              generatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { new: true, runValidators: true },
        )
        .lean()
        .exec();
      if (!updated) return null;

      const intervention = await this.interventionModel
        .findOneAndUpdate(
          { key },
          {
            $set: {
              type,
              dateKey,
              rationale,
              changeSummary,
              before: {
                recoveryScore: recovery ?? null,
                sleepDebtMinutes: sleepDebt ?? null,
                trainingIntensity: current.training.intensity,
                trainingDurationMinutes: current.training.durationMinutes,
              },
              after: {
                trainingIntensity: updated.training.intensity,
                trainingDurationMinutes: updated.training.durationMinutes,
              },
              status: HealthInterventionStatus.FOLLOW_UP_PENDING,
              appliedAt: new Date(),
              followUpDueAt: this.addDaysDate(new Date(), 1),
              isActive: true,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();
      await this.progressService.syncPlanTasksForDates([dateKey]);
      return intervention;
    }

    const lowExecution = intelligence.plateauFlags.some(
      (item) => item.key === 'execution-low',
    );
    if (lowExecution) {
      const key = `${dateKey}:simplify_plan`;
      const existing = await this.interventionModel
        .findOne({ key, isActive: true })
        .lean()
        .exec();
      if (existing && !force) return existing;
      await this.plannerService.ensureRollingWindow({
        aheadDays: 7,
        forceRefresh: true,
        refreshStale: true,
        reason: 'proactive_low_adherence_simplification',
      });
      return this.interventionModel
        .findOneAndUpdate(
          { key },
          {
            $set: {
              type: 'simplify_plan',
              dateKey,
              rationale:
                'Recent execution adherence is low enough that simplifying the plan is more useful than adding complexity.',
              changeSummary:
                'Regenerated the rolling plan with low-adherence intelligence so HSAKAA can reduce complexity and improve executability.',
              before: {},
              after: {},
              status: HealthInterventionStatus.FOLLOW_UP_PENDING,
              appliedAt: new Date(),
              followUpDueAt: this.addDaysDate(new Date(), 3),
              isActive: true,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();
    }

    return null;
  }

  private safeTrainingOverride(
    training: HealthPlanDay['training'],
    critical: boolean,
  ) {
    if (critical) {
      return {
        ...training,
        title: 'Recovery + mobility',
        type: 'recovery',
        durationMinutes: Math.min(
          35,
          Math.max(20, training.durationMinutes || 25),
        ),
        intensity: HealthPlanIntensity.REST,
        exercises: [],
        cardio: {
          ...training.cardio,
          type: training.cardio?.type || 'Easy walk / cycle',
          durationMinutes: Math.min(
            20,
            Math.max(10, training.cardio?.durationMinutes || 15),
          ),
          intensity: 'Very easy / Zone 1-2',
          notes: 'Keep effort conversational. Stop if symptoms or pain worsen.',
        },
        progressionRule:
          'No progression today. Resume progression only when recovery/pain signals support it.',
        deloadNote: 'This day is already acting as a recovery intervention.',
      };
    }
    return {
      ...training,
      durationMinutes: Math.min(training.durationMinutes, 60),
      intensity:
        training.intensity === HealthPlanIntensity.HARD
          ? HealthPlanIntensity.MODERATE
          : training.intensity,
      exercises: (training.exercises ?? []).map((exercise) => ({
        ...exercise,
        sets: Math.max(1, exercise.sets - 1),
        rir: Math.max(3, exercise.rir),
        rpe: Math.min(7.5, exercise.rpe),
        notes:
          `${exercise.notes} Auto-adjusted for recovery: keep technique clean and stop before grinding.`.trim(),
      })),
      cardio: {
        ...training.cardio,
        durationMinutes: Math.min(20, training.cardio?.durationMinutes ?? 0),
        intensity: 'Easy / Zone 2 or below',
      },
      progressionRule:
        'Hold progression today; reassess after recovery improves.',
    };
  }

  private async followUpInterventions(today: string) {
    const due = await this.interventionModel
      .find({
        isActive: true,
        status: HealthInterventionStatus.FOLLOW_UP_PENDING,
        followUpDueAt: { $lte: new Date() },
      })
      .sort({ followUpDueAt: 1 })
      .limit(20)
      .exec();
    if (!due.length) return [];
    const progress = await this.progressService
      .getDaily(today)
      .catch(() => null);
    const recovery = progress?.automaticMetrics.recoveryScore;
    const results: unknown[] = [];
    for (const item of due) {
      const beforeRecovery = this.numberFromRecord(
        item.before,
        'recoveryScore',
      );
      const improved =
        typeof recovery === 'number' &&
        typeof beforeRecovery === 'number' &&
        recovery >= beforeRecovery + 8;
      item.status = improved
        ? HealthInterventionStatus.IMPROVED
        : HealthInterventionStatus.NOT_IMPROVED;
      item.followedUpAt = new Date();
      item.followUpSummary =
        typeof recovery === 'number' && typeof beforeRecovery === 'number'
          ? improved
            ? `Recovery improved from ${Math.round(beforeRecovery)}% to ${Math.round(recovery)}% after the intervention.`
            : `Recovery is ${Math.round(recovery)}% versus ${Math.round(beforeRecovery)}% before the intervention; keep monitoring rather than assuming the intervention solved the issue.`
          : 'Follow-up evidence is incomplete; no strong conclusion was made.';
      await item.save();
      results.push(item.toObject());
    }
    return results;
  }

  private async syncAttention() {
    const intelligence = await this.intelligenceService.getIntelligence(30);
    const now = new Date();
    const candidates = [
      ...intelligence.attention.map((item) => ({
        key: item.key,
        priority: this.attentionPriority(item.key, item.severity),
        title: item.title,
        message: item.message,
        action: item.action,
        domain: this.domainFromKey(item.key),
        sourceType: 'intelligence',
        sourceKey: item.key,
        evidence: {},
      })),
      ...intelligence.goals
        .filter(
          (goal) =>
            goal.status === 'slightly_behind' || goal.status === 'off_track',
        )
        .map((goal) => ({
          key: `goal:${goal.id}:${goal.status}`,
          priority:
            goal.status === 'off_track'
              ? HealthAttentionPriority.IMPORTANT
              : HealthAttentionPriority.ACTION,
          title: `${goal.title} is ${goal.status === 'off_track' ? 'off track' : 'slightly behind'}`,
          message: goal.evidence,
          action:
            'Let HSAKAA adapt execution difficulty, nutrition/activity structure or training progression before adding more complexity.',
          domain: goal.category,
          sourceType: 'goal',
          sourceKey: goal.id,
          evidence: {
            currentValue: goal.currentValue,
            targetValue: goal.targetValue,
            progressPercentage: goal.progressPercentage,
            expectedProgressPercentage: goal.expectedProgressPercentage,
          },
        })),
    ];
    const activeKeys = candidates.map((item) => item.key);
    for (const candidate of candidates) {
      const existing = await this.attentionModel
        .findOne({ key: candidate.key })
        .lean()
        .exec();
      const status =
        !existing || !existing.isActive
          ? HealthAttentionStatus.OPEN
          : existing.status;
      const item = await this.attentionModel
        .findOneAndUpdate(
          { key: candidate.key },
          {
            $set: {
              ...candidate,
              status,
              lastSeenAt: now,
              isActive: true,
              ...(status === HealthAttentionStatus.OPEN
                ? { resolvedAt: null, dismissedAt: null }
                : {}),
            },
            $setOnInsert: { firstSeenAt: now },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        )
        .lean()
        .exec();
      if (item?.status === HealthAttentionStatus.OPEN) {
        await this.syncAttentionTask(item);
      } else if (item) {
        await this.cancelAttentionTask(item.key);
      }
    }

    const stale = await this.attentionModel
      .find({
        isActive: true,
        ...(activeKeys.length ? { key: { $nin: activeKeys } } : {}),
      })
      .lean()
      .exec();
    if (stale.length) {
      await this.attentionModel
        .updateMany(
          { _id: { $in: stale.map((item) => item._id) } },
          {
            $set: {
              isActive: false,
              status: HealthAttentionStatus.RESOLVED,
              resolvedAt: now,
            },
          },
        )
        .exec();
      await Promise.all(
        stale.map((item) => this.cancelAttentionTask(item.key)),
      );
    }
    return {
      synced: candidates.length,
      counts: await this.attentionCounts(),
    };
  }

  private async syncAttentionTask(item: HealthAttentionItem) {
    if (
      item.priority === HealthAttentionPriority.INFO ||
      item.priority === HealthAttentionPriority.ACTION
    ) {
      return;
    }
    const now = new Date();
    const externalId = `health:attention:${item.key}`;
    await this.taskModel
      .findOneAndUpdate(
        {
          source: TaskSource.HSAKAA,
          sourceExternalId: externalId,
          isArchived: false,
        },
        {
          $set: {
            title: item.title,
            description: item.message,
            status: TaskStatus.TODO,
            priority:
              item.priority === HealthAttentionPriority.PROFESSIONAL_REVIEW
                ? TaskPriority.URGENT
                : TaskPriority.HIGH,
            area: 'health',
            dueAt: now,
            source: TaskSource.HSAKAA,
            sourceExternalId: externalId,
            tags: ['health', 'attention', item.priority],
            metadata: {
              healthAttentionKey: item.key,
              healthAttentionPriority: item.priority,
              sourcePath: '/admin/health/attention',
            },
            isActive: true,
            isArchived: false,
          },
          $setOnInsert: {
            reminderAt: new Date(now.getTime() + 60_000),
            recurrence: { enabled: false, interval: 1 },
            memoryIds: [],
            isFavourite: false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  private async cancelAttentionTask(key: string) {
    await this.taskModel
      .findOneAndUpdate(
        {
          source: TaskSource.HSAKAA,
          sourceExternalId: `health:attention:${key}`,
          isArchived: false,
        },
        { $set: { status: TaskStatus.CANCELLED, cancelledAt: new Date() } },
      )
      .exec();
  }

  private async syncMorningBriefTask() {
    const preferences = await this.ensurePreferences();
    const today = this.getIstDateKey();
    const externalId = `health:morning-brief:${today}`;
    if (!preferences.morningBriefEnabled) {
      await this.taskModel
        .findOneAndUpdate(
          {
            source: TaskSource.HSAKAA,
            sourceExternalId: externalId,
            isArchived: false,
          },
          { $set: { status: TaskStatus.CANCELLED, cancelledAt: new Date() } },
        )
        .exec();
      return;
    }
    const scheduled = this.dateAtIstTime(today, preferences.morningBriefTime);
    const intelligence = await this.intelligenceService.getIntelligence(30);
    await this.taskModel
      .findOneAndUpdate(
        {
          source: TaskSource.HSAKAA,
          sourceExternalId: externalId,
          isArchived: false,
        },
        {
          $set: {
            title: 'Health morning brief',
            description: intelligence.headline,
            status: TaskStatus.TODO,
            priority: TaskPriority.MEDIUM,
            area: 'health',
            dueAt: scheduled,
            reminderAt: scheduled,
            source: TaskSource.HSAKAA,
            sourceExternalId: externalId,
            tags: ['health', 'morning-brief'],
            metadata: {
              healthBriefDateKey: today,
              sourcePath: '/admin/health',
            },
            isActive: true,
            isArchived: false,
          },
          $setOnInsert: {
            recurrence: { enabled: false, interval: 1 },
            memoryIds: [],
            isFavourite: false,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  private async ensurePreferences() {
    return this.preferencesModel
      .findOneAndUpdate(
        { ownerKey: DEFAULT_OWNER_KEY },
        {
          $setOnInsert: { ownerKey: DEFAULT_OWNER_KEY, isActive: true },
          $set: { importantAlertsEnabled: true },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();
  }

  private async attentionCounts() {
    const rows = await this.attentionModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { isActive: true, status: HealthAttentionStatus.OPEN } },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]);
    const counts: Record<string, number> = {
      info: 0,
      action: 0,
      important: 0,
      review: 0,
      professional_review: 0,
    };
    for (const row of rows) counts[row._id] = row.count;
    return counts;
  }

  private attentionPriority(key: string, severity: string) {
    if (/report-safety|photo-safety|repeated-pain/i.test(key)) {
      return HealthAttentionPriority.PROFESSIONAL_REVIEW;
    }
    if (/execution-low|plateau|sleep|recovery|hrv/i.test(key)) {
      return severity === 'attention'
        ? HealthAttentionPriority.IMPORTANT
        : HealthAttentionPriority.ACTION;
    }
    return severity === 'attention'
      ? HealthAttentionPriority.REVIEW
      : HealthAttentionPriority.ACTION;
  }

  private domainFromKey(key: string) {
    if (/sleep|hrv|recovery/i.test(key)) return 'recovery';
    if (/pain|injur/i.test(key)) return 'training';
    if (/report/i.test(key)) return 'reports';
    if (/photo|skin|hair/i.test(key)) return 'care';
    if (/execution/i.test(key)) return 'execution';
    return 'health';
  }

  private numberFromRecord(value: Record<string, unknown>, key: string) {
    const candidate = value?.[key];
    return typeof candidate === 'number' ? candidate : null;
  }

  private getIstDateKey(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private dateAtIstTime(dateKey: string, time: string) {
    return new Date(`${dateKey}T${time}:00+05:30`);
  }

  private addDaysDate(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
