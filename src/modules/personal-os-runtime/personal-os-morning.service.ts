import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { HsakaaBriefService } from '../../hsakaa/hsakaa-brief.service';
import { HealthProactiveService } from '../health/health-proactive.service';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { ProactiveService } from '../proactive/proactive.service';
import { RemindersService } from '../reminders/reminders.service';
import { RunPersonalOsMorningDto } from './dto/run-personal-os-morning.dto';
import { PersonalOsRuntimeService } from './personal-os-runtime.service';
import {
  PersonalOsMorningRun,
  PersonalOsMorningRunDocument,
} from './schemas/personal-os-morning-run.schema';
import { PersonalOsRuntimeRunStatus } from './schemas/personal-os-runtime-run.schema';

type StageStatus = 'completed' | 'skipped' | 'warning' | 'failed';

type MorningStageResult = {
  status: StageStatus;
  changed: boolean;
  changeCount: number;
  message: string;
  metadata: Record<string, unknown>;
};

type MorningStage = {
  id: string;
  label: string;
  status: StageStatus;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  changed: boolean;
  changeCount: number;
  message: string;
  metadata: Record<string, unknown>;
};

type MorningOptions = {
  syncWhoop: boolean;
  allowHealthAdaptation: boolean;
  allowAi: boolean;
  forceBrief: boolean;
  maxEmbeddings: number;
};

@Injectable()
export class PersonalOsMorningService {
  constructor(
    @InjectModel(PersonalOsMorningRun.name)
    private readonly runModel: Model<PersonalOsMorningRunDocument>,
    private readonly runtime: PersonalOsRuntimeService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
    private readonly healthProactive: HealthProactiveService,
    private readonly reminders: RemindersService,
    private readonly proactive: ProactiveService,
    private readonly brief: HsakaaBriefService,
  ) {}

  async getStatus() {
    const [latestRun, activeLeases, runtimeStatus] = await Promise.all([
      this.runModel.findOne({}).sort({ startedAt: -1 }).lean().exec(),
      this.runtimeLeases.getActiveLeases(),
      this.runtime.getStatus(),
    ]);
    const activeRun = activeLeases.find(
      (lease) => lease.key === 'personal-os:morning-run',
    );

    return {
      running: Boolean(activeRun),
      activeRun: activeRun
        ? {
            acquiredAt: activeRun.acquiredAt,
            expiresAt: activeRun.expiresAt,
          }
        : null,
      latestRun: latestRun ?? null,
      automationEnabled: runtimeStatus.automationEnabled,
      mode: 'manual' as const,
      defaults: {
        syncWhoop: true,
        allowHealthAdaptation: true,
        allowAi: true,
        forceBrief: false,
        maxEmbeddings: 100,
      },
      safeguards: [
        'Step 2 remains manual while the morning sequence is being proven.',
        'Safe Health adaptation still obeys the Health autonomy policy.',
        'Medication remains non-autonomous and professional instructions remain locked.',
        'A cached HSAKAA brief is reused when morning evidence did not materially change.',
        'Consequential Proactive HSAKAA actions still require owner confirmation.',
      ],
      generatedAt: new Date(),
    };
  }

