import { BadRequestException } from '@nestjs/common';
import { MediaExecutionService } from './media-execution.service';
import {
  MediaExecutionKind,
  MediaExecutionStatus,
} from './schemas/media-daily-execution.schema';
import { MediaPlatform } from './schemas/media-post.schema';

describe('MediaExecutionService', () => {
  it('syncs planned work without overwriting an existing execution status', async () => {
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });
    const find = jest.fn(() => ({
      sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })),
    }));
    const service = new MediaExecutionService({ updateOne, find } as never);

    await service.sync('2026-09-03', [
      {
        key: '2026-09-03:post:linkedin:10:30:0',
        date: '2026-09-03',
        kind: MediaExecutionKind.POST,
        platform: MediaPlatform.LINKEDIN,
        title: 'Founder decision',
        time: '10:30',
      },
    ]);

    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledWith(
      { key: '2026-09-03:post:linkedin:10:30:0' },
      {
        $setOnInsert: {
          key: '2026-09-03:post:linkedin:10:30:0',
          date: '2026-09-03',
          kind: MediaExecutionKind.POST,
          status: MediaExecutionStatus.PENDING,
          completedCount: 0,
        },
        $set: {
          title: 'Founder decision',
          time: '10:30',
          instruction: undefined,
          plannedCount: 0,
          platform: MediaPlatform.LINKEDIN,
          sourceKey: undefined,
          sourceId: undefined,
          isActive: true,
        },
      },
      { upsert: true },
    );
  });

  it('only carries forward unresolved recent work', async () => {
    const lean = jest
      .fn()
      .mockResolvedValue([
        { key: 'old-task', status: MediaExecutionStatus.BLOCKED },
      ]);
    const limit = jest.fn(() => ({ lean }));
    const sort = jest.fn(() => ({ limit }));
    const find = jest.fn(() => ({ sort }));
    const service = new MediaExecutionService({ find } as never);

    const result = await service.carryForward('2026-09-03');
    expect(result).toHaveLength(1);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: {
          $in: [
            MediaExecutionStatus.PENDING,
            MediaExecutionStatus.MISSED,
            MediaExecutionStatus.BLOCKED,
          ],
        },
      }),
    );
  });

  it('requires a new date when a task is rescheduled', async () => {
    const existing = {
      key: 'task-1',
      status: MediaExecutionStatus.PENDING,
      save: jest.fn(),
      toObject: jest.fn(),
    };
    const service = new MediaExecutionService({
      findOne: jest.fn().mockResolvedValue(existing),
    } as never);

    await expect(
      service.update('task-1', { status: MediaExecutionStatus.RESCHEDULED }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calculates progress without counting intentional skips as required work', () => {
    const service = new MediaExecutionService({} as never);
    expect(
      service.summary([
        { status: MediaExecutionStatus.DONE },
        { status: MediaExecutionStatus.PENDING },
        { status: MediaExecutionStatus.SKIPPED },
      ] as never),
    ).toEqual(
      expect.objectContaining({
        actionable: 2,
        done: 1,
        completionPercent: 50,
      }),
    );
  });
});
