/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

type ClosedLoopStatus = 'healthy' | 'active' | 'warning' | 'broken' | 'idle';
type ClosedLoopStageStatus =
  'complete' | 'waiting' | 'missing' | 'not_applicable';
type OpsCheckLevel = 'pass' | 'warning' | 'fail';
type LooseDoc = Record<string, any>;

type ClosedLoopStage = {
  id: string;
  label: string;
  status: ClosedLoopStageStatus;
  detail: string;
  occurredAt?: Date | null;
};

type ClosedLoopSnapshot = {
  id: string;
  label: string;
  route: string;
  status: ClosedLoopStatus;
  summary: string;
  stages: ClosedLoopStage[];
  evidence: Record<string, unknown>;
  startedAt?: Date | null;
  updatedAt?: Date | null;
};

type OpsCheck = {
  id: string;
  label: string;
  level: OpsCheckLevel;
  detail: string;
};

const GRAPH_GRACE_MINUTES = 15;
const FOLLOW_UP_GRACE_HOURS = 6;
const ATTENTION_TASK_GRACE_MINUTES = 5;

@Injectable()
export class PersonalOsClosedLoopService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async snapshot() {
    const loops = await Promise.all([
      this.healthRecoveryAdaptationLoop(),
      this.healthExecutionLearningLoop(),
      this.healthAttentionResolutionLoop(),
      this.proactiveEvidenceActionLoop(),
    ]);

    const broken = loops.filter((loop) => loop.status === 'broken').length;
    const warnings = loops.filter((loop) => loop.status === 'warning').length;
    const active = loops.filter((loop) => loop.status === 'active').length;
    const healthy = loops.filter((loop) => loop.status === 'healthy').length;
    const idle = loops.filter((loop) => loop.status === 'idle').length;
    const checks = loops.map((loop) => this.loopCheck(loop));

