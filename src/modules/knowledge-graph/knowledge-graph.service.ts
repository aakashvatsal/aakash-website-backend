/* eslint-disable @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { HsakaaRuntimeLeaseService } from '../hsakaa-runtime/hsakaa-runtime-lease.service';
import {
  HealthEntry,
  HealthEntryDocument,
} from '../health/schemas/health-entry.schema';
import {
  JournalEntry,
  JournalEntryDocument,
} from '../journal/schemas/journal-entry.schema';
import {
  LibraryHighlight,
  LibraryHighlightDocument,
} from '../library/schemas/library-highlight.schema';
import {
  LibraryItem,
  LibraryItemDocument,
} from '../library/schemas/library-item.schema';
import {
  MediaPost,
  MediaPostDocument,
} from '../media/schemas/media-post.schema';
import {
  Memory,
  MemoryAccessLevel,
  MemoryDocument,
  MemoryEntityType,
} from '../memory/schemas/memory.schema';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from '../memory/schemas/memory-person.schema';
import {
  PersonGraphEdge,
  PersonGraphEdgeDocument,
} from '../memory/schemas/person-graph-edge.schema';
import { Task, TaskDocument, TaskPriority } from '../tasks/schemas/task.schema';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseDocument,
} from '../../hsakaa/schemas/hsakaa-decision-case.schema';
import {
  KnowledgeGraphNeighborsQueryDto,
  KnowledgeGraphOverviewQueryDto,
  KnowledgeGraphPathQueryDto,
  KnowledgeGraphTimelineQueryDto,
} from './dto/knowledge-graph.dto';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeDirection,
  KnowledgeGraphEdgeDocument,
  KnowledgeGraphEdgeType,
  KnowledgeGraphEvidence,
} from './schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeDocument,
  KnowledgeGraphNodeType,
  KnowledgeGraphPrivacy,
} from './schemas/knowledge-graph-node.schema';

type SourceRecord = Record<string, any> & {
  _id: { toString(): string } | string;
  createdAt?: Date;
  updatedAt?: Date;
};

type NodeInput = {
  nodeKey: string;
  type: KnowledgeGraphNodeType;
  sourceCollection: string;
  sourceId: string;
  label: string;
  summary?: string;
  aliases?: string[];
  tags?: string[];
  importance?: number;
  privacy?: KnowledgeGraphPrivacy;
  occurredAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  sourceCreatedAt?: Date;
  sourceUpdatedAt?: Date;
  metadata?: Record<string, unknown>;
  searchText?: string;
};

type SyncResult = {
  syncedAt: Date;
  nodes: number;
  edges: number;
  countsByType: Record<string, number>;
};

type EdgeInput = {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  type: KnowledgeGraphEdgeType;
  label?: string;
  strength?: number;
  direction?: KnowledgeGraphEdgeDirection;
  evidence?: KnowledgeGraphEvidence[];
  occurredAt?: Date;
  validFrom?: Date;
  validTo?: Date;
  metadata?: Record<string, unknown>;
  isDerived?: boolean;
};

const DEFAULT_OVERVIEW_LIMIT = 180;
const DEFAULT_TIMELINE_LIMIT = 120;
const FRESHNESS_MINUTES = 10;

@Injectable()
export class KnowledgeGraphService {
  private syncPromise: Promise<SyncResult> | null = null;

  constructor(
    @InjectModel(KnowledgeGraphNode.name)
    private readonly nodeModel: Model<KnowledgeGraphNodeDocument>,
    @InjectModel(KnowledgeGraphEdge.name)
    private readonly edgeModel: Model<KnowledgeGraphEdgeDocument>,
    @InjectModel(MemoryPerson.name)
    private readonly personModel: Model<MemoryPersonDocument>,
    @InjectModel(PersonGraphEdge.name)
    private readonly personGraphEdgeModel: Model<PersonGraphEdgeDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(HsakaaDecisionCase.name)
    private readonly decisionModel: Model<HsakaaDecisionCaseDocument>,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<MemoryDocument>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItemDocument>,
    @InjectModel(LibraryHighlight.name)
    private readonly highlightModel: Model<LibraryHighlightDocument>,
    @InjectModel(HealthEntry.name)
    private readonly healthModel: Model<HealthEntryDocument>,
    @InjectModel(MediaPost.name)
    private readonly mediaModel: Model<MediaPostDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
    private readonly runtimeLeases: HsakaaRuntimeLeaseService,
  ) {}

  async ensureFresh(maxAgeMinutes = FRESHNESS_MINUTES) {
    const latest = await this.nodeModel
      .findOne({ isActive: true })
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

    const result = await this.syncAll();
    return { refreshed: true, lastSyncedAt: result.syncedAt };
  }

  async syncAll() {
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = this.syncWithLease().finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  private async syncWithLease(): Promise<SyncResult> {
    const lease = await this.runtimeLeases.acquire(
      'knowledge-graph-sync',
      10 * 60_000,
      { engine: 'knowledge_graph' },
    );
    if (!lease) return this.waitForExternalSync();

    try {
      return await this.performSync();
    } finally {
      await this.runtimeLeases.release(lease);
    }
  }

  private async waitForExternalSync(): Promise<SyncResult> {
    const startedAt = Date.now();
    const initial = await this.latestSyncAt();

    while (Date.now() - startedAt < 30_000) {
      await this.sleep(500);
      const latest = await this.latestSyncAt();
      if (latest && (!initial || latest.getTime() > initial.getTime())) {
        return this.currentSnapshot(latest);
      }
    }

    return this.currentSnapshot((await this.latestSyncAt()) ?? new Date(0));
  }

  private async latestSyncAt(): Promise<Date | null> {
    const latest = await this.nodeModel
      .findOne({ isActive: true })
      .sort({ lastSyncedAt: -1 })
      .select({ lastSyncedAt: 1 })
      .lean()
      .exec();
    return latest?.lastSyncedAt ? new Date(latest.lastSyncedAt) : null;
  }

  private async currentSnapshot(syncedAt: Date): Promise<SyncResult> {
    const [nodes, edges, grouped] = await Promise.all([
      this.nodeModel.countDocuments({ isActive: true }),
      this.edgeModel.countDocuments({ isActive: true }),
      this.nodeModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { isActive: true } },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);
    return {
      syncedAt,
      nodes,
      edges,
      countsByType: Object.fromEntries(
        grouped.map((item) => [item._id, item.count]),
      ),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getOverview(query: KnowledgeGraphOverviewQueryDto = {}) {
    await this.ensureFresh();

    const filter: Record<string, unknown> = { isActive: true };
    if (query.types?.length) filter.type = { $in: query.types };

    const normalizedQuery = this.clean(query.q);
    if (normalizedQuery) {
      const regex = new RegExp(this.escapeRegex(normalizedQuery), 'i');
      filter.$or = [
        { label: regex },
        { summary: regex },
        { aliases: regex },
        { tags: regex },
      ];
    }

    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_OVERVIEW_LIMIT, 1),
      500,
    );
    const nodes = await this.nodeModel
      .find(filter)
      .sort({ importance: -1, occurredAt: -1, sourceUpdatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    const nodeKeys = nodes.map((node) => node.nodeKey);
    const edges = nodeKeys.length
      ? await this.edgeModel
          .find({
            isActive: true,
            sourceNodeKey: { $in: nodeKeys },
            targetNodeKey: { $in: nodeKeys },
          })
          .sort({ strength: -1, occurredAt: -1 })
          .lean()
          .exec()
      : [];

    const [totalNodes, totalEdges, typeCounts] = await Promise.all([
      this.nodeModel.countDocuments({ isActive: true }),
      this.edgeModel.countDocuments({ isActive: true }),
      this.nodeModel.aggregate<{ _id: KnowledgeGraphNodeType; count: number }>([
        { $match: { isActive: true } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      nodes,
      edges,
      summary: {
        totalNodes,
        totalEdges,
        returnedNodes: nodes.length,
        returnedEdges: edges.length,
        connectedDomains: typeCounts.length,
        countsByType: Object.fromEntries(
          typeCounts.map((item) => [item._id, item.count]),
        ),
        query: normalizedQuery || null,
      },
      generatedAt: new Date(),
    };
  }

  async getNode(nodeKey: string) {
    await this.ensureFresh();
    const node = await this.nodeModel
      .findOne({ nodeKey, isActive: true })
      .lean()
      .exec();
    if (!node) throw new NotFoundException('Knowledge Graph node not found.');

    const edges = await this.edgeModel
      .find({
        isActive: true,
        $or: [{ sourceNodeKey: nodeKey }, { targetNodeKey: nodeKey }],
      })
      .sort({ strength: -1, occurredAt: -1 })
      .lean()
      .exec();
    const neighborKeys = [
      ...new Set(
        edges.flatMap((edge) => [edge.sourceNodeKey, edge.targetNodeKey]),
      ),
    ].filter((key) => key !== nodeKey);
    const neighbors = neighborKeys.length
      ? await this.nodeModel
          .find({ nodeKey: { $in: neighborKeys }, isActive: true })
          .lean()
          .exec()
      : [];

    return { node, edges, neighbors, generatedAt: new Date() };
  }

  async getNeighbors(
    nodeKey: string,
    query: KnowledgeGraphNeighborsQueryDto = {},
  ) {
    await this.ensureFresh();
    const root = await this.nodeModel
      .findOne({ nodeKey, isActive: true })
      .lean()
      .exec();
    if (!root) throw new NotFoundException('Knowledge Graph node not found.');

    const depth = Math.min(Math.max(query.depth ?? 1, 1), 3);
    const limit = Math.min(Math.max(query.limit ?? 150, 1), 300);
    const visited = new Set<string>([nodeKey]);
    let frontier = new Set<string>([nodeKey]);
    const edgeMap = new Map<string, any>();

    for (
      let level = 0;
      level < depth && frontier.size && visited.size < limit;
      level += 1
    ) {
      const current = [...frontier];
      const edges = await this.edgeModel
        .find({
          isActive: true,
          $or: [
            { sourceNodeKey: { $in: current } },
            { targetNodeKey: { $in: current } },
          ],
        })
        .sort({ strength: -1 })
        .lean()
        .exec();

      frontier = new Set<string>();
      for (const edge of edges) {
        edgeMap.set(edge.edgeKey, edge);
        for (const key of [edge.sourceNodeKey, edge.targetNodeKey]) {
          if (!visited.has(key) && visited.size < limit) {
            visited.add(key);
            frontier.add(key);
          }
        }
      }
    }

    const nodes = await this.nodeModel
      .find({ nodeKey: { $in: [...visited] }, isActive: true })
      .sort({ importance: -1, occurredAt: -1 })
      .lean()
      .exec();

    return {
      root,
      nodes,
      edges: [...edgeMap.values()].filter(
        (edge) =>
          visited.has(edge.sourceNodeKey) && visited.has(edge.targetNodeKey),
      ),
      depth,
      generatedAt: new Date(),
    };
  }

  async findPath(query: KnowledgeGraphPathQueryDto) {
    await this.ensureFresh();
    const maxDepth = Math.min(Math.max(query.maxDepth ?? 4, 1), 6);
    const endpoints = await this.nodeModel
      .find({ nodeKey: { $in: [query.from, query.to] }, isActive: true })
      .lean()
      .exec();
    if (endpoints.length !== 2)
      throw new NotFoundException(
        'One or both Knowledge Graph nodes were not found.',
      );

    if (query.from === query.to) {
      return {
        found: true,
        nodes: [endpoints[0]],
        edges: [],
        hops: 0,
        maxDepth,
        generatedAt: new Date(),
      };
    }

    const visited = new Set<string>([query.from]);
    const parent = new Map<string, { from: string; edge: any }>();
    let frontier = new Set<string>([query.from]);
    let found = false;

    for (
      let depth = 0;
      depth < maxDepth && frontier.size && !found;
      depth += 1
    ) {
      const current = [...frontier];
      const edges = await this.edgeModel
        .find({
          isActive: true,
          $or: [
            { sourceNodeKey: { $in: current } },
            { targetNodeKey: { $in: current } },
          ],
        })
        .sort({ strength: -1 })
        .lean()
        .exec();
      const next = new Set<string>();

      for (const edge of edges) {
        for (const currentKey of current) {
          const neighbor = this.edgeNeighbor(edge, currentKey);
          if (!neighbor || visited.has(neighbor)) continue;
          visited.add(neighbor);
          parent.set(neighbor, { from: currentKey, edge });
          next.add(neighbor);
          if (neighbor === query.to) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      frontier = next;
    }

    if (!found) {
      return {
        found: false,
        nodes: [],
        edges: [],
        hops: null,
        maxDepth,
        generatedAt: new Date(),
      };
    }

    const pathKeys = [query.to];
    const pathEdges: any[] = [];
    let cursor = query.to;
    while (cursor !== query.from) {
      const step = parent.get(cursor);
      if (!step) break;
      pathEdges.unshift(step.edge);
      cursor = step.from;
      pathKeys.unshift(cursor);
    }
    const nodeDocs = await this.nodeModel
      .find({ nodeKey: { $in: pathKeys }, isActive: true })
      .lean()
      .exec();
    const byKey = new Map(nodeDocs.map((node) => [node.nodeKey, node]));

    return {
      found: true,
      nodes: pathKeys.map((key) => byKey.get(key)).filter(Boolean),
      edges: pathEdges,
      hops: pathEdges.length,
      maxDepth,
      generatedAt: new Date(),
    };
  }

  async getTimeline(query: KnowledgeGraphTimelineQueryDto = {}) {
    await this.ensureFresh();
    const filter: Record<string, any> = {
      isActive: true,
      occurredAt: { $ne: null },
    };
    if (query.types?.length) filter.type = { $in: query.types };
    if (query.from || query.to) {
      filter.occurredAt = {};
      if (query.from) filter.occurredAt.$gte = new Date(query.from);
      if (query.to) filter.occurredAt.$lte = new Date(query.to);
    }
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_TIMELINE_LIMIT, 1),
      500,
    );
    const nodes = await this.nodeModel
      .find(filter)
      .sort({ occurredAt: -1, importance: -1 })
      .limit(limit)
      .lean()
      .exec();

    return { nodes, count: nodes.length, generatedAt: new Date() };
  }

  async getEvidenceGraph(question: string, maxEvidence = 30) {
    await this.ensureFresh();
    const normalized = this.normalize(question);
    const tokens = this.searchTokens(question);
    const timeWindow = this.parseTimeWindow(question);
    const requestedTypes = this.inferQuestionTypes(normalized);

    const allImportant = await this.nodeModel
      .find({
        isActive: true,
        ...(requestedTypes.length ? { type: { $in: requestedTypes } } : {}),
        ...(timeWindow
          ? { occurredAt: { $gte: timeWindow.from, $lte: timeWindow.to } }
          : {}),
      })
      .sort({ importance: -1, occurredAt: -1 })
      .limit(250)
      .lean()
      .exec();

    const companies = await this.nodeModel
      .find({ isActive: true, type: KnowledgeGraphNodeType.COMPANY })
      .lean()
      .exec();
    const matchedCompanies = companies.filter((company) =>
      [company.label, ...(company.aliases ?? [])].some((value) =>
        normalized.includes(this.normalize(value)),
      ),
    );

    const scored = allImportant
      .map((node) => ({
        node,
        score: this.nodeQuestionScore(node as any, tokens, matchedCompanies),
      }))
      .filter(
        (item) => item.score > 0 || requestedTypes.includes(item.node.type),
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.node.importance ?? 0) - (a.node.importance ?? 0),
      );

    const seeds = [
      ...new Map(
        [...matchedCompanies, ...scored.map((item) => item.node)].map(
          (node) => [node.nodeKey, node],
        ),
      ).values(),
    ].slice(0, Math.max(8, Math.min(maxEvidence, 30)));
    const seedKeys = seeds.map((node) => node.nodeKey);

    const incidentEdges = seedKeys.length
      ? await this.edgeModel
          .find({
            isActive: true,
            $or: [
              { sourceNodeKey: { $in: seedKeys } },
              { targetNodeKey: { $in: seedKeys } },
            ],
          })
          .sort({ strength: -1, occurredAt: -1 })
          .limit(maxEvidence * 5)
          .lean()
          .exec()
      : [];

    const relatedKeys = [
      ...new Set(
        incidentEdges.flatMap((edge) => [
          edge.sourceNodeKey,
          edge.targetNodeKey,
        ]),
      ),
    ];
    const relatedNodes = relatedKeys.length
      ? await this.nodeModel
          .find({ nodeKey: { $in: relatedKeys }, isActive: true })
          .sort({ importance: -1, occurredAt: -1 })
          .lean()
          .exec()
      : [];

    const rankedRelated = relatedNodes
      .map((node) => ({
        node,
        score: this.nodeQuestionScore(node as any, tokens, matchedCompanies),
      }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.node.importance ?? 0) - (a.node.importance ?? 0),
      )
      .slice(0, maxEvidence)
      .map((item) => item.node);
    const selectedKeys = new Set(rankedRelated.map((node) => node.nodeKey));
    const selectedEdges = incidentEdges
      .filter(
        (edge) =>
          selectedKeys.has(edge.sourceNodeKey) &&
          selectedKeys.has(edge.targetNodeKey),
      )
      .slice(0, maxEvidence * 2);

    return {
      question,
      timeWindow,
      inferredTypes: requestedTypes,
      matchedCompanies,
      nodes: rankedRelated,
      edges: selectedEdges,
      generatedAt: new Date(),
    };
  }

  private async performSync() {
    const syncedAt = new Date();
    const [
      people,
      peopleEdges,
      companies,
      decisions,
      journals,
      memories,
      books,
      highlights,
      health,
      media,
      tasks,
    ] = await Promise.all([
      this.personModel
        .find({ isActive: true, isArchived: false, isBlocked: false })
        .lean()
        .exec(),
      this.personGraphEdgeModel.find({ isActive: true }).lean().exec(),
      this.companyModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.decisionModel.find({}).lean().exec(),
      this.journalModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.memoryModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.libraryItemModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.highlightModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.healthModel
        .find({ isActive: true, isArchived: false })
        .lean()
        .exec(),
      this.mediaModel.find({ isActive: true, isArchived: false }).lean().exec(),
      this.taskModel.find({ isActive: true, isArchived: false }).lean().exec(),
    ]);

    const source = {
      people: people as unknown as SourceRecord[],
      peopleEdges: peopleEdges as unknown as SourceRecord[],
      companies: companies as unknown as SourceRecord[],
      decisions: decisions as unknown as SourceRecord[],
      journals: journals as unknown as SourceRecord[],
      memories: memories as unknown as SourceRecord[],
      books: books as unknown as SourceRecord[],
      highlights: highlights as unknown as SourceRecord[],
      health: health as unknown as SourceRecord[],
      media: media as unknown as SourceRecord[],
      tasks: tasks as unknown as SourceRecord[],
    };

    const nodes = this.buildNodes(source);
    const nodeBySource = new Map(
      nodes.map((node) => [
        `${node.sourceCollection}:${node.sourceId}`,
        node.nodeKey,
      ]),
    );
    const nodesByType = this.groupNodesByType(nodes);
    const edges = this.buildEdges(source, nodes, nodeBySource, nodesByType);

    if (nodes.length) {
      await this.nodeModel.bulkWrite(
        nodes.map((node) => ({
          updateOne: {
            filter: { nodeKey: node.nodeKey },
            update: {
              $set: { ...node, lastSyncedAt: syncedAt, isActive: true },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const activeNodeKeys = nodes.map((node) => node.nodeKey);
    await this.nodeModel.updateMany(
      activeNodeKeys.length
        ? { nodeKey: { $nin: activeNodeKeys }, isActive: true }
        : { isActive: true },
      { $set: { isActive: false, lastSyncedAt: syncedAt } },
    );

    if (edges.length) {
      await this.edgeModel.bulkWrite(
        edges.map((edge) => ({
          updateOne: {
            filter: { edgeKey: edge.edgeKey },
            update: {
              $set: { ...edge, lastSyncedAt: syncedAt, isActive: true },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const activeEdgeKeys = edges.map((edge) => edge.edgeKey);
    await this.edgeModel.updateMany(
      activeEdgeKeys.length
        ? { edgeKey: { $nin: activeEdgeKeys }, isActive: true }
        : { isActive: true },
      { $set: { isActive: false, lastSyncedAt: syncedAt } },
    );

    const countsByType = Object.fromEntries(
      Object.entries(nodesByType).map(([key, value]) => [key, value.length]),
    );
    return { syncedAt, nodes: nodes.length, edges: edges.length, countsByType };
  }

  private buildNodes(source: Record<string, SourceRecord[]>): NodeInput[] {
    const nodes: NodeInput[] = [];

    for (const person of source.people) {
      const id = this.id(person._id);
      const label =
        this.clean(person.preferredName) || this.clean(person.name) || 'Person';
      nodes.push(
        this.node(KnowledgeGraphNodeType.PERSON, 'memory_people', id, label, {
          summary: this.joinText([
            person.relationshipLabel,
            person.roleTitle,
            person.organizationName,
            person.notes,
          ]),
          aliases: this.strings([
            person.name,
            ...(person.aliases ?? []),
          ]).filter((value) => value !== label),
          tags: this.strings([
            person.relationship,
            person.organizationName,
            ...(person.tags ?? []),
          ]),
          importance: this.clamp((Number(person.importance ?? 3) || 3) / 5),
          occurredAt:
            this.date(person.lastInteractionAt) ?? this.date(person.firstMetAt),
          sourceCreatedAt: this.date(person.createdAt),
          sourceUpdatedAt: this.date(person.updatedAt),
          metadata: {
            relationship: person.relationship,
            organizationName: person.organizationName,
            roleTitle: person.roleTitle,
            identityStatus: person.identityStatus,
          },
        }),
      );
    }

    for (const company of source.companies) {
      const id = this.id(company._id);
      const label = this.clean(company.name) || 'Company';
      nodes.push(
        this.node(KnowledgeGraphNodeType.COMPANY, 'companies', id, label, {
          summary: this.joinText([
            company.tagline,
            company.description,
            company.currentFocus,
          ]),
          aliases: this.strings([company.legalName, company.slug]),
          tags: this.strings([
            company.status,
            company.stage,
            ...(company.industries ?? []),
            ...(company.products ?? []),
          ]),
          importance: company.isFeatured ? 0.95 : 0.8,
          occurredAt: this.date(company.foundedAt),
          sourceCreatedAt: this.date(company.createdAt),
          sourceUpdatedAt: this.date(company.updatedAt),
          privacy: KnowledgeGraphPrivacy.PUBLIC_SAFE,
          metadata: {
            status: company.status,
            stage: company.stage,
            roles: company.roles ?? [],
          },
        }),
      );
    }

    for (const decision of source.decisions) {
      const id = this.id(decision._id);
      const question = this.clean(decision.question) || 'Decision';
      nodes.push(
        this.node(
          KnowledgeGraphNodeType.DECISION,
          'hsakaa_decision_cases',
          id,
          question,
          {
            summary: this.joinText([
              decision.context,
              decision.analysis?.summary,
              decision.analysis?.recommendation?.rationale,
              decision.outcome?.summary,
            ]),
            tags: this.strings([
              decision.horizon,
              decision.analysis?.decisionType,
              decision.outcome?.status,
            ]),
            importance: decision.commitment ? 0.95 : 0.82,
            occurredAt:
              this.date(decision.commitment?.committedAt) ??
              this.date(decision.generatedAt),
            sourceCreatedAt: this.date(decision.createdAt),
            sourceUpdatedAt: this.date(decision.updatedAt),
            metadata: {
              horizon: decision.horizon,
              recommendationOptionId:
                decision.analysis?.recommendation?.optionId ?? null,
              recommendationConfidence:
                decision.analysis?.recommendation?.confidence ?? null,
              committedOptionId: decision.commitment?.optionId ?? null,
              outcomeStatus: decision.outcome?.status ?? null,
            },
          },
        ),
      );
    }

    for (const journal of source.journals) {
      const id = this.id(journal._id);
      const label =
        this.clean(journal.title) || `Journal ${journal.dateKey ?? ''}`.trim();
      nodes.push(
        this.node(
          KnowledgeGraphNodeType.JOURNAL,
          'journal_entries',
          id,
          label,
          {
            summary: this.joinText(
              [
                journal.highlight,
                journal.content,
                ...(journal.decisions ?? []),
                ...(journal.ideas ?? []),
              ],
              3500,
            ),
            tags: this.strings([
              journal.type,
              journal.mood,
              ...(journal.tags ?? []),
            ]),
            importance: journal.isFavourite
              ? 0.82
              : journal.type === 'decision'
                ? 0.78
                : 0.58,
            occurredAt: this.date(journal.date),
            sourceCreatedAt: this.date(journal.createdAt),
            sourceUpdatedAt: this.date(journal.updatedAt),
            privacy:
              journal.visibility === 'public' && journal.isPublished
                ? KnowledgeGraphPrivacy.PUBLIC_SAFE
                : KnowledgeGraphPrivacy.OWNER_ONLY,
            metadata: {
              dateKey: journal.dateKey,
              type: journal.type,
              mood: journal.mood,
              visibility: journal.visibility,
            },
          },
        ),
      );
    }

    for (const memory of source.memories) {
      const id = this.id(memory._id);
      const content = this.clean(memory.content) || 'Memory';
      nodes.push(
        this.node(
          KnowledgeGraphNodeType.MEMORY,
          'memory',
          id,
          this.truncate(content, 120),
          {
            summary: content,
            tags: this.strings([
              memory.type,
              memory.source,
              memory.verificationStatus,
              ...(memory.tags ?? []),
              ...(memory.categories ?? []),
            ]),
            importance: this.clamp(Number(memory.importance ?? 0.5)),
            occurredAt:
              this.date(memory.happenedAt) ?? this.date(memory.capturedAt),
            validTo: this.date(memory.expiresAt),
            sourceCreatedAt: this.date(memory.createdAt),
            sourceUpdatedAt: this.date(memory.updatedAt),
            privacy:
              memory.accessLevel === MemoryAccessLevel.PUBLIC
                ? KnowledgeGraphPrivacy.PUBLIC_SAFE
                : KnowledgeGraphPrivacy.OWNER_ONLY,
            metadata: {
              type: memory.type,
              source: memory.source,
              confidence: memory.confidence,
              verificationStatus: memory.verificationStatus,
              lifecycleStatus: memory.lifecycleStatus,
            },
          },
        ),
      );
    }

    for (const book of source.books) {
      const id = this.id(book._id);
      const label = this.clean(book.title) || 'Library item';
      nodes.push(
        this.node(KnowledgeGraphNodeType.BOOK, 'library_items', id, label, {
          summary: this.joinText([
            book.subtitle,
            book.summary,
            book.notes,
            ...(book.keyTakeaways ?? []),
          ]),
          aliases: this.strings([book.slug]),
          tags: this.strings([
            book.type,
            book.status,
            book.category,
            ...(book.tags ?? []),
            ...(book.authors ?? []),
            book.author,
          ]),
          importance: this.clamp(
            0.45 +
              (book.isFavourite ? 0.25 : 0) +
              (book.status === 'completed' ? 0.1 : 0),
          ),
          occurredAt:
            this.date(book.completedAt) ??
            this.date(book.lastReadAt) ??
            this.date(book.startedAt),
          sourceCreatedAt: this.date(book.createdAt),
          sourceUpdatedAt: this.date(book.updatedAt),
          privacy: book.isPublic
            ? KnowledgeGraphPrivacy.PUBLIC_SAFE
            : KnowledgeGraphPrivacy.OWNER_ONLY,
          metadata: {
            type: book.type,
            status: book.status,
            authors: book.authors ?? [],
            rating: book.rating ?? null,
          },
        }),
      );
    }

    for (const highlight of source.highlights) {
      const id = this.id(highlight._id);
      const content =
        this.clean(highlight.note) ||
        this.clean(highlight.text) ||
        'Book highlight';
      nodes.push(
        this.node(
          KnowledgeGraphNodeType.HIGHLIGHT,
          'library_highlights',
          id,
          this.truncate(content, 140),
          {
            summary: this.joinText([highlight.text, highlight.note]),
            tags: this.strings([highlight.type, highlight.source]),
            importance: highlight.isFavourite ? 0.72 : 0.48,
            occurredAt:
              this.date(highlight.highlightedAt) ??
              this.date(highlight.sourceModifiedAt),
            sourceCreatedAt: this.date(highlight.createdAt),
            sourceUpdatedAt: this.date(highlight.updatedAt),
            privacy: highlight.isPublic
              ? KnowledgeGraphPrivacy.PUBLIC_SAFE
              : KnowledgeGraphPrivacy.OWNER_ONLY,
            metadata: {
              type: highlight.type,
              location: highlight.location,
              physicalLocation: highlight.physicalLocation,
            },
          },
        ),
      );
    }

    for (const entry of source.health) {
      const id = this.id(entry._id);
      const label = `Health · ${this.clean(entry.dateKey) || this.date(entry.date)?.toISOString().slice(0, 10) || id}`;
      nodes.push(
        this.node(KnowledgeGraphNodeType.HEALTH, 'health_entries', id, label, {
          summary: this.joinText([
            entry.notes,
            ...(entry.achievements ?? []),
            ...(entry.goals ?? []),
            ...(entry.symptoms ?? []),
            ...(entry.painEntries ?? []).map(
              (pain: any) =>
                `${pain.bodyPart ?? 'pain'} ${pain.description ?? ''}`,
            ),
          ]),
          tags: this.strings([entry.mood, ...(entry.sources ?? [])]),
          importance:
            entry.achievements?.length || entry.painEntries?.length
              ? 0.64
              : 0.45,
          occurredAt: this.date(entry.date),
          sourceCreatedAt: this.date(entry.createdAt),
          sourceUpdatedAt: this.date(entry.updatedAt),
          metadata: {
            dateKey: entry.dateKey,
            steps: entry.steps ?? null,
            strainScore: entry.strainScore ?? null,
            energyScore: entry.energyScore ?? null,
            recoveryScore: entry.recovery?.recoveryScore ?? null,
          },
        }),
      );
    }

    for (const post of source.media) {
      const id = this.id(post._id);
      const label =
        this.clean(post.content?.title) || `${post.platform ?? 'Media'} post`;
      nodes.push(
        this.node(KnowledgeGraphNodeType.MEDIA, 'media_posts', id, label, {
          summary: this.joinText([
            post.content?.hook,
            post.content?.shortDescription,
            post.content?.detailedDescription,
            post.strategy?.coreMessage,
            post.outcome?.lessonLearned,
          ]),
          tags: this.strings([
            post.platform,
            post.postType,
            post.publishing?.status,
            post.strategy?.contentPillar,
            post.strategy?.primaryGoal,
          ]),
          importance: post.publishing?.status === 'posted' ? 0.68 : 0.52,
          occurredAt:
            this.date(post.publishing?.publishedAt) ?? this.date(post.date),
          sourceCreatedAt: this.date(post.createdAt),
          sourceUpdatedAt: this.date(post.updatedAt),
          metadata: {
            platform: post.platform,
            postType: post.postType,
            status: post.publishing?.status,
            contentPillar: post.strategy?.contentPillar,
            outcomeStatus: post.outcome?.status,
          },
        }),
      );
    }

    for (const task of source.tasks) {
      const id = this.id(task._id);
      const label = this.clean(task.title) || 'Task';
      const priorityBoost =
        task.priority === TaskPriority.URGENT
          ? 0.25
          : task.priority === TaskPriority.HIGH
            ? 0.15
            : 0;
      nodes.push(
        this.node(KnowledgeGraphNodeType.TASK, 'tasks', id, label, {
          summary: this.joinText([task.description, task.notes]),
          tags: this.strings([
            task.status,
            task.priority,
            task.area,
            ...(task.tags ?? []),
          ]),
          importance: this.clamp(
            0.42 + priorityBoost + (task.isFavourite ? 0.15 : 0),
          ),
          occurredAt:
            this.date(task.completedAt) ??
            this.date(task.dueAt) ??
            this.date(task.startAt),
          sourceCreatedAt: this.date(task.createdAt),
          sourceUpdatedAt: this.date(task.updatedAt),
          metadata: {
            status: task.status,
            priority: task.priority,
            area: task.area,
            source: task.source,
          },
        }),
      );
    }

    return nodes;
  }

  private buildEdges(
    source: Record<string, SourceRecord[]>,
    nodes: NodeInput[],
    nodeBySource: Map<string, string>,
    nodesByType: Record<string, NodeInput[]>,
  ): EdgeInput[] {
    const edges = new Map<string, EdgeInput>();
    const add = (edge: Omit<EdgeInput, 'edgeKey'> & { edgeKey?: string }) => {
      if (
        !edge.sourceNodeKey ||
        !edge.targetNodeKey ||
        edge.sourceNodeKey === edge.targetNodeKey
      )
        return;
      const edgeKey =
        edge.edgeKey ??
        this.makeEdgeKey(
          edge.type,
          edge.sourceNodeKey,
          edge.targetNodeKey,
          edge.label,
        );
      const existing = edges.get(edgeKey);
      if (existing) {
        existing.evidence = this.mergeEvidence(
          existing.evidence ?? [],
          edge.evidence ?? [],
        );
        existing.strength = Math.max(
          existing.strength ?? 0,
          edge.strength ?? 0,
        );
        return;
      }
      edges.set(edgeKey, {
        ...edge,
        edgeKey,
        strength: edge.strength ?? 0.7,
        direction: edge.direction ?? KnowledgeGraphEdgeDirection.DIRECTED,
        evidence: edge.evidence ?? [],
        metadata: edge.metadata ?? {},
        isDerived: edge.isDerived ?? true,
      });
    };

    for (const relation of source.peopleEdges) {
      let sourceKey = nodeBySource.get(
        `memory_people:${this.id(relation.sourcePersonId)}`,
      );
      let targetKey = nodeBySource.get(
        `memory_people:${this.id(relation.targetPersonId)}`,
      );
      if (!sourceKey || !targetKey) continue;
      if (sourceKey.localeCompare(targetKey) > 0)
        [sourceKey, targetKey] = [targetKey, sourceKey];
      add({
        sourceNodeKey: sourceKey,
        targetNodeKey: targetKey,
        type: KnowledgeGraphEdgeType.PERSON_RELATIONSHIP,
        label: this.clean(relation.label) || this.clean(relation.kind),
        strength: this.clamp(Number(relation.strength ?? 0.75)),
        direction: KnowledgeGraphEdgeDirection.UNDIRECTED,
        evidence: [
          this.evidence(
            'person_graph_edges',
            this.id(relation._id),
            'kind',
            `Saved People Graph relationship: ${relation.kind ?? 'related'}`,
          ),
        ],
        metadata: {
          relationshipKind: relation.kind,
          contexts: relation.contexts ?? [],
        },
        isDerived: Boolean(relation.isDerived),
      });
    }

    for (const journal of source.journals) {
      const sourceKey = nodeBySource.get(
        `journal_entries:${this.id(journal._id)}`,
      );
      if (!sourceKey) continue;
      this.addIdEdges(
        add,
        sourceKey,
        journal.companyIds,
        'companies',
        KnowledgeGraphEdgeType.BELONGS_TO_COMPANY,
        journal,
        'companyIds',
      );
      this.addIdEdges(
        add,
        sourceKey,
        journal.memoryIds,
        'memory',
        KnowledgeGraphEdgeType.REFERENCES,
        journal,
        'memoryIds',
      );
      this.addIdEdges(
        add,
        sourceKey,
        journal.libraryItemIds,
        'library_items',
        KnowledgeGraphEdgeType.REFERENCES,
        journal,
        'libraryItemIds',
      );

      if ((journal.ideas ?? []).length) {
        for (const bookId of journal.libraryItemIds ?? []) {
          const bookKey = nodeBySource.get(`library_items:${this.id(bookId)}`);
          if (!bookKey) continue;
          add({
            sourceNodeKey: bookKey,
            targetNodeKey: sourceKey,
            type: KnowledgeGraphEdgeType.INFLUENCED_IDEA,
            label: 'reading linked to journal ideas',
            strength: 0.82,
            evidence: [
              this.evidence(
                'journal_entries',
                this.id(journal._id),
                'ideas',
                `Journal records ideas alongside this library item.`,
                this.date(journal.date),
              ),
            ],
            occurredAt: this.date(journal.date),
          });
        }
      }
    }

    for (const memory of source.memories) {
      const memoryKey = nodeBySource.get(`memory:${this.id(memory._id)}`);
      if (!memoryKey) continue;
      const personIds = [
        memory.personId,
        ...(memory.personLinks ?? []).map((link: any) => link.personId),
      ].filter(Boolean);
      this.addIdEdges(
        add,
        memoryKey,
        personIds,
        'memory_people',
        KnowledgeGraphEdgeType.INVOLVES_PERSON,
        memory,
        'personLinks',
      );

      for (const entity of memory.entities ?? []) {
        const targetType = this.memoryEntityNodeType(entity.type);
        if (!targetType) continue;
        const targetKey = entity.entityId
          ? nodeBySource.get(
              `${this.collectionForNodeType(targetType)}:${this.id(entity.entityId)}`,
            )
          : this.findNodeKeyByLabel(nodesByType[targetType] ?? [], entity.name);
        if (!targetKey) continue;
        add({
          sourceNodeKey: memoryKey,
          targetNodeKey: targetKey,
          type: KnowledgeGraphEdgeType.REFERENCES,
          label: entity.name,
          strength: 0.86,
          evidence: [
            this.evidence(
              'memory',
              this.id(memory._id),
              'entities',
              `Memory explicitly references ${entity.name}.`,
              this.date(memory.happenedAt) ?? this.date(memory.capturedAt),
            ),
          ],
          occurredAt:
            this.date(memory.happenedAt) ?? this.date(memory.capturedAt),
        });
      }

      if (memory.supersedesMemoryId) {
        const targetKey = nodeBySource.get(
          `memory:${this.id(memory.supersedesMemoryId)}`,
        );
        if (targetKey)
          add(
            this.simpleEdge(
              memoryKey,
              targetKey,
              KnowledgeGraphEdgeType.SUPERSEDES,
              memory,
              'supersedesMemoryId',
              0.98,
            ),
          );
      }
      for (const targetId of memory.contradictsMemoryIds ?? []) {
        const targetKey = nodeBySource.get(`memory:${this.id(targetId)}`);
        if (targetKey)
          add(
            this.simpleEdge(
              memoryKey,
              targetKey,
              KnowledgeGraphEdgeType.CONTRADICTS,
              memory,
              'contradictsMemoryIds',
              0.98,
            ),
          );
      }
    }

    for (const highlight of source.highlights) {
      const highlightKey = nodeBySource.get(
        `library_highlights:${this.id(highlight._id)}`,
      );
      const bookKey = nodeBySource.get(
        `library_items:${this.id(highlight.libraryItemId)}`,
      );
      if (highlightKey && bookKey) {
        add({
          sourceNodeKey: bookKey,
          targetNodeKey: highlightKey,
          type: KnowledgeGraphEdgeType.HAS_HIGHLIGHT,
          strength: 1,
          evidence: [
            this.evidence(
              'library_highlights',
              this.id(highlight._id),
              'libraryItemId',
              'Highlight belongs to this library item.',
              this.date(highlight.highlightedAt),
            ),
          ],
          occurredAt: this.date(highlight.highlightedAt),
        });
      }
    }

    for (const entry of source.health) {
      const sourceKey = nodeBySource.get(
        `health_entries:${this.id(entry._id)}`,
      );
      if (sourceKey)
        this.addIdEdges(
          add,
          sourceKey,
          entry.memoryIds,
          'memory',
          KnowledgeGraphEdgeType.REFERENCES,
          entry,
          'memoryIds',
        );
    }

    for (const post of source.media) {
      const sourceKey = nodeBySource.get(`media_posts:${this.id(post._id)}`);
      if (!sourceKey) continue;
      if (post.companyId)
        this.addIdEdges(
          add,
          sourceKey,
          [post.companyId],
          'companies',
          KnowledgeGraphEdgeType.BELONGS_TO_COMPANY,
          post,
          'companyId',
        );
      this.addIdEdges(
        add,
        sourceKey,
        post.memoryIds,
        'memory',
        KnowledgeGraphEdgeType.REFERENCES,
        post,
        'memoryIds',
      );
    }

    for (const task of source.tasks) {
      const sourceKey = nodeBySource.get(`tasks:${this.id(task._id)}`);
      if (!sourceKey) continue;
      if (task.companyId)
        this.addIdEdges(
          add,
          sourceKey,
          [task.companyId],
          'companies',
          KnowledgeGraphEdgeType.BELONGS_TO_COMPANY,
          task,
          'companyId',
        );
      this.addIdEdges(
        add,
        sourceKey,
        task.memoryIds,
        'memory',
        KnowledgeGraphEdgeType.REFERENCES,
        task,
        'memoryIds',
      );
      if (task.parentTaskId) {
        const parentKey = nodeBySource.get(
          `tasks:${this.id(task.parentTaskId)}`,
        );
        if (parentKey)
          add(
            this.simpleEdge(
              parentKey,
              sourceKey,
              KnowledgeGraphEdgeType.PARENT_OF,
              task,
              'parentTaskId',
              1,
            ),
          );
      }
    }

    this.addMentionEdges(
      add,
      source.decisions,
      'hsakaa_decision_cases',
      nodesByType,
      nodeBySource,
      [
        KnowledgeGraphNodeType.COMPANY,
        KnowledgeGraphNodeType.PERSON,
        KnowledgeGraphNodeType.BOOK,
      ],
    );
    this.addMentionEdges(
      add,
      source.journals,
      'journal_entries',
      nodesByType,
      nodeBySource,
      [
        KnowledgeGraphNodeType.PERSON,
        KnowledgeGraphNodeType.COMPANY,
        KnowledgeGraphNodeType.BOOK,
        KnowledgeGraphNodeType.DECISION,
      ],
    );

    return [...edges.values()];
  }

  private addMentionEdges(
    add: (edge: Omit<EdgeInput, 'edgeKey'> & { edgeKey?: string }) => void,
    records: SourceRecord[],
    sourceCollection: string,
    nodesByType: Record<string, NodeInput[]>,
    nodeBySource: Map<string, string>,
    targetTypes: KnowledgeGraphNodeType[],
  ) {
    for (const record of records) {
      const sourceKey = nodeBySource.get(
        `${sourceCollection}:${this.id(record._id)}`,
      );
      if (!sourceKey) continue;
      const corpus = this.normalize(this.recordCorpus(record));
      if (!corpus) continue;

      for (const targetType of targetTypes) {
        for (const target of nodesByType[targetType] ?? []) {
          if (target.nodeKey === sourceKey) continue;
          const candidates = [target.label, ...(target.aliases ?? [])]
            .map((value) => this.normalize(value))
            .filter((value) => value.length >= 4);
          const matched = candidates.find((candidate) =>
            corpus.includes(candidate),
          );
          if (!matched) continue;
          add({
            sourceNodeKey: sourceKey,
            targetNodeKey: target.nodeKey,
            type:
              targetType === KnowledgeGraphNodeType.COMPANY
                ? KnowledgeGraphEdgeType.BELONGS_TO_COMPANY
                : targetType === KnowledgeGraphNodeType.PERSON
                  ? KnowledgeGraphEdgeType.INVOLVES_PERSON
                  : KnowledgeGraphEdgeType.MENTIONS,
            label: `mentions ${target.label}`,
            strength:
              targetType === KnowledgeGraphNodeType.COMPANY ? 0.82 : 0.68,
            evidence: [
              this.evidence(
                sourceCollection,
                this.id(record._id),
                'text',
                `Source text mentions ${target.label}.`,
                this.recordOccurredAt(record, sourceCollection),
              ),
            ],
            occurredAt: this.recordOccurredAt(record, sourceCollection),
          });
        }
      }
    }
  }

  private addIdEdges(
    add: (edge: Omit<EdgeInput, 'edgeKey'> & { edgeKey?: string }) => void,
    sourceNodeKey: string,
    ids: unknown[] | undefined,
    targetCollection: string,
    type: KnowledgeGraphEdgeType,
    source: SourceRecord,
    fieldPath: string,
  ) {
    for (const value of ids ?? []) {
      const targetNodeKey = this.keyForCollection(
        targetCollection,
        this.id(value),
      );
      add({
        sourceNodeKey,
        targetNodeKey,
        type,
        strength: 0.95,
        evidence: [
          this.evidence(
            this.collectionOfSourceNode(sourceNodeKey),
            this.id(source._id),
            fieldPath,
            `Explicit ${fieldPath} relationship.`,
            this.recordOccurredAt(
              source,
              this.collectionOfSourceNode(sourceNodeKey),
            ),
          ),
        ],
        occurredAt: this.recordOccurredAt(
          source,
          this.collectionOfSourceNode(sourceNodeKey),
        ),
      });
    }
  }

  private simpleEdge(
    sourceNodeKey: string,
    targetNodeKey: string,
    type: KnowledgeGraphEdgeType,
    source: SourceRecord,
    fieldPath: string,
    strength: number,
  ) {
    return {
      sourceNodeKey,
      targetNodeKey,
      type,
      strength,
      evidence: [
        this.evidence(
          this.collectionOfSourceNode(sourceNodeKey),
          this.id(source._id),
          fieldPath,
          `Explicit ${fieldPath} relationship.`,
          this.recordOccurredAt(
            source,
            this.collectionOfSourceNode(sourceNodeKey),
          ),
        ),
      ],
      occurredAt: this.recordOccurredAt(
        source,
        this.collectionOfSourceNode(sourceNodeKey),
      ),
    };
  }

  private node(
    type: KnowledgeGraphNodeType,
    sourceCollection: string,
    sourceId: string,
    label: string,
    options: Omit<
      NodeInput,
      'nodeKey' | 'type' | 'sourceCollection' | 'sourceId' | 'label'
    > = {},
  ): NodeInput {
    const aliases = this.strings(options.aliases ?? []);
    const tags = this.strings(options.tags ?? []);
    const summary = this.clean(options.summary);
    return {
      nodeKey: this.keyForCollection(sourceCollection, sourceId),
      type,
      sourceCollection,
      sourceId,
      label: this.truncate(label, 300),
      summary: summary ? this.truncate(summary, 4000) : undefined,
      aliases,
      tags,
      importance: this.clamp(options.importance ?? 0.5),
      privacy: options.privacy ?? KnowledgeGraphPrivacy.OWNER_ONLY,
      occurredAt: options.occurredAt,
      validFrom: options.validFrom,
      validTo: options.validTo,
      sourceCreatedAt: options.sourceCreatedAt,
      sourceUpdatedAt: options.sourceUpdatedAt,
      metadata: options.metadata ?? {},
      searchText: this.joinText([label, summary, ...aliases, ...tags], 6000),
    };
  }

  private groupNodesByType(nodes: NodeInput[]) {
    const grouped: Record<string, NodeInput[]> = {};
    for (const node of nodes) (grouped[node.type] ??= []).push(node);
    return grouped;
  }

  private sourceReferenceCollection(entityType: unknown) {
    const normalized = this.normalize(entityType);
    const map: Record<string, string> = {
      person: 'memory_people',
      memory_person: 'memory_people',
      company: 'companies',
      decision: 'hsakaa_decision_cases',
      journal: 'journal_entries',
      journal_entry: 'journal_entries',
      memory: 'memory',
      book: 'library_items',
      library: 'library_items',
      library_item: 'library_items',
      highlight: 'library_highlights',
      health: 'health_entries',
      health_entry: 'health_entries',
      media: 'media_posts',
      media_post: 'media_posts',
      task: 'tasks',
    };
    return map[normalized];
  }

  private memoryEntityNodeType(
    type: MemoryEntityType,
  ): KnowledgeGraphNodeType | null {
    const map: Partial<Record<MemoryEntityType, KnowledgeGraphNodeType>> = {
      [MemoryEntityType.PERSON]: KnowledgeGraphNodeType.PERSON,
      [MemoryEntityType.COMPANY]: KnowledgeGraphNodeType.COMPANY,
      [MemoryEntityType.DECISION]: KnowledgeGraphNodeType.DECISION,
      [MemoryEntityType.TASK]: KnowledgeGraphNodeType.TASK,
      [MemoryEntityType.BOOK]: KnowledgeGraphNodeType.BOOK,
      [MemoryEntityType.MEDIA]: KnowledgeGraphNodeType.MEDIA,
      [MemoryEntityType.HEALTH]: KnowledgeGraphNodeType.HEALTH,
    };
    return map[type] ?? null;
  }

  private collectionForNodeType(type: KnowledgeGraphNodeType) {
    const map: Record<KnowledgeGraphNodeType, string> = {
      [KnowledgeGraphNodeType.PERSON]: 'memory_people',
      [KnowledgeGraphNodeType.COMPANY]: 'companies',
      [KnowledgeGraphNodeType.DECISION]: 'hsakaa_decision_cases',
      [KnowledgeGraphNodeType.JOURNAL]: 'journal_entries',
      [KnowledgeGraphNodeType.MEMORY]: 'memory',
      [KnowledgeGraphNodeType.BOOK]: 'library_items',
      [KnowledgeGraphNodeType.HIGHLIGHT]: 'library_highlights',
      [KnowledgeGraphNodeType.HEALTH]: 'health_entries',
      [KnowledgeGraphNodeType.MEDIA]: 'media_posts',
      [KnowledgeGraphNodeType.TASK]: 'tasks',
    };
    return map[type];
  }

  private keyForCollection(collection: string, id: string) {
    const typeByCollection: Record<string, KnowledgeGraphNodeType> = {
      memory_people: KnowledgeGraphNodeType.PERSON,
      companies: KnowledgeGraphNodeType.COMPANY,
      hsakaa_decision_cases: KnowledgeGraphNodeType.DECISION,
      journal_entries: KnowledgeGraphNodeType.JOURNAL,
      memory: KnowledgeGraphNodeType.MEMORY,
      library_items: KnowledgeGraphNodeType.BOOK,
      library_highlights: KnowledgeGraphNodeType.HIGHLIGHT,
      health_entries: KnowledgeGraphNodeType.HEALTH,
      media_posts: KnowledgeGraphNodeType.MEDIA,
      tasks: KnowledgeGraphNodeType.TASK,
    };
    const type = typeByCollection[collection];
    return type ? `${type}:${id}` : `${collection}:${id}`;
  }

  private collectionOfSourceNode(nodeKey: string) {
    const type = nodeKey.split(':', 1)[0] as KnowledgeGraphNodeType;
    return this.collectionForNodeType(type) ?? type;
  }

  private makeEdgeKey(
    type: KnowledgeGraphEdgeType,
    source: string,
    target: string,
    label?: string,
  ) {
    return `${type}:${source}>${target}${label ? `:${this.normalize(label).slice(0, 80)}` : ''}`;
  }

  private evidence(
    sourceCollection: string,
    sourceId: string,
    fieldPath?: string,
    note?: string,
    occurredAt?: Date,
  ): KnowledgeGraphEvidence {
    return {
      sourceCollection,
      sourceId,
      fieldPath,
      note: note ? this.truncate(note, 1000) : undefined,
      occurredAt,
    };
  }

  private mergeEvidence(
    first: KnowledgeGraphEvidence[],
    second: KnowledgeGraphEvidence[],
  ) {
    const map = new Map<string, KnowledgeGraphEvidence>();
    for (const item of [...first, ...second]) {
      const key = `${item.sourceCollection}:${item.sourceId}:${item.fieldPath ?? ''}:${item.note ?? ''}`;
      map.set(key, item);
    }
    return [...map.values()].slice(0, 12);
  }

  private findNodeKeyByLabel(nodes: NodeInput[], label: unknown) {
    const normalized = this.normalize(label);
    if (!normalized) return undefined;
    return nodes.find((node) =>
      [node.label, ...(node.aliases ?? [])].some(
        (candidate) => this.normalize(candidate) === normalized,
      ),
    )?.nodeKey;
  }

  private edgeNeighbor(
    edge: { sourceNodeKey: string; targetNodeKey: string },
    current: string,
  ) {
    if (edge.sourceNodeKey === current) return edge.targetNodeKey;
    if (edge.targetNodeKey === current) return edge.sourceNodeKey;
    return null;
  }

  private nodeQuestionScore(node: any, tokens: string[], companies: any[]) {
    const haystack = this.normalize(
      [
        node.label,
        node.summary,
        ...(node.aliases ?? []),
        ...(node.tags ?? []),
      ].join(' '),
    );
    let score = (Number(node.importance ?? 0.5) || 0.5) * 1.5;
    for (const token of tokens)
      if (haystack.includes(token)) score += token.length > 6 ? 2 : 1;
    if (companies.some((company) => company.nodeKey === node.nodeKey))
      score += 8;
    return score;
  }

  private inferQuestionTypes(normalizedQuestion: string) {
    const types = new Set<KnowledgeGraphNodeType>();
    const rules: Array<[RegExp, KnowledgeGraphNodeType[]]> = [
      [/decision|choice|tradeoff|commit/, [KnowledgeGraphNodeType.DECISION]],
      [/people|person|who|relationship/, [KnowledgeGraphNodeType.PERSON]],
      [/company|8lete|frayto|business/, [KnowledgeGraphNodeType.COMPANY]],
      [
        /book|read|reading|highlight/,
        [KnowledgeGraphNodeType.BOOK, KnowledgeGraphNodeType.HIGHLIGHT],
      ],
      [/journal|day|week|month/, [KnowledgeGraphNodeType.JOURNAL]],
      [/memory|remember/, [KnowledgeGraphNodeType.MEMORY]],
      [/health|sleep|recovery|workout|pain/, [KnowledgeGraphNodeType.HEALTH]],
      [
        /media|instagram|youtube|linkedin|content/,
        [KnowledgeGraphNodeType.MEDIA],
      ],
      [/task|todo|work item|commitment/, [KnowledgeGraphNodeType.TASK]],
      [
        /idea|influence/,
        [
          KnowledgeGraphNodeType.JOURNAL,
          KnowledgeGraphNodeType.MEMORY,
          KnowledgeGraphNodeType.BOOK,
        ],
      ],
    ];
    for (const [pattern, matched] of rules)
      if (pattern.test(normalizedQuestion))
        matched.forEach((type) => types.add(type));
    return [...types];
  }

  private parseTimeWindow(question: string) {
    const normalized = this.normalize(question);
    const now = new Date();
    const match = normalized.match(
      /last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)/,
    );
    if (match) {
      const count = Math.max(1, Number(match[1]));
      const from = new Date(now);
      const unit = match[2];
      if (unit.startsWith('day')) from.setDate(from.getDate() - count);
      else if (unit.startsWith('week'))
        from.setDate(from.getDate() - count * 7);
      else if (unit.startsWith('month')) from.setMonth(from.getMonth() - count);
      else from.setFullYear(from.getFullYear() - count);
      return { from, to: now, label: match[0] };
    }
    if (normalized.includes('last six months')) {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 6);
      return { from, to: now, label: 'last six months' };
    }
    return null;
  }

  private searchTokens(value: string) {
    const stop = new Set([
      'what',
      'which',
      'who',
      'when',
      'where',
      'over',
      'last',
      'have',
      'with',
      'that',
      'this',
      'from',
      'around',
      'important',
      'repeatedly',
      'eventually',
      'used',
      'affected',
    ]);
    return [
      ...new Set(
        this.normalize(value)
          .split(/\s+/)
          .filter((token) => token.length >= 3 && !stop.has(token)),
      ),
    ].slice(0, 24);
  }

  private recordCorpus(record: SourceRecord) {
    return this.joinText(
      [
        record.question,
        record.context,
        record.analysis?.summary,
        record.analysis?.recommendation?.rationale,
        record.outcome?.summary,
        record.title,
        record.content,
        record.highlight,
        ...(record.decisions ?? []),
        ...(record.ideas ?? []),
        ...(record.tags ?? []),
      ],
      20_000,
    );
  }

  private recordOccurredAt(record: SourceRecord, collection: string) {
    if (collection === 'journal_entries') return this.date(record.date);
    if (collection === 'hsakaa_decision_cases')
      return (
        this.date(record.commitment?.committedAt) ??
        this.date(record.generatedAt)
      );
    if (collection === 'health_entries') return this.date(record.date);
    if (collection === 'media_posts')
      return (
        this.date(record.publishing?.publishedAt) ?? this.date(record.date)
      );
    if (collection === 'tasks')
      return this.date(record.completedAt) ?? this.date(record.dueAt);
    if (collection === 'memory')
      return this.date(record.happenedAt) ?? this.date(record.capturedAt);
    return this.date(record.updatedAt) ?? this.date(record.createdAt);
  }

  private id(value: unknown) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof (value as any).toString === 'function')
      return (value as any).toString();
    return String(value);
  }

  private strings(values: unknown[]) {
    return [
      ...new Set(
        values
          .flatMap((value) => {
            if (Array.isArray(value))
              return value.map((item) => this.clean(item));
            return [this.clean(value)];
          })
          .filter(Boolean),
      ),
    ].slice(0, 80);
  }

  private clean(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private normalize(value: unknown) {
    return this.clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private joinText(values: unknown[], max = 4000) {
    const parts = values
      .flatMap((value) => {
        if (Array.isArray(value)) return value.map((item) => this.clean(item));
        return [this.clean(value)];
      })
      .filter(Boolean);
    return this.truncate(parts.join(' · '), max);
  }

  private truncate(value: string, max: number) {
    return value.length <= max
      ? value
      : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }

  private clamp(value: number) {
    if (!Number.isFinite(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
  }

  private date(value: unknown) {
    if (!value) return undefined;
    const date =
      value instanceof Date ? value : new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
