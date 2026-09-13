import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  KnowledgeGraphNeighborsQueryDto,
  KnowledgeGraphOverviewQueryDto,
  KnowledgeGraphPathQueryDto,
  KnowledgeGraphTimelineQueryDto,
} from './dto/knowledge-graph.dto';
import {
  ADVANCED_HEALTH_GRAPH_COLLECTIONS,
  HealthKnowledgeGraphIntegrationService,
} from './health-knowledge-graph-integration.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeDocument,
  KnowledgeGraphNodeType,
} from './schemas/knowledge-graph-node.schema';

export const BASE_KNOWLEDGE_GRAPH_SERVICE = Symbol(
  'BASE_KNOWLEDGE_GRAPH_SERVICE',
);

const DEFAULT_FRESHNESS_MINUTES = 10;

@Injectable()
export class IntegratedKnowledgeGraphService {
  constructor(
    @Inject(BASE_KNOWLEDGE_GRAPH_SERVICE)
    private readonly base: KnowledgeGraphService,
    private readonly healthIntegration: HealthKnowledgeGraphIntegrationService,
    @InjectModel(KnowledgeGraphNode.name)
    private readonly nodeModel: Model<KnowledgeGraphNodeDocument>,
  ) {}

  async ensureFresh(maxAgeMinutes = DEFAULT_FRESHNESS_MINUTES) {
    // The legacy graph service checks the newest node across the entire graph.
    // Once Health V2 evidence is integrated, a fresh Health-only node could mask
    // stale legacy graph data. Check the base graph independently first.
    const latestBase = await this.nodeModel
      .findOne({
        isActive: true,
        sourceCollection: { $nin: [...ADVANCED_HEALTH_GRAPH_COLLECTIONS] },
      })
      .sort({ lastSyncedAt: -1 })
      .select({ lastSyncedAt: 1 })
      .lean()
      .exec();
    const cutoff = Date.now() - maxAgeMinutes * 60_000;
    const baseIsFresh = Boolean(
      latestBase?.lastSyncedAt &&
      new Date(latestBase.lastSyncedAt).getTime() >= cutoff,
    );

    const base = baseIsFresh
      ? { refreshed: false, lastSyncedAt: latestBase?.lastSyncedAt ?? null }
      : await this.refreshBaseGraph();
    // A base sync intentionally deactivates collections it does not know about;
    // this call reactivates/reconciles the V2 Health evidence immediately after.
    const health = await this.healthIntegration.ensureFresh(maxAgeMinutes);

    return {
      refreshed: Boolean(base.refreshed || health.refreshed),
      lastSyncedAt: health.lastSyncedAt ?? base.lastSyncedAt,
      base,
      health,
    };
  }

  async syncAll() {
    const base = await this.base.syncAll();
    const health = await this.healthIntegration.sync();
    return {
      ...base,
      syncedAt: health.syncedAt,
      nodes: base.nodes + health.nodes,
      edges: base.edges + health.edges,
      countsByType: {
        ...base.countsByType,
        [KnowledgeGraphNodeType.HEALTH]:
          (base.countsByType[KnowledgeGraphNodeType.HEALTH] ?? 0) +
          health.nodes,
      },
      healthIntegration: health,
    };
  }

  async getOverview(query: KnowledgeGraphOverviewQueryDto = {}) {
    await this.ensureFresh();
    return this.base.getOverview(query);
  }

  async getNode(nodeKey: string) {
    await this.ensureFresh();
    return this.base.getNode(nodeKey);
  }

  async getNeighbors(
    nodeKey: string,
    query: KnowledgeGraphNeighborsQueryDto = {},
  ) {
    await this.ensureFresh();
    return this.base.getNeighbors(nodeKey, query);
  }

  async findPath(query: KnowledgeGraphPathQueryDto) {
    await this.ensureFresh();
    return this.base.findPath(query);
  }

  async getTimeline(query: KnowledgeGraphTimelineQueryDto = {}) {
    await this.ensureFresh();
    return this.base.getTimeline(query);
  }

  async getEvidenceGraph(question: string, maxEvidence = 30) {
    await this.ensureFresh();
    return this.base.getEvidenceGraph(question, maxEvidence);
  }

  private async refreshBaseGraph() {
    const result = await this.base.syncAll();
    return { refreshed: true, lastSyncedAt: result.syncedAt };
  }
}
