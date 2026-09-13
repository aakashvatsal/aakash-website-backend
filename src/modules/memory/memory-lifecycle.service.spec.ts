import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { MemoryRecallService } from './memory-recall.service';
import { MemoryService } from './memory.service';
import {
  MemoryLifecycleStatus,
  MemoryScope,
  MemoryType,
} from './schemas/memory.schema';

function makeMemory(overrides: Record<string, unknown> = {}) {
  const memory = {
    _id: new Types.ObjectId(),
    content: 'A memory',
    contentHash: 'hash',
    type: MemoryType.FACT,
    scope: MemoryScope.GENERAL,
    personId: null,
    personLinks: [],
    lifecycleStatus: MemoryLifecycleStatus.ACTIVE,
    lifecycleHistory: [],
    supersedesMemoryId: null as Types.ObjectId | null,
    supersededByMemoryId: null as Types.ObjectId | null,
    contradictsMemoryIds: [],
    contradictedByMemoryIds: [],
    isActive: true,
    isArchived: false,
    isDisputed: false,
    embeddingGenerated: false,
    accessCount: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return memory;
}

describe('MemoryService lifecycle truth maintenance', () => {
  const findOne = jest.fn();
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  const updateMany = jest.fn().mockResolvedValue({ modifiedCount: 0 });
  const memoryModel = {
    findOne,
    updateOne,
    updateMany,
    collection: {
      indexes: jest.fn().mockResolvedValue([]),
      dropIndex: jest.fn(),
      createIndex: jest.fn(),
    },
  };
  const memoryPersonModel = {};
  const verificationService = {};
  const accessPolicyService = {};
  const aiService = { generateEmbedding: jest.fn() };

  let service: MemoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    updateOne.mockResolvedValue({ modifiedCount: 1 });
    updateMany.mockResolvedValue({ modifiedCount: 0 });
    memoryModel.collection.indexes.mockResolvedValue([]);
    service = new MemoryService(
      memoryModel as never,
      memoryPersonModel as never,
      verificationService as never,
      accessPolicyService as never,
      aiService as never,
      new MemoryRecallService(),
    );
  });

  function queueMemories(...memories: ReturnType<typeof makeMemory>[]) {
    for (const memory of memories) {
      findOne.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue(memory),
      });
    }
  }

  it('treats a legacy archived record as archived rather than forgotten', async () => {
    const memory = makeMemory({
      lifecycleStatus: undefined,
      isActive: false,
      isArchived: true,
    });
    queueMemories(memory);

    await expect(service.restore(memory._id.toString())).resolves.toEqual(
      memory,
    );

    expect(memory.lifecycleStatus).toBe(MemoryLifecycleStatus.ACTIVE);
    expect(memory.isActive).toBe(true);
    expect(memory.isArchived).toBe(false);
  });

  it('archives without deleting history and restores an unexpired memory', async () => {
    const memory = makeMemory();
    queueMemories(memory, memory);

    await service.archive(memory._id.toString(), 'No longer current.');

    expect(memory.lifecycleStatus).toBe(MemoryLifecycleStatus.ARCHIVED);
    expect(memory.isActive).toBe(false);
    expect(memory.lifecycleHistory).toEqual([
      expect.objectContaining({
        fromStatus: MemoryLifecycleStatus.ACTIVE,
        toStatus: MemoryLifecycleStatus.ARCHIVED,
        reason: 'No longer current.',
      }),
    ]);

    await service.restore(memory._id.toString(), 'Current again.');

    expect(memory.lifecycleStatus).toBe(MemoryLifecycleStatus.ACTIVE);
    expect(memory.isActive).toBe(true);
    expect(memory.lifecycleHistory).toHaveLength(2);
  });

  it('restoring a memory whose expiry is already past keeps it expired', async () => {
    const memory = makeMemory({
      lifecycleStatus: MemoryLifecycleStatus.ARCHIVED,
      isActive: false,
      isArchived: true,
      expiresAt: new Date(Date.now() - 60_000),
    });
    queueMemories(memory);

    await service.restore(memory._id.toString(), 'Try to restore.');

    expect(memory.lifecycleStatus).toBe(MemoryLifecycleStatus.EXPIRED);
    expect(memory.isActive).toBe(false);
  });

  it('requires disputed memories to use the explicit dispute-resolution flow', async () => {
    const memory = makeMemory({
      lifecycleStatus: MemoryLifecycleStatus.DISPUTED,
      isActive: false,
      isDisputed: true,
      disputeReason: 'Person challenged accuracy.',
    });
    queueMemories(memory);

    await expect(service.restore(memory._id.toString())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('forgets non-destructively and refuses direct restoration', async () => {
    const memory = makeMemory();
    queueMemories(memory);

    await expect(service.remove(memory._id.toString())).resolves.toEqual({
      message: 'Memory forgotten successfully.',
    });
    expect(memory.lifecycleStatus).toBe(MemoryLifecycleStatus.FORGOTTEN);
    expect(memory.isActive).toBe(false);
    expect(memory.isArchived).toBe(true);

    queueMemories(memory);
    await expect(service.restore(memory._id.toString())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('supersedes the old memory while keeping the replacement authoritative', async () => {
    const oldMemory = makeMemory();
    const newMemory = makeMemory();
    queueMemories(oldMemory, newMemory);

    const result = await service.supersede(oldMemory._id.toString(), {
      supersedingMemoryId: newMemory._id.toString(),
      reason: 'Preference changed.',
    });

    expect(result.superseded.lifecycleStatus).toBe(
      MemoryLifecycleStatus.SUPERSEDED,
    );
    expect(oldMemory.supersededByMemoryId?.toString()).toBe(
      newMemory._id.toString(),
    );
    expect(newMemory.supersedesMemoryId?.toString()).toBe(
      oldMemory._id.toString(),
    );
    expect(newMemory.lifecycleStatus).toBe(MemoryLifecycleStatus.ACTIVE);
  });

  it('marks a contradicted memory historical without changing the authoritative one', async () => {
    const oldMemory = makeMemory();
    const authoritative = makeMemory();
    queueMemories(oldMemory, authoritative);

    await service.contradict(oldMemory._id.toString(), {
      authoritativeMemoryId: authoritative._id.toString(),
      reason: 'New verified evidence contradicts the old fact.',
    });

    expect(oldMemory.lifecycleStatus).toBe(MemoryLifecycleStatus.CONTRADICTED);
    expect(oldMemory.contradictedByMemoryIds).toContainEqual(authoritative._id);
    expect(authoritative.contradictsMemoryIds).toContainEqual(oldMemory._id);
    expect(authoritative.lifecycleStatus).toBe(MemoryLifecycleStatus.ACTIVE);
  });

  it('drops an existing destructive expiresAt TTL index at startup', async () => {
    memoryModel.collection.indexes.mockResolvedValue([
      {
        name: 'expiresAt_1',
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
      },
    ]);

    await service.onModuleInit();

    expect(memoryModel.collection.dropIndex).toHaveBeenCalledWith(
      'expiresAt_1',
    );
    expect(memoryModel.collection.createIndex).toHaveBeenCalledWith(
      { lifecycleStatus: 1, expiresAt: 1, updatedAt: -1 },
      { name: 'memory_lifecycle_expiry_history' },
    );
  });
});
