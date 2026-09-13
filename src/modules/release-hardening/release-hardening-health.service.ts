/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { ADVANCED_HEALTH_GRAPH_COLLECTIONS } from '../knowledge-graph/health-knowledge-graph-integration.service';
import { KnowledgeGraphPrivacy } from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import { ReleaseHardeningService } from './release-hardening.service';

export const BASE_RELEASE_HARDENING_SERVICE = Symbol(
  'BASE_RELEASE_HARDENING_SERVICE',
);

type CheckLevel = 'pass' | 'warning' | 'fail';

type ReleaseCheck = {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
};

const HEALTH_SOURCE_PRIORITY = [
  'professional_instruction',
  'owner_update',
  'connected_objective_data',
  'structured_health_log',
  'task_completion',
  'ai_inference',
];

@Injectable()
export class ReleaseHardeningHealthService {
  constructor(
    @Inject(BASE_RELEASE_HARDENING_SERVICE)
    private readonly base: ReleaseHardeningService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  getPolicy() {
    const base = this.base.getPolicy();
    return {
      ...base,
      version: 'personal-os-release-hardening-v2-health-integration',
      scope: [
        ...new Set([...(base.scope ?? []), 'health_os_v2_4', 'cross_system']),
      ],
      principles: [
        ...(base.principles ?? []),
        'Advanced Health evidence is owner-only in the Personal Knowledge Graph.',
        'Health evidence precedence is professional instruction → owner update → connected objective data → structured log → task completion → AI inference.',
        'Medication is never autonomous; professional instructions remain locked; supplement changes require approval.',
        'Health graph coverage is required whenever advanced Health source data exists.',
      ],
      health: this.healthPolicy(),
    };
  }

  async runChecks() {
    const base = await this.base.runChecks();
    const health = await this.healthSnapshot();
    const healthChecks = this.healthChecks(health);
    const checks: ReleaseCheck[] = [...(base.checks ?? []), ...healthChecks];
    const failures = checks.filter((check) => check.level === 'fail').length;
    const warnings = checks.filter((check) => check.level === 'warning').length;

    return {
      ...base,
      ready: failures === 0,
      score: Math.max(0, 100 - failures * 25 - warnings * 5),
      summary: {
        passed: checks.filter((check) => check.level === 'pass').length,
        warnings,
        failures,
      },
      checks,
      health: {
        onboardingComplete: health.onboardingComplete,
        activeGoals: health.activeGoals,
        advancedSourceDocuments: health.advancedSourceDocuments,
        advancedGraphNodes: health.advancedGraphNodes,
        graphCoverage: health.graphCoverage,
        missingGraphCollections: health.missingGraphCollections,
        ownerOnlyPrivacyViolations: health.ownerOnlyPrivacyViolations,
        professionalReviewOpen: health.professionalReviewOpen,
        governanceConfigured: Boolean(health.settings),
        governance: health.settings
          ? {
              sourcePriority: health.settings.sourcePriority ?? [],
              autonomy: health.settings.autonomy ?? {},
            }
          : null,
      },
      policies: {
        ...(base.policies ?? {}),
        health: this.healthPolicy(),
      },
    };
  }

  private healthPolicy() {
    return {
      graphPrivacy: KnowledgeGraphPrivacy.OWNER_ONLY,
      sourcePriority: HEALTH_SOURCE_PRIORITY,
      autonomySafety: {
        medication: 'never',
        professionalInstructions: 'locked',
        supplements: 'approval',
      },
    };
  }

  private async healthSnapshot() {
    const sourceCounts = await Promise.all(
      ADVANCED_HEALTH_GRAPH_COLLECTIONS.map(async (collection) => {
        try {
          return [
            collection,
            await this.connection
              .collection(collection)
              .countDocuments({ isActive: true }),
          ] as const;
        } catch {
          return [collection, 0] as const;
        }
      }),
    );
    const sourceCountMap = Object.fromEntries(sourceCounts) as Record<
      string,
      number
    >;

    const [baseline, activeGoals, settings, professionalReviewOpen, graphRows] =
      await Promise.all([
        this.safeFindOne('health_baselines', { isActive: true }),
        this.safeCount('health_goals', { isActive: true, status: 'active' }),
        this.safeFindOne('health_evidence_settings', { isActive: true }),
        this.safeCount('health_attention_items', {
          isActive: true,
          status: 'open',
          priority: 'professional_review',
        }),
        this.connection
          .collection('knowledge_graph_nodes')
          .aggregate<{ _id: string; count: number }>([
            {
              $match: {
                isActive: true,
                sourceCollection: {
                  $in: [...ADVANCED_HEALTH_GRAPH_COLLECTIONS],
                },
              },
            },
            { $group: { _id: '$sourceCollection', count: { $sum: 1 } } },
          ])
          .toArray()
          .catch(() => []),
      ]);

    const graphCountMap = Object.fromEntries(
      graphRows.map((row) => [row._id, row.count]),
    ) as Record<string, number>;
    const advancedSourceDocuments = Object.values(sourceCountMap).reduce(
      (sum, value) => sum + value,
      0,
    );
    const advancedGraphNodes = Object.values(graphCountMap).reduce(
      (sum, value) => sum + value,
      0,
    );
    const missingGraphCollections = ADVANCED_HEALTH_GRAPH_COLLECTIONS.filter(
      (collection) =>
        (sourceCountMap[collection] ?? 0) > 0 &&
        (graphCountMap[collection] ?? 0) === 0,
    );
    const ownerOnlyPrivacyViolations = await this.connection
      .collection('knowledge_graph_nodes')
      .countDocuments({
        isActive: true,
        sourceCollection: { $in: [...ADVANCED_HEALTH_GRAPH_COLLECTIONS] },
        privacy: { $ne: KnowledgeGraphPrivacy.OWNER_ONLY },
      })
      .catch(() => 0);

    return {
      baseline,
      onboardingComplete: Boolean(baseline?.onboardingCompleted),
      activeGoals,
      settings,
      professionalReviewOpen,
      sourceCountMap,
      graphCountMap,
      advancedSourceDocuments,
      advancedGraphNodes,
      graphCoverage: advancedSourceDocuments
        ? Number(
            Math.min(1, advancedGraphNodes / advancedSourceDocuments).toFixed(
              4,
            ),
          )
        : 1,
      missingGraphCollections,
      ownerOnlyPrivacyViolations,
    };
  }

  private healthChecks(
    health: Awaited<ReturnType<typeof this.healthSnapshot>>,
  ) {
    const checks: ReleaseCheck[] = [];

    checks.push(
      health.baseline
        ? health.onboardingComplete
          ? this.pass(
              'health-baseline-ready',
              'Health baseline readiness',
              'The owner Health baseline is complete and available to cross-system context.',
            )
          : this.warning(
              'health-baseline-ready',
              'Health baseline readiness',
              'A Health baseline exists but onboarding is not marked complete.',
            )
        : this.warning(
            'health-baseline-ready',
            'Health baseline readiness',
            'No active Health baseline exists yet; this is allowed before Health onboarding.',
          ),
    );

    checks.push(
      health.activeGoals > 0
        ? this.pass(
            'health-active-goals',
            'Health goal integration',
            `${health.activeGoals} active Health goal(s) are available for Personal OS context.`,
          )
        : this.warning(
            'health-active-goals',
            'Health goal integration',
            'No active Health goals exist yet; HSAKAA can deploy, but goal-aware coaching is limited.',
          ),
    );

    checks.push(this.checkGovernance(health.settings));

    checks.push(
      health.advancedSourceDocuments === 0
        ? this.warning(
            'health-graph-coverage',
            'Advanced Health graph coverage',
            'No advanced Health evidence exists yet, so graph coverage cannot be exercised.',
          )
        : health.missingGraphCollections.length === 0
          ? this.pass(
              'health-graph-coverage',
              'Advanced Health graph coverage',
              `${health.advancedGraphNodes} advanced Health graph node(s) represent every populated Health evidence collection.`,
            )
          : this.fail(
              'health-graph-coverage',
              'Advanced Health graph coverage',
              `Populated Health collection(s) are missing from the Knowledge Graph: ${health.missingGraphCollections.join(', ')}. Run the Knowledge Graph sync after installing the cross-system patch.`,
            ),
    );

    checks.push(
      health.ownerOnlyPrivacyViolations === 0
        ? this.pass(
            'health-graph-privacy',
            'Advanced Health graph privacy',
            'All advanced Health graph nodes are owner-only.',
          )
        : this.fail(
            'health-graph-privacy',
            'Advanced Health graph privacy',
            `${health.ownerOnlyPrivacyViolations} advanced Health graph node(s) are not owner-only.`,
          ),
    );

    checks.push(
      health.professionalReviewOpen > 0
        ? this.warning(
            'health-professional-review',
            'Health professional-review queue',
            `${health.professionalReviewOpen} Health item(s) require professional review. This is an owner attention warning, not an autonomous action.`,
          )
        : this.pass(
            'health-professional-review',
            'Health professional-review queue',
            'No open Health item currently requires professional review.',
          ),
    );

    return checks;
  }

  private checkGovernance(settings: any): ReleaseCheck {
    if (!settings) {
      return this.warning(
        'health-governance',
        'Health autonomy and evidence governance',
        'Health evidence settings do not exist yet; V2.4 defaults will be created when the Evidence workspace is used.',
      );
    }

    const sourcePriority: string[] = Array.isArray(settings.sourcePriority)
      ? (settings.sourcePriority as unknown[])
          .map((value) => (typeof value === 'string' ? value : ''))
          .filter(Boolean)
      : [];
    const orderSafe = HEALTH_SOURCE_PRIORITY.every(
      (value, index) => sourcePriority[index] === value,
    );
    const medicationSafe = settings.autonomy?.medication === 'never';
    const professionalSafe =
      settings.autonomy?.professionalInstructions === 'locked';
    const supplementsSafe = settings.autonomy?.supplements !== 'autonomous';

    if (
      !orderSafe ||
      !medicationSafe ||
      !professionalSafe ||
      !supplementsSafe
    ) {
      const problems = [
        !orderSafe
          ? 'evidence source precedence differs from the safe order'
          : '',
        !medicationSafe ? 'medication is not locked to never-autonomous' : '',
        !professionalSafe ? 'professional instructions are not locked' : '',
        !supplementsSafe ? 'supplements are fully autonomous' : '',
      ].filter(Boolean);
      return this.fail(
        'health-governance',
        'Health autonomy and evidence governance',
        `Unsafe Health governance: ${problems.join('; ')}.`,
      );
    }

    return this.pass(
      'health-governance',
      'Health autonomy and evidence governance',
      'Evidence precedence and Health autonomy safety boundaries are correctly enforced.',
    );
  }

  private async safeFindOne(
    collection: string,
    filter: Record<string, unknown>,
  ) {
    try {
      return await this.connection.collection(collection).findOne(filter);
    } catch {
      return null;
    }
  }

  private async safeCount(collection: string, filter: Record<string, unknown>) {
    try {
      return await this.connection
        .collection(collection)
        .countDocuments(filter);
    } catch {
      return 0;
    }
  }

  private pass(id: string, label: string, detail: string): ReleaseCheck {
    return { id, label, level: 'pass', detail };
  }

  private warning(id: string, label: string, detail: string): ReleaseCheck {
    return { id, label, level: 'warning', detail };
  }

  private fail(id: string, label: string, detail: string): ReleaseCheck {
    return { id, label, level: 'fail', detail };
  }
}
