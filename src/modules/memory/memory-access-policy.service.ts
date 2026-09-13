import { Injectable } from '@nestjs/common';
import { QueryFilter, Types } from 'mongoose';

import {
  MemoryAccessLevel,
  MemoryDocument,
  MemoryEntityType,
  MemoryLifecycleStatus,
  MemorySensitivity,
  MemorySource,
} from './schemas/memory.schema';

@Injectable()
export class MemoryAccessPolicyService {
  getPublicHsakaaFilter(): QueryFilter<MemoryDocument> {
    return {
      ...this.getCommonHsakaaSafetyFilter(),
      accessLevel: MemoryAccessLevel.PUBLIC,
      sensitivity: {
        $nin: [MemorySensitivity.SENSITIVE, MemorySensitivity.HIGHLY_SENSITIVE],
      },
    };
  }

  getVerifiedPersonHsakaaFilter(input: {
    personId: Types.ObjectId;
    memoryAccessConsentGranted: boolean;
  }): QueryFilter<MemoryDocument> {
    const accessBranches: QueryFilter<MemoryDocument>[] = [
      {
        accessLevel: MemoryAccessLevel.PUBLIC,
        sensitivity: {
          $nin: [
            MemorySensitivity.SENSITIVE,
            MemorySensitivity.HIGHLY_SENSITIVE,
          ],
        },
      },
    ];

    if (input.memoryAccessConsentGranted) {
      accessBranches.push({
        personId: input.personId,
        accessLevel: {
          $in: [
            MemoryAccessLevel.PERSON_PRIVATE,
            MemoryAccessLevel.OWNER_AND_PERSON,
          ],
        },
        sensitivity: { $ne: MemorySensitivity.HIGHLY_SENSITIVE },
      });
    }

    const common = this.getCommonHsakaaSafetyFilter();

    return {
      ...common,
      $and: [
        ...(common.$and ?? []),
        {
          $or: accessBranches,
        },
      ],
    };
  }

  private getCommonHsakaaSafetyFilter(): QueryFilter<MemoryDocument> {
    return {
      isActive: true,
      isArchived: false,
      isDisputed: false,
      source: { $nin: [MemorySource.HEALTH, MemorySource.MEDIA] },
      'entities.type': {
        $nin: [MemoryEntityType.HEALTH, MemoryEntityType.MEDIA],
      },
      categories: { $nin: ['health', 'media', 'whoop', 'social_media'] },
      tags: { $nin: ['health', 'media', 'whoop', 'social_media'] },
      $and: [
        {
          $or: [
            { lifecycleStatus: MemoryLifecycleStatus.ACTIVE },
            { lifecycleStatus: { $exists: false } },
          ],
        },
        {
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
      ],
    };
  }
}
