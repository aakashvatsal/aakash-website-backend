import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { ADVANCED_HEALTH_GRAPH_COLLECTIONS } from '../knowledge-graph/health-knowledge-graph-integration.service';

type SystemHealthLevel = 'healthy' | 'warning' | 'blocked' | 'idle';
type OpsCheckLevel = 'pass' | 'warning' | 'fail';

type OpsCheck = {
  id: string;
  label: string;
  level: OpsCheckLevel;
  detail: string;
};

type ModuleDefinition = {
  id: string;
  label: string;
  collections: string[];
  graphCollections?: string[];
  route: string;
};

type ModuleSnapshot = {
  id: string;
  label: string;
  route: string;
  status: SystemHealthLevel;
  sourceRecords: number;
  graphNodes: number | null;
  missingGraphCollections: string[];
  detail: string;
};

const CORE_MODULES: ModuleDefinition[] = [
  {
    id: 'people',
    label: 'People',
    collections: ['memory_people'],
    graphCollections: ['memory_people'],
    route: '/admin/hsakaa/people',
  },
  {
    id: 'companies',
    label: 'Companies',
    collections: ['companies'],
    graphCollections: ['companies'],
    route: '/admin/companies',
  },
  {
    id: 'journal',
    label: 'Journal',
    collections: ['journal_entries'],
    graphCollections: ['journal_entries'],
    route: '/admin/journal',
  },
  {
    id: 'memory',
    label: 'Memory',
    collections: ['memory'],
    graphCollections: ['memory'],
    route: '/admin/hsakaa/memory',
  },
  {
    id: 'library',
    label: 'Library',
    collections: ['library_items', 'library_highlights'],
    graphCollections: ['library_items', 'library_highlights'],
    route: '/admin/library',
  },
  {
    id: 'health',
    label: 'Health',
    collections: ['health_entries', ...ADVANCED_HEALTH_GRAPH_COLLECTIONS],
    graphCollections: ['health_entries', ...ADVANCED_HEALTH_GRAPH_COLLECTIONS],
    route: '/admin/health',
  },
  {
    id: 'media',
    label: 'Media',
    collections: ['media_posts'],
    graphCollections: ['media_posts'],
    route: '/admin/media',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    collections: ['tasks'],
    graphCollections: ['tasks'],
    route: '/admin/tasks',
  },
  {
    id: 'reminders',
    label: 'Reminders',
    collections: ['reminders'],
    route: '/admin/reminders',
  },
];

@Injectable()
export class PersonalOsSystemHealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async snapshot() {
    const collectionNames = [
      ...new Set(
        CORE_MODULES.flatMap((module) => module.collections).concat([
          'knowledge_graph_nodes',
          'knowledge_graph_edges',
          'universal_search_embeddings',
          'hsakaa_proactive_signals',
        ]),
      ),
    ];

    const counts = Object.fromEntries(
      await Promise.all(
        collectionNames.map(async (collection) => [
          collection,
          await this.safeCount(collection, this.activeFilter(collection)),
        ]),
      ),
    ) as Record<string, number>;

    const graphByCollection = await this.graphCountsBySourceCollection();
    const coreModules = CORE_MODULES.map((definition) =>
      this.moduleSnapshot(definition, counts, graphByCollection),
    );

    const graphNodes = counts.knowledge_graph_nodes ?? 0;
    const graphEdges = counts.knowledge_graph_edges ?? 0;
    const indexedNodes = counts.universal_search_embeddings ?? 0;
    const searchCoverage = graphNodes
      ? Number(Math.min(1, indexedNodes / graphNodes).toFixed(4))
      : 0;

