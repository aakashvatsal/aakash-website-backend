import { Types } from 'mongoose';

import { HobbiesCoachingService } from './hobbies-coaching.service';
import { HobbyPracticeTimeWindow, HobbyStatus } from './schemas/hobby.schema';
import {
  HobbyEvidenceType,
  HobbyPracticeStatus,
} from './schemas/hobby-practice-session.schema';
import { HobbyReviewPeriod } from './schemas/hobby-review.schema';

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

function createService() {
  const hobbyId = new Types.ObjectId();
  const hobby = {
    _id: hobbyId,
    name: 'Guitar',
    slug: 'guitar',
    status: HobbyStatus.ACTIVE,
    goal: 'Play complete songs',
    why: 'Creative learning',
    currentSkillLevel: 'Beginner',
    currentStageKey: 'foundations',
    nextAction: 'Practice A-D-E transitions',
    nextActionMinutes: 30,
    weeklyTargetMinutes: 150,
    targetSessionsPerWeek: 5,
    recommendedSessionMinutes: 30,
    preferredWeekdays: [0, 1, 2, 4, 5],
    preferredPracticeTime: HobbyPracticeTimeWindow.EVENING,
    aiCoachingEnabled: true,
    automaticReviewsEnabled: true,
    curriculum: [
      {
        key: 'foundations',
        title: 'Foundations',
        status: 'current',
        completionCriteria: ['Change between core chords without stopping'],
      },
    ],
    linkedLibraryItemIds: [],
    isActive: true,
    isArchived: false,
  };

  const hobbyModel = {
    findOne: jest.fn().mockResolvedValue(hobby),
    find: jest.fn(() => chain([hobby])),
  };
  const sessionModel = {
    find: jest.fn(() => chain([])),
  };
  const reviewModel = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn(() => chain([])),
    findOneAndUpdate: jest.fn(() => chain({ _id: new Types.ObjectId() })),
  };
  const taskModel = {
    find: jest.fn(() => chain([])),
    exists: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(null),
  };
  const libraryItemModel = {
    find: jest.fn(() => chain([])),
  };
  const aiService = {
    generateStructuredResponse: jest.fn().mockResolvedValue({
      data: {
        summary: 'Practice is becoming more consistent.',
        wins: ['Completed real practice sessions'],
        stuckPoints: ['Chord changes still need repetition'],
        coachingNotes: ['Keep the next block simple'],
        nextFocus: 'A-D-E chord changes at a steady tempo',
        suggestedWeeklyMinutes: 150,
        suggestedSessions: 5,
        suggestedSessionMinutes: 30,
        curriculumRecommendation: 'hold',
        nextPlan: [
          {
            focus: 'A-D-E transitions',
            minutes: 30,
            reason: 'Current stage criteria are not yet evidenced as complete.',
          },
        ],
        resourceSearchTerms: ['beginner guitar chord transition drill'],
        evidenceComparison: {
          summary: 'Only written evidence descriptions were available.',
          observedChanges: [],
        },
      },
      model: 'test-model',
      responseId: 'resp_test',
      usage: {
        inputTokens: 10,
        outputTokens: 10,
        totalTokens: 20,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      },
    }),
  };

  const service = new HobbiesCoachingService(
    hobbyModel as never,
    sessionModel as never,
    reviewModel as never,
    taskModel as never,
    libraryItemModel as never,
    aiService as never,
  );

  return {
    service,
    hobby,
    hobbyModel,
    sessionModel,
    reviewModel,
    taskModel,
    aiService,
  };
}

describe('HobbiesCoachingService', () => {
  it('builds practice slots from hobby preferences and Tasks workload without claiming Calendar availability', async () => {
    const { service, taskModel } = createService();
    taskModel.find.mockReturnValue(
      chain([
        {
          dueAt: new Date(),
          estimatedMinutes: 240,
        },
      ]),
    );

    const plan = await service.getPracticePlan(new Date());

    expect(plan.source).toBe('tasks_plus_hobby_preferences');
    expect(plan.calendarIntegration).toBe('not_connected_in_backend');
    expect(plan.note).toContain('does not claim Google Calendar availability');
    expect(plan.slots.length).toBeGreaterThan(0);
    expect(plan.slots[0]).toMatchObject({
      hobbyName: 'Guitar',
      timeWindow: HobbyPracticeTimeWindow.EVENING,
    });
  });

  it('uses the latest coaching focus and suggested session duration in the weekly practice plan', async () => {
    const { service, hobby, reviewModel } = createService();
    reviewModel.find.mockReturnValue(
      chain([
        {
          hobbyId: hobby._id,
          nextFocus: 'Play the A-D-E progression cleanly at 70 BPM',
          suggestedSessionMinutes: 18,
          periodEnd: new Date(),
        },
      ]),
    );

    const plan = await service.getPracticePlan(new Date());

    expect(plan.slots.length).toBeGreaterThan(0);
    expect(plan.slots[0]).toMatchObject({
      focus: 'Play the A-D-E progression cleanly at 70 BPM',
      minutes: 18,
    });
  });

  it('does not send raw evidence URLs to the coaching prompt and flags media for true multimodal review', async () => {
    const { service, sessionModel, aiService, reviewModel } = createService();
    sessionModel.find.mockReturnValue(
      chain([
        {
          hobbyId: new Types.ObjectId(),
          status: HobbyPracticeStatus.COMPLETED,
          startedAt: new Date(),
          durationMinutes: 30,
          focus: 'Chord transitions',
          reflection: 'Fewer pauses than last week.',
          evidence: [
            {
              type: HobbyEvidenceType.AUDIO,
              url: 'https://private.example.com/practice.mp3',
              description:
                'Same 30-second progression as the baseline recording.',
            },
          ],
        },
      ]),
    );
    const saved = {
      evidenceComparison: {
        requiresMultimodalReview: true,
      },
    };
    reviewModel.findOneAndUpdate.mockReturnValue(chain(saved));

    const result = await service.generateReview(
      new Types.ObjectId().toString(),
      HobbyReviewPeriod.WEEKLY,
      true,
    );

    const call = aiService.generateStructuredResponse.mock
      .calls[0] as unknown as [{ input: string }];
    const request = call[0];
    expect(request.input).not.toContain(
      'https://private.example.com/practice.mp3',
    );
    expect(request.input).toContain('"hasUrl":true');
    expect(result.evidenceComparison.requiresMultimodalReview).toBe(true);
  });

  it('deduplicates synced practice-plan tasks by hobby and date', async () => {
    const { service, taskModel } = createService();
    jest.spyOn(service, 'getPracticePlan').mockResolvedValue({
      generatedAt: new Date().toISOString(),
      weekStart: new Date().toISOString(),
      weekEnd: new Date().toISOString(),
      source: 'tasks_plus_hobby_preferences',
      calendarIntegration: 'not_connected_in_backend',
      note: 'test',
      slots: [
        {
          hobbyId: new Types.ObjectId().toString(),
          hobbyName: 'Guitar',
          dateKey: '2026-09-05',
          startAt: '2026-09-05T13:30:00.000Z',
          timeWindow: HobbyPracticeTimeWindow.EVENING,
          minutes: 30,
          focus: 'Chord transitions',
          reason: 'test',
          taskLoadMinutes: 0,
        },
      ],
    });
    taskModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await service.syncPracticePlanTasks();

    expect(result).toMatchObject({ created: 0, skipped: 1, slots: 1 });
    expect(taskModel.create).not.toHaveBeenCalled();
  });
});
