import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PersonRelationshipContextService } from './person-relationship-context.service';
import { PersonOpenLoopKind } from './schemas/person-open-loop.schema';
import {
  PersonInteractionChannel,
  PersonInteractionType,
} from './schemas/person-interaction.schema';
import { PersonRelationshipType } from './schemas/memory-person.schema';

describe('PersonRelationshipContextService', () => {
  const personId = new Types.ObjectId();
  const introducerId = new Types.ObjectId();

  const personModel = {
    findOne: jest.fn(),
    find: jest.fn(),
  };
  const interactionModel = {
    find: jest.fn(),
  };
  const contextModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const openLoopsService = {
    findForPerson: jest.fn(),
  };

  let service: PersonRelationshipContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PersonRelationshipContextService(
      personModel as never,
      interactionModel as never,
      contextModel as never,
      openLoopsService as never,
    );
  });

  function activePerson(overrides: Record<string, unknown> = {}) {
    return {
      _id: personId,
      name: 'Archana Bagaria',
      preferredName: 'Lola',
      relationship: PersonRelationshipType.FRIEND,
      importance: 4,
      isActive: true,
      isArchived: false,
      ...overrides,
    };
  }

  function mockFindOneLean(value: unknown) {
    personModel.findOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(value),
    });
  }

  it('builds deterministic relationship context from interactions and open commitments', async () => {
    const occurredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockFindOneLean(activePerson({ lastInteractionAt: occurredAt }));

    contextModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        personId,
        introducedByPersonId: introducerId,
        howWeMet: 'Met through a mutual friend.',
        connectionContexts: ['8lete'],
        preferredContactCadenceDays: 30,
        relationshipNotes: 'Keep product and personal context separate.',
      }),
    });

    interactionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(),
              occurredAt,
              type: PersonInteractionType.CALL,
              channel: PersonInteractionChannel.PHONE,
              summary: 'Discussed the next launch milestone.',
              tags: ['launch', '8lete'],
            },
          ]),
        }),
      }),
    });

    openLoopsService.findForPerson.mockResolvedValue({
      data: [
        {
          kind: PersonOpenLoopKind.PROMISE_I_MADE,
          title: 'Send the deck',
        },
        {
          kind: PersonOpenLoopKind.FOLLOW_UP,
          title: 'Check back next week',
        },
      ],
      summary: { open: 2, overdue: 0 },
    });

    personModel.findOne.mockReturnValueOnce({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: introducerId,
          name: 'Introducer',
          relationship: PersonRelationshipType.FRIEND,
          importance: 3,
        }),
      }),
    });

    const result = await service.getForPerson(personId.toString());

    expect(result.explicitContext.introducedBy?.personId).toBe(
      introducerId.toString(),
    );
    expect(result.recentDiscussions).toHaveLength(1);
    expect(result.recentDiscussions[0].topics).toEqual(['launch', '8lete']);
    expect(result.commitments).toHaveLength(1);
    expect(result.commitments[0].title).toBe('Send the deck');
    expect(result.contact.daysSinceLastContact).toBeGreaterThanOrEqual(9);
    expect(result.contact.isDormant).toBe(false);
  });

  it('keeps last-contact fields empty when no contact has ever been recorded', async () => {
    const knownSinceAt = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);
    mockFindOneLean(
      activePerson({
        firstMetAt: knownSinceAt,
        lastInteractionAt: undefined,
        createdAt: new Date(Date.now() - 80 * 24 * 60 * 60 * 1000),
      }),
    );

    contextModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    interactionModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    });
    openLoopsService.findForPerson.mockResolvedValue({
      data: [],
      summary: { open: 0, overdue: 0 },
    });

    const result = await service.getForPerson(personId.toString());

    expect(result.contact.hasRecordedContact).toBe(false);
    expect(result.contact.lastContactAt).toBeNull();
    expect(result.contact.daysSinceLastContact).toBeNull();
    expect(result.contact.lastContactSource).toBe('none');
    expect(result.contact.daysSinceKnown).toBeGreaterThanOrEqual(74);
    expect(result.contact.isDormant).toBe(false);
    expect(result.contact.isCadenceOverdue).toBe(false);
  });

  it('rejects assigning the same person as their own introducer', async () => {
    mockFindOneLean(activePerson());

    await expect(
      service.update(personId.toString(), {
        introducedByPersonId: personId.toString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(contextModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns only people beyond the requested contact gap and context', async () => {
    const oldContact = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const recentContact = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const secondId = new Types.ObjectId();

    personModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          activePerson({
            organizationName: '8lete',
            lastInteractionAt: oldContact,
          }),
          {
            ...activePerson({
              _id: secondId,
              preferredName: 'Recent person',
              organizationName: '8lete',
              lastInteractionAt: recentContact,
            }),
          },
        ]),
      }),
    });
    contextModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getContactGaps({
      days: 60,
      context: '8lete',
      limit: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].person.personId).toBe(personId.toString());
    expect(result.summary.dormantDays).toBe(60);
  });

  it('distinguishes never-contacted people from recorded contact gaps', async () => {
    const oldCreatedAt = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);

    personModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          activePerson({
            lastInteractionAt: undefined,
            firstMetAt: undefined,
            createdAt: oldCreatedAt,
          }),
        ]),
      }),
    });
    contextModel.find.mockReturnValue({
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await service.getContactGaps({ days: 60, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hasRecordedContact).toBe(false);
    expect(result.data[0].lastContactAt).toBeNull();
    expect(result.data[0].daysSinceLastContact).toBeNull();
    expect(result.data[0].gapReferenceSource).toBe('directory_created');
    expect(result.data[0].daysSinceGapReference).toBeGreaterThanOrEqual(119);
    expect(result.summary.neverContactedCount).toBe(1);
    expect(result.summary.recordedContactGapCount).toBe(0);
  });

  it('finds people through explicit relationship contexts even when organization differs', async () => {
    personModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([
            activePerson({ organizationName: 'Another company', tags: [] }),
          ]),
      }),
    });
    contextModel.find.mockReturnValue({
      lean: jest
        .fn()
        .mockResolvedValue([
          { personId, connectionContexts: ['8lete', 'football'] },
        ]),
    });

    const result = await service.findPeopleByContext({ context: '8lete' });

    expect(result.total).toBe(1);
    expect(result.data[0].connectionContexts).toContain('8lete');
  });
});
