import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PersonTimelineService } from './person-timeline.service';
import { MemoryPersonRelation, MemoryScope } from './schemas/memory.schema';
import {
  PersonInteractionChannel,
  PersonInteractionDirection,
  PersonInteractionType,
} from './schemas/person-interaction.schema';

describe('PersonTimelineService interactions', () => {
  const personModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
  };
  const interactionModel = {
    create: jest.fn(),
    find: jest.fn(),
  };
  const memoryModel = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const taskModel = { find: jest.fn() };
  const journalModel = { find: jest.fn() };
  const mediaModel = { find: jest.fn() };
  const decisionModel = { find: jest.fn() };

  let service: PersonTimelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonTimelineService(
      personModel as never,
      interactionModel as never,
      memoryModel as never,
      taskModel as never,
      journalModel as never,
      mediaModel as never,
      decisionModel as never,
    );
  });

  function mockActivePeople(ids: Types.ObjectId[]) {
    personModel.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(ids.map((_id) => ({ _id }))),
    });
  }

  it('records an interaction against exact saved participant IDs and advances last interaction time', async () => {
    const primaryId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const occurredAt = '2026-08-29T08:30:00.000Z';
    mockActivePeople([primaryId, secondId]);
    interactionModel.create.mockImplementation(
      (payload: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        ...payload,
        toObject: () => payload,
      }),
    );

    const result = await service.recordInteraction(primaryId.toString(), {
      type: PersonInteractionType.MEETING,
      channel: PersonInteractionChannel.VIDEO,
      direction: PersonInteractionDirection.MUTUAL,
      occurredAt,
      summary: 'Reviewed the next launch milestone.',
      participantIds: [secondId.toString()],
    });

    expect(interactionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryPersonId: primaryId,
        participantIds: [primaryId, secondId],
        summary: 'Reviewed the next launch milestone.',
      }),
    );
    expect(personModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [primaryId, secondId] } },
      { $max: { lastInteractionAt: new Date(occurredAt) } },
    );
    expect(result).toEqual(
      expect.objectContaining({
        summary: 'Reviewed the next launch milestone.',
      }),
    );
  });

  it('rejects linking a memory that belongs to a different person', async () => {
    const primaryId = new Types.ObjectId();
    const unrelatedId = new Types.ObjectId();
    const memoryId = new Types.ObjectId();
    mockActivePeople([primaryId]);
    memoryModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: memoryId,
        scope: MemoryScope.INDIVIDUAL,
        personId: unrelatedId,
        personLinks: [
          {
            personId: unrelatedId,
            relation: MemoryPersonRelation.PRIMARY_SUBJECT,
          },
        ],
      }),
    });

    await expect(
      service.recordInteraction(primaryId.toString(), {
        type: PersonInteractionType.NOTE,
        occurredAt: '2026-08-29T08:30:00.000Z',
        summary: 'Should not attach this memory.',
        linkedMemoryId: memoryId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(interactionModel.create).not.toHaveBeenCalled();
  });

  it('allows a group memory only when one exact participant is explicitly linked to it', async () => {
    const primaryId = new Types.ObjectId();
    const secondId = new Types.ObjectId();
    const memoryId = new Types.ObjectId();
    mockActivePeople([primaryId, secondId]);
    memoryModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: memoryId,
        scope: MemoryScope.GROUP,
        personId: null,
        personLinks: [
          {
            personId: primaryId,
            relation: MemoryPersonRelation.PARTICIPANT,
          },
          {
            personId: secondId,
            relation: MemoryPersonRelation.PARTICIPANT,
          },
        ],
      }),
    });
    interactionModel.create.mockImplementation(
      (payload: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        ...payload,
        toObject: () => payload,
      }),
    );

    await service.recordInteraction(primaryId.toString(), {
      type: PersonInteractionType.SHARED_ACTIVITY,
      occurredAt: '2026-08-29T08:30:00.000Z',
      summary: 'Worked together on the launch.',
      participantIds: [secondId.toString()],
      linkedMemoryId: memoryId.toString(),
    });

    expect(interactionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ linkedMemoryId: memoryId }),
    );
  });
});