  async listRuns(limit = 10) {
    const safeLimit = Math.min(50, Math.max(1, Math.round(limit || 10)));
    const runs = await this.runModel
      .find({})
      .sort({ startedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec();
    return { runs, count: runs.length, generatedAt: new Date() };
  }

  async run(dto: RunPersonalOsMorningDto = {}) {
    const options: MorningOptions = {
      syncWhoop: dto.syncWhoop !== false,
      allowHealthAdaptation: dto.allowHealthAdaptation !== false,
      allowAi: dto.allowAi !== false,
      forceBrief: dto.forceBrief === true,
      maxEmbeddings: Math.min(
        500,
        Math.max(1, Math.round(dto.maxEmbeddings ?? 100)),
      ),
    };
    const lease = await this.runtimeLeases.acquire(
      'personal-os:morning-run',
      60 * 60_000,
      { mode: 'morning_manual', allowAi: options.allowAi },
    );
    if (!lease) {
      return {
        started: false,
        skipped: true,
        reason: 'another_morning_run_is_active',
        status: await this.getStatus(),
      };
    }

    const runId = randomUUID();
    const startedAt = new Date();
    const stages: MorningStage[] = [];
    const snapshot: Record<string, unknown> = {};
    let meaningfulChanges = 0;

    await this.runModel.create({
      runId,
      mode: 'morning_manual',
      status: PersonalOsRuntimeRunStatus.RUNNING,
      requestedAt: startedAt,
      startedAt,
      options,
      stages: [],
      snapshot: {},
      summary: {},
    });

    try {
      const runtimeRefresh = await this.stage(
        'runtime-refresh',
        'Runtime refresh',
        async () => {
          const result = await this.runtime.run({
            syncWhoop: options.syncWhoop,
            allowHealthAdaptation: options.allowHealthAdaptation,
            allowAi: options.allowAi,
            maxEmbeddings: options.maxEmbeddings,
          });
          if (!result.started) {
            return this.warning(
              'The full Personal OS refresh was already running, so the morning loop used current stored state.',
              { reason: result.reason ?? 'runtime_refresh_not_started' },
            );
          }

          const runtimeRun = this.asRecord(result.run);
          const runtimeSummary = this.asRecord(runtimeRun.summary);
          const changes = this.readNumber(runtimeSummary, 'meaningfulChanges');
          meaningfulChanges += changes;
          snapshot.runtime = {
            runId: this.readString(runtimeRun, 'runId'),
            status: this.readString(runtimeRun, 'status'),
            summary: this.compact(runtimeSummary),
          };
          const runtimeStatus = this.readString(runtimeRun, 'status');
          if (runtimeStatus === PersonalOsRuntimeRunStatus.FAILED) {
            return this.failed(
              'The Personal OS runtime refresh failed; morning output may be stale.',
              { runtimeRunId: this.readString(runtimeRun, 'runId') },
            );
          }
          if (runtimeStatus === PersonalOsRuntimeRunStatus.PARTIAL) {
            return this.warning(
              'The Personal OS runtime refresh completed partially; morning output was still assembled from the available current state.',
              {
                runtimeRunId: this.readString(runtimeRun, 'runId'),
                runtimeSummary: this.compact(runtimeSummary),
              },
            );
          }
          const runtimeWarnings = this.readNumber(runtimeSummary, 'warnings');
          if (runtimeWarnings > 0) {
            return this.warning(
              `Personal OS current truth refreshed with ${runtimeWarnings} warning(s) that still need attention.`,
              {
                runtimeRunId: this.readString(runtimeRun, 'runId'),
                runtimeSummary: this.compact(runtimeSummary),
              },
            );
          }
          return this.completed(
            changes
              ? `Personal OS current truth refreshed with ${changes} recorded change(s).`
              : 'Personal OS current truth refreshed with no recorded changes.',
            changes,
            {
              runtimeRunId: this.readString(runtimeRun, 'runId'),
              runtimeSummary: this.compact(runtimeSummary),
            },
          );
        },
      );
      stages.push(runtimeRefresh);
      await this.persist(runId, stages, snapshot);

      const morningState = await this.stage(
        'morning-state',
        'Morning state',
        async () => {
          const [health, reminders, proactive] = await Promise.all([
            this.healthProactive.getMorningBrief(),
            this.reminders.getToday(),
            this.proactive.getDashboard(),
          ]);
          const healthRecord = this.asRecord(health);
          const attention = Array.isArray(healthRecord.attention)
            ? healthRecord.attention
            : [];
          const tasks = Array.isArray(healthRecord.tasks)
            ? healthRecord.tasks
            : [];
          const remindersRecord = this.asRecord(reminders);
          const due = Array.isArray(remindersRecord.due)
            ? remindersRecord.due
            : [];
          const upcoming = Array.isArray(remindersRecord.upcoming)
            ? remindersRecord.upcoming
            : [];
          const proactiveRecord = this.asRecord(proactive);
          const proactiveSummary = this.asRecord(proactiveRecord.summary);

          snapshot.health = this.compact(health);
          snapshot.reminders = {
            due: due.length,
            upcoming: upcoming.length,
          };
          snapshot.proactive = {
            totalOpen: this.readNumber(proactiveSummary, 'totalOpen'),
            highPriority: this.readNumber(proactiveSummary, 'highPriority'),
            activeNow: this.readNumber(proactiveSummary, 'activeNow'),
          };

          return this.completed(
            `Morning state assembled with ${tasks.length} Health task(s), ${attention.length} Health attention item(s), and ${due.length} due reminder(s).`,
            0,
            {
              healthTasks: tasks.length,
              healthAttention: attention.length,
              dueReminders: due.length,
              upcomingReminders: upcoming.length,
              proactiveHighPriority: this.readNumber(
                proactiveSummary,
                'highPriority',
              ),
            },
          );
        },
      );
      stages.push(morningState);
      await this.persist(runId, stages, snapshot);

      const hsakaaBrief = await this.stage(
        'hsakaa-brief',
        'HSAKAA morning brief',
        async () => {
          if (!options.allowAi) {
            return this.skipped(
              'AI is off for this morning run, so HSAKAA Daily Brief generation was skipped.',
            );
          }

          let result = await this.brief.getToday();
          const initial = this.asRecord(result);
          const generatedAt = this.readDate(initial, 'generatedAt');
          const shouldRefresh =
            initial.cached === true &&
            (options.forceBrief ||
              (meaningfulChanges > 0 &&
                (!generatedAt || generatedAt.getTime() < startedAt.getTime())));
          if (shouldRefresh) {
            result = await this.brief.refreshToday();
          }

          const briefRecord = this.asRecord(result);
          const content = this.asRecord(briefRecord.content);
          const priorities = Array.isArray(content.priorities)
            ? content.priorities
            : [];
          snapshot.brief = this.compact(result);
          const refreshed = shouldRefresh || briefRecord.cached === false;
          return this.completed(
            refreshed
              ? 'HSAKAA generated a fresh morning brief from the reconciled Personal OS state.'
              : 'HSAKAA reused today’s current cached brief because no material morning refresh was needed.',
            refreshed ? 1 : 0,
            {
              cached: briefRecord.cached === true,
              refreshed,
              headline: this.readString(content, 'headline'),
              priorities: priorities.length,
            },
          );
        },
      );
      stages.push(hsakaaBrief);
      meaningfulChanges += hsakaaBrief.changeCount;
      await this.persist(runId, stages, snapshot);

      const packageStage = await this.stage(
        'morning-package',
        'Morning package',
        () => {
          const health = this.asRecord(snapshot.health);
          const plan = this.asRecord(health.plan);
          const tasks = Array.isArray(health.tasks) ? health.tasks : [];
          const attention = Array.isArray(health.attention)
            ? health.attention
            : [];
          const reminders = this.asRecord(snapshot.reminders);
          const proactive = this.asRecord(snapshot.proactive);
          const briefRecord = this.asRecord(snapshot.brief);
          const content = this.asRecord(briefRecord.content);
          const packageSummary = {
            dateKey: this.readString(health, 'dateKey'),
            planReady: Object.keys(plan).length > 0,
            healthTasks: tasks.length,
            healthAttention: attention.length,
            dueReminders: this.readNumber(reminders, 'due'),
            proactiveHighPriority: this.readNumber(proactive, 'highPriority'),
            headline: this.readString(content, 'headline'),
            taskCompletionPercentage: this.readNumber(
              health,
              'taskCompletionPercentage',
            ),
          };
          snapshot.package = packageSummary;

          if (!packageSummary.planReady) {
            return this.warning(
              'Morning package is available, but today does not have an active Health plan day yet.',
              packageSummary,
            );
          }
          return this.completed(
            'Morning package is ready for the owner: current Health plan, tasks, reminders, attention, and HSAKAA brief are aligned.',
            0,
            packageSummary,
          );
        },
      );
      stages.push(packageStage);
      await this.persist(runId, stages, snapshot);

      const failures = stages.filter(
        (stage) => stage.status === 'failed',
      ).length;
      const warnings = stages.filter(
        (stage) => stage.status === 'warning',
      ).length;
      const completedAt = new Date();
      const status = failures
        ? PersonalOsRuntimeRunStatus.PARTIAL
        : PersonalOsRuntimeRunStatus.COMPLETED;
      const summary = {
        completed: stages.filter((stage) => stage.status === 'completed')
          .length,
        skipped: stages.filter((stage) => stage.status === 'skipped').length,
        warnings,
        failures,
        meaningfulChanges,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };
      const saved = await this.runModel
        .findOneAndUpdate(
          { runId },
          { $set: { status, stages, snapshot, summary, completedAt } },
          { new: true },
        )
        .lean()
        .exec();
      return { started: true, run: saved };
    } catch (error) {
      const completedAt = new Date();
      const message = this.errorMessage(error);
      const saved = await this.runModel
        .findOneAndUpdate(
          { runId },
          {
            $set: {
              status: PersonalOsRuntimeRunStatus.FAILED,
              stages,
              snapshot,
              completedAt,
              error: message,
              summary: {
                completed: stages.filter(
                  (stage) => stage.status === 'completed',
                ).length,
                skipped: stages.filter((stage) => stage.status === 'skipped')
                  .length,
                warnings: stages.filter((stage) => stage.status === 'warning')
                  .length,
                failures:
                  stages.filter((stage) => stage.status === 'failed').length +
                  1,
                meaningfulChanges,
                durationMs: completedAt.getTime() - startedAt.getTime(),
              },
            },
          },
          { new: true },
        )
        .lean()
        .exec();
      return { started: true, run: saved };
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  private async stage(
    id: string,
    label: string,
    execute: () => MorningStageResult | Promise<MorningStageResult>,
  ): Promise<MorningStage> {
    const startedAt = new Date();
    try {
      const result = await execute();
      const completedAt = new Date();
      return {
        id,
        label,
        ...result,
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };
    } catch (error) {
      const completedAt = new Date();
      return {
        id,
        label,
        status: 'failed',
        startedAt,
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
        changed: false,
        changeCount: 0,
        message: this.errorMessage(error),
        metadata: {},
      };
    }
  }

  private completed(
    message: string,
    changeCount = 0,
    metadata: Record<string, unknown> = {},
  ) {
    return {
      status: 'completed' as const,
      changed: changeCount > 0,
      changeCount,
      message,
      metadata,
    };
  }

  private skipped(message: string, metadata: Record<string, unknown> = {}) {
    return {
      status: 'skipped' as const,
      changed: false,
      changeCount: 0,
      message,
      metadata,
    };
  }

  private warning(message: string, metadata: Record<string, unknown> = {}) {
    return {
      status: 'warning' as const,
      changed: false,
      changeCount: 0,
      message,
      metadata,
    };
  }

  private failed(message: string, metadata: Record<string, unknown> = {}) {
    return {
      status: 'failed' as const,
      changed: false,
      changeCount: 0,
      message,
      metadata,
    };
  }

  private async persist(
    runId: string,
    stages: MorningStage[],
    snapshot: Record<string, unknown>,
  ) {
    await this.runModel
      .updateOne({ runId }, { $set: { stages, snapshot } })
      .exec();
  }

  private compact(
    value: unknown,
    depth = 0,
    seen: WeakSet<object> = new WeakSet<object>(),
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 2000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value;
    if (typeof value !== 'object') return undefined;
    if (depth >= 7) return '[truncated]';
    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .slice(0, 30)
        .map((item) => this.compact(item, depth + 1, seen));
    }

    const record = value as Record<string, unknown>;
    const mongooseDocument = record._doc;
    if (
      mongooseDocument !== null &&
      mongooseDocument !== undefined &&
      typeof mongooseDocument === 'object'
    ) {
      return this.compact(mongooseDocument, depth + 1, seen);
    }

    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !key.startsWith('$'))
        .slice(0, 50)
        .map(([key, item]) => [key, this.compact(item, depth + 1, seen)]),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: Record<string, unknown>, key: string) {
    const item = value[key];
    return typeof item === 'string' ? item : null;
  }

  private readNumber(value: Record<string, unknown>, key: string) {
    const item = value[key];
    return typeof item === 'number' && Number.isFinite(item) ? item : 0;
  }

  private readDate(value: Record<string, unknown>, key: string) {
    const item = value[key];
    if (item instanceof Date) return item;
    if (typeof item !== 'string') return null;
    const parsed = new Date(item);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown morning loop error.';
  }
}
