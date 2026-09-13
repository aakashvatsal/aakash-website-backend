import { Model, Types } from 'mongoose';
import { MediaPlanningGenerationService } from './media-planning-generation.service';
import { MediaPlanningService } from './media-planning.service';
import {
  MediaGenerationPurpose,
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';

describe('MediaPlanningGenerationService', () => {
  const jobId = new Types.ObjectId();

  function build() {
    const findOne = jest.fn();
    const create = jest.fn();
    type UpdateOneFn = (
      filter: Record<string, unknown>,
      update: Record<string, unknown>,
    ) => Promise<{ acknowledged: boolean }>;
    const updateOne = jest.fn() as jest.MockedFunction<UpdateOneFn>;
    updateOne.mockResolvedValue({ acknowledged: true });
    const generationRunModel = {
      findOne,
      create,
      updateOne,
    } as unknown as Model<MediaGenerationRunDocument>;
    const generate = jest.fn() as jest.MockedFunction<
      MediaPlanningService['generate']
    >;
    const planningService = { generate } as unknown as MediaPlanningService;
    const service = new MediaPlanningGenerationService(
      generationRunModel,
      planningService,
    );
    return { service, findOne, create, updateOne, planningService, generate };
  }

  function runDocument(overrides: Record<string, unknown> = {}) {
    return {
      _id: jobId,
      purpose: MediaGenerationPurpose.PLANNING,
      status: MediaGenerationRunStatus.GENERATING,
      metadata: {
        stage: 'queued',
        progress: 0,
        queuedAt: '2026-09-04T06:30:00.000Z',
      },
      ...overrides,
    } as unknown as MediaGenerationRunDocument;
  }

  it('returns immediately with a persisted job instead of waiting for plan generation', async () => {
    const { service, findOne, create, generate } = build();
    findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    create.mockResolvedValue(runDocument());
    let resolvePlan: (value: Record<string, unknown>) => void = () => undefined;
    const pendingPlan = new Promise<Record<string, unknown>>((resolve) => {
      resolvePlan = resolve;
    });
    generate.mockReturnValue(pendingPlan);

    const result = await service.start({ force: true });

    expect(result).toMatchObject({
      jobId: jobId.toString(),
      status: MediaGenerationRunStatus.GENERATING,
      stage: 'queued',
      progress: 0,
    });
    expect(generate).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(generate).toHaveBeenCalledWith(
      { force: true },
      expect.any(Function),
    );
    resolvePlan({
      _id: new Types.ObjectId(),
      startDate: '2026-09-04',
      endDate: '2026-09-10',
    });
  });

  it('checkpoints completed days, partial plan and token usage while generation is running', async () => {
    const { service, findOne, create, updateOne, generate } = build();
    findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    create.mockResolvedValue(runDocument());
    generate.mockImplementation(async (_dto, progress) => {
      await progress({
        stage: 'generating_days',
        progress: 54,
        completedDays: 3,
        totalDays: 7,
        usage: {
          inputTokens: 1200,
          outputTokens: 800,
          totalTokens: 2000,
          cachedInputTokens: 300,
          reasoningTokens: 120,
          calls: 5,
          failedCalls: 1,
          retriedCalls: 1,
        },
        partialPlan: {
          startDate: '2026-09-04',
          endDate: '2026-09-10',
          days: [{ date: '2026-09-04' }],
        },
      });
      return {
        _id: new Types.ObjectId(),
        startDate: '2026-09-04',
        endDate: '2026-09-10',
      };
    });

    await service.start({ force: true });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    const checkpointUpdate = updateOne.mock.calls
      .filter(([filter]) => filter._id === jobId.toString())
      .map(([, update]) => update)
      .find((update) => {
        const set = update.$set;
        if (!set || typeof set !== 'object') return false;
        return (set as Record<string, unknown>)['metadata.completedDays'] === 3;
      });

    expect(checkpointUpdate).toBeDefined();
    const checkpointSet = (checkpointUpdate?.$set ?? {}) as Record<
      string,
      unknown
    >;
    expect(checkpointSet['metadata.completedDays']).toBe(3);
    expect(checkpointSet['metadata.totalDays']).toBe(7);

    const usage = checkpointSet['metadata.usage'] as
      Record<string, unknown> | undefined;
    expect(usage?.totalTokens).toBe(2000);
    expect(usage?.calls).toBe(5);

    const partialPlan = checkpointSet['metadata.partialPlan'] as
      Record<string, unknown> | undefined;
    expect(partialPlan?.startDate).toBe('2026-09-04');
  });

  it('returns the existing active planning job instead of starting duplicate generation', async () => {
    const { service, findOne, create } = build();
    findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(
        runDocument({
          metadata: { stage: 'generating_plan', progress: 10 },
        }),
      ),
    });

    const result = await service.start({ force: true });

    expect(result.stage).toBe('generating_plan');
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces the persisted failure message through job status', async () => {
    const { service, findOne } = build();
    findOne.mockReturnValue(
      Promise.resolve(
        runDocument({
          status: MediaGenerationRunStatus.FAILED,
          metadata: {
            stage: 'failed',
            progress: 10,
            error: 'AI structured response failed.',
          },
        }),
      ),
    );

    const result = await service.get(jobId.toString());

    expect(result).toMatchObject({
      status: MediaGenerationRunStatus.FAILED,
      stage: 'failed',
      error: 'AI structured response failed.',
    });
  });
});
