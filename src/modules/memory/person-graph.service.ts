import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  CreatePersonGraphEdgeDto,
  PersonGraphOverviewQueryDto,
  UpdatePersonGraphEdgeDto,
} from './dto/person-graph.dto';
import {
  MemoryPerson,
  MemoryPersonDocument,
} from './schemas/memory-person.schema';
import {
  PersonGraphEdge,
  PersonGraphEdgeDocument,
  PersonGraphEdgeSource,
  PersonGraphRelationshipKind,
} from './schemas/person-graph-edge.schema';
import {
  PersonRelationshipContext,
  PersonRelationshipContextDocument,
} from './schemas/person-relationship-context.schema';

const DEFAULT_GRAPH_LIMIT = 150;
const DEFAULT_PATH_DEPTH = 4;

const SYMMETRIC_RELATIONSHIPS = new Set<PersonGraphRelationshipKind>([
  PersonGraphRelationshipKind.KNOWS,
  PersonGraphRelationshipKind.FRIEND,
  PersonGraphRelationshipKind.FAMILY,
  PersonGraphRelationshipKind.COLLEAGUE,
  PersonGraphRelationshipKind.WORKS_WITH,
  PersonGraphRelationshipKind.COFOUNDER,
]);

type GraphPerson = MemoryPerson & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};

type GraphEdge = {
  edgeId: string;
  sourcePersonId: string;
  targetPersonId: string;
  kind: PersonGraphRelationshipKind;
  label?: string;
  contexts: string[];
  strength?: number;
  notes?: string;
  source: PersonGraphEdgeSource;
  isDerived: boolean;
  metadata: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
};

@Injectable()
export class PersonGraphService {
  constructor(
    @InjectModel(MemoryPerson.name)
    private readonly personModel: Model<MemoryPersonDocument>,
    @InjectModel(PersonGraphEdge.name)
    private readonly edgeModel: Model<PersonGraphEdgeDocument>,
    @InjectModel(PersonRelationshipContext.name)
    private readonly contextModel: Model<PersonRelationshipContextDocument>,
  ) {}

