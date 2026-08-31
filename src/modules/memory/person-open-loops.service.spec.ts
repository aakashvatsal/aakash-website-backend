import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PersonOpenLoopsService } from './person-open-loops.service';
import {
  PersonOpenLoopKind,
  PersonOpenLoopStatus,
} from './schemas/person-open-loop.schema';

describe('PersonOpenLoopsService', () => {
  const personId = new Types.ObjectId();
  const interactionId = new Types.ObjectId();

  const personModel = {
    exists: jest.fn(),
  };

  const interactionModel = {
    exists: jest.fn(),
  };

  const openLoopModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  let service: PersonOpenLoopsService;

  beforeEach(() => {
    jest.clearAllMocks();
    personModel.exists.mockResolvedValue({ _id: personId });
    interactionModel.exists.mockResolvedValue({ _id: interactionId });
    openLoopModel.countDocuments.mockResolvedValue(0);

    service = new PersonOpenLoopsService(
      personModel as never,
      interactionModel as never,
      openLoopModel as never,
    );
  });

  it('captures a first-class relationship open loop without requiring a due date', async () => {
    openLoopModel.create.mockImplementation(
      (payload: Record<string, unknown>) => payload,
    );

    const result = await service.create(personId.toString(), {
      kind: PersonOpenLoopKind.FOLLOW_UP,
      title: 'Send the proposal',
      details: 'Follow up after the pricing conversation.',
    });

    expect(openLoopModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        personId,
        kind: PersonOpenLoopKind.FOLLOW_UP,
        status: PersonOpenLoopStatus.OPEN,
        title: 'Send the proposal',
        details: 'Follow up after the pricing conversation.',
        metadata: {},
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ status: PersonOpenLoopStatus.OPEN }),
    );
  });

  it('refuses to attach a source interaction that is not linked to the person', async () => {
    interactionModel.exists.mockResolvedValue(null);

    await expect(
      service.create(personId.toString(), {
        kind: PersonOpenLoopKind.UNANSWERED_QUESTION,
        title: 'Ask about the launch date',
        sourceInteractionId: interactionId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(openLoopModel.create).not.toHaveBeenCalled();
  });

  it('resolves an open loop and preserves a closure timestamp', async () => {
    const loop = {
      personId,
      status: PersonOpenLoopStatus.OPEN,
      resolvedAt: undefined as Date | undefined,
      dismissedAt: undefined as Date | undefined,
      resolutionNote: undefined as string | undefined,
      save: jest.fn().mockImplementation(function (this: unknown) {
        return this;
      }),
    };
    openLoopModel.findOne.mockResolvedValue(loop);

    const result = await service.resolve(
      personId.toString(),
      new Types.ObjectId().toString(),
      { resolutionNote: 'Sent on WhatsApp' },
    );

    expect(result.status).toBe(PersonOpenLoopStatus.RESOLVED);
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(result.resolutionNote).toBe('Sent on WhatsApp');
    expect(loop.save).toHaveBeenCalledTimes(1);
  });

  it('returns only active-person open loops in the cross-person follow-up queue', async () => {
    const lean = jest.fn().mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        personId: {
          _id: personId,
          name: 'Archana Bagaria',
          preferredName: 'Lola',
        },
        kind: PersonOpenLoopKind.FOLLOW_UP,
        status: PersonOpenLoopStatus.OPEN,
        title: 'Reply about the meeting',
        dueAt: new Date('2026-08-28T10:00:00.000Z'),
      },
      {
        _id: new Types.ObjectId(),
        personId: null,
        kind: PersonOpenLoopKind.OTHER,
        status: PersonOpenLoopStatus.OPEN,
        title: 'Orphaned person reference',
      },
    ]);
    const limit = jest.fn().mockReturnValue({ lean });
    const populate = jest.fn().mockReturnValue({ limit });
    openLoopModel.find.mockReturnValue({ populate });

    const result = await service.getOpenQueue({ limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({ title: 'Reply about the meeting' }),
    );
  });
});
