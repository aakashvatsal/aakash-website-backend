import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';

import { MemoryInboxService } from './memory-inbox.service';
import { MemoryInboxStatus } from './schemas/memory-inbox-item.schema';
import {
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDurability,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

describe('MemoryInboxService', () => {
  const inboxModel = {
    findOne: jest.fn(),
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  const memoryService = {
    create: jest.fn(),
    resolveAttribution: jest.fn(),
  };

  let service: MemoryInboxService;

  beforeEach(() => {
    jest.clearAllMocks();
    memoryService.resolveAttribution.mockResolvedValue({
      scope: 'general',
      personId: null,
      personLinks: [],
    });
    service = new MemoryInboxService(
      inboxModel as never,
      memoryService as never,
    );
  });

  it('stages a non-sensitive HSAKAA candidate without creating active memory', async () => {
    inboxModel.findOne.mockResolvedValue(null);
    inboxModel.create.mockImplementation(
      (payload: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        ...payload,
      }),
    );

    const result = await service.captureFromHsakaa({
      content:
        'Aakash prefers deterministic release gates for Personal OS patches.',
      type: MemoryType.PREFERENCE,
      categories: ['Personal OS'],
      durability: MemoryDurability.DURABLE,
      sensitivity: MemorySensitivity.PERSONAL,
      proposalReason: 'Likely to affect future development workflows.',
    });

    expect(memoryService.create).not.toHaveBeenCalled();
    expect(inboxModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: MemorySource.CHAT,
        captureOrigin: MemoryCaptureOrigin.HSAKAA,
        accessLevel: MemoryAccessLevel.OWNER_ONLY,
        verificationStatus: MemoryVerificationStatus.INFERRED,
        categories: ['personal-os'],
        status: MemoryInboxStatus.PENDING,
      }),
    );
    expect(result).toEqual(expect.objectContaining({ status: 'pending' }));
  });

  it('refuses to auto-stage sensitive HSAKAA memory', async () => {
    await expect(
      service.captureFromHsakaa({
        content: 'Sensitive private detail.',
        sensitivity: MemorySensitivity.SENSITIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(inboxModel.create).not.toHaveBeenCalled();
    expect(memoryService.create).not.toHaveBeenCalled();
  });

  it('accepts a pending candidate into confirmed active memory without changing the captured baseline', async () => {
    const inboxItemId = new Types.ObjectId();
    const acceptedMemoryId = new Types.ObjectId();
    const capturedAt = new Date('2026-08-28T04:00:00.000Z');
    const happenedAt = new Date('2026-08-27T18:30:00.000Z');
    const save = jest.fn().mockResolvedValue(undefined);

    const item = {
      _id: inboxItemId,
      personId: null,
      content: 'A durable builder lesson.',
      type: MemoryType.EXPERIENCE,
      source: MemorySource.CHAT,
      sourceReference: undefined,
      tags: ['builder'],
      categories: ['work'],
      entities: [],
      importance: 0.8,
      confidence: 0.7,
      verificationStatus: MemoryVerificationStatus.INFERRED,
      accessLevel: MemoryAccessLevel.OWNER_ONLY,
      sensitivity: MemorySensitivity.PERSONAL,
      durability: MemoryDurability.DURABLE,
      captureOrigin: MemoryCaptureOrigin.HSAKAA,
      capturedAt,
      happenedAt,
      expiresAt: undefined,
      status: MemoryInboxStatus.PENDING,
      save,
    };

    inboxModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(item),
    });
    memoryService.create.mockResolvedValue({ _id: acceptedMemoryId });

    const result = await service.accept(inboxItemId.toString(), {});

    expect(memoryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        content: item.content,
        verificationStatus: MemoryVerificationStatus.CONFIRMED,
        captureOrigin: MemoryCaptureOrigin.HSAKAA,
        capturedAt: capturedAt.toISOString(),
        happenedAt: happenedAt.toISOString(),
        inboxItemId: inboxItemId.toString(),
      }),
    );
    expect(item.status).toBe(MemoryInboxStatus.ACCEPTED);
    expect(item.acceptedMemoryId).toEqual(acceptedMemoryId);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.memory).toEqual({ _id: acceptedMemoryId });
  });

  it('does not allow an already-reviewed inbox item to be accepted again', async () => {
    inboxModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        status: MemoryInboxStatus.REJECTED,
      }),
    });

    await expect(
      service.accept(new Types.ObjectId().toString(), {}),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(memoryService.create).not.toHaveBeenCalled();
  });
});
