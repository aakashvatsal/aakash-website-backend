import { MemoryRecallService } from './memory-recall.service';
import { MemoryService } from './memory.service';
import {
  MemoryLifecycleStatus,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

describe('MemoryService deterministic recall', () => {
  const makeQuery = (value: unknown[]) => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  });

  it('recalls current and historical memory without generating an embedding or OpenAI call', async () => {
    const current = [
      {
        _id: 'current',
        content: 'The current launch goal is Mumbai repeatability.',
        type: MemoryType.GOAL,
        importance: 0.9,
        confidence: 0.9,
        verificationStatus: MemoryVerificationStatus.CONFIRMED,
        lifecycleStatus: MemoryLifecycleStatus.ACTIVE,
        capturedAt: new Date(),
      },
    ];
    const historical = [
      {
        _id: 'historical',
        content: 'The previous launch goal prioritized the UK.',
        type: MemoryType.GOAL,
        importance: 0.7,
        confidence: 0.8,
        verificationStatus: MemoryVerificationStatus.CONFIRMED,
        lifecycleStatus: MemoryLifecycleStatus.SUPERSEDED,
        capturedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];

    const memoryModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      find: jest
        .fn()
        .mockReturnValueOnce(makeQuery(current))
        .mockReturnValueOnce(makeQuery(historical)),
    };
    const aiService = {
      generateEmbedding: jest.fn(),
    };

    const service = new MemoryService(
      memoryModel as never,
      {} as never,
      {} as never,
      {} as never,
      aiService as never,
      new MemoryRecallService(),
    );

    const result = await service.recall({
      query: 'How did my launch goals change previously?',
      includeHistorical: true,
      limit: 5,
    });

    expect(result.current[0].memory._id).toBe('current');
    expect(result.historical[0].memory._id).toBe('historical');
    expect(result.plan.includeHistorical).toBe(true);
    expect(aiService.generateEmbedding).not.toHaveBeenCalled();
    expect(memoryModel.updateMany).toHaveBeenCalled();
  });
});
