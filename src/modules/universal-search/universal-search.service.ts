import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { HsakaaAiUsageService } from '../hsakaa-observability/hsakaa-ai-usage.service';
import {
  HsakaaAiUsageFeature,
  HsakaaAiUsageStatus,
} from '../hsakaa-observability/schemas/hsakaa-ai-usage.schema';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeDocument,
} from '../knowledge-graph/schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeDocument,
  KnowledgeGraphNodeType,
} from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import {
  HsakaaUniversalSearchDto,
  UniversalSearchIndexSyncDto,
  UniversalSearchMode,
  UniversalSearchQueryDto,
  UniversalSearchSort,
} from './dto/universal-search.dto';
import {
  UniversalSearchEmbedding,
  UniversalSearchEmbeddingDocument,
} from './schemas/universal-search-embedding.schema';

type SearchNode = {
  nodeKey: string;
  type: KnowledgeGraphNodeType;
  sourceCollection: string;
  sourceId: string;
  label: string;
  summary?: string;
  aliases: string[];
  tags: string[];
  importance: number;
  privacy: string;
  occurredAt?: Date;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  metadata: Record<string, unknown>;
  searchText?: string;
};

type CachedEmbedding = {
  nodeKey: string;
  embeddingModel: string;
  fingerprint: string;
  embedding: number[];
  indexedAt: Date;
  isActive: boolean;
};

type ScoreParts = {
  exact: number;
  lexical: number;
  semantic: number;
  importance: number;
  recency: number;
  relationship: number;
};

type IndexSyncResult = {
  model: string;
  totalNodes: number;
  pendingBeforeSync: number;
  attempted: number;
  generated: number;
  failed: number;
  remaining: number;
  indexedNodes: number;
  coverage: number;
  semanticReady: boolean;
  errors: string[];
  skipped?: boolean;
  skipReason?: string;
};

type ScoredNode = {
  node: SearchNode;
  score: number;
  parts: ScoreParts;
  matchReasons: string[];
};

const MAX_CANDIDATES = 5000;
const EMBEDDING_BATCH_SIZE = 64;
const DEFAULT_SYNC_LIMIT = 1000;

@Injectable()
export class UniversalSearchService {
  private indexSyncPromise: Promise<IndexSyncResult> | null = null;

