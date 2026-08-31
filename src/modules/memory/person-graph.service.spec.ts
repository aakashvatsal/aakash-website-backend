import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PersonGraphService } from './person-graph.service';
import { PersonRelationshipType } from './schemas/memory-person.schema';
import {
  PersonGraphEdgeSource,
  PersonGraphRelationshipKind,
} from './schemas/person-graph-edge.schema';

const aliceId = new Types.ObjectId('64a000000000000000000001');
const bobId = new Types.ObjectId('64a000000000000000000002');
const carolId = new Types.ObjectId('64a000000000000000000003');
const davidId = new Types.ObjectId('64a000000000000000000004');

function person(id: Types.ObjectId, name: string, overrides = {}) {
  return {
    _id: id,
    name,
    relationship: PersonRelationshipType.FRIEND,
    importance: 3,
    isActive: true,
    isArchived: false,
    ...overrides,
  };
}

function edge(
  id: string,
  sourcePersonId: Types.ObjectId,
  targetPersonId: Types.ObjectId,
  kind = PersonGraphRelationshipKind.KNOWS,
) {
  return {
    _id: new Types.ObjectId(id),
    sourcePersonId,
    targetPersonId,
    kind,
    contexts: [],
    source: PersonGraphEdgeSource.MANUAL,
    metadata: {},
    isActive: true,
  };
}

describe('PersonGraphService', () => {
  const personModel = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const edgeModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
  };
  const contextModel = {
    find: jest.fn(),
  };

  let service: PersonGraphService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonGraphService(
      personModel as never,
      edgeModel as never,
      contextModel as never,
    );
  });

  function mockActivePerson(value: unknown) {
    personModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(value),
      }),
    });
  }

  function mockGraph(
    people: unknown[],
    edges: unknown[] = [],
    contexts: unknown[] = [],
  ) {
    personModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(people),
      }),
    });
    edgeModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue(edges),
    });
    contextModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue(contexts),
    });
  }

  it('creates an explicit symmetric connection without inventing graph evidence', async () => {
    mockActivePerson(person(aliceId, 'Alice'));
    mockActivePerson(person(bobId, 'Bob'));
    edgeModel.exists.mockResolvedValue(null);
    edgeModel.create.mockImplementation((payload: Record<string, unknown>) => ({
      _id: new Types.ObjectId('64b000000000000000000001'),
      ...payload,
    }));

    const result = await service.createConnection(aliceId.toString(), {
      targetPersonId: bobId.toString(),
      kind: PersonGraphRelationshipKind.FRIEND,
      contexts: ['8lete', ' 8LETE '],
      strength: 4,
    });

    expect(edgeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePersonId: aliceId,
        targetPersonId: bobId,
        kind: PersonGraphRelationshipKind.FRIEND,
        contexts: ['8lete'],
        source: PersonGraphEdgeSource.MANUAL,
      }),
    );
    expect(result.isDerived).toBe(false);
    expect(result.strength).toBe(4);
  });

  it('rejects connecting a person to themselves', async () => {
    mockActivePerson(person(aliceId, 'Alice'));
    mockActivePerson(person(aliceId, 'Alice'));

    await expect(
      service.createConnection(aliceId.toString(), {
        targetPersonId: aliceId.toString(),
        kind: PersonGraphRelationshipKind.KNOWS,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(edgeModel.create).not.toHaveBeenCalled();
  });

  it('derives introducer edges from 5D relationship context and labels them as derived', async () => {
    mockGraph(
      [person(aliceId, 'Alice'), person(bobId, 'Bob')],
      [],
      [
        {
          personId: bobId,
          introducedByPersonId: aliceId,
          connectionContexts: ['8lete'],
        },
      ],
    );

    const result = await service.getOverview({ limit: 20 });

    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toEqual(
      expect.objectContaining({
        sourcePersonId: aliceId.toString(),
        targetPersonId: bobId.toString(),
        kind: PersonGraphRelationshipKind.INTRODUCED,
        source: PersonGraphEdgeSource.RELATIONSHIP_CONTEXT,
        isDerived: true,
      }),
    );
    expect(result.summary.derivedConnections).toBe(1);
    expect(result.topConnected[0].degree).toBe(1);
  });

  it('finds the shortest evidence-backed path across explicit connections', async () => {
    mockActivePerson(person(aliceId, 'Alice'));
    mockActivePerson(person(carolId, 'Carol'));
    mockGraph(
      [
        person(aliceId, 'Alice'),
        person(bobId, 'Bob'),
        person(carolId, 'Carol'),
        person(davidId, 'David'),
      ],
      [
        edge('64b000000000000000000011', aliceId, bobId),
        edge('64b000000000000000000012', bobId, carolId),
        edge('64b000000000000000000013', aliceId, davidId),
        edge('64b000000000000000000014', davidId, bobId),
      ],
    );

    const result = await service.findPath(
      aliceId.toString(),
      carolId.toString(),
      4,
    );

    expect(result.found).toBe(true);
    expect(result.hops).toBe(2);
    expect(result.nodes.map((node) => node.name)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
    expect(result.edges).toHaveLength(2);
  });

  it('returns direct mutual connections without inferring them from names or text', async () => {
    mockActivePerson(person(aliceId, 'Alice'));
    mockActivePerson(person(carolId, 'Carol'));
    mockGraph(
      [
        person(aliceId, 'Alice'),
        person(bobId, 'Bob'),
        person(carolId, 'Carol'),
      ],
      [
        edge('64b000000000000000000021', aliceId, bobId),
        edge('64b000000000000000000022', carolId, bobId),
      ],
    );

    const result = await service.getMutualConnections(
      aliceId.toString(),
      carolId.toString(),
    );

    expect(result.total).toBe(1);
    expect(result.data[0].personId).toBe(bobId.toString());
  });

  it('keeps context-filtered graph summaries deterministic', async () => {
    mockGraph(
      [
        person(aliceId, 'Alice', { organizationName: '8lete' }),
        person(bobId, 'Bob', { organizationName: '8lete' }),
        person(carolId, 'Carol', { organizationName: 'Frayto' }),
      ],
      [
        edge('64b000000000000000000031', aliceId, bobId),
        edge('64b000000000000000000032', bobId, carolId),
      ],
    );

    const result = await service.getOverview({ context: '8lete', limit: 20 });

    expect(result.nodes.map((node) => node.name).sort()).toEqual([
      'Alice',
      'Bob',
    ]);
    expect(result.edges).toHaveLength(1);
    expect(result.summary.people).toBe(2);
    expect(result.summary.connections).toBe(1);
    expect(result.summary.components).toBe(1);
  });
});
