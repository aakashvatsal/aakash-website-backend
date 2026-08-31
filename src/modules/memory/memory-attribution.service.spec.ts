import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { MemoryRecallService } from './memory-recall.service';
import { MemoryService } from './memory.service';
import {
  MemoryPersonRelation,
  MemoryScope,
  MemoryType,
} from './schemas/memory.schema';

describe('MemoryService attribution', () => {
  const memoryModel = {
    find: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  };
  const memoryPersonModel = {
    find: jest.fn(),
  };
  const verificationService = {};
  const aiService = {};

  let service: MemoryService;

  const personQuery = (items: Array<Record<string, unknown>>) => ({
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(items),
  });

  const memoryQuery = (items: Array<Record<string, unknown>>) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(items),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemoryService(
      memoryModel as never,
      memoryPersonModel as never,
      verificationService as never,
      aiService as never,
      new MemoryRecallService(),
    );
  });

  it('turns a legacy personId into one authoritative individual primary-subject link', async () => {
    const personId = new Types.ObjectId();
    memoryPersonModel.find.mockReturnValue(
      personQuery([
        {
          _id: personId,
          name: 'Ayush Sharma',
          preferredName: 'Ayush',
        },
      ]),
    );

    const result = await service.resolveAttribution({
      personId: personId.toString(),
    });

    expect(result.scope).toBe(MemoryScope.INDIVIDUAL);
    expect(result.personId?.toString()).toBe(personId.toString());
    expect(result.personLinks).toEqual([
      expect.objectContaining({
        personId,
        relation: MemoryPersonRelation.PRIMARY_SUBJECT,
        displayNameSnapshot: 'Ayush',
      }),
    ]);
  });

  it('requires two distinct subject people for group memory', async () => {
    const personId = new Types.ObjectId().toString();

    await expect(
      service.resolveAttribution({
        scope: MemoryScope.GROUP,
        personLinks: [
          {
            personId,
            relation: MemoryPersonRelation.PARTICIPANT,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(memoryPersonModel.find).not.toHaveBeenCalled();
  });

  it('allows general memory to mention a person but rejects assigning them as the subject', async () => {
    const personId = new Types.ObjectId();

    await expect(
      service.resolveAttribution({
        scope: MemoryScope.GENERAL,
        personLinks: [
          {
            personId: personId.toString(),
            relation: MemoryPersonRelation.PARTICIPANT,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    memoryPersonModel.find.mockReturnValue(
      personQuery([{ _id: personId, name: 'Mahesh' }]),
    );

    const result = await service.resolveAttribution({
      scope: MemoryScope.GENERAL,
      personLinks: [
        {
          personId: personId.toString(),
          relation: MemoryPersonRelation.SOURCE,
        },
      ],
    });

    expect(result.personId).toBeNull();
    expect(result.personLinks[0].relation).toBe(MemoryPersonRelation.SOURCE);
  });

  it('returns no person memories when a name resolves ambiguously', async () => {
    memoryPersonModel.find.mockReturnValue(
      personQuery([
        { _id: new Types.ObjectId(), name: 'Mahesh A' },
        { _id: new Types.ObjectId(), name: 'Mahesh B' },
      ]),
    );

    const result = await service.findPersonMemoryContext('Mahesh');

    expect(result.status).toBe('ambiguous');
    expect(result.individualMemories).toEqual([]);
    expect(result.groupMemories).toEqual([]);
    expect(result.relatedMentions).toEqual([]);
    expect(memoryModel.find).not.toHaveBeenCalled();
  });

  it('keeps individual, group and mention-only context in separate buckets for one resolved person', async () => {
    const personId = new Types.ObjectId();
    memoryPersonModel.find.mockReturnValue(
      personQuery([
        {
          _id: personId,
          name: 'Sarthak Jain',
          preferredName: 'Sarthak',
          relationship: 'friend',
        },
      ]),
    );

    const individual = { _id: new Types.ObjectId(), content: 'Individual' };
    const group = { _id: new Types.ObjectId(), content: 'Shared group' };
    const mention = { _id: new Types.ObjectId(), content: 'Mention only' };

    memoryModel.find
      .mockReturnValueOnce(memoryQuery([individual]))
      .mockReturnValueOnce(memoryQuery([group]))
      .mockReturnValueOnce(memoryQuery([mention]));

    const result = await service.findPersonMemoryContext('Sarthak', 10);

    expect(result.status).toBe('resolved');
    expect(result.person).toEqual(
      expect.objectContaining({
        personId: personId.toString(),
        name: 'Sarthak',
      }),
    );
    expect(result.individualMemories[0]?.memory).toEqual(individual);
    expect(result.individualMemories).toHaveLength(1);
    expect(result.groupMemories[0]?.memory).toEqual(group);
    expect(result.groupMemories).toHaveLength(1);
    expect(result.relatedMentions[0]?.memory).toEqual(mention);
    expect(result.relatedMentions).toHaveLength(1);
    expect(result.attributionRule).toContain('must not be attributed');
  });
  it('applies semantic type filtering without weakening person attribution', async () => {
    const personId = new Types.ObjectId();
    memoryPersonModel.find.mockReturnValue(
      personQuery([
        {
          _id: personId,
          name: 'Ayush Sharma',
          preferredName: 'Ayush',
        },
      ]),
    );

    memoryModel.find
      .mockReturnValueOnce(memoryQuery([]))
      .mockReturnValueOnce(memoryQuery([]))
      .mockReturnValueOnce(memoryQuery([]));

    await service.findPersonMemoryContext('Ayush', 8, MemoryType.PREFERENCE);

    expect(memoryModel.find).toHaveBeenCalledTimes(3);

    for (const [filter] of memoryModel.find.mock.calls) {
      expect(filter).toEqual(
        expect.objectContaining({
          type: MemoryType.PREFERENCE,
          isActive: true,
          isArchived: false,
          isDisputed: false,
        }),
      );
    }
  });
});