  constructor(
    @InjectModel(KnowledgeGraphNode.name)
    private readonly nodeModel: Model<KnowledgeGraphNodeDocument>,
    @InjectModel(KnowledgeGraphEdge.name)
    private readonly edgeModel: Model<KnowledgeGraphEdgeDocument>,
    @InjectModel(UniversalSearchEmbedding.name)
    private readonly embeddingModel: Model<UniversalSearchEmbeddingDocument>,
    private readonly graphService: KnowledgeGraphService,
    private readonly aiService: AiService,
    private readonly aiUsage: HsakaaAiUsageService,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  async search(query: UniversalSearchQueryDto) {
    await this.graphService.ensureFresh();

    const mode = query.mode ?? UniversalSearchMode.HYBRID;
    const sort = query.sort ?? UniversalSearchSort.RELEVANCE;
    const limit = query.limit ?? 30;
    const offset = query.offset ?? 0;
    const normalizedQuery = this.normalize(query.q);
    const tokens = this.tokens(query.q);
    const nodes = await this.loadCandidates(query);

    const lexical = nodes.map((node) => {
      const exact = this.exactScore(node, normalizedQuery);
      const lexicalScore = this.lexicalScore(node, normalizedQuery, tokens);
      return { node, exact, lexical: lexicalScore };
    });

    const anchorKeys = lexical
      .filter((item) => item.exact >= 0.65 || item.lexical >= 0.55)
      .sort((a, b) => b.exact + b.lexical - (a.exact + a.lexical))
      .slice(0, 8)
      .map((item) => item.node.nodeKey);
    const relationBoosts = await this.relationshipBoosts(anchorKeys);

    const semantic =
      mode === UniversalSearchMode.EXACT
        ? { scores: new Map<string, number>(), available: false, reason: null }
        : await this.semanticScores(query.q, nodes);

    let scored: ScoredNode[] = lexical.map((item) => {
      const parts: ScoreParts = {
        exact: item.exact,
        lexical: item.lexical,
        semantic: semantic.scores.get(item.node.nodeKey) ?? 0,
        importance: this.clamp(item.node.importance),
        recency: this.recencyScore(item.node.occurredAt),
        relationship: relationBoosts.get(item.node.nodeKey) ?? 0,
      };
      return {
        node: item.node,
        score: this.combinedScore(parts, mode, semantic.available),
        parts,
        matchReasons: this.matchReasons(parts, semantic.available),
      };
    });

    scored = scored.filter((item) =>
      this.isRelevant(item, mode, semantic.available),
    );
    scored = this.sort(scored, sort);

    const total = scored.length;
    const page = scored.slice(offset, offset + limit);
    const relationships = await this.relatedEntities(
      page.map((item) => item.node.nodeKey),
    );
    const facets = this.facets(scored);

    return {
      query: query.q,
      mode,
      sort,
      total,
      offset,
      limit,
      semantic: {
        available: semantic.available,
        model: semantic.available ? this.aiService.getEmbeddingModel() : null,
        indexedCandidates: semantic.scores.size,
        degradedReason: semantic.reason,
      },
      filters: {
        types: query.types ?? [],
        tags: query.tags ?? [],
        from: query.from ?? null,
        to: query.to ?? null,
        minImportance: query.minImportance ?? null,
      },
      facets,
      results: page.map((item, index) => ({
        rank: offset + index + 1,
        nodeKey: item.node.nodeKey,
        type: item.node.type,
        label: item.node.label,
        summary: item.node.summary ?? null,
        snippet: this.snippet(item.node, normalizedQuery),
        aliases: item.node.aliases,
        tags: item.node.tags,
        importance: item.node.importance,
        privacy: item.node.privacy,
        occurredAt: item.node.occurredAt ?? null,
        score: Number(item.score.toFixed(6)),
        scoreBreakdown: {
          exact: Number(item.parts.exact.toFixed(4)),
          lexical: Number(item.parts.lexical.toFixed(4)),
          semantic: Number(item.parts.semantic.toFixed(4)),
          importance: Number(item.parts.importance.toFixed(4)),
          recency: Number(item.parts.recency.toFixed(4)),
          relationship: Number(item.parts.relationship.toFixed(4)),
        },
        matchReasons: item.matchReasons,
        source: {
          collection: item.node.sourceCollection,
          id: item.node.sourceId,
          createdAt: item.node.sourceCreatedAt ?? null,
          updatedAt: item.node.sourceUpdatedAt ?? null,
          metadata: item.node.metadata,
        },
        relatedEntities: relationships.get(item.node.nodeKey) ?? [],
      })),
    };
  }

  async getIndexStatus() {
    await this.graphService.ensureFresh();
    const model = this.aiService.getEmbeddingModel();
    const [totalNodes, indexedNodes, inactiveEmbeddings] = await Promise.all([
      this.nodeModel.countDocuments({ isActive: true }),
      this.embeddingModel.countDocuments({
        isActive: true,
        embeddingModel: model,
      }),
      this.embeddingModel.countDocuments({ isActive: false }),
    ]);

    return {
      model,
      totalNodes,
      indexedNodes,
      pendingNodes: Math.max(0, totalNodes - indexedNodes),
      inactiveEmbeddings,
      semanticReady: totalNodes > 0 && indexedNodes >= totalNodes,
      coverage: totalNodes ? Number((indexedNodes / totalNodes).toFixed(4)) : 0,
    };
  }

  async syncIndex(
    dto: UniversalSearchIndexSyncDto = {},
  ): Promise<IndexSyncResult> {
    if (this.indexSyncPromise) return this.indexSyncPromise;

    this.indexSyncPromise = this.syncIndexWithLease(dto).finally(() => {
      this.indexSyncPromise = null;
    });
    return this.indexSyncPromise;
  }

  private async syncIndexWithLease(
    dto: UniversalSearchIndexSyncDto,
  ): Promise<IndexSyncResult> {
    const lease = await this.runtimeLeases.acquire(
      'universal-search-index-sync',
      20 * 60_000,
      { engine: 'universal_search', force: Boolean(dto.force) },
    );
    if (!lease) {
      const status = await this.getIndexStatus();
      return {
        model: status.model,
        totalNodes: status.totalNodes,
        pendingBeforeSync: status.pendingNodes,
        attempted: 0,
        generated: 0,
        failed: 0,
        remaining: status.pendingNodes,
        indexedNodes: status.indexedNodes,
        coverage: status.coverage,
        semanticReady: status.semanticReady,
        errors: [],
        skipped: true,
        skipReason: 'Another search index sync is already running.',
      };
    }

    try {
      return await this.performIndexSync(dto);
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  private async performIndexSync(
    dto: UniversalSearchIndexSyncDto,
  ): Promise<IndexSyncResult> {
    await this.graphService.ensureFresh();
    const model = this.aiService.getEmbeddingModel();
    const maxEmbeddings = dto.maxEmbeddings ?? DEFAULT_SYNC_LIMIT;
    const nodes = (await this.nodeModel
      .find({ isActive: true })
      .select('+searchText')
      .sort({ importance: -1, sourceUpdatedAt: -1 })
      .limit(MAX_CANDIDATES)
      .lean()
      .exec()) as unknown as SearchNode[];

    const existing = (await this.embeddingModel
      .find({ nodeKey: { $in: nodes.map((node) => node.nodeKey) } })
      .select('+embedding')
      .lean()
      .exec()) as unknown as CachedEmbedding[];
    const existingByKey = new Map(existing.map((item) => [item.nodeKey, item]));

    const pending = nodes.filter((node) => {
      const cached = existingByKey.get(node.nodeKey);
      if (dto.force) return true;
      return (
        !cached ||
        !cached.isActive ||
        cached.embeddingModel !== model ||
        cached.fingerprint !== this.fingerprint(node)
      );
    });
    const selected = pending.slice(0, maxEmbeddings);

    let generated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (
      let index = 0;
      index < selected.length;
      index += EMBEDDING_BATCH_SIZE
    ) {
      const batch = selected.slice(index, index + EMBEDDING_BATCH_SIZE);
      const embeddingTexts = batch.map((node) => this.embeddingText(node));
      const aiStartedAt = Date.now();
      try {
        await this.aiUsage.assertBudget(
          HsakaaAiUsageFeature.SEARCH_INDEX_EMBEDDING,
        );
        const result = await this.aiService.generateEmbeddings(embeddingTexts);
        if (result.embeddings.length !== batch.length) {
          throw new Error(
            'Embedding provider returned an unexpected batch size.',
          );
        }
        const indexedAt = new Date();
        await this.embeddingModel.bulkWrite(
          batch.map((node, batchIndex) => ({
            updateOne: {
              filter: { nodeKey: node.nodeKey },
              update: {
                $set: {
                  nodeKey: node.nodeKey,
                  embeddingModel: result.model,
                  fingerprint: this.fingerprint(node),
                  embedding: result.embeddings[batchIndex],
                  indexedAt,
                  isActive: true,
                },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        );
        generated += batch.length;
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.SEARCH_INDEX_EMBEDDING,
          status: HsakaaAiUsageStatus.SUCCESS,
          startedAt: aiStartedAt,
          model: result.model,
          estimatedInputTokens: Math.ceil(
            embeddingTexts.reduce((sum, text) => sum + text.length, 0) / 4,
          ),
          requestUnits: batch.length,
          metadata: { batchSize: batch.length },
        });
      } catch (error) {
        await this.aiUsage.record({
          feature: HsakaaAiUsageFeature.SEARCH_INDEX_EMBEDDING,
          status: this.aiUsage.isBudgetExceeded(error)
            ? HsakaaAiUsageStatus.BLOCKED
            : HsakaaAiUsageStatus.ERROR,
          startedAt: aiStartedAt,
          model,
          estimatedInputTokens: Math.ceil(
            embeddingTexts.reduce((sum, text) => sum + text.length, 0) / 4,
          ),
          requestUnits: batch.length,
          metadata: { batchSize: batch.length },
          error,
        });
        failed += batch.length;
        if (errors.length < 5) errors.push(this.errorMessage(error));
      }
    }

    const activeKeys = nodes.map((node) => node.nodeKey);
    await this.embeddingModel.updateMany(
      activeKeys.length
        ? { nodeKey: { $nin: activeKeys }, isActive: true }
        : { isActive: true },
      { $set: { isActive: false } },
    );

    const indexedNodes = await this.embeddingModel.countDocuments({
      isActive: true,
      embeddingModel: model,
    });

    return {
      model,
      totalNodes: nodes.length,
      pendingBeforeSync: pending.length,
      attempted: selected.length,
      generated,
      failed,
      remaining: Math.max(0, pending.length - selected.length + failed),
      indexedNodes,
      coverage: nodes.length
        ? Number((indexedNodes / nodes.length).toFixed(4))
        : 0,
      semanticReady: nodes.length > 0 && indexedNodes >= nodes.length,
      errors,
    };
  }

  async searchForHsakaa(dto: HsakaaUniversalSearchDto) {
    const maxEvidence = dto.maxEvidence ?? 24;
    const result = await this.search({
      q: dto.question,
      mode: UniversalSearchMode.HYBRID,
      sort: UniversalSearchSort.RELEVANCE,
      types: dto.types,
      from: dto.from,
      to: dto.to,
      limit: maxEvidence,
      offset: 0,
    });

    const context = result.results
      .map((item) => {
        const related = item.relatedEntities
          .slice(0, 3)
          .map((entity) => `${entity.relationship}: ${entity.label}`)
          .join('; ');
        return [
          `[${item.rank}] ${item.type.toUpperCase()} — ${item.label}`,
          item.summary ? `Summary: ${item.summary}` : null,
          item.occurredAt
            ? `Occurred: ${new Date(item.occurredAt).toISOString()}`
            : null,
          `Source: ${item.source.collection}/${item.source.id}`,
          related ? `Related: ${related}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    return {
      question: dto.question,
      evidenceCount: result.results.length,
      semantic: result.semantic,
      evidence: result.results,
      context: this.truncate(context, 24_000),
      instruction:
        'Use only this evidence packet for grounded Personal OS reasoning. Cite result ranks and state when evidence is insufficient or contradictory.',
    };
  }

  private async loadCandidates(query: UniversalSearchQueryDto) {
    const filter: QueryFilter<KnowledgeGraphNodeDocument> = { isActive: true };
    if (query.types?.length) filter.type = { $in: query.types };
    if (query.tags?.length) filter.tags = { $in: query.tags };
    if (query.minImportance !== undefined) {
      filter.importance = { $gte: query.minImportance };
    }
    if (query.from || query.to) {
      filter.occurredAt = {};
      if (query.from) filter.occurredAt.$gte = new Date(query.from);
      if (query.to) filter.occurredAt.$lte = new Date(query.to);
    }

    return (await this.nodeModel
      .find(filter)
      .select('+searchText')
      .sort({ importance: -1, occurredAt: -1 })
      .limit(MAX_CANDIDATES)
      .lean()
      .exec()) as unknown as SearchNode[];
  }

  private async semanticScores(query: string, nodes: SearchNode[]) {
    if (!nodes.length) {
      return {
        scores: new Map<string, number>(),
        available: false,
        reason: 'No graph nodes match the selected filters.',
      };
    }

    const aiStartedAt = Date.now();
    try {
      const model = this.aiService.getEmbeddingModel();
      const cache = (await this.embeddingModel
        .find({
          nodeKey: { $in: nodes.map((node) => node.nodeKey) },
          embeddingModel: model,
          isActive: true,
        })
        .select('+embedding')
        .lean()
        .exec()) as unknown as CachedEmbedding[];
      if (!cache.length) {
        return {
          scores: new Map<string, number>(),
          available: false,
          reason:
            'Semantic index is empty. Sync the Universal Search index first.',
        };
      }

      await this.aiUsage.assertBudget(
        HsakaaAiUsageFeature.SEARCH_QUERY_EMBEDDING,
      );
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.SEARCH_QUERY_EMBEDDING,
        status: HsakaaAiUsageStatus.SUCCESS,
        startedAt: aiStartedAt,
        model,
        estimatedInputTokens: Math.ceil(query.length / 4),
        metadata: { candidateCount: cache.length },
      });
      const scores = new Map<string, number>();
      for (const item of cache) {
        if (!item.embedding?.length) continue;
        scores.set(
          item.nodeKey,
          Math.max(0, this.cosine(queryEmbedding.embedding, item.embedding)),
        );
      }
      return { scores, available: scores.size > 0, reason: null };
    } catch (error) {
      await this.aiUsage.record({
        feature: HsakaaAiUsageFeature.SEARCH_QUERY_EMBEDDING,
        status: this.aiUsage.isBudgetExceeded(error)
          ? HsakaaAiUsageStatus.BLOCKED
          : HsakaaAiUsageStatus.FALLBACK,
        startedAt: aiStartedAt,
        model: this.aiService.getEmbeddingModel(),
        estimatedInputTokens: Math.ceil(query.length / 4),
        metadata: { candidateCount: nodes.length },
        error,
      });
      return {
        scores: new Map<string, number>(),
        available: false,
        reason: `Semantic search degraded to lexical ranking: ${this.errorMessage(error)}`,
      };
    }
  }

  private async relationshipBoosts(anchorKeys: string[]) {
    const boosts = new Map<string, number>();
    if (!anchorKeys.length) return boosts;
    const edges = await this.edgeModel
      .find({
        isActive: true,
        $or: [
          { sourceNodeKey: { $in: anchorKeys } },
          { targetNodeKey: { $in: anchorKeys } },
        ],
      })
      .lean()
      .exec();

    for (const edge of edges) {
      const sourceIsAnchor = anchorKeys.includes(edge.sourceNodeKey);
      const key = sourceIsAnchor ? edge.targetNodeKey : edge.sourceNodeKey;
      if (anchorKeys.includes(key)) continue;
      const value = this.clamp(Number(edge.strength ?? 0.5));
      boosts.set(key, Math.max(boosts.get(key) ?? 0, value));
    }
    return boosts;
  }

  private async relatedEntities(nodeKeys: string[]) {
    const result = new Map<
      string,
      Array<{
        nodeKey: string;
        type: KnowledgeGraphNodeType;
        label: string;
        relationship: string;
        strength: number;
      }>
    >();
    if (!nodeKeys.length) return result;

    const edges = await this.edgeModel
      .find({
        isActive: true,
        $or: [
          { sourceNodeKey: { $in: nodeKeys } },
          { targetNodeKey: { $in: nodeKeys } },
        ],
      })
      .sort({ strength: -1 })
      .limit(300)
      .lean()
      .exec();
    const relatedKeys = new Set<string>();
    for (const edge of edges) {
      if (nodeKeys.includes(edge.sourceNodeKey))
        relatedKeys.add(edge.targetNodeKey);
      if (nodeKeys.includes(edge.targetNodeKey))
        relatedKeys.add(edge.sourceNodeKey);
    }
    const relatedNodes = (await this.nodeModel
      .find({ nodeKey: { $in: [...relatedKeys] }, isActive: true })
      .lean()
      .exec()) as unknown as SearchNode[];
    const nodeByKey = new Map(relatedNodes.map((node) => [node.nodeKey, node]));

    for (const edge of edges) {
      const pairs: Array<[string, string]> = [];
      if (nodeKeys.includes(edge.sourceNodeKey)) {
        pairs.push([edge.sourceNodeKey, edge.targetNodeKey]);
      }
      if (nodeKeys.includes(edge.targetNodeKey)) {
        pairs.push([edge.targetNodeKey, edge.sourceNodeKey]);
      }
      for (const [key, relatedKey] of pairs) {
        const related = nodeByKey.get(relatedKey);
        if (!related) continue;
        const list = result.get(key) ?? [];
        if (
          list.length >= 4 ||
          list.some((item) => item.nodeKey === relatedKey)
        ) {
          continue;
        }
        list.push({
          nodeKey: related.nodeKey,
          type: related.type,
          label: related.label,
          relationship: edge.label || edge.type,
          strength: Number(edge.strength ?? 0.5),
        });
        result.set(key, list);
      }
    }
    return result;
  }

  private exactScore(node: SearchNode, query: string) {
    if (!query) return 0;
    const label = this.normalize(node.label);
    const aliases = node.aliases.map((value) => this.normalize(value));
    const tags = node.tags.map((value) => this.normalize(value));
    if (label === query) return 1;
    if (aliases.includes(query)) return 0.96;
    if (tags.includes(query)) return 0.88;
    if (label.startsWith(query)) return 0.84;
    if (label.includes(query)) return 0.76;
    if (aliases.some((value) => value.includes(query))) return 0.7;
    if (this.normalize(node.summary ?? '').includes(query)) return 0.58;
    if (this.normalize(node.searchText ?? '').includes(query)) return 0.52;
    return 0;
  }

  private lexicalScore(node: SearchNode, query: string, tokens: string[]) {
    if (!tokens.length) return this.exactScore(node, query);
    const label = this.normalize(node.label);
    const aliases = this.normalize(node.aliases.join(' '));
    const tags = this.normalize(node.tags.join(' '));
    const summary = this.normalize(node.summary ?? '');
    const corpus = this.normalize(node.searchText ?? '');

    let weighted = 0;
    for (const token of tokens) {
      if (label.includes(token)) weighted += 0.45;
      if (aliases.includes(token)) weighted += 0.2;
      if (tags.includes(token)) weighted += 0.15;
      if (summary.includes(token)) weighted += 0.15;
      else if (corpus.includes(token)) weighted += 0.05;
    }
    const coverage = weighted / Math.max(1, tokens.length);
    const phraseBoost = query && corpus.includes(query) ? 0.18 : 0;
    return this.clamp(coverage + phraseBoost);
  }

  private combinedScore(
    parts: ScoreParts,
    mode: UniversalSearchMode,
    semanticAvailable: boolean,
  ) {
    if (mode === UniversalSearchMode.EXACT) {
      return (
        parts.exact * 0.55 +
        parts.lexical * 0.3 +
        parts.importance * 0.1 +
        parts.recency * 0.04 +
        parts.relationship * 0.01
      );
    }
    if (mode === UniversalSearchMode.SEMANTIC && semanticAvailable) {
      return (
        parts.semantic * 0.7 +
        parts.lexical * 0.1 +
        parts.exact * 0.05 +
        parts.importance * 0.09 +
        parts.recency * 0.04 +
        parts.relationship * 0.02
      );
    }
    if (!semanticAvailable) {
      return (
        parts.exact * 0.48 +
        parts.lexical * 0.34 +
        parts.importance * 0.1 +
        parts.recency * 0.05 +
        parts.relationship * 0.03
      );
    }
    return (
      parts.exact * 0.28 +
      parts.lexical * 0.24 +
      parts.semantic * 0.32 +
      parts.importance * 0.08 +
      parts.recency * 0.05 +
      parts.relationship * 0.03
    );
  }

  private isRelevant(
    item: ScoredNode,
    mode: UniversalSearchMode,
    semanticAvailable: boolean,
  ) {
    if (mode === UniversalSearchMode.EXACT || !semanticAvailable) {
      return item.parts.exact > 0 || item.parts.lexical >= 0.08;
    }
    if (mode === UniversalSearchMode.SEMANTIC) {
      return item.parts.semantic >= 0.2 || item.parts.lexical >= 0.2;
    }
    return (
      item.parts.exact > 0 ||
      item.parts.lexical >= 0.08 ||
      item.parts.semantic >= 0.2
    );
  }

  private sort(items: ScoredNode[], sort: UniversalSearchSort) {
    return items.sort((first, second) => {
      if (sort === UniversalSearchSort.RECENT) {
        const delta =
          this.time(second.node.occurredAt) - this.time(first.node.occurredAt);
        return delta || second.score - first.score;
      }
      if (sort === UniversalSearchSort.IMPORTANCE) {
        return (
          second.node.importance - first.node.importance ||
          second.score - first.score
        );
      }
      return second.score - first.score;
    });
  }

  private facets(items: ScoredNode[]) {
    const types: Record<string, number> = {};
    const tags: Record<string, number> = {};
    for (const item of items) {
      types[item.node.type] = (types[item.node.type] ?? 0) + 1;
      for (const tag of item.node.tags.slice(0, 12)) {
        tags[tag] = (tags[tag] ?? 0) + 1;
      }
    }
    return {
      types,
      tags: Object.entries(tags)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([tag, count]) => ({ tag, count })),
    };
  }

  private matchReasons(parts: ScoreParts, semanticAvailable: boolean) {
    const reasons: string[] = [];
    if (parts.exact >= 0.9) reasons.push('exact match');
    else if (parts.exact > 0) reasons.push('phrase match');
    if (parts.lexical >= 0.35) reasons.push('keyword relevance');
    if (semanticAvailable && parts.semantic >= 0.55)
      reasons.push('semantic similarity');
    if (parts.relationship >= 0.5) reasons.push('related entity');
    if (parts.importance >= 0.8) reasons.push('high importance');
    return reasons.slice(0, 4);
  }

  private snippet(node: SearchNode, query: string) {
    const source = node.summary || node.searchText || node.label;
    if (!query) return this.truncate(source, 360);
    const normalized = this.normalize(source);
    const index = normalized.indexOf(query);
    if (index < 0) return this.truncate(source, 360);
    const start = Math.max(0, index - 120);
    return `${start > 0 ? '…' : ''}${this.truncate(source.slice(start), 360)}`;
  }

  private embeddingText(node: SearchNode) {
    return this.truncate(
      [
        `Type: ${node.type}`,
        `Title: ${node.label}`,
        node.aliases.length ? `Aliases: ${node.aliases.join(', ')}` : '',
        node.tags.length ? `Tags: ${node.tags.join(', ')}` : '',
        node.summary ? `Summary: ${node.summary}` : '',
        node.searchText ? `Search text: ${node.searchText}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      8000,
    );
  }

  private fingerprint(node: SearchNode) {
    return createHash('sha256').update(this.embeddingText(node)).digest('hex');
  }

  private recencyScore(value?: Date) {
    if (!value) return 0.25;
    const ageDays = Math.max(
      0,
      (Date.now() - new Date(value).getTime()) / 86_400_000,
    );
    return Math.exp((-Math.log(2) * ageDays) / 180);
  }

  private cosine(first: number[], second: number[]) {
    if (!first.length || first.length !== second.length) return 0;
    let dot = 0;
    let firstNorm = 0;
    let secondNorm = 0;
    for (let index = 0; index < first.length; index += 1) {
      dot += first[index] * second[index];
      firstNorm += first[index] * first[index];
      secondNorm += second[index] * second[index];
    }
    if (!firstNorm || !secondNorm) return 0;
    return dot / (Math.sqrt(firstNorm) * Math.sqrt(secondNorm));
  }

  private tokens(value: string) {
    const stop = new Set([
      'the',
      'and',
      'for',
      'with',
      'that',
      'this',
      'from',
      'what',
      'which',
      'who',
      'when',
      'where',
      'how',
      'did',
      'does',
      'have',
      'has',
      'about',
    ]);
    return [
      ...new Set(
        this.normalize(value)
          .split(/\s+/)
          .filter((token) => token.length >= 2 && !stop.has(token)),
      ),
    ].slice(0, 32);
  }

  private normalize(value: unknown) {
    const text =
      typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? `${value}`
          : value instanceof Date
            ? value.toISOString()
            : '';
    return text
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private truncate(value: string, max: number) {
    return value.length <= max
      ? value
      : `${value.slice(0, max - 1).trimEnd()}…`;
  }

  private clamp(value: number) {
    return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  }

  private time(value?: Date) {
    return value ? new Date(value).getTime() : 0;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
