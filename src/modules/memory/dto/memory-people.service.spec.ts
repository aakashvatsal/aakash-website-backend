import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';

import { MemoryPeopleService } from '../memory-people.service';
import {
  PersonIdentityStatus,
  PersonRelationshipType,
} from '../schemas/memory-person.schema';

describe('MemoryPeopleService directory identity', () => {
  const memoryPersonModel = {
    create: jest.fn(),
    exists: jest.fn(),
    find: jest.fn(),
  };

  const verificationSessionModel = {
    updateMany: jest.fn(),
  };

  let service: MemoryPeopleService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemoryPeopleService(
      memoryPersonModel,
      verificationSessionModel,
    );
  });

  it('creates a stable person identity without requiring email or phone', async () => {
    const personId = new Types.ObjectId();
    memoryPersonModel.create.mockImplementation(
      (payload: Record<string, unknown>) => ({
        _id: personId,
        identityStatus: PersonIdentityStatus.UNVERIFIED,
        isActive: true,
        isArchived: false,
        ...payload,
      }),
    );

    const result = await service.create({
      name: 'Mahesh',
      relationship: PersonRelationshipType.COLLEAGUE,
      organizationName: 'Frayto',
      roleTitle: 'Operations',
      importance: 4,
    });

    expect(memoryPersonModel.exists).not.toHaveBeenCalled();
    expect(memoryPersonModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mahesh',
        emails: [],
        phoneNumbers: [],
        organizationName: 'Frayto',
        roleTitle: 'Operations',
        importance: 4,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ _id: personId }));
  });

  it('normalizes country code plus a local phone into one E.164 identity', async () => {
    memoryPersonModel.exists.mockResolvedValue(null);
    memoryPersonModel.create.mockImplementation(
      (payload: Record<string, unknown>) => payload,
    );

    await service.create({
      name: 'Ayush',
      phoneNumbers: [
        {
          countryCode: '+91',
          phoneNumber: '98765 43210',
          isPrimary: true,
        },
      ],
    });

    expect(memoryPersonModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumbers: [
          expect.objectContaining({
            countryCode: '+91',
            phoneNumber: '+919876543210',
            isPrimary: true,
            isVerified: false,
          }),
        ],
      }),
    );
  });

  it('rejects an email or phone already attached to another active person', async () => {
    memoryPersonModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(
      service.create({
        name: 'Duplicate',
        emails: [{ email: 'same@example.com' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(memoryPersonModel.create).not.toHaveBeenCalled();
  });

  it('never accepts profile input as proof that an email is verified', async () => {
    memoryPersonModel.exists.mockResolvedValue(null);
    memoryPersonModel.create.mockImplementation(
      (payload: Record<string, unknown>) => payload,
    );

    await service.create({
      name: 'Unverified Contact',
      emails: [
        {
          email: 'person@example.com',
          isVerified: true,
          isPrimary: true,
        } as never,
      ],
      identityStatus: PersonIdentityStatus.VERIFIED,
    });

    expect(memoryPersonModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emails: [
          expect.objectContaining({
            email: 'person@example.com',
            isVerified: false,
          }),
        ],
      }),
    );
  });

  it('returns ambiguous candidates instead of guessing between exact name matches', async () => {
    const people = [
      {
        _id: new Types.ObjectId(),
        name: 'Rahul Sharma',
        preferredName: 'Rahul',
        aliases: [],
        tags: [],
        relationship: PersonRelationshipType.COLLEAGUE,
        identityStatus: PersonIdentityStatus.UNVERIFIED,
        importance: 3,
      },
      {
        _id: new Types.ObjectId(),
        name: 'Rahul Mehta',
        preferredName: 'Rahul',
        aliases: [],
        tags: [],
        relationship: PersonRelationshipType.FRIEND,
        identityStatus: PersonIdentityStatus.UNVERIFIED,
        importance: 4,
      },
    ];

    memoryPersonModel.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(people),
    });

    const result = await service.resolveExactPerson('Rahul');

    expect(result.status).toBe('ambiguous');
    expect(result.matches).toHaveLength(2);
    expect(result).not.toHaveProperty('person');
  });
});
