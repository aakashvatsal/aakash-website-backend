import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { ContextEngineService } from '../context-engine/context-engine.service';
import { HealthIntelligenceService } from '../health/health-intelligence.service';
import { HealthPlannerService } from '../health/health-planner.service';
import { HealthProactiveService } from '../health/health-proactive.service';
import { HealthProgressService } from '../health/health-progress.service';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { WhoopService } from '../integrations/whoop/whoop.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { ProactiveService } from '../proactive/proactive.service';
import { RemindersService } from '../reminders/reminders.service';
import { UniversalSearchService } from '../universal-search/universal-search.service';
import { RunPersonalOsDto } from './dto/run-personal-os.dto';
import { PersonalOsAutomationGateService } from './personal-os-automation-gate.service';
import {
  PersonalOsRuntimeRun,
  PersonalOsRuntimeRunDocument,
  PersonalOsRuntimeRunStatus,
} from './schemas/personal-os-runtime-run.schema';

type StageStatus = 'completed' | 'skipped' | 'warning' | 'failed';

type RuntimeStage = {
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

type RuntimeOptions = {
  syncWhoop: boolean;
  allowHealthAdaptation: boolean;
  allowAi: boolean;
  maxEmbeddings: number;
};

@Injectable()
export class PersonalOsRuntimeService {
  constructor(
    @InjectModel(PersonalOsRuntimeRun.name)
    private readonly runModel: Model<PersonalOsRuntimeRunDocument>,
    private readonly automationGate: PersonalOsAutomationGateService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
    private readonly whoop: WhoopService,
    private readonly healthPlanner: HealthPlannerService,
    private readonly healthProgress: HealthProgressService,
    private readonly healthIntelligence: HealthIntelligenceService,
    private readonly healthProactive: HealthProactiveService,
    private readonly reminders: RemindersService,
    private readonly graph: KnowledgeGraphService,
    private readonly search: UniversalSearchService,
    private readonly context: ContextEngineService,
    private readonly proactive: ProactiveService,
  ) {}

  async getStatus() {
    const [latestRun, activeLeases] = await Promise.all([
      this.runModel.findOne({}).sort({ startedAt: -1 }).lean().exec(),
      this.runtimeLeases.getActiveLeases(),
    ]);
    const gate = this.automationGate.getStatus();
    const activeRun = activeLeases.find(
      (lease) => lease.key === 'personal-os:activation-run',
    );

    return {
      ...gate,
      running: Boolean(activeRun),
      activeRun: activeRun
        ? {
            acquiredAt: activeRun.acquiredAt,
            expiresAt: activeRun.expiresAt,
          }
        : null,
      latestRun: latestRun ?? null,
      defaults: {
        syncWhoop: true,
        allowHealthAdaptation: false,
        allowAi: false,
        maxEmbeddings: 100,
      },
      safeguards: [
        'Automatic cron schedules remain disabled unless ' +
          'PERSONAL_OS_AUTOMATION_ENABLED=true.',
        'Health adaptation is opt-in during Runtime Activation V1.',
        'AI generation and semantic indexing are opt-in during Runtime Activation V1.',
        'A distributed lease prevents overlapping full Personal OS runs.',
        'Consequential Proactive OS actions still require owner confirmation.',
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

  async run(dto: RunPersonalOsDto = {}) {
    this.automationGate.applyGate();
    const options: RuntimeOptions = {
      syncWhoop: dto.syncWhoop !== false,
      allowHealthAdaptation: dto.allowHealthAdaptation === true,
      allowAi: dto.allowAi === true,
      maxEmbeddings: Math.min(
        500,
        Math.max(1, Math.round(dto.maxEmbeddings ?? 100)),
      ),
    };
    const lease = await this.runtimeLeases.acquire(
      'personal-os:activation-run',
      45 * 60_000,
      { mode: 'manual', allowAi: options.allowAi },
    );
    if (!lease) {
      return {
        started: false,
        skipped: true,
        reason: 'another_personal_os_run_is_active',
        status: await this.getStatus(),
      };
    }

    const runId = randomUUID();
    const startedAt = new Date();
    const stages: RuntimeStage[] = [];
    let meaningfulChanges = 0;
    await this.runModel.create({
      runId,
      mode: 'manual',
      status: PersonalOsRuntimeRunStatus.RUNNING,
      requestedAt: startedAt,
      startedAt,
      options,
      stages: [],
      summary: {},
    });

    try {
      const connectedData = await this.stage(
        'connected-data',
        'Connected data',
        async () => {
          const status = await this.whoop.getStatus();
          if (!options.syncWhoop) {
            return this.skipped('WHOOP sync was disabled for this run.', {
              whoopStatus: status,
            });
          }
          if (!this.isWhoopConnected(status)) {
            return this.skipped(
              'WHOOP is not connected, so connected Health sync was skipped.',
              { whoopStatus: status },
            );
          }
          const result = await this.whoop.syncRecentHealth(3);
          const changes = this.estimateChangeCount(result);
          return this.completed(
            changes
              ? `WHOOP sync completed with ${changes} recorded change(s).`
              : 'WHOOP sync completed; no explicit record changes were reported.',
            changes,
            { result: this.compact(result) },
          );
        },
      );
      stages.push(connectedData);
      meaningfulChanges += connectedData.changeCount;
      await this.persistStages(runId, stages);

      const currentTruth = await this.stage(
        'current-truth',
        'Current truth',
        async () => {
          let window = await this.healthPlanner.getWindow(7);
          const missingDays = window.coverage.missingDays;
          if (missingDays > 0 && options.allowAi) {
            window = await this.healthPlanner.ensureRollingWindow({
              aheadDays: 7,
              forceRefresh: false,
              refreshStale: false,
              reason: 'personal_os_runtime_activation',
            });
          }
          if (window.coverage.missingDays > 0) {
            return this.warning(
              [
                `${window.coverage.missingDays} Health plan day(s) are missing.`,
                `AI generation stayed ${
                  options.allowAi
                    ? 'enabled but could not fully repair coverage'
                    : 'off for this run'
                }.`,
              ].join(' '),
              {
                coverage: window.coverage,
                setup: window.setup,
              },
            );
          }
          return this.completed(
            `Health current truth is covered through ${window.coverage.throughDateKey}.`,
            0,
            { coverage: window.coverage, setup: window.setup },
          );
        },
      );
      stages.push(currentTruth);
      await this.persistStages(runId, stages);

      const intelligence = await this.stage(
        'health-intelligence',
        'Health intelligence',
        async () => {
          const result = await this.healthIntelligence.getIntelligence(30);
          return this.completed(
            'Deterministic Health intelligence refreshed from current evidence.',
            0,
            { generatedAt: this.readDateLike(result, 'generatedAt') },
          );
        },
      );
      stages.push(intelligence);
      await this.persistStages(runId, stages);

      const adaptation = await this.stage(
        'allowed-adaptations',
        'Allowed adaptations',
        async () => {
          if (!options.allowHealthAdaptation) {
            return this.skipped(
              'Safe Health adaptation is off for Runtime Activation V1. ' +
                'Turn it on explicitly when testing this stage.',
            );
          }
          const result = await this.healthProactive.runProactive(false);
          const changes = this.estimateChangeCount(result);
          return this.completed(
            changes
              ? `Health proactive reconciliation completed with ${changes} ` +
                  'recorded change(s).'
              : 'Health proactive reconciliation completed.',
            changes,
            { result: this.compact(result) },
          );
        },
      );
      stages.push(adaptation);
      meaningfulChanges += adaptation.changeCount;
      await this.persistStages(runId, stages);

      const tasksReminders = await this.stage(
        'tasks-reminders',
        'Tasks & reminders',
        async () => {
          const window = await this.healthPlanner.getWindow(7);
          const dateKeys = window.days.map((day) => day.dateKey);
          const [taskSync, reminderSync] = await Promise.all([
            this.healthProgress.syncPlanTasksForDates(dateKeys),
            this.reminders.syncUpcoming(2),
          ]);
          const changes =
            Number(reminderSync.generated ?? 0) +
            Number(reminderSync.deactivated ?? 0);
          return this.completed(
            [
              `Health tasks reconciled for ${taskSync.synced} day(s);`,
              `reminders generated ${reminderSync.generated} and`,
              `deactivated ${reminderSync.deactivated}.`,
            ].join(' '),
            changes,
            {
              planDaysSynced: taskSync.synced,
              reminders: reminderSync,
            },
          );
        },
      );
      stages.push(tasksReminders);
      meaningfulChanges += tasksReminders.changeCount;
      await this.persistStages(runId, stages);

      const graph = await this.stage(
        'knowledge-graph',
        'Knowledge Graph',
        async () => {
          const result = await this.graph.syncAll();
          return this.completed(
            `Knowledge Graph synchronized ${result.nodes} node(s) and ` +
              `${result.edges} edge(s).`,
            0,
            {
              nodes: result.nodes,
              edges: result.edges,
              countsByType: result.countsByType,
            },
          );
        },
      );
      stages.push(graph);
      await this.persistStages(runId, stages);

      const searchContext = await this.stage(
        'search-context',
        'Search & context',
        async () => {
          const before = await this.search.getIndexStatus();
          let indexResult: unknown = null;
          if (options.allowAi && before.pendingNodes > 0) {
            indexResult = await this.search.syncIndex({
              maxEmbeddings: options.maxEmbeddings,
            });
          }
          const after = await this.search.getIndexStatus();
          const contextPolicy = this.context.getPolicy();
          if (!options.allowAi && before.pendingNodes > 0) {
            return this.warning(
              [
                `${before.pendingNodes} semantic index item(s) are pending.`,
                'AI indexing is off for this run; lexical search and',
                'Context Engine remain available.',
              ].join(' '),
              {
                before,
                after,
                contextPolicyVersion: this.readString(contextPolicy, 'version'),
              },
            );
          }
          return this.completed(
            `Search/context ready at ${(after.coverage * 100).toFixed(1)}% ` +
              'semantic coverage.',
            0,
            {
              before,
              after,
              indexResult: this.compact(indexResult),
              contextPolicyVersion: this.readString(contextPolicy, 'version'),
            },
          );
        },
      );
      stages.push(searchContext);
      await this.persistStages(runId, stages);

      const proactive = await this.stage(
        'proactive',
        'Proactive HSAKAA',
        async () => {
          if (!options.allowAi) {
            return this.skipped(
              'Proactive AI evaluation is off for Runtime Activation V1.',
              { meaningfulChanges },
            );
          }
          if (meaningfulChanges === 0) {
            return this.skipped(
              'No meaningful source changes were detected, so HSAKAA did ' +
                'not spend an AI request on a proactive scan.',
              { meaningfulChanges },
            );
          }
          const result = await this.proactive.runScan({});
          const changes = this.estimateChangeCount(result);
          return this.completed(
            'Proactive HSAKAA evaluated the changed Personal OS evidence.',
            changes,
            { result: this.compact(result), meaningfulChanges },
          );
        },
      );
      stages.push(proactive);
      meaningfulChanges += proactive.changeCount;
      await this.persistStages(runId, stages);

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
          { $set: { status, stages, summary, completedAt } },
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
    execute: () => Promise<{
      status: StageStatus;
      changed: boolean;
      changeCount: number;
      message: string;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<RuntimeStage> {
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

  private async persistStages(runId: string, stages: RuntimeStage[]) {
    await this.runModel.updateOne({ runId }, { $set: { stages } }).exec();
  }

  private isWhoopConnected(status: unknown) {
    const record = this.asRecord(status);
    return Boolean(
      record.connected === true ||
      record.isConnected === true ||
      record.status === 'connected',
    );
  }

  private estimateChangeCount(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (Array.isArray(value)) {
      let total = 0;
      for (const item of value as unknown[]) {
        total += this.estimateChangeCount(item);
      }
      return total;
    }
    if (typeof value !== 'object') return 0;
    let total = 0;
    for (const [key, item] of Object.entries(value)) {
      if (
        typeof item === 'number' &&
        /(created|updated|inserted|generated|deactivated|persisted|changed|synced)$/i.test(
          key,
        )
      ) {
        total += Math.max(0, item);
      }
    }
    return total;
  }

  private compact(
    value: unknown,
    depth = 0,
    seen: WeakSet<object> = new WeakSet<object>(),
  ): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.slice(0, 1000);
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value;
    if (typeof value !== 'object') return undefined;
    if (depth >= 6) return '[truncated]';

    if (seen.has(value)) return '[circular]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value
        .slice(0, 20)
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

    const entries = Object.entries(record)
      .filter(([key]) => !key.startsWith('$'))
      .slice(0, 30);
    return Object.fromEntries(
      entries.map(([key, item]) => [key, this.compact(item, depth + 1, seen)]),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown, key: string) {
    const item = this.asRecord(value)[key];
    return typeof item === 'string' ? item : null;
  }

  private readDateLike(value: unknown, key: string) {
    const item = this.asRecord(value)[key];
    return item instanceof Date || typeof item === 'string' ? item : null;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown runtime error.';
  }
}