    const engineModules: ModuleSnapshot[] = [
      {
        id: 'knowledge-graph',
        label: 'Knowledge Graph',
        route: '/admin/hsakaa/graph',
        status: graphNodes > 0 ? 'healthy' : 'warning',
        sourceRecords: graphNodes,
        graphNodes,
        missingGraphCollections: [],
        detail:
          graphNodes > 0
            ? `${graphNodes} active node(s) and ${graphEdges} active edge(s).`
            : 'No active graph snapshot exists yet. Run Knowledge Graph sync.',
      },
      {
        id: 'universal-search',
        label: 'Universal Search',
        route: '/admin/hsakaa/search',
        status: this.searchStatus(graphNodes, searchCoverage),
        sourceRecords: indexedNodes,
        graphNodes,
        missingGraphCollections: [],
        detail: graphNodes
          ? `${(searchCoverage * 100).toFixed(1)}% of active graph nodes have an active semantic embedding.`
          : 'Search is waiting for the first Knowledge Graph snapshot.',
      },
      {
        id: 'context-engine',
        label: 'Context Engine',
        route: '/admin/hsakaa/context',
        status: graphNodes > 0 ? 'healthy' : 'warning',
        sourceRecords: graphNodes,
        graphNodes,
        missingGraphCollections: [],
        detail:
          graphNodes > 0
            ? 'Context Engine has graph evidence available; lexical fallback remains available if semantic search degrades.'
            : 'Context Engine has no graph evidence to pack yet.',
      },
      {
        id: 'proactive-hsakaa',
        label: 'Proactive HSAKAA',
        route: '/admin/hsakaa/proactive',
        status: graphNodes > 0 ? 'healthy' : 'warning',
        sourceRecords: counts.hsakaa_proactive_signals ?? 0,
        graphNodes,
        missingGraphCollections: [],
        detail:
          graphNodes > 0
            ? `${counts.hsakaa_proactive_signals ?? 0} stored proactive signal(s); graph evidence is available for scans.`
            : 'Proactive scans should wait until the graph has active evidence.',
      },
    ];

    const modules = [...coreModules, ...engineModules];
    const checks = this.buildChecks(coreModules, graphNodes, searchCoverage);
    const blocked = modules.filter(
      (module) => module.status === 'blocked',
    ).length;
    const warnings = modules.filter(
      (module) => module.status === 'warning',
    ).length;
    const idle = modules.filter((module) => module.status === 'idle').length;
    const healthy = modules.filter(
      (module) => module.status === 'healthy',
    ).length;

