/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';

import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeDirection,
  KnowledgeGraphEdgeDocument,
  KnowledgeGraphEdgeType,
} from './schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeDocument,
  KnowledgeGraphNodeType,
  KnowledgeGraphPrivacy,
} from './schemas/knowledge-graph-node.schema';

type HealthDoc = Record<string, any> & {
  _id: { toString(): string } | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type HealthNodeInput = {
  nodeKey: string;
  type: KnowledgeGraphNodeType.HEALTH;
  sourceCollection: string;
  sourceId: string;
  label: string;
  summary?: string;
  aliases: string[];
  tags: string[];
  importance: number;
  privacy: KnowledgeGraphPrivacy.OWNER_ONLY;
  occurredAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  metadata: Record<string, unknown>;
  searchText: string;
};

type HealthEdgeInput = {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  type: KnowledgeGraphEdgeType;
  label?: string;
  strength: number;
  direction: KnowledgeGraphEdgeDirection.DIRECTED;
  evidence: Array<{
    sourceCollection: string;
    sourceId: string;
    fieldPath?: string;
    note?: string;
    occurredAt?: Date;
  }>;
  occurredAt?: Date;
  metadata: Record<string, unknown>;
  isDerived: boolean;
};

const INTEGRATION_VERSION = 'health-cross-system-v2-closed-loop';
const FRESHNESS_MINUTES = 10;

export const ADVANCED_HEALTH_GRAPH_COLLECTIONS = [
  'health_baselines',
  'health_goals',
  'health_strategies',
  'health_plan_days',
  'health_plan_executions',
  'health_plan_reviews',
  'health_attention_items',
  'health_owner_updates',
  'health_progress_photos',
  'health_source_reports',
  'health_interventions',
  'health_evidence_settings',
] as const;

@Injectable()
export class HealthKnowledgeGraphIntegrationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(KnowledgeGraphNode.name)
    private readonly nodeModel: Model<KnowledgeGraphNodeDocument>,
    @InjectModel(KnowledgeGraphEdge.name)
    private readonly edgeModel: Model<KnowledgeGraphEdgeDocument>,
  ) {}

  async ensureFresh(maxAgeMinutes = FRESHNESS_MINUTES) {
    const latest = await this.nodeModel
      .findOne({
        isActive: true,
        'metadata.integrationVersion': INTEGRATION_VERSION,
      })
      .sort({ lastSyncedAt: -1 })
      .select({ lastSyncedAt: 1 })
      .lean()
      .exec();

    const cutoff = Date.now() - maxAgeMinutes * 60_000;
    if (
      latest?.lastSyncedAt &&
      new Date(latest.lastSyncedAt).getTime() >= cutoff
    ) {
      return { refreshed: false, lastSyncedAt: latest.lastSyncedAt };
    }

    const result = await this.sync();
    return { refreshed: true, lastSyncedAt: result.syncedAt };
  }

  async sync() {
    const syncedAt = new Date();
    const source = await this.loadSource();
    const nodes = this.buildNodes(source);
    const nodeBySource = new Map(
      nodes.map((node) => [
        `${node.sourceCollection}:${node.sourceId}`,
        node.nodeKey,
      ]),
    );
    const edges = this.buildEdges(source, nodeBySource);

    if (nodes.length) {
      await this.nodeModel.bulkWrite(
        nodes.map((node) => ({
          updateOne: {
            filter: {
              sourceCollection: node.sourceCollection,
              sourceId: node.sourceId,
            },
            update: {
              $set: {
                ...node,
                lastSyncedAt: syncedAt,
                isActive: true,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const activeNodeKeys = nodes.map((node) => node.nodeKey);
    await this.nodeModel.updateMany(
      {
        sourceCollection: { $in: [...ADVANCED_HEALTH_GRAPH_COLLECTIONS] },
        ...(activeNodeKeys.length ? { nodeKey: { $nin: activeNodeKeys } } : {}),
      },
      { $set: { isActive: false, lastSyncedAt: syncedAt } },
    );

    if (edges.length) {
      await this.edgeModel.bulkWrite(
        edges.map((edge) => ({
          updateOne: {
            filter: { edgeKey: edge.edgeKey },
            update: {
              $set: {
                ...edge,
                lastSyncedAt: syncedAt,
                isActive: true,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const activeEdgeKeys = edges.map((edge) => edge.edgeKey);
    await this.edgeModel.updateMany(
      {
        'metadata.integrationVersion': { $regex: '^health-cross-system-v' },
        ...(activeEdgeKeys.length ? { edgeKey: { $nin: activeEdgeKeys } } : {}),
      },
      { $set: { isActive: false, lastSyncedAt: syncedAt } },
    );

    return {
      syncedAt,
      nodes: nodes.length,
      edges: edges.length,
      countsByCollection: Object.fromEntries(
        ADVANCED_HEALTH_GRAPH_COLLECTIONS.map((collection) => [
          collection,
          nodes.filter((node) => node.sourceCollection === collection).length,
        ]),
      ),
    };
  }

  private async loadSource(): Promise<Record<string, HealthDoc[]>> {
    const [
      baselines,
      goals,
      strategies,
      planDays,
      executions,
      reviews,
      attention,
      ownerUpdates,
      photos,
      reports,
      interventions,
      evidenceSettings,
      healthEntries,
      healthTasks,
    ] = await Promise.all([
      this.find('health_baselines', { isActive: true }, 20),
      this.find('health_goals', { isActive: true }, 250),
      this.find('health_strategies', { isActive: true }, 50),
      this.find('health_plan_days', { isActive: true }, 365),
      this.find('health_plan_executions', { isActive: true }, 365),
      this.find('health_plan_reviews', { isActive: true }, 100),
      this.find('health_attention_items', { isActive: true }, 250),
      this.find('health_owner_updates', { isActive: true }, 250),
      this.find('health_progress_photos', { isActive: true }, 250, {
        data: 0,
      }),
      this.find('health_source_reports', { isActive: true }, 150, { data: 0 }),
      this.find('health_interventions', { isActive: true }, 250),
      this.find('health_evidence_settings', { isActive: true }, 20),
      this.find('health_entries', { isActive: true, isArchived: false }, 365),
      this.find(
        'tasks',
        { isActive: true, isArchived: false, area: 'health' },
        1500,
      ),
    ]);

    return {
      health_baselines: baselines,
      health_goals: goals,
      health_strategies: strategies,
      health_plan_days: planDays,
      health_plan_executions: executions,
      health_plan_reviews: reviews,
      health_attention_items: attention,
      health_owner_updates: ownerUpdates,
      health_progress_photos: photos,
      health_source_reports: reports,
      health_interventions: interventions,
      health_evidence_settings: evidenceSettings,
      health_entries: healthEntries,
      tasks: healthTasks,
    };
  }

  private async find(
    collection: string,
    filter: Record<string, unknown>,
    limit: number,
    projection?: Record<string, 0 | 1>,
  ): Promise<HealthDoc[]> {
    try {
      return (await this.connection
        .collection(collection)
        .find(filter, projection ? { projection } : undefined)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray()) as HealthDoc[];
    } catch {
      return [];
    }
  }

  private buildNodes(source: Record<string, HealthDoc[]>): HealthNodeInput[] {
    const nodes: HealthNodeInput[] = [];

    for (const baseline of source.health_baselines ?? []) {
      nodes.push(
        this.node('health_baselines', baseline, 'Health baseline', {
          summary: this.joinText([
            baseline.currentLookSummary,
            baseline.expectationSummary,
            ...(baseline.reportNotes ?? []),
          ]),
          tags: this.strings([
            'baseline',
            baseline.onboardingCompleted ? 'onboarding_complete' : 'onboarding',
          ]),
          importance: baseline.onboardingCompleted ? 0.95 : 0.82,
          occurredAt:
            this.date(baseline.lastReviewedAt) ?? this.date(baseline.updatedAt),
          metadata: {
            onboardingCompleted: Boolean(baseline.onboardingCompleted),
            onboardingCompletedAt: baseline.onboardingCompletedAt ?? null,
            lastReviewedAt: baseline.lastReviewedAt ?? null,
            reviewVersion: baseline.reviewVersion ?? 1,
            body: this.pick(baseline.body, [
              'weightKg',
              'heightCm',
              'waistCm',
              'bodyFatPercent',
            ]),
            lifestyle: this.pick(baseline.lifestyle, [
              'averageSleepHours',
              'averageSteps',
              'stressLevel',
            ]),
          },
        }),
      );
    }

    for (const goal of source.health_goals ?? []) {
      const target = this.joinText([
        goal.currentValue != null ? `Current ${String(goal.currentValue)}` : '',
        goal.targetValue != null ? `Target ${String(goal.targetValue)}` : '',
        goal.unit,
      ]);
      nodes.push(
        this.node(
          'health_goals',
          goal,
          this.clean(goal.title) || 'Health goal',
          {
            summary: this.joinText([target, goal.successCriteria, goal.notes]),
            tags: this.strings([
              'goal',
              goal.category,
              goal.status,
              goal.horizonMode,
            ]),
            importance: this.clamp(
              0.72 + Math.min(0.22, Number(goal.priority ?? 1) * 0.04),
            ),
            occurredAt: this.date(goal.updatedAt),
            validTo: this.date(goal.targetDate),
            metadata: {
              category: goal.category ?? null,
              status: goal.status ?? null,
              currentValue: goal.currentValue ?? null,
              targetValue: goal.targetValue ?? null,
              unit: goal.unit ?? null,
              horizonMode: goal.horizonMode ?? null,
              targetDate: goal.targetDate ?? null,
              relativeMonths: goal.relativeMonths ?? null,
              priority: goal.priority ?? null,
            },
          },
        ),
      );
    }

    for (const strategy of source.health_strategies ?? []) {
      nodes.push(
        this.node('health_strategies', strategy, 'HSAKAA Health strategy', {
          summary: this.joinText([
            strategy.summary,
            ...(strategy.priorities ?? []),
            strategy.trainingStrategy,
            strategy.nutritionStrategy,
            strategy.recoveryStrategy,
            strategy.meditationStrategy,
            strategy.skinStrategy,
            strategy.hairStrategy,
            strategy.intimateCareStrategy,
            ...(strategy.safetyEscalations ?? []),
          ]),
          tags: this.strings(['strategy', ...(strategy.priorities ?? [])]),
          importance: 0.93,
          occurredAt:
            this.date(strategy.generatedAt) ?? this.date(strategy.updatedAt),
          metadata: {
            version: strategy.version ?? null,
            generatedAt: strategy.generatedAt ?? null,
            safetyEscalations: strategy.safetyEscalations ?? [],
            measurementPlan: strategy.measurementPlan ?? [],
          },
        }),
      );
    }

    for (const plan of source.health_plan_days ?? []) {
      const dateKey = this.clean(plan.dateKey) || this.id(plan._id);
      nodes.push(
        this.node('health_plan_days', plan, `Health plan · ${dateKey}`, {
          summary: this.joinText([
            plan.focus,
            plan.rationale,
            plan.training?.title,
            plan.training?.type,
            plan.nutrition?.focus,
            ...(plan.signals ?? []),
            ...(plan.guardrails ?? []),
          ]),
          tags: this.strings([
            'plan',
            plan.status,
            plan.recoveryMode ? 'recovery_mode' : '',
            plan.training?.type,
            plan.training?.intensity,
          ]),
          importance: plan.status === 'planned' ? 0.8 : 0.68,
          occurredAt: this.date(plan.date),
          metadata: {
            dateKey: plan.dateKey ?? null,
            status: plan.status ?? null,
            lockedByOwner: Boolean(plan.lockedByOwner),
            recoveryMode: Boolean(plan.recoveryMode),
            trainingTitle: plan.training?.title ?? null,
            trainingType: plan.training?.type ?? null,
            stepsTarget: plan.stepsTarget ?? null,
            version: plan.version ?? null,
          },
        }),
      );
    }

    for (const execution of source.health_plan_executions ?? []) {
      const dateKey = this.clean(execution.dateKey) || this.id(execution._id);
      const smoking = execution.feedback?.smoking;
      const alcohol = execution.feedback?.alcohol;
      nodes.push(
        this.node(
          'health_plan_executions',
          execution,
          `Health execution · ${dateKey}`,
          {
            summary: this.joinText([
              execution.adherence != null
                ? `Adherence ${String(execution.adherence)}`
                : '',
              execution.trackingCoverage != null
                ? `Tracking coverage ${String(execution.trackingCoverage)}`
                : '',
              ...(execution.feedback?.whatWorked ?? []),
              ...(execution.feedback?.blockers ?? []),
              ...(execution.feedback?.requestedChanges ?? []),
              execution.feedback?.notes,
              smoking?.status === 'yes'
                ? `Smoking ${smoking.quantity ?? ''} ${smoking.unit ?? ''} ${smoking.type ?? ''}`
                : '',
              alcohol?.status === 'yes'
                ? `Alcohol ${alcohol.quantity ?? ''} ${alcohol.unit ?? ''} ${alcohol.type ?? ''}`
                : '',
            ]),
            tags: this.strings([
              'execution',
              execution.isFinal ? 'final' : 'live',
              smoking?.status === 'yes' ? 'smoking' : '',
              alcohol?.status === 'yes' ? 'alcohol' : '',
            ]),
            importance: execution.isFinal ? 0.78 : 0.68,
            occurredAt: this.date(execution.date),
            metadata: {
              dateKey: execution.dateKey ?? null,
              planVersion: execution.planVersion ?? null,
              adherence: execution.adherence ?? null,
              trackingCoverage: execution.trackingCoverage ?? null,
              taskCompletion: execution.taskCompletion ?? null,
              smoking: smoking ?? null,
              alcohol: alcohol ?? null,
              computedAt: execution.computedAt ?? null,
            },
          },
        ),
      );
    }

    for (const review of source.health_plan_reviews ?? []) {
      const period = this.clean(review.periodKey) || this.id(review._id);
      nodes.push(
        this.node(
          'health_plan_reviews',
          review,
          `Health ${review.periodType ?? 'progress'} review · ${period}`,
          {
            summary: this.joinText([
              review.summary,
              ...(review.wins ?? []),
              ...(review.misses ?? []),
              ...(review.blockers ?? []),
              ...(review.recommendedChanges ?? []),
              ...(review.safetyFlags ?? []),
              ...(review.nextActions ?? []),
            ]),
            tags: this.strings([
              'review',
              review.periodType,
              ...(review.safetyFlags?.length ? ['safety_flag'] : []),
            ]),
            importance: review.periodType === 'monthly' ? 0.92 : 0.86,
            occurredAt:
              this.date(review.generatedAt) ?? this.date(review.updatedAt),
            metadata: {
              periodType: review.periodType ?? null,
              periodKey: review.periodKey ?? null,
              startDateKey: review.startDateKey ?? null,
              endDateKey: review.endDateKey ?? null,
              targetProgress: review.targetProgress ?? [],
              safetyFlags: review.safetyFlags ?? [],
              version: review.version ?? null,
            },
          },
        ),
      );
    }

    for (const item of source.health_attention_items ?? []) {
      const priority = this.clean(item.priority) || 'info';
      const importance: Record<string, number> = {
        professional_review: 0.99,
        important: 0.95,
        review: 0.9,
        action: 0.82,
        info: 0.65,
      };
      nodes.push(
        this.node(
          'health_attention_items',
          item,
          this.clean(item.title) || 'Health attention',
          {
            summary: this.joinText([item.message, item.action]),
            tags: this.strings([
              'attention',
              item.priority,
              item.status,
              item.domain,
              item.sourceType,
            ]),
            importance: importance[priority] ?? 0.7,
            occurredAt:
              this.date(item.lastSeenAt) ?? this.date(item.firstSeenAt),
            metadata: {
              key: item.key ?? null,
              priority: item.priority ?? null,
              status: item.status ?? null,
              domain: item.domain ?? null,
              sourceType: item.sourceType ?? null,
              sourceKey: item.sourceKey ?? null,
              action: item.action ?? null,
              evidence: item.evidence ?? [],
            },
          },
        ),
      );
    }

    for (const update of source.health_owner_updates ?? []) {
      nodes.push(
        this.node(
          'health_owner_updates',
          update,
          `Health update · ${this.clean(update.domain) || 'general'}`,
          {
            summary: this.clean(update.update),
            tags: this.strings(['owner_update', update.domain]),
            importance: 0.88,
            occurredAt:
              this.date(update.effectiveAt) ?? this.date(update.createdAt),
            metadata: {
              domain: update.domain ?? null,
              effectiveAt: update.effectiveAt ?? null,
            },
          },
        ),
      );
    }

    for (const photo of source.health_progress_photos ?? []) {
      nodes.push(
        this.node(
          'health_progress_photos',
          photo,
          `${this.title(photo.category)} progress photo · ${this.clean(photo.angle) || 'checkpoint'}`,
          {
            summary: this.joinText([
              photo.analysis?.summary,
              ...(photo.analysis?.observations ?? []),
              ...(photo.analysis?.improvementOpportunities ?? []),
              photo.analysis?.comparison?.changeSummary,
              ...(photo.analysis?.comparison?.visibleChanges ?? []),
              ...(photo.analysis?.safetyFlags ?? []),
            ]),
            tags: this.strings([
              'progress_photo',
              photo.category,
              photo.angle,
              ...(photo.analysis?.safetyFlags?.length ? ['safety_flag'] : []),
            ]),
            importance: photo.analysis?.safetyFlags?.length ? 0.92 : 0.7,
            occurredAt: this.date(photo.takenAt),
            metadata: {
              category: photo.category ?? null,
              angle: photo.angle ?? null,
              takenAt: photo.takenAt ?? null,
              comparison: photo.analysis?.comparison ?? null,
              safetyFlags: photo.analysis?.safetyFlags ?? [],
              analyzedAt: photo.analyzedAt ?? null,
            },
          },
        ),
      );
    }

    for (const report of source.health_source_reports ?? []) {
      nodes.push(
        this.node(
          'health_source_reports',
          report,
          this.clean(report.label) || 'Health report',
          {
            summary: this.joinText([
              report.analysis?.summary,
              ...(report.analysis?.findings ?? []),
              ...(report.analysis?.planningImplications ?? []),
              ...(report.analysis?.professionalInstructions ?? []),
              ...(report.analysis?.safetyFlags ?? []),
              ...this.array(report.analysis?.structuredMeasurements).map(
                (measurement) => {
                  const item = measurement as Record<string, unknown>;
                  const name = this.valueText(item.name) || 'measurement';
                  const value = this.valueText(item.value);
                  const unit = this.valueText(item.unit);
                  const referenceRange = this.valueText(item.referenceRange);
                  const flag = this.valueText(item.flag);
                  return `${name} ${value} ${unit} ${
                    referenceRange ? `reference ${referenceRange}` : ''
                  } ${flag}`;
                },
              ),
            ]),
            tags: this.strings([
              'health_report',
              ...(report.analysis?.safetyFlags?.length ? ['safety_flag'] : []),
              ...(report.analysis?.professionalInstructions?.length
                ? ['professional_instruction']
                : []),
            ]),
            importance:
              report.analysis?.safetyFlags?.length ||
              report.analysis?.professionalInstructions?.length
                ? 0.98
                : 0.86,
            occurredAt:
              this.date(report.reportDate) ?? this.date(report.createdAt),
            metadata: {
              reportDate: report.reportDate ?? null,
              measurements: report.analysis?.structuredMeasurements ?? [],
              professionalInstructions:
                report.analysis?.professionalInstructions ?? [],
              safetyFlags: report.analysis?.safetyFlags ?? [],
              analyzedAt: report.analyzedAt ?? null,
            },
          },
        ),
      );
    }

    for (const intervention of source.health_interventions ?? []) {
      const dateKey =
        this.clean(intervention.dateKey) || this.id(intervention._id);
      nodes.push(
        this.node(
          'health_interventions',
          intervention,
          `Health intervention · ${dateKey}`,
          {
            summary: this.joinText([
              intervention.rationale,
              intervention.changeSummary,
              intervention.followUpSummary,
            ]),
            tags: this.strings([
              'intervention',
              intervention.type,
              intervention.status,
            ]),
            importance: 0.9,
            occurredAt:
              this.date(intervention.appliedAt) ??
              this.date(intervention.createdAt),
            metadata: {
              key: intervention.key ?? null,
              type: intervention.type ?? null,
              dateKey: intervention.dateKey ?? null,
              status: intervention.status ?? null,
              followUpDueAt: intervention.followUpDueAt ?? null,
              followedUpAt: intervention.followedUpAt ?? null,
            },
          },
        ),
      );
    }

    for (const settings of source.health_evidence_settings ?? []) {
      nodes.push(
        this.node(
          'health_evidence_settings',
          settings,
          'Health evidence & autonomy policy',
          {
            summary: this.joinText([
              `Source priority: ${this.strings([settings.sourcePriority]).join(
                ' → ',
              )}`,
              `Training ${settings.autonomy?.training ?? 'unknown'}`,
              `Supplements ${settings.autonomy?.supplements ?? 'unknown'}`,
              `Medication ${settings.autonomy?.medication ?? 'unknown'}`,
              `Professional instructions ${settings.autonomy?.professionalInstructions ?? 'unknown'}`,
            ]),
            tags: this.strings([
              'health_governance',
              'autonomy',
              'source_priority',
            ]),
            importance: 0.96,
            occurredAt: this.date(settings.updatedAt),
            metadata: {
              sourcePriority: settings.sourcePriority ?? [],
              autonomy: settings.autonomy ?? {},
              baselineRefreshDays: settings.baselineRefreshDays ?? null,
              bodyPhotoRefreshDays: settings.bodyPhotoRefreshDays ?? null,
              skinPhotoRefreshDays: settings.skinPhotoRefreshDays ?? null,
              hairPhotoRefreshDays: settings.hairPhotoRefreshDays ?? null,
              reportFreshnessDays: settings.reportFreshnessDays ?? null,
            },
          },
        ),
      );
    }

    return nodes;
  }

  private buildEdges(
    source: Record<string, HealthDoc[]>,
    nodeBySource: Map<string, string>,
  ): HealthEdgeInput[] {
    const edges = new Map<string, HealthEdgeInput>();
    const add = (
      sourceCollection: string,
      sourceDoc: HealthDoc | undefined,
      targetCollection: string,
      targetDoc: HealthDoc | undefined,
      type: KnowledgeGraphEdgeType,
      label: string,
      strength = 0.85,
    ) => {
      if (!sourceDoc || !targetDoc) return;
      const sourceId = this.id(sourceDoc._id);
      const targetId = this.id(targetDoc._id);
      const sourceKey = this.resolveGraphNodeKey(
        sourceCollection,
        sourceId,
        nodeBySource,
      );
      const targetKey = this.resolveGraphNodeKey(
        targetCollection,
        targetId,
        nodeBySource,
      );
      if (!sourceKey || !targetKey || sourceKey === targetKey) return;
      const edgeKey = `${INTEGRATION_VERSION}:${type}:${sourceKey}>${targetKey}:${this.normalize(label).slice(0, 80)}`;
      edges.set(edgeKey, {
        edgeKey,
        sourceNodeKey: sourceKey,
        targetNodeKey: targetKey,
        type,
        label,
        strength,
        direction: KnowledgeGraphEdgeDirection.DIRECTED,
        evidence: [
          {
            sourceCollection,
            sourceId,
            note: label,
            occurredAt: this.recordDate(sourceDoc),
          },
        ],
        occurredAt: this.recordDate(sourceDoc),
        metadata: { integrationVersion: INTEGRATION_VERSION },
        isDerived: true,
      });
    };

    const baseline = (source.health_baselines ?? [])[0];
    const strategy = (source.health_strategies ?? [])[0];
    const settings = (source.health_evidence_settings ?? [])[0];
    const activeGoals = (source.health_goals ?? []).filter(
      (goal) => !goal.status || goal.status === 'active',
    );

    for (const goal of activeGoals) {
      add(
        'health_goals',
        goal,
        'health_baselines',
        baseline,
        KnowledgeGraphEdgeType.RELATED_TO,
        'Goal is evaluated against the current Health baseline.',
        0.93,
      );
    }

    if (strategy) {
      add(
        'health_strategies',
        strategy,
        'health_baselines',
        baseline,
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Health strategy is derived from baseline evidence and constraints.',
        0.98,
      );
      for (const goal of activeGoals.slice(0, 25)) {
        add(
          'health_strategies',
          strategy,
          'health_goals',
          goal,
          KnowledgeGraphEdgeType.SUPPORTS,
          'Health strategy supports this active goal.',
          0.92,
        );
      }
    }

    for (const plan of source.health_plan_days ?? []) {
      add(
        'health_plan_days',
        plan,
        'health_strategies',
        strategy,
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Daily Health plan is generated from the active Health strategy.',
        0.95,
      );
      const priorReview = this.latestReviewBefore(
        source.health_plan_reviews ?? [],
        String(plan.dateKey ?? ''),
      );
      add(
        'health_plan_days',
        plan,
        'health_plan_reviews',
        priorReview,
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Future Health planning uses the latest completed execution review as learning evidence.',
        0.93,
      );
    }

    const plansByDate = new Map(
      (source.health_plan_days ?? [])
        .filter((plan) => plan.dateKey)
        .map((plan) => [String(plan.dateKey), plan]),
    );
    const executionsByDate = new Map(
      (source.health_plan_executions ?? [])
        .filter((execution) => execution.dateKey)
        .map((execution) => [String(execution.dateKey), execution]),
    );
    const healthEntriesByDate = new Map(
      (source.health_entries ?? [])
        .filter((entry) => entry.dateKey)
        .map((entry) => [String(entry.dateKey), entry]),
    );
    const tasksByDate = new Map<string, HealthDoc[]>();
    const tasksByExternalId = new Map<string, HealthDoc>();
    for (const task of source.tasks ?? []) {
      const externalId = this.clean(task.sourceExternalId);
      if (externalId) tasksByExternalId.set(externalId, task);
      const dateKey = this.clean(task.metadata?.healthDateKey);
      if (!dateKey) continue;
      const items = tasksByDate.get(dateKey) ?? [];
      items.push(task);
      tasksByDate.set(dateKey, items);
    }

    for (const execution of source.health_plan_executions ?? []) {
      const dateKey = String(execution.dateKey ?? '');
      add(
        'health_plan_executions',
        execution,
        'health_plan_days',
        plansByDate.get(dateKey),
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Execution is the plan-vs-actual record for this Health plan day.',
        1,
      );
      add(
        'health_plan_executions',
        execution,
        'health_entries',
        healthEntriesByDate.get(dateKey),
        KnowledgeGraphEdgeType.RELATED_TO,
        'Execution is evaluated alongside the same-day Health and connected-device evidence.',
        0.9,
      );
      for (const task of tasksByDate.get(dateKey) ?? []) {
        add(
          'tasks',
          task,
          'health_plan_executions',
          execution,
          KnowledgeGraphEdgeType.SUPPORTS,
          'Health task status is execution evidence for this plan-vs-actual record.',
          0.96,
        );
      }
    }

    for (const review of source.health_plan_reviews ?? []) {
      const endExecution = executionsByDate.get(
        this.valueText(review.endDateKey),
      );
      add(
        'health_plan_reviews',
        review,
        'health_plan_executions',
        endExecution,
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Health review summarizes execution evidence in this review period.',
        0.9,
      );
      add(
        'health_plan_reviews',
        review,
        'health_strategies',
        strategy,
        KnowledgeGraphEdgeType.SUPPORTS,
        'Health review informs strategy adjustment.',
        0.88,
      );
    }

    for (const update of source.health_owner_updates ?? []) {
      add(
        'health_owner_updates',
        update,
        'health_strategies',
        strategy,
        KnowledgeGraphEdgeType.SUPPORTS,
        'Owner-provided Health update has priority context for future planning.',
        0.97,
      );
    }

    for (const photo of source.health_progress_photos ?? []) {
      add(
        'health_progress_photos',
        photo,
        'health_baselines',
        baseline,
        KnowledgeGraphEdgeType.RELATED_TO,
        'Private progress-photo evidence contributes to Health progress context.',
        0.82,
      );
    }

    for (const report of source.health_source_reports ?? []) {
      add(
        'health_source_reports',
        report,
        'health_baselines',
        baseline,
        KnowledgeGraphEdgeType.RELATED_TO,
        'Uploaded report evidence contributes to the Health baseline.',
        0.95,
      );
      add(
        'health_source_reports',
        report,
        'health_strategies',
        strategy,
        KnowledgeGraphEdgeType.SUPPORTS,
        'Report findings and documented professional instructions inform Health strategy.',
        0.96,
      );
    }

    for (const intervention of source.health_interventions ?? []) {
      const dateKey = String(intervention.dateKey ?? '');
      add(
        'health_interventions',
        intervention,
        'health_plan_days',
        plansByDate.get(dateKey),
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Proactive Health intervention modifies or follows up this plan day.',
        0.94,
      );
      add(
        'health_interventions',
        intervention,
        'health_entries',
        healthEntriesByDate.get(dateKey),
        KnowledgeGraphEdgeType.DERIVED_FROM,
        'Proactive Health intervention is grounded in same-day Health and connected-device evidence.',
        0.96,
      );
      for (const task of tasksByDate.get(dateKey) ?? []) {
        add(
          'health_interventions',
          intervention,
          'tasks',
          task,
          KnowledgeGraphEdgeType.RELATED_TO,
          'The intervention changed the operational Health tasks for this day.',
          0.93,
        );
      }
      add(
        'health_plan_executions',
        executionsByDate.get(dateKey),
        'health_interventions',
        intervention,
        KnowledgeGraphEdgeType.RELATED_TO,
        'Execution and follow-up evidence evaluate this proactive Health intervention.',
        0.94,
      );
    }

    for (const item of source.health_attention_items ?? []) {
      const targetPlan = item.sourceKey
        ? plansByDate.get(String(item.sourceKey))
        : undefined;
      if (targetPlan) {
        add(
          'health_attention_items',
          item,
          'health_plan_days',
          targetPlan,
          KnowledgeGraphEdgeType.RELATED_TO,
          'Health Attention item is linked to its source plan evidence.',
          0.9,
        );
      } else {
        add(
          'health_attention_items',
          item,
          'health_baselines',
          baseline,
          KnowledgeGraphEdgeType.RELATED_TO,
          'Health Attention item belongs to the current owner-only Health context.',
          0.82,
        );
      }
      const attentionKey = this.clean(item.key);
      if (attentionKey) {
        add(
          'health_attention_items',
          item,
          'tasks',
          tasksByExternalId.get(`health:attention:${attentionKey}`),
          KnowledgeGraphEdgeType.RELATED_TO,
          'Important Health Attention is operationalized through its matching HSAKAA task/reminder.',
          0.98,
        );
      }
    }

    if (settings) {
      add(
        'health_evidence_settings',
        settings,
        'health_baselines',
        baseline,
        KnowledgeGraphEdgeType.SUPPORTS,
        'Evidence precedence and autonomy policy govern Health interpretation.',
        1,
      );
      add(
        'health_evidence_settings',
        settings,
        'health_strategies',
        strategy,
        KnowledgeGraphEdgeType.SUPPORTS,
        'Evidence precedence and autonomy policy constrain Health planning.',
        1,
      );
    }

    return [...edges.values()];
  }

  private resolveGraphNodeKey(
    collection: string,
    sourceId: string,
    nodeBySource: Map<string, string>,
  ): string | undefined {
    const integrated = nodeBySource.get(`${collection}:${sourceId}`);
    if (integrated) return integrated;
    if (collection === 'tasks') return `task:${sourceId}`;
    if (collection === 'health_entries') return `health:${sourceId}`;
    return undefined;
  }

  private latestReviewBefore(
    reviews: HealthDoc[],
    dateKey: string,
  ): HealthDoc | undefined {
    if (!dateKey) return undefined;
    return reviews
      .filter((review) => {
        const endDateKey = this.clean(review.endDateKey);
        return Boolean(endDateKey && endDateKey < dateKey);
      })
      .sort((left, right) =>
        this.clean(right.endDateKey).localeCompare(this.clean(left.endDateKey)),
      )[0];
  }

  private node(
    sourceCollection: string,
    record: HealthDoc,
    label: string,
    options: {
      summary?: string;
      tags?: string[];
      importance?: number;
      occurredAt?: Date;
      validTo?: Date;
      metadata?: Record<string, unknown>;
    },
  ): HealthNodeInput {
    const sourceId = this.id(record._id);
    const summary = this.clean(options.summary);
    const tags = this.strings(options.tags ?? []);
    const cleanLabel = this.truncate(
      this.clean(label) || 'Health evidence',
      300,
    );
    return {
      nodeKey: `health:${sourceCollection}:${sourceId}`,
      type: KnowledgeGraphNodeType.HEALTH,
      sourceCollection,
      sourceId,
      label: cleanLabel,
      summary: summary ? this.truncate(summary, 4000) : undefined,
      aliases: [],
      tags,
      importance: this.clamp(options.importance ?? 0.65),
      privacy: KnowledgeGraphPrivacy.OWNER_ONLY,
      occurredAt: options.occurredAt,
      validTo: options.validTo,
      sourceCreatedAt: this.date(record.createdAt),
      sourceUpdatedAt: this.date(record.updatedAt),
      metadata: {
        ...(options.metadata ?? {}),
        integrationVersion: INTEGRATION_VERSION,
        healthEvidence: true,
      },
      searchText: this.joinText([cleanLabel, summary, ...tags], 6000),
    };
  }

  private recordDate(record: HealthDoc): Date | undefined {
    return (
      this.date(record.effectiveAt) ??
      this.date(record.generatedAt) ??
      this.date(record.appliedAt) ??
      this.date(record.takenAt) ??
      this.date(record.reportDate) ??
      this.date(record.date) ??
      this.date(record.updatedAt) ??
      this.date(record.createdAt)
    );
  }

  private id(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (value && typeof value === 'object' && 'toString' in value) {
      const stringifier = (value as { toString?: unknown }).toString;
      if (typeof stringifier === 'function') {
        const rendered = (value as { toString(): string }).toString();
        return rendered === '[object Object]' ? '' : rendered;
      }
    }
    return '';
  }

  private date(value: unknown): Date | undefined {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value !== 'string' && typeof value !== 'number') {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalize(value: unknown): string {
    return this.clean(value).toLowerCase().replace(/\s+/g, ' ');
  }

  private array(value: unknown): unknown[] {
    return Array.isArray(value) ? (value as unknown[]) : [];
  }

  private flatten(values: unknown[]): unknown[] {
    const result: unknown[] = [];
    for (const value of values) {
      if (Array.isArray(value)) {
        result.push(...(value as unknown[]));
      } else {
        result.push(value);
      }
    }
    return result;
  }

  private strings(values: unknown[]): string[] {
    const strings = this.flatten(values)
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
    return [...new Set(strings)].slice(0, 80);
  }

  private valueText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return '';
  }

  private joinText(values: unknown[], max = 4000): string {
    const joined = this.flatten(values)
      .map((value) => this.valueText(value))
      .filter(Boolean)
      .join(' · ');
    return this.truncate(joined, max);
  }

  private truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
  }

  private title(value: unknown): string {
    const text = this.clean(value);
    return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : 'Health';
  }

  private pick(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== 'object') return {};
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      keys
        .filter((key) => source[key] != null)
        .map((key) => [key, source[key]]),
    );
  }
}