    return {
      status: broken
        ? 'broken'
        : warnings
          ? 'warning'
          : active
            ? 'active'
            : 'healthy',
      score: Math.max(0, 100 - broken * 20 - warnings * 5),
      summary: { healthy, active, warnings, broken, idle },
      loops,
      checks,
      policy: {
        version: 'personal-os-closed-loop-v1',
        principles: [
          'Closed-loop inspection is read-only and never invokes the AI provider.',
          'A loop is idle when no qualifying evidence exists; idle is not a failure.',
          'Recent actions may remain active while execution or follow-up evidence is not due yet.',
          'Missing graph/task/follow-up evidence becomes a blocker only after a reasonable grace window.',
          'Consequential proactive actions must retain explicit confirmation requirements.',
        ],
      },
      generatedAt: new Date(),
    };
  }

  private async healthRecoveryAdaptationLoop(): Promise<ClosedLoopSnapshot> {
    const intervention = await this.findOne(
      'health_interventions',
      {
        isActive: true,
        type: {
          $in: ['recovery_day', 'reduced_training_load', 'simplify_plan'],
        },
      },
      { appliedAt: -1, updatedAt: -1 },
    );

    if (!intervention) {
      return this.idleLoop(
        'health-recovery-adaptation',
        'Health recovery adaptation',
        '/admin/health/attention',
        'No proactive Health intervention has been needed yet.',
      );
    }

    const dateKey = this.text(intervention.dateKey);
    const appliedAt = this.date(
      intervention.appliedAt ?? intervention.updatedAt,
    );
    const [healthEntry, plan, tasks, execution] = await Promise.all([
      this.findOne('health_entries', { dateKey, isActive: true }),
      this.findOne('health_plan_days', { dateKey, isActive: true }),
      this.findMany(
        'tasks',
        {
          isActive: true,
          isArchived: false,
          area: 'health',
          'metadata.healthDateKey': dateKey,
        },
        100,
      ),
      this.findOne('health_plan_executions', { dateKey, isActive: true }),
    ]);

    const graphEvidence = await this.graphEvidence([
      ['health_interventions', intervention],
      ['health_plan_days', plan],
      ['health_plan_executions', execution],
      ...tasks.map((task) => ['tasks', task] as [string, LooseDoc]),
    ]);

    const interventionAgeMinutes = this.ageMinutes(appliedAt);
    const executionIsDue = dateKey < this.istDateKey();
    const followUpDueAt = this.date(intervention.followUpDueAt);
    const followUpComplete = Boolean(
      intervention.followedUpAt ||
      ['improved', 'not_improved', 'skipped'].includes(
        this.text(intervention.status),
      ),
    );
    const followUpOverdue = Boolean(
      followUpDueAt &&
      Date.now() - followUpDueAt.getTime() >
        FOLLOW_UP_GRACE_HOURS * 60 * 60 * 1000,
    );

    const stages: ClosedLoopStage[] = [
      this.stage(
        'trigger',
        'Health / connected-device evidence',
        healthEntry ? 'complete' : 'missing',
        healthEntry
          ? `Same-day Health evidence exists for ${dateKey}.`
          : `No active Health entry exists for ${dateKey}.`,
        this.date(healthEntry?.date ?? healthEntry?.updatedAt),
      ),
      this.stage(
        'intervention',
        'HSAKAA intervention',
        'complete',
        `${this.text(intervention.type) || 'Health'} intervention was applied: ${this.text(intervention.changeSummary) || 'plan adjusted'}.`,
        appliedAt,
      ),
      this.stage(
        'plan',
        'Adjusted Health plan',
        plan ? 'complete' : 'missing',
        plan
          ? `Plan ${dateKey} is active at version ${Number(plan.version ?? 0) || 'unknown'}.`
          : `Adjusted plan ${dateKey} is missing.`,
        this.date(plan?.generatedAt ?? plan?.updatedAt),
      ),
      this.stage(
        'tasks',
        'Operational Health tasks',
        tasks.length
          ? 'complete'
          : interventionAgeMinutes <= GRAPH_GRACE_MINUTES
            ? 'waiting'
            : 'missing',
        tasks.length
          ? `${tasks.length} Health task(s) operationalize the adjusted day.`
          : 'No Health tasks are linked to the intervention day yet.',
        this.latestDate(
          tasks.map((task) => (task.updatedAt ?? task.createdAt) as unknown),
        ),
      ),
      this.stage(
        'execution',
        'Plan-vs-actual execution',
        execution ? 'complete' : executionIsDue ? 'missing' : 'waiting',
        execution
          ? `${Number(execution.taskCompletionPercentage ?? 0).toFixed(0)}% task completion with ${Number(execution.taskTrackingCoveragePercentage ?? 0).toFixed(0)}% tracking coverage.`
          : executionIsDue
            ? 'The intervention day has passed but no execution record exists.'
            : 'Execution is still in progress for this intervention day.',
        this.date(execution?.computedAt ?? execution?.updatedAt),
      ),
      this.stage(
        'follow-up',
        'Outcome follow-up',
        followUpComplete ? 'complete' : followUpOverdue ? 'missing' : 'waiting',
        followUpComplete
          ? this.text(intervention.followUpSummary) ||
              `Follow-up status is ${this.text(intervention.status)}.`
          : followUpOverdue
            ? 'The intervention follow-up is overdue beyond the grace window.'
            : `Follow-up is pending${followUpDueAt ? ` until ${followUpDueAt.toISOString()}` : ''}.`,
        this.date(intervention.followedUpAt),
      ),
      this.stage(
        'graph',
        'Knowledge Graph feedback evidence',
        graphEvidence.complete
          ? 'complete'
          : interventionAgeMinutes <= GRAPH_GRACE_MINUTES
            ? 'waiting'
            : 'missing',
        graphEvidence.detail,
        graphEvidence.latestSyncAt,
      ),
    ];

    const status = this.statusFromStages(stages, {
      waitingIsActive: true,
      missingIsBroken: true,
    });

    return {
      id: 'health-recovery-adaptation',
      label: 'Health recovery adaptation',
      route: '/admin/health/attention',
      status,
      summary:
        status === 'healthy'
          ? 'Health evidence triggered an intervention, execution was captured, follow-up completed and the chain is represented in the Knowledge Graph.'
          : status === 'active'
            ? 'The latest Health intervention is still progressing through execution/follow-up.'
            : 'The latest Health intervention has a missing closed-loop stage that needs attention.',
      stages,
      evidence: {
        dateKey,
        interventionType: intervention.type ?? null,
        interventionStatus: intervention.status ?? null,
        healthTaskCount: tasks.length,
        graphNodesFound: graphEvidence.found,
        graphNodesExpected: graphEvidence.expected,
      },
      startedAt: appliedAt,
      updatedAt: this.latestDate([
        intervention.updatedAt,
        plan?.updatedAt,
        execution?.updatedAt,
        intervention.followedUpAt,
      ]),
    };
  }

  private async healthExecutionLearningLoop(): Promise<ClosedLoopSnapshot> {
    const review = await this.findOne(
      'health_plan_reviews',
      { isActive: true },
      { generatedAt: -1, updatedAt: -1 },
    );
    if (!review) {
      return this.idleLoop(
        'health-execution-learning',
        'Health execution → future planning',
        '/admin/health/progress',
        'No completed Health progress review exists yet.',
      );
    }

    const startDateKey = this.text(review.startDateKey);
    const endDateKey = this.text(review.endDateKey);
    const generatedAt = this.date(review.generatedAt ?? review.updatedAt);
    const [executions, futurePlan] = await Promise.all([
      this.findMany(
        'health_plan_executions',
        {
          isActive: true,
          ...(startDateKey && endDateKey
            ? { dateKey: { $gte: startDateKey, $lte: endDateKey } }
            : {}),
        },
        100,
      ),
      this.findOne(
        'health_plan_days',
        {
          isActive: true,
          ...(endDateKey ? { dateKey: { $gt: endDateKey } } : {}),
          ...(generatedAt ? { generatedAt: { $gte: generatedAt } } : {}),
        },
        { dateKey: 1, generatedAt: 1 },
      ),
    ]);

    const graphEvidence = await this.graphEvidence([
      ['health_plan_reviews', review],
      ...executions
        .slice(0, 10)
        .map(
          (execution) =>
            ['health_plan_executions', execution] as [string, LooseDoc],
        ),
      ['health_plan_days', futurePlan],
    ]);
    const learningEdge = futurePlan
      ? await this.findOne('knowledge_graph_edges', {
          isActive: true,
          sourceNodeKey: this.advancedHealthNodeKey(
            'health_plan_days',
            futurePlan,
          ),
          targetNodeKey: this.advancedHealthNodeKey(
            'health_plan_reviews',
            review,
          ),
          type: 'derived_from',
        })
      : null;
    const reviewAgeHours = this.ageHours(generatedAt);

    const stages: ClosedLoopStage[] = [
      this.stage(
        'execution',
        'Execution evidence',
        executions.length ? 'complete' : 'missing',
        executions.length
          ? `${executions.length} execution record(s) feed this review period.`
          : 'The review has no matching execution records.',
        this.latestDate(
          executions.map(
            (item) => (item.computedAt ?? item.updatedAt) as unknown,
          ),
        ),
      ),
      this.stage(
        'review',
        'HSAKAA progress review',
        'complete',
        `${this.text(review.periodType) || 'Health'} review covers ${startDateKey || 'unknown'} → ${endDateKey || 'unknown'}.`,
        generatedAt,
      ),
      this.stage(
        'future-plan',
        'Future plan adapts after review',
        futurePlan ? 'complete' : reviewAgeHours <= 24 ? 'waiting' : 'missing',
        futurePlan
          ? `A later plan (${this.text(futurePlan.dateKey)}) was generated after the review.`
          : reviewAgeHours <= 24
            ? 'The review is recent; a later regenerated plan is not required yet.'
            : 'No later Health plan generated after this review was found.',
        this.date(futurePlan?.generatedAt ?? futurePlan?.updatedAt),
      ),
      this.stage(
        'graph-learning',
        'Review → future-plan graph link',
        learningEdge
          ? 'complete'
          : futurePlan && reviewAgeHours > 0.25
            ? 'missing'
            : 'waiting',
        learningEdge
          ? 'Knowledge Graph explicitly records the future plan as derived from prior execution-review learning.'
          : 'The explicit review-to-future-plan Knowledge Graph edge is not available yet.',
        this.date(learningEdge?.lastSyncedAt),
      ),
      this.stage(
        'graph-evidence',
        'Review evidence indexed in graph',
        graphEvidence.complete ? 'complete' : 'missing',
        graphEvidence.detail,
        graphEvidence.latestSyncAt,
      ),
    ];

    const missingCritical = stages.some(
      (stage) =>
        stage.status === 'missing' &&
        ['execution', 'graph-learning', 'graph-evidence'].includes(stage.id),
    );
    const status: ClosedLoopStatus = missingCritical
      ? 'broken'
      : stages.some((stage) => stage.status === 'missing')
        ? 'warning'
        : stages.some((stage) => stage.status === 'waiting')
          ? 'active'
          : 'healthy';

    return {
      id: 'health-execution-learning',
      label: 'Health execution → future planning',
      route: '/admin/health/progress',
      status,
      summary:
        status === 'healthy'
          ? 'Execution evidence was reviewed and explicitly feeds a later Health plan in the Knowledge Graph.'
          : status === 'active'
            ? 'The latest review is waiting for the next planning cycle.'
            : 'Execution-review learning is not fully closing into future planning.',
      stages,
      evidence: {
        reviewId: this.id(review._id),
        periodType: review.periodType ?? null,
        startDateKey: startDateKey || null,
        endDateKey: endDateKey || null,
        executionCount: executions.length,
        futurePlanDateKey: futurePlan?.dateKey ?? null,
      },
      startedAt: this.latestDate(
        executions.map(
          (item) => (item.computedAt ?? item.updatedAt) as unknown,
        ),
      ),
      updatedAt: this.latestDate([
        review.updatedAt,
        futurePlan?.updatedAt,
        learningEdge?.lastSyncedAt,
      ]),
    };
  }

  private async healthAttentionResolutionLoop(): Promise<ClosedLoopSnapshot> {
    const attention = await this.findOne(
      'health_attention_items',
      {
        priority: { $in: ['important', 'review', 'professional_review'] },
      },
      { lastSeenAt: -1, updatedAt: -1 },
    );
    if (!attention) {
      return this.idleLoop(
        'health-attention-resolution',
        'Health Attention → task resolution',
        '/admin/health/attention',
        'No important/review Health Attention item has been created yet.',
      );
    }

    const key = this.text(attention.key);
    const attentionStatus = this.text(attention.status);
    const task = await this.findOne('tasks', {
      sourceExternalId: `health:attention:${key}`,
      isArchived: false,
    });
    const attentionAgeMinutes = this.ageMinutes(
      this.date(attention.firstSeenAt ?? attention.createdAt),
    );
    const resolved = ['resolved', 'dismissed'].includes(attentionStatus);
    const taskStatus = this.text(task?.status);
    const taskLifecycleCorrect = resolved
      ? ['cancelled', 'completed'].includes(taskStatus)
      : Boolean(task && !['cancelled', 'completed'].includes(taskStatus));

    const graphEvidence = await this.graphEvidence([
      ['health_attention_items', attention],
      ['tasks', task],
    ]);
    const graphLink = task
      ? await this.findOne('knowledge_graph_edges', {
          isActive: true,
          sourceNodeKey: this.advancedHealthNodeKey(
            'health_attention_items',
            attention,
          ),
          targetNodeKey: this.baseNodeKey('tasks', task),
          type: 'related_to',
        })
      : null;

    const stages: ClosedLoopStage[] = [
      this.stage(
        'attention',
        'Health Attention detected',
        'complete',
        `${this.text(attention.priority)} Attention: ${this.text(attention.title) || key}.`,
        this.date(attention.firstSeenAt ?? attention.createdAt),
      ),
      this.stage(
        'task',
        'HSAKAA task/reminder created',
        task
          ? 'complete'
          : attentionAgeMinutes <= ATTENTION_TASK_GRACE_MINUTES
            ? 'waiting'
            : 'missing',
        task
          ? `Task status is ${taskStatus || 'unknown'}.`
          : 'Important/review Attention has no matching HSAKAA task.',
        this.date(task?.createdAt),
      ),
      this.stage(
        'resolution',
        'Attention/task lifecycle stays in sync',
        taskLifecycleCorrect ? (resolved ? 'complete' : 'waiting') : 'missing',
        resolved
          ? taskLifecycleCorrect
            ? `Attention is ${attentionStatus} and its task is ${taskStatus}.`
            : `Attention is ${attentionStatus}, but task status ${taskStatus || 'missing'} is inconsistent.`
          : taskLifecycleCorrect
            ? 'Attention is still open and its task remains actionable.'
            : 'Open Attention no longer has an actionable task.',
        this.date(
          attention.resolvedAt ?? attention.dismissedAt ?? task?.updatedAt,
        ),
      ),
      this.stage(
        'graph',
        'Attention ↔ task graph evidence',
        graphEvidence.complete && graphLink
          ? 'complete'
          : attentionAgeMinutes <= GRAPH_GRACE_MINUTES
            ? 'waiting'
            : 'missing',
        graphLink
          ? 'Knowledge Graph links the Attention item to its operational task.'
          : 'The Attention-to-task Knowledge Graph relationship is missing.',
        this.date(graphLink?.lastSyncedAt ?? graphEvidence.latestSyncAt),
      ),
    ];

    const status = stages.some((stage) => stage.status === 'missing')
      ? 'broken'
      : resolved
        ? 'healthy'
        : 'active';

    return {
      id: 'health-attention-resolution',
      label: 'Health Attention → task resolution',
      route: '/admin/health/attention',
      status,
      summary:
        status === 'healthy'
          ? 'Important Health Attention and its HSAKAA task resolved together.'
          : status === 'active'
            ? 'Important Health Attention remains actionable and correctly linked to a task.'
            : 'Health Attention and task/graph state have drifted apart.',
      stages,
      evidence: {
        attentionKey: key,
        priority: attention.priority ?? null,
        attentionStatus: attention.status ?? null,
        taskId: task ? this.id(task._id) : null,
        taskStatus: task?.status ?? null,
      },
      startedAt: this.date(attention.firstSeenAt ?? attention.createdAt),
      updatedAt: this.latestDate([attention.updatedAt, task?.updatedAt]),
    };
  }

  private async proactiveEvidenceActionLoop(): Promise<ClosedLoopSnapshot> {
    const signal = await this.findOne(
      'hsakaa_proactive_signals',
      {},
      { lastDetectedAt: -1, updatedAt: -1 },
    );
    if (!signal) {
      return this.idleLoop(
        'proactive-evidence-action',
        'Graph evidence → Proactive HSAKAA',
        '/admin/hsakaa/proactive',
        'No proactive HSAKAA signal exists yet.',
      );
    }

    const evidence: unknown[] = Array.isArray(signal.evidence)
      ? (signal.evidence as unknown[])
      : [];
    const nodeKeys = [
      ...new Set(
        evidence
          .map((item) => this.text(this.field(item, 'nodeKey')))
          .filter(Boolean),
      ),
    ];
    const existingEvidenceNodes = nodeKeys.length
      ? await this.safeCount('knowledge_graph_nodes', {
          isActive: true,
          nodeKey: { $in: nodeKeys },
        })
      : 0;
    const action = signal.proposedAction ?? null;
    const consequential = Boolean(action?.consequential);
    const confirmationSafe =
      !consequential || action?.requiresConfirmation === true;

    const stages: ClosedLoopStage[] = [
      this.stage(
        'graph-evidence',
        'Knowledge Graph evidence cited',
        nodeKeys.length && existingEvidenceNodes === nodeKeys.length
          ? 'complete'
          : 'missing',
        nodeKeys.length
          ? `${existingEvidenceNodes}/${nodeKeys.length} cited graph evidence node(s) are still active.`
          : 'The proactive signal contains no Knowledge Graph evidence node keys.',
        this.date(signal.lastDetectedAt),
      ),
      this.stage(
        'signal',
        'Proactive signal generated',
        'complete',
        `${this.text(signal.severity) || 'unknown'} severity · ${this.text(signal.title) || 'proactive signal'}.`,
        this.date(signal.lastDetectedAt),
      ),
      this.stage(
        'action-safety',
        'Consequential-action confirmation firewall',
        confirmationSafe ? 'complete' : 'missing',
        action
          ? consequential
            ? confirmationSafe
              ? 'Consequential proposed action explicitly requires confirmation.'
              : 'Consequential proposed action does not require confirmation.'
            : 'Proposed action is non-consequential.'
          : 'No external/consequential action is proposed for this signal.',
        this.date(action?.decidedAt ?? signal.updatedAt),
      ),
      this.stage(
        'human-loop',
        'Action decision state',
        action?.requiresConfirmation &&
          action?.status === 'pending_confirmation'
          ? 'waiting'
          : 'complete',
        action?.requiresConfirmation &&
          action?.status === 'pending_confirmation'
          ? 'The proposed action is correctly waiting for explicit approval.'
          : action
            ? `Action status is ${this.text(action.status) || 'not_required'}.`
            : 'No action approval is required.',
        this.date(action?.decidedAt),
      ),
    ];

    const status = stages.some((stage) => stage.status === 'missing')
      ? 'broken'
      : stages.some((stage) => stage.status === 'waiting')
        ? 'active'
        : 'healthy';

    return {
      id: 'proactive-evidence-action',
      label: 'Graph evidence → Proactive HSAKAA',
      route: '/admin/hsakaa/proactive',
      status,
      summary:
        status === 'healthy'
          ? 'Proactive HSAKAA is grounded in live graph evidence and consequential actions remain confirmation-gated.'
          : status === 'active'
            ? 'A proactive action is correctly waiting for explicit approval.'
            : 'Proactive evidence or the consequential-action safety boundary is broken.',
      stages,
      evidence: {
        signalId: this.id(signal._id),
        category: signal.category ?? null,
        severity: signal.severity ?? null,
        evidenceNodes: nodeKeys.length,
        activeEvidenceNodes: existingEvidenceNodes,
        proposedAction: action
          ? {
              kind: action.kind ?? null,
              consequential,
              requiresConfirmation: action.requiresConfirmation ?? false,
              status: action.status ?? null,
            }
          : null,
      },
      startedAt: this.date(signal.firstDetectedAt),
      updatedAt: this.date(signal.lastDetectedAt ?? signal.updatedAt),
    };
  }

  private loopCheck(loop: ClosedLoopSnapshot): OpsCheck {
    if (loop.status === 'broken') {
      return {
        id: `closed-loop-${loop.id}`,
        label: loop.label,
        level: 'fail',
        detail: loop.summary,
      };
    }
    if (loop.status === 'warning') {
      return {
        id: `closed-loop-${loop.id}`,
        label: loop.label,
        level: 'warning',
        detail: loop.summary,
      };
    }
    return {
      id: `closed-loop-${loop.id}`,
      label: loop.label,
      level: 'pass',
      detail:
        loop.status === 'idle'
          ? `${loop.summary} The loop is wired and dormant.`
          : loop.summary,
    };
  }

  private statusFromStages(
    stages: ClosedLoopStage[],
    options: { waitingIsActive: boolean; missingIsBroken: boolean },
  ): ClosedLoopStatus {
    if (stages.some((stage) => stage.status === 'missing')) {
      return options.missingIsBroken ? 'broken' : 'warning';
    }
    if (
      options.waitingIsActive &&
      stages.some((stage) => stage.status === 'waiting')
    ) {
      return 'active';
    }
    return 'healthy';
  }

  private idleLoop(
    id: string,
    label: string,
    route: string,
    summary: string,
  ): ClosedLoopSnapshot {
    return {
      id,
      label,
      route,
      status: 'idle',
      summary,
      stages: [],
      evidence: {},
      startedAt: null,
      updatedAt: null,
    };
  }

  private stage(
    id: string,
    label: string,
    status: ClosedLoopStageStatus,
    detail: string,
    occurredAt?: Date | null,
  ): ClosedLoopStage {
    return { id, label, status, detail, occurredAt: occurredAt ?? null };
  }

  private async graphEvidence(
    records: Array<[string, LooseDoc | null | undefined]>,
  ) {
    const expectedKeys = records
      .filter(([, record]) => Boolean(record?._id))
      .map(([collection, record]) =>
        record ? this.nodeKey(collection, record) : '',
      );
    const uniqueKeys = [...new Set(expectedKeys.filter(Boolean))];
    if (!uniqueKeys.length) {
      return {
        complete: false,
        found: 0,
        expected: 0,
        detail:
          'No source records are available to validate in the Knowledge Graph.',
        latestSyncAt: null as Date | null,
      };
    }
    const nodes = await this.findMany(
      'knowledge_graph_nodes',
      { isActive: true, nodeKey: { $in: uniqueKeys } },
      uniqueKeys.length + 5,
    );
    return {
      complete: nodes.length === uniqueKeys.length,
      found: nodes.length,
      expected: uniqueKeys.length,
      detail:
        nodes.length === uniqueKeys.length
          ? `${nodes.length}/${uniqueKeys.length} expected closed-loop evidence node(s) are active in the Knowledge Graph.`
          : `${nodes.length}/${uniqueKeys.length} expected closed-loop evidence node(s) are active in the Knowledge Graph.`,
      latestSyncAt: this.latestDate(
        nodes.map((node) => node.lastSyncedAt as unknown),
      ),
    };
  }

  private nodeKey(collection: string, record: LooseDoc): string {
    if (collection === 'tasks') return this.baseNodeKey(collection, record);
    if (collection === 'health_entries')
      return this.baseNodeKey(collection, record);
    return this.advancedHealthNodeKey(collection, record);
  }

  private advancedHealthNodeKey(collection: string, record: LooseDoc): string {
    return record?._id ? `health:${collection}:${this.id(record._id)}` : '';
  }

  private baseNodeKey(collection: string, record: LooseDoc): string {
    if (!record?._id) return '';
    if (collection === 'tasks') return `task:${this.id(record._id)}`;
    if (collection === 'health_entries') return `health:${this.id(record._id)}`;
    return `${collection}:${this.id(record._id)}`;
  }

  private async findOne(
    collection: string,
    filter: Record<string, unknown>,
    sort: Record<string, 1 | -1> = { updatedAt: -1, createdAt: -1 },
  ): Promise<LooseDoc | null> {
    try {
      const document = await this.connection
        .collection(collection)
        .findOne(filter, { sort });
      return document;
    } catch {
      return null;
    }
  }

  private async findMany(
    collection: string,
    filter: Record<string, unknown>,
    limit: number,
  ): Promise<LooseDoc[]> {
    try {
      const documents = await this.connection
        .collection(collection)
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(limit)
        .toArray();
      return documents;
    } catch {
      return [];
    }
  }

  private async safeCount(
    collection: string,
    filter: Record<string, unknown>,
  ): Promise<number> {
    try {
      return await this.connection
        .collection(collection)
        .countDocuments(filter);
    } catch {
      return 0;
    }
  }

  private text(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value).trim();
    }
    return '';
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

  private date(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private field(value: unknown, key: string): unknown {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }

  private latestDate(values: unknown[]): Date | null {
    const dates = values
      .map((value) => this.date(value))
      .filter((value): value is Date => Boolean(value));
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((value) => value.getTime())));
  }

  private ageMinutes(date: Date | null): number {
    if (!date) return Number.POSITIVE_INFINITY;
    return Math.max(0, (Date.now() - date.getTime()) / 60_000);
  }

  private ageHours(date: Date | null): number {
    return this.ageMinutes(date) / 60;
  }

  private istDateKey(date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
