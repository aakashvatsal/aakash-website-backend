import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { JournalService } from './journal.service';

type MockJournalDocument = {
  _id: Types.ObjectId;
  metadata: Record<string, unknown>;
  visibility: string;
  isPublished: boolean;
  publishedAt: Date | undefined;
  isArchived: boolean;
  isActive: boolean;
  save: jest.Mock<Promise<MockJournalDocument>, []>;
};

function document(metadata: Record<string, unknown>): MockJournalDocument {
  const entry = {
    _id: new Types.ObjectId(),
    metadata,
    visibility: 'private',
    isPublished: false,
    publishedAt: undefined,
    isArchived: false,
    isActive: true,
    save: jest.fn<Promise<MockJournalDocument>, []>(),
  } as MockJournalDocument;

  entry.save.mockImplementation(() => Promise.resolve(entry));
  return entry;
}

describe('JournalService HSAKAA daily journal safety', () => {
  it('blocks publishing the private daily synthesis', async () => {
    const entry = document({
      dailySynthesis: true,
      approvalStatus: 'approved',
    });
    const model = { findOne: jest.fn().mockResolvedValue(entry) };
    const service = new JournalService(model as never);

    await expect(service.publish(String(entry._id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(entry.save).not.toHaveBeenCalled();
  });

  it('blocks publishing an unapproved public derivative', async () => {
    const entry = document({
      dailyPublicDerivative: true,
      approvalStatus: 'pending_approval',
    });
    const model = { findOne: jest.fn().mockResolvedValue(entry) };
    const service = new JournalService(model as never);

    await expect(service.publish(String(entry._id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(entry.save).not.toHaveBeenCalled();
  });

  it('allows publishing an approved public derivative', async () => {
    const entry = document({
      dailyPublicDerivative: true,
      approvalStatus: 'approved',
    });
    const model = { findOne: jest.fn().mockResolvedValue(entry) };
    const service = new JournalService(model as never);

    await service.publish(String(entry._id));
    expect(entry.visibility).toBe('public');
    expect(entry.isPublished).toBe(true);
    expect(entry.save).toHaveBeenCalledTimes(1);
  });

  it('blocks publishing an approved public derivative after it becomes stale', async () => {
    const entry = document({
      dailyPublicDerivative: true,
      approvalStatus: 'approved',
      publicDraftStale: true,
    });
    const model = { findOne: jest.fn().mockResolvedValue(entry) };
    const service = new JournalService(model as never);

    await expect(service.publish(String(entry._id))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(entry.save).not.toHaveBeenCalled();
  });
});
