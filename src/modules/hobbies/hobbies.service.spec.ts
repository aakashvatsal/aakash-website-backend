import { Types } from 'mongoose';

import { HobbiesService } from './hobbies.service';
import { HobbyStatus } from './schemas/hobby.schema';
import { HobbyPracticeStatus } from './schemas/hobby-practice-session.schema';

type HobbyStatsProbe = {
  getHobbyStats(hobby: Record<string, unknown>): Promise<{
    weeklyMinutes: number;
    todayMinutes: number;
    sessionsThisWeek: number;
    activeSession: unknown;
  }>;
  nextHobbyRecommendation(
    backlog: Array<Record<string, unknown>>,
    active: Array<Record<string, unknown>>,
  ): {
    ready: boolean;
    hobby: { name: string } | null;
    reason: string;
  };
};

function chain<T>(value: T) {
  const api = {
    sort: jest.fn(),
    limit: jest.fn(),
    select: jest.fn(),
    lean: jest.fn().mockResolvedValue(value),
  };
  api.sort.mockReturnValue(api);
  api.limit.mockReturnValue(api);
  api.select.mockReturnValue(api);
  return api;
}

function createService(options?: {
  completedSessions?: Array<{
    startedAt: Date;
    durationMinutes: number;
    status: HobbyPracticeStatus;
  }>;
  activeSession?: Record<string, unknown> | null;
}) {
  const sessionModel = {
    find: jest.fn(() => chain(options?.completedSessions ?? [])),
    findOne: jest.fn(() => chain(options?.activeSession ?? null)),
  };
  const taskModel = {
    exists: jest.fn((query: Record<string, unknown>) => {
      void query;
      return Promise.resolve<unknown>(null);
    }),
    create: jest.fn((document: Record<string, unknown>) => {
      void document;
      return Promise.resolve<unknown>(null);
    }),
    updateOne: jest.fn(),
  };
  const service = new HobbiesService(
    {} as never,
    sessionModel as never,
    taskModel as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, sessionModel, taskModel };
}

describe('HobbiesService', () => {
  it('counts only completed real practice sessions toward weekly minutes', async () => {
    const now = new Date();
    const { service, sessionModel } = createService({
      completedSessions: [
        {
          startedAt: now,
          durationMinutes: 30,
          status: HobbyPracticeStatus.COMPLETED,
        },
      ],
      activeSession: {
        status: HobbyPracticeStatus.IN_PROGRESS,
        durationMinutes: 0,
      },
    });
    const probe = service as unknown as HobbyStatsProbe;
    const stats = await probe.getHobbyStats({
      _id: new Types.ObjectId().toString(),
      weeklyTargetMinutes: 150,
      targetSessionsPerWeek: 5,
      recommendedSessionMinutes: 30,
      status: HobbyStatus.ACTIVE,
      intensity: 'primary',
      curriculum: [],
    });

    expect(stats.weeklyMinutes).toBe(30);
    expect(stats.sessionsThisWeek).toBe(1);
    expect(stats.activeSession).toMatchObject({
      status: HobbyPracticeStatus.IN_PROGRESS,
    });
    expect(sessionModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: HobbyPracticeStatus.COMPLETED }),
    );
  });

  it('keeps the next hobby gated while two acquisition tracks are active', () => {
    const { service } = createService();
    const probe = service as unknown as HobbyStatsProbe;
    const result = probe.nextHobbyRecommendation(
      [
        {
          _id: new Types.ObjectId(),
          name: 'Chess',
          status: HobbyStatus.BACKLOG,
          candidateProfile: {
            genuineCuriosity: 9,
            lifestyleFit: 8,
            novelty: 7,
            strategicUsefulness: 7,
            mediaUsefulness: 6,
            weeklyMinutes: 120,
          },
        },
      ],
      [
        {
          status: HobbyStatus.ACTIVE,
          weeklyTargetMinutes: 150,
          targetDate: new Date('2026-11-18T00:00:00.000+05:30'),
        },
        {
          status: HobbyStatus.ACTIVE,
          weeklyTargetMinutes: 100,
          targetDate: new Date('2026-09-25T00:00:00.000+05:30'),
        },
      ],
    );

    expect(result.ready).toBe(false);
    expect(result.hobby?.name).toBe('Chess');
    expect(result.reason).toContain('two serious acquisition tracks');
  });

  it('deduplicates HSAKAA practice tasks for the same hobby and day', async () => {
    const { service, taskModel } = createService();
    const hobbyId = new Types.ObjectId();
    jest.spyOn(service, 'getOverview').mockResolvedValue({
      generatedAt: new Date().toISOString(),
      trackingNote: 'test',
      active: [
        {
          _id: hobbyId,
          name: 'Guitar',
          slug: 'guitar',
          status: HobbyStatus.ACTIVE,
          recommendedTodayMinutes: 30,
          pace: 'behind',
          sessionsThisWeek: 1,
          expectedSessionsByToday: 3,
          nextAction: 'Practice chord transitions',
        },
      ],
      backlog: [],
      doNext: null,
      learningLoad: {
        weeklyTargetMinutes: 150,
        weeklyMinutes: 30,
        sessionsThisWeek: 1,
        load: 'light',
        recommendation: 'test',
      },
      nextHobby: {
        ready: false,
        hobby: null,
        reason: 'test',
      },
    } as unknown as Awaited<ReturnType<HobbiesService['getOverview']>>);
    taskModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.syncPracticeTasks();

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(taskModel.create).not.toHaveBeenCalled();
    expect(taskModel.exists).toHaveBeenCalledTimes(1);
    const existsQuery = taskModel.exists.mock.calls[0][0];
    expect(String(existsQuery.sourceExternalId)).toContain('hobby-practice:');
    expect(existsQuery.isActive).toBe(true);
  });
});