  async getOverview(query: PersonGraphOverviewQueryDto = {}) {
    const graph = await this.buildGraph();
    const contextQuery = this.normalizeSearch(query.context);
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_GRAPH_LIMIT, 1),
      500,
    );

    const selectedPeople = graph.people
      .filter((person) =>
        this.personMatchesContext(person, graph.contextsByPerson, contextQuery),
      )
      .sort((a, b) => {
        const importanceDelta = (b.importance ?? 3) - (a.importance ?? 3);
        if (importanceDelta) return importanceDelta;
        return this.displayName(a).localeCompare(this.displayName(b));
      })
      .slice(0, limit);
    const selectedIds = new Set(
      selectedPeople.map((person) => person._id.toString()),
    );
    const edges = graph.edges.filter(
      (edge) =>
        selectedIds.has(edge.sourcePersonId) &&
        selectedIds.has(edge.targetPersonId),
    );
    const adjacency = this.buildAdjacency(selectedIds, edges);
    const topConnected = selectedPeople
      .map((person) => ({
        person: this.toNode(person, graph.contextsByPerson, adjacency),
        degree: adjacency.get(person._id.toString())?.size ?? 0,
      }))
      .sort((a, b) => {
        if (b.degree !== a.degree) return b.degree - a.degree;
        return (b.person.importance ?? 3) - (a.person.importance ?? 3);
      })
      .slice(0, 10);

    const connectedIds = new Set<string>();
    for (const edge of edges) {
      connectedIds.add(edge.sourcePersonId);
      connectedIds.add(edge.targetPersonId);
    }

    return {
      nodes: selectedPeople.map((person) =>
        this.toNode(person, graph.contextsByPerson, adjacency),
      ),
      edges,
      topConnected,
      summary: {
        people: selectedPeople.length,
        connections: edges.length,
        explicitConnections: edges.filter((edge) => !edge.isDerived).length,
        derivedConnections: edges.filter((edge) => edge.isDerived).length,
        connectedPeople: connectedIds.size,
        isolatedPeople: selectedPeople.length - connectedIds.size,
        components: this.countComponents(selectedIds, adjacency),
        context: query.context?.trim() || null,
      },
      generatedAt: new Date(),
    };
  }

  async getForPerson(personId: string) {
    const person = await this.getActivePerson(personId);
    const graph = await this.buildGraph();
    const personKey = person._id.toString();
    const incidentEdges = graph.edges.filter(
      (edge) =>
        edge.sourcePersonId === personKey || edge.targetPersonId === personKey,
    );
    const neighborIds = new Set(
      incidentEdges.map((edge) =>
        edge.sourcePersonId === personKey
          ? edge.targetPersonId
          : edge.sourcePersonId,
      ),
    );
    const peopleById = new Map(
      graph.people.map((candidate) => [candidate._id.toString(), candidate]),
    );
    const adjacency = this.buildAdjacency(
      new Set(graph.people.map((candidate) => candidate._id.toString())),
      graph.edges,
    );

    const connections = incidentEdges
      .map((edge) => {
        const neighborId =
          edge.sourcePersonId === personKey
            ? edge.targetPersonId
            : edge.sourcePersonId;
        const neighbor = peopleById.get(neighborId);
        if (!neighbor) return null;

        return {
          edge,
          person: this.toNode(neighbor, graph.contextsByPerson, adjacency),
          direction: this.edgeDirectionFromPerspective(edge, personKey),
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((a, b) => {
        const importanceDelta =
          (b.person.importance ?? 3) - (a.person.importance ?? 3);
        if (importanceDelta) return importanceDelta;
        return a.person.name.localeCompare(b.person.name);
      });

    return {
      person: this.toNode(person, graph.contextsByPerson, adjacency),
      connections,
      summary: {
        directConnections: neighborIds.size,
        explicitConnections: incidentEdges.filter((edge) => !edge.isDerived)
          .length,
        derivedConnections: incidentEdges.filter((edge) => edge.isDerived)
          .length,
      },
      generatedAt: new Date(),
    };
  }

  async createConnection(personId: string, dto: CreatePersonGraphEdgeDto) {
    const [sourcePerson, targetPerson] = await Promise.all([
      this.getActivePerson(personId),
      this.getActivePerson(dto.targetPersonId),
    ]);

    if (sourcePerson._id.equals(targetPerson._id)) {
      throw new BadRequestException(
        'A person cannot be connected to themselves.',
      );
    }

    const endpoints = this.normalizeEndpoints(
      sourcePerson._id,
      targetPerson._id,
      dto.kind,
    );
    const duplicate = await this.edgeModel.exists({
      sourcePersonId: endpoints.sourcePersonId,
      targetPersonId: endpoints.targetPersonId,
      kind: dto.kind,
      isActive: true,
    });
    if (duplicate) {
      throw new BadRequestException(
        'This People Graph connection already exists.',
      );
    }

    const created = await this.edgeModel.create({
      sourcePersonId: endpoints.sourcePersonId,
      targetPersonId: endpoints.targetPersonId,
      kind: dto.kind,
      label: this.cleanOptionalText(dto.label),
      contexts: this.normalizeContexts(dto.contexts ?? []),
      strength: dto.strength,
      notes: this.cleanOptionalText(dto.notes),
      source: PersonGraphEdgeSource.MANUAL,
      metadata: dto.metadata ?? {},
      isActive: true,
    });

    return this.toStoredEdge(created);
  }

  async updateConnection(
    personId: string,
    edgeId: string,
    dto: UpdatePersonGraphEdgeDto,
  ) {
    const person = await this.getActivePerson(personId);
    this.assertObjectId(edgeId, 'connection ID');
    const edge = await this.edgeModel.findOne({
      _id: new Types.ObjectId(edgeId),
      isActive: true,
      $or: [{ sourcePersonId: person._id }, { targetPersonId: person._id }],
    });

    if (!edge) {
      throw new NotFoundException('People Graph connection not found.');
    }
    if (edge.source !== PersonGraphEdgeSource.MANUAL) {
      throw new BadRequestException(
        'Derived graph connections cannot be edited directly.',
      );
    }

    if (dto.kind !== undefined && dto.kind !== edge.kind) {
      const endpoints = this.normalizeEndpoints(
        edge.sourcePersonId,
        edge.targetPersonId,
        dto.kind,
      );
      const duplicate = await this.edgeModel.exists({
        _id: { $ne: edge._id },
        sourcePersonId: endpoints.sourcePersonId,
        targetPersonId: endpoints.targetPersonId,
        kind: dto.kind,
        isActive: true,
      });
      if (duplicate) {
        throw new BadRequestException(
          'This People Graph connection already exists.',
        );
      }
      edge.sourcePersonId = endpoints.sourcePersonId;
      edge.targetPersonId = endpoints.targetPersonId;
      edge.kind = dto.kind;
    }

    if (dto.label !== undefined) edge.label = this.cleanOptionalText(dto.label);
    if (dto.contexts !== undefined) {
      edge.contexts = this.normalizeContexts(dto.contexts);
    }
    if (dto.strength !== undefined) edge.strength = dto.strength ?? undefined;
    if (dto.notes !== undefined) edge.notes = this.cleanOptionalText(dto.notes);
    if (dto.metadata !== undefined) edge.metadata = dto.metadata;

    await edge.save();
    return this.toStoredEdge(edge);
  }

  async deleteConnection(personId: string, edgeId: string) {
    const person = await this.getActivePerson(personId);
    this.assertObjectId(edgeId, 'connection ID');
    const edge = await this.edgeModel.findOne({
      _id: new Types.ObjectId(edgeId),
      isActive: true,
      source: PersonGraphEdgeSource.MANUAL,
      $or: [{ sourcePersonId: person._id }, { targetPersonId: person._id }],
    });
    if (!edge) {
      throw new NotFoundException('People Graph connection not found.');
    }

    edge.isActive = false;
    await edge.save();

    return { deleted: true, edgeId };
  }

  async getMutualConnections(firstPersonId: string, secondPersonId: string) {
    if (firstPersonId === secondPersonId) {
      throw new BadRequestException('Choose two different people.');
    }
    const [firstPerson, secondPerson] = await Promise.all([
      this.getActivePerson(firstPersonId),
      this.getActivePerson(secondPersonId),
    ]);
    const graph = await this.buildGraph();
    const adjacency = this.buildAdjacency(
      new Set(graph.people.map((person) => person._id.toString())),
      graph.edges,
    );
    const firstId = firstPerson._id.toString();
    const secondId = secondPerson._id.toString();
    const firstNeighbors = adjacency.get(firstId) ?? new Set<string>();
    const secondNeighbors = adjacency.get(secondId) ?? new Set<string>();
    const mutualIds = [...firstNeighbors].filter(
      (candidate) =>
        candidate !== firstId &&
        candidate !== secondId &&
        secondNeighbors.has(candidate),
    );
    const peopleById = new Map(
      graph.people.map((person) => [person._id.toString(), person]),
    );

    const data = mutualIds
      .map((personId) => peopleById.get(personId))
      .filter((value): value is GraphPerson => Boolean(value))
      .map((person) => this.toNode(person, graph.contextsByPerson, adjacency))
      .sort((a, b) => {
        const importanceDelta = (b.importance ?? 3) - (a.importance ?? 3);
        return importanceDelta || a.name.localeCompare(b.name);
      });

    return {
      firstPerson: this.toNode(firstPerson, graph.contextsByPerson, adjacency),
      secondPerson: this.toNode(
        secondPerson,
        graph.contextsByPerson,
        adjacency,
      ),
      data,
      total: data.length,
      generatedAt: new Date(),
    };
  }

  async findPath(
    fromPersonId: string,
    toPersonId: string,
    maxDepth = DEFAULT_PATH_DEPTH,
  ) {
    const depth = Math.min(Math.max(maxDepth, 1), 6);
    const [fromPerson, toPerson] = await Promise.all([
      this.getActivePerson(fromPersonId),
      this.getActivePerson(toPersonId),
    ]);
    const graph = await this.buildGraph();
    const fromId = fromPerson._id.toString();
    const toId = toPerson._id.toString();
    const peopleById = new Map(
      graph.people.map((person) => [person._id.toString(), person]),
    );
    const edgeAdjacency = this.buildEdgeAdjacency(graph.edges);
    const nodeAdjacency = this.buildAdjacency(
      new Set(peopleById.keys()),
      graph.edges,
    );

    if (fromId === toId) {
      return {
        found: true,
        hops: 0,
        maxDepth: depth,
        nodes: [this.toNode(fromPerson, graph.contextsByPerson, nodeAdjacency)],
        edges: [],
        generatedAt: new Date(),
      };
    }

    const queue: Array<{ personId: string; depth: number }> = [
      { personId: fromId, depth: 0 },
    ];
    const visited = new Set<string>([fromId]);
    const previous = new Map<string, { personId: string; edge: GraphEdge }>();

    while (queue.length) {
      const current = queue.shift();
      if (!current) break;
      if (current.depth >= depth) continue;

      for (const connection of edgeAdjacency.get(current.personId) ?? []) {
        const nextId = connection.neighborId;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        previous.set(nextId, {
          personId: current.personId,
          edge: connection.edge,
        });
        if (nextId === toId) {
          return this.buildPathResponse(
            fromId,
            toId,
            previous,
            peopleById,
            graph.contextsByPerson,
            nodeAdjacency,
            depth,
          );
        }
        queue.push({ personId: nextId, depth: current.depth + 1 });
      }
    }

    return {
      found: false,
      hops: null,
      maxDepth: depth,
      nodes: [
        this.toNode(fromPerson, graph.contextsByPerson, nodeAdjacency),
        this.toNode(toPerson, graph.contextsByPerson, nodeAdjacency),
      ],
      edges: [],
      generatedAt: new Date(),
    };
  }

  private async buildGraph() {
    const [people, storedEdges, contexts] = await Promise.all([
      this.personModel
        .find({ isActive: true, isArchived: false })
        .select(this.personProjection())
        .lean(),
      this.edgeModel.find({ isActive: true }).lean(),
      this.contextModel.find({}).lean(),
    ]);
    const activeIds = new Set(people.map((person) => person._id.toString()));
    const explicitEdges = storedEdges
      .filter(
        (edge) =>
          activeIds.has(edge.sourcePersonId.toString()) &&
          activeIds.has(edge.targetPersonId.toString()),
      )
      .map((edge) => this.toStoredEdge(edge));
    const edgeKeys = new Set(
      explicitEdges.map((edge) => this.edgeIdentity(edge)),
    );
    const derivedEdges: GraphEdge[] = [];

    for (const context of contexts) {
      if (!context.introducedByPersonId) continue;
      const sourcePersonId = context.introducedByPersonId.toString();
      const targetPersonId = context.personId.toString();
      if (
        sourcePersonId === targetPersonId ||
        !activeIds.has(sourcePersonId) ||
        !activeIds.has(targetPersonId)
      ) {
        continue;
      }

      const edge: GraphEdge = {
        edgeId: `relationship-context:introduced:${sourcePersonId}:${targetPersonId}`,
        sourcePersonId,
        targetPersonId,
        kind: PersonGraphRelationshipKind.INTRODUCED,
        label: 'Introduced me to this person',
        contexts: context.connectionContexts ?? [],
        source: PersonGraphEdgeSource.RELATIONSHIP_CONTEXT,
        isDerived: true,
        metadata: {},
        updatedAt: this.readTimestamp(context, 'updatedAt'),
      };
      const key = this.edgeIdentity(edge);
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        derivedEdges.push(edge);
      }
    }

    return {
      people: people as GraphPerson[],
      edges: [...explicitEdges, ...derivedEdges],
      contextsByPerson: new Map(
        contexts.map((context) => [context.personId.toString(), context]),
      ),
    };
  }

  private buildPathResponse(
    fromId: string,
    toId: string,
    previous: Map<string, { personId: string; edge: GraphEdge }>,
    peopleById: Map<string, GraphPerson>,
    contextsByPerson: Map<string, PersonRelationshipContext>,
    adjacency: Map<string, Set<string>>,
    maxDepth: number,
  ) {
    const nodeIds: string[] = [toId];
    const edges: GraphEdge[] = [];
    let cursor = toId;

    while (cursor !== fromId) {
      const step = previous.get(cursor);
      if (!step) break;
      edges.unshift(step.edge);
      cursor = step.personId;
      nodeIds.unshift(cursor);
    }

    const nodes = nodeIds
      .map((personId) => peopleById.get(personId))
      .filter((value): value is GraphPerson => Boolean(value))
      .map((person) => this.toNode(person, contextsByPerson, adjacency));

    return {
      found: cursor === fromId,
      hops: cursor === fromId ? edges.length : null,
      maxDepth,
      nodes,
      edges: cursor === fromId ? edges : [],
      generatedAt: new Date(),
    };
  }

  private buildAdjacency(personIds: Set<string>, edges: GraphEdge[]) {
    const adjacency = new Map<string, Set<string>>();
    for (const personId of personIds) adjacency.set(personId, new Set());

    for (const edge of edges) {
      adjacency.get(edge.sourcePersonId)?.add(edge.targetPersonId);
      adjacency.get(edge.targetPersonId)?.add(edge.sourcePersonId);
    }
    return adjacency;
  }

  private buildEdgeAdjacency(edges: GraphEdge[]) {
    const adjacency = new Map<
      string,
      Array<{ neighborId: string; edge: GraphEdge }>
    >();
    for (const edge of edges) {
      const source = adjacency.get(edge.sourcePersonId) ?? [];
      source.push({ neighborId: edge.targetPersonId, edge });
      adjacency.set(edge.sourcePersonId, source);

      const target = adjacency.get(edge.targetPersonId) ?? [];
      target.push({ neighborId: edge.sourcePersonId, edge });
      adjacency.set(edge.targetPersonId, target);
    }
    return adjacency;
  }

  private countComponents(
    personIds: Set<string>,
    adjacency: Map<string, Set<string>>,
  ) {
    const visited = new Set<string>();
    let count = 0;

    for (const personId of personIds) {
      if (visited.has(personId)) continue;
      count += 1;
      const queue = [personId];
      visited.add(personId);
      while (queue.length) {
        const current = queue.shift();
        if (!current) break;
        for (const neighbor of adjacency.get(current) ?? []) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return count;
  }

  private toNode(
    person: GraphPerson,
    contextsByPerson: Map<string, PersonRelationshipContext>,
    adjacency: Map<string, Set<string>>,
  ) {
    const personId = person._id.toString();
    return {
      personId,
      name: this.displayName(person),
      fullName: person.name,
      preferredName: person.preferredName,
      relationship: person.relationship,
      relationshipLabel: person.relationshipLabel,
      organizationName: person.organizationName,
      roleTitle: person.roleTitle,
      importance: person.importance ?? 3,
      lastInteractionAt: person.lastInteractionAt,
      connectionContexts:
        contextsByPerson.get(personId)?.connectionContexts ?? [],
      degree: adjacency.get(personId)?.size ?? 0,
    };
  }

  private toStoredEdge(
    value: PersonGraphEdge | PersonGraphEdgeDocument,
  ): GraphEdge {
    const sourcePersonId = value.sourcePersonId.toString();
    const targetPersonId = value.targetPersonId.toString();
    return {
      edgeId: this.readId(value),
      sourcePersonId,
      targetPersonId,
      kind: value.kind,
      label: value.label,
      contexts: value.contexts ?? [],
      strength: value.strength,
      notes: value.notes,
      source: value.source ?? PersonGraphEdgeSource.MANUAL,
      isDerived: false,
      metadata: value.metadata ?? {},
      createdAt: this.readTimestamp(value, 'createdAt'),
      updatedAt: this.readTimestamp(value, 'updatedAt'),
    };
  }

  private edgeDirectionFromPerspective(edge: GraphEdge, personId: string) {
    if (SYMMETRIC_RELATIONSHIPS.has(edge.kind)) return 'mutual' as const;
    return edge.sourcePersonId === personId
      ? ('outgoing' as const)
      : ('incoming' as const);
  }

  private normalizeEndpoints(
    sourcePersonId: Types.ObjectId,
    targetPersonId: Types.ObjectId,
    kind: PersonGraphRelationshipKind,
  ) {
    if (!SYMMETRIC_RELATIONSHIPS.has(kind)) {
      return { sourcePersonId, targetPersonId };
    }

    return sourcePersonId.toString().localeCompare(targetPersonId.toString()) <=
      0
      ? { sourcePersonId, targetPersonId }
      : { sourcePersonId: targetPersonId, targetPersonId: sourcePersonId };
  }

  private edgeIdentity(edge: GraphEdge) {
    if (SYMMETRIC_RELATIONSHIPS.has(edge.kind)) {
      const [first, second] = [edge.sourcePersonId, edge.targetPersonId].sort();
      return `${edge.kind}:${first}:${second}`;
    }
    return `${edge.kind}:${edge.sourcePersonId}:${edge.targetPersonId}`;
  }

  private personMatchesContext(
    person: GraphPerson,
    contextsByPerson: Map<string, PersonRelationshipContext>,
    query: string,
  ) {
    if (!query) return true;
    const explicit = contextsByPerson.get(person._id.toString());
    const values = [
      person.organizationName,
      ...(person.tags ?? []),
      ...(explicit?.connectionContexts ?? []),
    ];
    return values.some((value) => value?.toLocaleLowerCase().includes(query));
  }

  private normalizeContexts(values: string[]) {
    return [
      ...new Set(
        values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean),
      ),
    ];
  }

  private normalizeSearch(value?: string) {
    return value?.trim().toLocaleLowerCase() ?? '';
  }

  private cleanOptionalText(value?: string | null) {
    const cleaned = value?.trim();
    return cleaned || undefined;
  }

  private displayName(person: GraphPerson) {
    return person.preferredName || person.name;
  }

  private async getActivePerson(personId: string) {
    this.assertObjectId(personId, 'person ID');
    const person = await this.personModel
      .findOne({
        _id: new Types.ObjectId(personId),
        isActive: true,
        isArchived: false,
      })
      .select(this.personProjection())
      .lean();

    if (!person) throw new NotFoundException('Memory person not found.');
    return person as GraphPerson;
  }

  private personProjection() {
    return {
      name: 1,
      preferredName: 1,
      relationship: 1,
      relationshipLabel: 1,
      organizationName: 1,
      roleTitle: 1,
      importance: 1,
      lastInteractionAt: 1,
      tags: 1,
    } as const;
  }

  private readId(value: unknown) {
    if (!value || typeof value !== 'object') return '';
    const candidate = (value as Record<string, unknown>)._id;
    if (candidate instanceof Types.ObjectId) return candidate.toHexString();
    return typeof candidate === 'string' ? candidate : '';
  }

  private readTimestamp(value: unknown, field: string): Date | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const candidate = (value as Record<string, unknown>)[field];
    if (candidate instanceof Date) return candidate;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
  }

  private assertObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
