import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';

import { ContextEngineService } from '../context-engine/context-engine.service';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import {
  HsakaaRuntimeLease,
  HsakaaRuntimeLeaseDocument,
} from '../hsakaa-runtime/schemas/hsakaa-runtime-lease.schema';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeDocument,
} from '../knowledge-graph/schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeDocument,
  KnowledgeGraphPrivacy,
} from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import { ProactiveSignalStatus } from '../proactive/dto/proactive.dto';
import { ProactiveService } from '../proactive/proactive.service';
import {
  ProactiveReview,
  ProactiveReviewDocument,
} from '../proactive/schemas/proactive-review.schema';
import {
  ProactiveSignal,
  ProactiveSignalDocument,
} from '../proactive/schemas/proactive-signal.schema';
import {
  UniversalSearchEmbedding,
  UniversalSearchEmbeddingDocument,
} from '../universal-search/schemas/universal-search-embedding.schema';

type CheckLevel = 'pass' | 'warning' | 'fail';

type ReleaseCheck = {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
};

const GRAPH_FRESH_MINUTES = 30;
const GRAPH_FAIL_HOURS = 24;
const SEMANTIC_WARNING_COVERAGE = 0.85;
const SEMANTIC_FAIL_COVERAGE = 0.3;

@Injectable()
export class ReleaseHardeningService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(KnowledgeGraphNode.name)
    private readonly nodeModel: Model<KnowledgeGraphNodeDocument>,
    @InjectModel(KnowledgeGraphEdge.name)
    private readonly edgeModel: Model<KnowledgeGraphEdgeDocument>,
    @InjectModel(UniversalSearchEmbedding.name)
    private readonly embeddingModel: Model<UniversalSearchEmbeddingDocument>,
    @InjectModel(ProactiveSignal.name)
    private readonly signalModel: Model<ProactiveSignalDocument>,
    @InjectModel(ProactiveReview.name)
    private readonly reviewModel: Model<ProactiveReviewDocument>,
    @InjectModel(HsakaaRuntimeLease.name)
    private readonly leaseModel: Model<HsakaaRuntimeLeaseDocument>,
    private readonly contextEngine: ContextEngineService,
    private readonly proactiveService: ProactiveService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  getPolicy() {
    return {
      version: 'personal-os-release-hardening-v1',
      scope: ['phase_7', 'phase_8', 'phase_9', 'phase_10', 'phase_11'],
      principles: [
        'No release check performs external or consequential actions.',
        'Runtime leases prevent overlapping graph, search-index, proactive-scan, and proactive-review work.',
        'Readiness checks never call the AI provider.',
        'Private/public context boundaries remain enforced by the Phase 10 Context Engine.',
        'Warnings are deployable with awareness; failures are release blockers.',
      ],
      thresholds: {
        graphFreshMinutes: GRAPH_FRESH_MINUTES,
        graphFailHours: GRAPH_FAIL_HOURS,
        semanticWarningCoverage: SEMANTIC_WARNING_COVERAGE,
        semanticFailCoverage: SEMANTIC_FAIL_COVERAGE,
      },
    };
  }

  async runChecks() {
    const now = new Date();
    const [
      activeNodes,
      activeEdges,
      latestNode,
      publicSafeNodes,
      invalidPrivacyNodes,
      activeEmbeddings,
      inactiveEmbeddings,
      embeddingModels,
      openSignals,
      latestReview,
      activeLeases,
      expiredLeases,
      nodeIndexes,
      edgeIndexes,
      embeddingIndexes,
      signalIndexes,
      reviewIndexes,
      leaseIndexes,
    ] = await Promise.all([
      this.nodeModel.countDocuments({ isActive: true }),
      this.edgeModel.countDocuments({ isActive: true }),
      this.nodeModel
        .findOne({ isActive: true })
        .sort({ lastSyncedAt: -1 })
        .select({ lastSyncedAt: 1 })
        .lean()
        .exec(),
      this.nodeModel.countDocuments({
        isActive: true,
        privacy: KnowledgeGraphPrivacy.PUBLIC_SAFE,
      }),
      this.nodeModel.countDocuments({
        isActive: true,
        privacy: {
          $nin: [
            KnowledgeGraphPrivacy.OWNER_ONLY,
            KnowledgeGraphPrivacy.PUBLIC_SAFE,
          ],
        },
      }),
      this.embeddingModel.countDocuments({ isActive: true }),
      this.embeddingModel.countDocuments({ isActive: false }),
      this.embeddingModel.distinct('embeddingModel', { isActive: true }),
      this.signalModel.countDocuments({
        status: {
          $in: [
            ProactiveSignalStatus.OPEN,
            ProactiveSignalStatus.ACKNOWLEDGED,
            ProactiveSignalStatus.SNOOZED,
          ],
        },
      }),
      this.reviewModel
        .findOne({})
        .sort({ periodEnd: -1, generatedAt: -1 })
        .select({ period: 1, periodEnd: 1, generatedAt: 1, status: 1 })
        .lean()
        .exec(),
      this.runtimeLeases.getActiveLeases(),
      this.leaseModel.countDocuments({ expiresAt: { $lte: now } }),
      this.indexNames(this.nodeModel),
      this.indexNames(this.edgeModel),
      this.indexNames(this.embeddingModel),
      this.indexNames(this.signalModel),
      this.indexNames(this.reviewModel),
      this.indexNames(this.leaseModel),
    ]);

    const latestGraphSync = latestNode?.lastSyncedAt
      ? new Date(latestNode.lastSyncedAt)
      : null;
    const graphAgeMinutes = latestGraphSync
      ? Math.max(
          0,
          Math.round((now.getTime() - latestGraphSync.getTime()) / 60_000),
        )
      : null;
    const semanticCoverage = activeNodes
      ? Number(Math.min(1, activeEmbeddings / activeNodes).toFixed(4))
      : 0;
    const contextPolicy = this.contextEngine.getPolicy();
    const proactivePolicy = this.proactiveService.getPolicy();

    const checks: ReleaseCheck[] = [
      this.checkDatabase(),
      this.checkGraph(activeNodes, graphAgeMinutes),
      this.checkIndex(
        'graph-node-unique-index',
        'Knowledge graph node uniqueness',
        nodeIndexes,
        ['nodeKey_1', 'sourceCollection_1_sourceId_1'],
      ),
      this.checkIndex(
        'graph-edge-unique-index',
        'Knowledge graph edge uniqueness',
        edgeIndexes,
        ['edgeKey_1'],
      ),
      this.checkSemantic(activeNodes, semanticCoverage),
      this.checkIndex(
        'search-embedding-unique-index',
        'Semantic embedding uniqueness',
        embeddingIndexes,
        ['nodeKey_1'],
      ),
      invalidPrivacyNodes === 0
        ? this.pass(
            'privacy-values',
            'Knowledge graph privacy values',
            'All active nodes use an allowed privacy boundary.',
          )
        : this.fail(
            'privacy-values',
            'Knowledge graph privacy values',
            `${invalidPrivacyNodes} active nodes have an unsupported privacy value.`,
          ),
      contextPolicy.safeguards.includes(
        'privacy filtering before context packing',
      )
        ? this.pass(
            'context-privacy-order',
            'Context privacy firewall',
            'Phase 10 declares privacy filtering before context packing.',
          )
        : this.fail(
            'context-privacy-order',
            'Context privacy firewall',
            'The Context Engine policy no longer declares privacy filtering before packing.',
          ),
      proactivePolicy.autonomy.automaticExternalExecution === false
        ? this.pass(
            'proactive-autonomy',
            'Proactive execution firewall',
            'Automatic external execution remains disabled.',
          )
        : this.fail(
            'proactive-autonomy',
            'Proactive execution firewall',
            'Automatic external execution is enabled.',
          ),
      proactivePolicy.timezone === 'Asia/Kolkata'
        ? this.pass(
            'proactive-timezone',
            'Proactive scheduler timezone',
            'Scheduled proactive work is pinned to Asia/Kolkata.',
          )
        : this.warning(
            'proactive-timezone',
            'Proactive scheduler timezone',
            `Unexpected scheduler timezone: ${proactivePolicy.timezone}.`,
          ),
      this.checkIndex(
        'proactive-signal-unique-index',
        'Proactive signal deduplication',
        signalIndexes,
        ['fingerprint_1'],
      ),
      this.checkIndex(
        'proactive-review-unique-index',
        'Proactive review idempotency',
        reviewIndexes,
        ['periodKey_1'],
      ),
      this.checkIndex(
        'runtime-lease-indexes',
        'Runtime concurrency leases',
        leaseIndexes,
        ['key_1', 'expiresAt_1'],
      ),
      expiredLeases > 100
        ? this.warning(
            'runtime-lease-cleanup',
            'Runtime lease cleanup',
            `${expiredLeases} expired lease rows are awaiting MongoDB TTL cleanup; acquisition remains safe.`,
          )
        : this.pass(
            'runtime-lease-cleanup',
            'Runtime lease cleanup',
            `${expiredLeases} expired lease rows are awaiting TTL cleanup.`,
          ),
    ];

    const failures = checks.filter((check) => check.level === 'fail').length;
    const warnings = checks.filter((check) => check.level === 'warning').length;
    const score = Math.max(0, 100 - failures * 25 - warnings * 5);

    return {
      ready: failures === 0,
      score,
      summary: {
        passed: checks.filter((check) => check.level === 'pass').length,
        warnings,
        failures,
      },
      checks,
      runtime: {
        databaseReadyState: this.connection.readyState,
        activeLeases: activeLeases.map((lease: HsakaaRuntimeLease) => ({
          key: lease.key,
          acquiredAt: lease.acquiredAt,
          expiresAt: lease.expiresAt,
          metadata: lease.metadata,
        })),
      },
      graph: {
        activeNodes,
        activeEdges,
        publicSafeNodes,
        ownerOnlyNodes: Math.max(0, activeNodes - publicSafeNodes),
        latestSyncAt: latestGraphSync,
        ageMinutes: graphAgeMinutes,
      },
      search: {
        activeEmbeddings,
        inactiveEmbeddings,
        semanticCoverage,
        embeddingModels,
      },
      proactive: {
        activeSignals: openSignals,
        latestReview: latestReview ?? null,
      },
      policies: {
        context: contextPolicy,
        proactive: proactivePolicy,
      },
      generatedAt: now,
    };
  }

  private checkDatabase(): ReleaseCheck {
    return Number(this.connection.readyState) === 1
      ? this.pass('database', 'MongoDB connection', 'Mongoose is connected.')
      : this.fail(
          'database',
          'MongoDB connection',
          `Mongoose readyState is ${this.connection.readyState}; expected 1.`,
        );
  }

  private checkGraph(
    activeNodes: number,
    ageMinutes: number | null,
  ): ReleaseCheck {
    if (!activeNodes || ageMinutes === null) {
      return this.warning(
        'knowledge-graph-freshness',
        'Knowledge graph freshness',
        'No active graph snapshot exists yet. Run a graph sync before release.',
      );
    }
    if (ageMinutes > GRAPH_FAIL_HOURS * 60) {
      return this.fail(
        'knowledge-graph-freshness',
        'Knowledge graph freshness',
        `Latest graph snapshot is ${ageMinutes} minutes old.`,
      );
    }
    if (ageMinutes > GRAPH_FRESH_MINUTES) {
      return this.warning(
        'knowledge-graph-freshness',
        'Knowledge graph freshness',
        `Latest graph snapshot is ${ageMinutes} minutes old.`,
      );
    }
    return this.pass(
      'knowledge-graph-freshness',
      'Knowledge graph freshness',
      `Latest graph snapshot is ${ageMinutes} minutes old.`,
    );
  }

  private checkSemantic(activeNodes: number, coverage: number): ReleaseCheck {
    if (!activeNodes) {
      return this.warning(
        'semantic-index-coverage',
        'Semantic index coverage',
        'There are no active graph nodes to index yet.',
      );
    }
    if (coverage < SEMANTIC_FAIL_COVERAGE) {
      return this.fail(
        'semantic-index-coverage',
        'Semantic index coverage',
        `Only ${(coverage * 100).toFixed(1)}% of active graph nodes have active embeddings.`,
      );
    }
    if (coverage < SEMANTIC_WARNING_COVERAGE) {
      return this.warning(
        'semantic-index-coverage',
        'Semantic index coverage',
        `${(coverage * 100).toFixed(1)}% of active graph nodes have active embeddings.`,
      );
    }
    return this.pass(
      'semantic-index-coverage',
      'Semantic index coverage',
      `${(coverage * 100).toFixed(1)}% of active graph nodes have active embeddings.`,
    );
  }

  private checkIndex(
    id: string,
    label: string,
    names: string[],
    required: string[],
  ): ReleaseCheck {
    const missing = required.filter((name) => !names.includes(name));
    return missing.length
      ? this.fail(
          id,
          label,
          `Missing MongoDB index(es): ${missing.join(', ')}.`,
        )
      : this.pass(
          id,
          label,
          `Required indexes present: ${required.join(', ')}.`,
        );
  }

  private async indexNames<T>(model: Model<T>): Promise<string[]> {
    try {
      const indexes = await model.collection.indexes();
      return indexes
        .map((index) => index.name)
        .filter((name): name is string => typeof name === 'string');
    } catch {
      return [];
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
