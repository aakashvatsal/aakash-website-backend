/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { Types } from 'mongoose';

import { MemoryAccessPolicyService } from './memory-access-policy.service';
import {
  MemoryAccessLevel,
  MemoryEntityType,
  MemorySensitivity,
  MemorySource,
} from './schemas/memory.schema';

describe('MemoryAccessPolicyService', () => {
  const service = new MemoryAccessPolicyService();

  it('keeps anonymous HSAKAA to non-sensitive public memory and excludes health/media', () => {
    const filter = service.getPublicHsakaaFilter() as Record<string, any>;

    expect(filter.accessLevel).toBe(MemoryAccessLevel.PUBLIC);
    expect(filter.sensitivity.$nin).toEqual(
      expect.arrayContaining([
        MemorySensitivity.SENSITIVE,
        MemorySensitivity.HIGHLY_SENSITIVE,
      ]),
    );
    expect(filter.source.$nin).toEqual(
      expect.arrayContaining([MemorySource.HEALTH, MemorySource.MEDIA]),
    );
    expect(filter['entities.type'].$nin).toEqual(
      expect.arrayContaining([MemoryEntityType.HEALTH, MemoryEntityType.MEDIA]),
    );
  });

  it('adds only the exact verified person branch when consent is granted', () => {
    const personId = new Types.ObjectId();
    const otherPersonId = new Types.ObjectId();
    const filter = service.getVerifiedPersonHsakaaFilter({
      personId,
      memoryAccessConsentGranted: true,
    }) as Record<string, any>;

    const accessClause = filter.$and.find(
      (clause: Record<string, any>) =>
        Array.isArray(clause.$or) &&
        clause.$or.some((branch: Record<string, unknown>) =>
          Object.prototype.hasOwnProperty.call(branch, 'accessLevel'),
        ),
    );
    const branches = accessClause.$or as Array<Record<string, any>>;
    const personBranch = branches.find((branch) => branch.personId);

    expect(branches).toHaveLength(2);
    expect(branches[0].accessLevel).toBe(MemoryAccessLevel.PUBLIC);
    expect(personBranch.personId.toString()).toBe(personId.toString());
    expect(personBranch.personId.toString()).not.toBe(otherPersonId.toString());
    expect(personBranch.accessLevel.$in).toEqual([
      MemoryAccessLevel.PERSON_PRIVATE,
      MemoryAccessLevel.OWNER_AND_PERSON,
    ]);
    expect(personBranch.sensitivity.$ne).toBe(
      MemorySensitivity.HIGHLY_SENSITIVE,
    );
  });

  it('falls back to public memory only as soon as person-memory consent is absent', () => {
    const filter = service.getVerifiedPersonHsakaaFilter({
      personId: new Types.ObjectId(),
      memoryAccessConsentGranted: false,
    }) as Record<string, any>;

    const accessClause = filter.$and.find(
      (clause: Record<string, any>) =>
        Array.isArray(clause.$or) &&
        clause.$or.some((branch: Record<string, unknown>) =>
          Object.prototype.hasOwnProperty.call(branch, 'accessLevel'),
        ),
    );

    expect(accessClause.$or).toHaveLength(1);
    expect(accessClause.$or[0].accessLevel).toBe(MemoryAccessLevel.PUBLIC);
  });
});