    return {
      status: blocked ? 'blocked' : warnings ? 'warning' : 'healthy',
      score: Math.max(0, 100 - blocked * 15 - warnings * 4),
      summary: { healthy, warnings, blocked, idle },
      modules,
      checks,
      graph: {
        activeNodes: graphNodes,
        activeEdges: graphEdges,
        indexedNodes,
        semanticCoverage: searchCoverage,
      },
      generatedAt: new Date(),
    };
  }

  private moduleSnapshot(
    definition: ModuleDefinition,
    counts: Record<string, number>,
    graphByCollection: Record<string, number>,
  ): ModuleSnapshot {
    const sourceRecords = definition.collections.reduce(
      (total, collection) => total + (counts[collection] ?? 0),
      0,
    );

    if (!definition.graphCollections?.length) {
      return {
        id: definition.id,
        label: definition.label,
        route: definition.route,
        status: 'healthy',
        sourceRecords,
        graphNodes: null,
        missingGraphCollections: [],
        detail: sourceRecords
          ? `${sourceRecords} active record(s); this module does not require Knowledge Graph ingestion.`
          : 'Ready. No active records yet.',
      };
    }

    const populatedGraphCollections = definition.graphCollections.filter(
      (collection) => (counts[collection] ?? 0) > 0,
    );
    const missingGraphCollections = populatedGraphCollections.filter(
      (collection) => (graphByCollection[collection] ?? 0) === 0,
    );
    const graphNodes = definition.graphCollections.reduce(
      (total, collection) => total + (graphByCollection[collection] ?? 0),
      0,
    );

    if (!sourceRecords) {
      return {
        id: definition.id,
        label: definition.label,
        route: definition.route,
        status: 'idle',
        sourceRecords,
        graphNodes,
        missingGraphCollections: [],
        detail: 'Ready. No active source records yet.',
      };
    }

    if (missingGraphCollections.length) {
      return {
        id: definition.id,
        label: definition.label,
        route: definition.route,
        status: 'blocked',
        sourceRecords,
        graphNodes,
        missingGraphCollections,
        detail: `Source data exists but ${missingGraphCollections.join(', ')} has no active Knowledge Graph representation.`,
      };
    }

    return {
      id: definition.id,
      label: definition.label,
      route: definition.route,
      status: 'healthy',
      sourceRecords,
      graphNodes,
      missingGraphCollections: [],
      detail: `${sourceRecords} active source record(s) are connected to ${graphNodes} graph node(s).`,
    };
  }

  private buildChecks(
    modules: ModuleSnapshot[],
    graphNodes: number,
    searchCoverage: number,
  ): OpsCheck[] {
    const checks = modules.map((module) => {
      if (module.status === 'blocked') {
        return this.fail(
          `module-${module.id}`,
          `${module.label} cross-system connection`,
          module.detail,
        );
      }
      if (module.status === 'idle') {
        return this.pass(
          `module-${module.id}`,
          `${module.label} cross-system connection`,
          'Module is wired and currently has no active source records.',
        );
      }
      return this.pass(
        `module-${module.id}`,
        `${module.label} cross-system connection`,
        module.detail,
      );
    });

    checks.push(
      graphNodes > 0
        ? this.pass(
            'system-health-graph-evidence',
            'Personal OS graph evidence',
            `${graphNodes} active Knowledge Graph node(s) are available to Search, Context and Proactive HSAKAA.`,
          )
        : this.warning(
            'system-health-graph-evidence',
            'Personal OS graph evidence',
            'No active Knowledge Graph nodes exist yet. Run a graph sync before evaluating cross-system behavior.',
          ),
    );

    checks.push(
      !graphNodes
        ? this.warning(
            'system-health-search-coverage',
            'Universal Search semantic coverage',
            'Semantic coverage cannot be evaluated until the graph has active nodes.',
          )
        : searchCoverage < 0.3
          ? this.fail(
              'system-health-search-coverage',
              'Universal Search semantic coverage',
              `Only ${(searchCoverage * 100).toFixed(1)}% of active graph nodes have embeddings.`,
            )
          : searchCoverage < 0.85
            ? this.warning(
                'system-health-search-coverage',
                'Universal Search semantic coverage',
                `${(searchCoverage * 100).toFixed(1)}% of active graph nodes have embeddings; lexical fallback remains available.`,
              )
            : this.pass(
                'system-health-search-coverage',
                'Universal Search semantic coverage',
                `${(searchCoverage * 100).toFixed(1)}% of active graph nodes have embeddings.`,
              ),
    );

    return checks;
  }

  private searchStatus(
    graphNodes: number,
    coverage: number,
  ): SystemHealthLevel {
    if (!graphNodes) return 'warning';
    if (coverage < 0.3) return 'blocked';
    if (coverage < 0.85) return 'warning';
    return 'healthy';
  }

  private async graphCountsBySourceCollection(): Promise<
    Record<string, number>
  > {
    try {
      const rows = await this.connection
        .collection('knowledge_graph_nodes')
        .aggregate<{ _id: string; count: number }>([
          { $match: { isActive: true } },
          { $group: { _id: '$sourceCollection', count: { $sum: 1 } } },
        ])
        .toArray();
      return Object.fromEntries(rows.map((row) => [row._id, row.count]));
    } catch {
      return {};
    }
  }

  private activeFilter(collection: string): Record<string, unknown> {
    if (collection === 'hsakaa_proactive_signals') return {};
    return { isActive: true };
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

  private pass(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'pass', detail };
  }

  private warning(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'warning', detail };
  }

  private fail(id: string, label: string, detail: string): OpsCheck {
    return { id, label, level: 'fail', detail };
  }
}
