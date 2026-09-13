import { HealthRoutineTaskStatus } from './dto/health-plan-progress.dto';
import {
  HealthProgressService,
  resolveHealthRoutineTaskStatus,
} from './health-progress.service';
import { HealthRoutineTask } from './schemas/health-plan-execution.schema';
import { TaskStatus } from '../tasks/schemas/task.schema';

describe('HealthProgressService routine task ownership', () => {
  it('serves a valid stored daily execution without recomputing source data', async () => {
    const service = Object.create(
      HealthProgressService.prototype,
    ) as HealthProgressService;
    const storedComparison = {
      dateKey: '2026-09-11',
      planVersion: 4,
      planStatus: 'active',
      isFinal: false,
      overallAdherencePercentage: 0,
      trackingCoveragePercentage: 0,
      taskCompletionPercentage: 0,
      taskTrackingCoveragePercentage: 0,
      domains: {},
      automaticMetrics: { sources: [] },
      tasks: [
        {
          key: 'health:2026-09-11:training',
          domain: 'training',
          label: 'Training',
          detail: '',
          scheduledTime: '19:00',
          status: HealthRoutineTaskStatus.PENDING,
          source: 'plan',
          globalTaskId: '',
        },
      ],
      feedback: {},
      computedAt: new Date().toISOString(),
    };
    const planModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ version: 4 }),
          }),
        }),
      }),
    };
    const executionModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            dateKey: '2026-09-11',
            planVersion: 4,
            tasks: storedComparison.tasks,
            comparison: storedComparison,
            sourceFingerprint: 'stable-fingerprint',
          }),
        }),
      }),
    };
    const refreshDaily = jest.fn();

    Object.assign(service as object, {
      planModel,
      executionModel,
      refreshDaily,
    });

    await expect(service.getDaily('2026-09-11')).resolves.toBe(
      storedComparison,
    );
    expect(refreshDaily).not.toHaveBeenCalled();
  });

  it('keeps an explicit Health owner completion authoritative over a stale mirrored task', () => {
    expect(
      resolveHealthRoutineTaskStatus(
        {
          status: HealthRoutineTaskStatus.COMPLETED,
          source: 'owner',
        },
        TaskStatus.TODO,
      ),
    ).toBe(HealthRoutineTaskStatus.COMPLETED);
  });

  it('updates the exact mirrored task and immediately increments Health completion', async () => {
    const service = Object.create(
      HealthProgressService.prototype,
    ) as HealthProgressService;
    const task = {
      key: 'health:2026-09-08:training',
      domain: 'training',
      label: 'Training',
      detail: '',
      scheduledTime: '19:00',
      status: HealthRoutineTaskStatus.PENDING,
      source: 'plan',
      globalTaskId: 'global-task-id',
    } as HealthRoutineTask;
    const execution = {
      tasks: [task],
      taskCompletionPercentage: 0,
      taskTrackingCoveragePercentage: 0,
      sourceFingerprint: '',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const taskUpdateExec = jest.fn().mockResolvedValue(null);
    const taskModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: taskUpdateExec }),
    };
    const executionModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(execution),
      }),
    };
    const recomputed = {
      dateKey: '2026-09-08',
      tasks: [
        {
          ...task,
          status: HealthRoutineTaskStatus.COMPLETED,
          source: 'owner',
        },
      ],
      taskCompletionPercentage: 100,
    };

    Object.assign(service as object, {
      taskModel,
      executionModel,
      captureRange: jest.fn().mockResolvedValue([]),
      getDaily: jest.fn().mockResolvedValue(recomputed),
    });

    const result = await service.updateRoutineTask('2026-09-08', task.key, {
      status: HealthRoutineTaskStatus.COMPLETED,
    });

    expect(task.status).toBe(HealthRoutineTaskStatus.COMPLETED);
    expect(task.source).toBe('owner');
    expect(execution.taskCompletionPercentage).toBe(100);
    expect(execution.taskTrackingCoveragePercentage).toBe(100);
    expect(execution.save).toHaveBeenCalledTimes(1);
    expect(taskModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = taskModel.findOneAndUpdate.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $unset?: Record<string, number> },
    ];
    expect(filter).toEqual({ _id: 'global-task-id', isArchived: false });
    expect(update.$set.status).toBe(TaskStatus.COMPLETED);
    expect(update.$unset).toEqual({ cancelledAt: 1 });
    expect(result.taskCompletionPercentage).toBe(100);
  });
});
