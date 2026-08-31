import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import { HealthService } from '../modules/health/health.service';
import { JournalService } from '../modules/journal/journal.service';
import { MemoryService } from '../modules/memory/memory.service';
import { NowService } from '../modules/now/now.service';
import { RemindersService } from '../modules/reminders/reminders.service';
import { TasksService } from '../modules/tasks/tasks.service';
import { HsakaaWeeklyReviewService } from './hsakaa-weekly-review.service';
import {
  HsakaaWeeklyReviewContent,
  HsakaaWeeklyReviewDocument,
} from './schemas/hsakaa-weekly-review.schema';

const weeklyContent: HsakaaWeeklyReviewContent = {
  headline: 'Execution moved forward, but one priority remains unresolved.',
  summary:
    'The week shows progress on AI implementation with one repeated item still competing for attention.',
  wins: [
    {
      title: 'AI implementation advanced',
      detail: 'Multiple implementation tasks were completed during the week.',
      significance: 'high',
      evidence: [
        {
          source: 'tasks_recent',
          label: 'Finish Phase 3B',
          detail: 'Task was completed during the review window.',
          occurredAt: '2026-08-27T08:00:00.000Z',
        },
      ],
    },
  ],
  misses: [],
  decisions: [
    {
      title: 'Keep AI writes confirmation-gated',
      decision:
        'Continue requiring explicit confirmation for Personal OS writes.',
      status: 'made',
      rationale:
        'The confirmed-action architecture was validated during testing.',
      evidence: [
        {
          source: 'journal_recent',
          label: 'Phase 2C journal verified',
          detail: 'Recorded that the confirmation boundary worked correctly.',
          occurredAt: '2026-08-27T09:00:00.000Z',
        },
      ],
    },
  ],
  lessons: [],
  unresolved: [],
  nextWeekPriorities: [
    {
      title: 'Close the remaining AI validation loop',
      reason:
        'The remaining work is a direct continuation of this week’s focus.',
      urgency: 'high',
      source: 'tasks_recent',
      prompt:
        'What is the smallest set of AI validation work I should finish next?',
      evidence: [
        {
          source: 'tasks_recent',
          label: 'AI validation',
          detail: 'Active work remains in the same focus area.',
          occurredAt: '2026-08-27T10:00:00.000Z',
        },
      ],
    },
  ],
  questions: ['What should I deliberately stop carrying into next week?'],
};

describe('HsakaaWeeklyReviewService', () => {
  function createService(options?: { cached?: boolean }) {
    const cached = options?.cached
      ? {
          _id: 'weekly-review-id',
          weekKey: '2026-08-24',
          timezone: 'Asia/Kolkata',
          weekStart: new Date('2026-08-23T18:30:00.000Z'),
          weekEnd: new Date('2026-08-27T10:00:00.000Z'),
          content: weeklyContent,
          aiModel: 'gpt-test',
          aiResponseId: 'resp-cached',
          usage: null,
          sources: ['tasks_recent', 'journal_recent'],
          generatedAt: new Date('2026-08-27T10:00:00.000Z'),
        }
      : null;

    const findOneExec = jest.fn().mockResolvedValue(cached);
    const findOneLean = jest.fn().mockReturnValue({ exec: findOneExec });
    const findOneSort = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: findOneExec }),
    });
    const findOne = jest.fn().mockReturnValue({
      lean: findOneLean,
      sort: findOneSort,
    });

    const saved = {
      _id: 'generated-weekly-review-id',
      weekKey: '2026-08-24',
      timezone: 'Asia/Kolkata',
      weekStart: new Date('2026-08-23T18:30:00.000Z'),
      weekEnd: new Date('2026-08-27T10:00:00.000Z'),
      content: weeklyContent,
      aiModel: 'gpt-test',
      aiResponseId: 'resp-generated',
      usage: {
        inputTokens: 300,
        outputTokens: 120,
        totalTokens: 420,
        cachedInputTokens: 0,
        reasoningTokens: 30,
      },
      sources: ['tasks_recent', 'journal_recent', 'now_history'],
      generatedAt: new Date('2026-08-27T10:05:00.000Z'),
    };

    const updateExec = jest.fn().mockResolvedValue(saved);
    const updateLean = jest.fn().mockReturnValue({ exec: updateExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean: updateLean });

    const model = {
      findOne,
      findOneAndUpdate,
    } as unknown as Model<HsakaaWeeklyReviewDocument>;

    const generateStructuredResponseMock = jest.fn().mockResolvedValue({
      data: weeklyContent,
      model: 'gpt-test',
      responseId: 'resp-generated',
      usage: saved.usage,
    });
    const aiService = {
      generateStructuredResponse: generateStructuredResponseMock,
    } as unknown as AiService;

    const tasksService = {
      findAll: jest.fn().mockResolvedValue({
        data: [{ title: 'AI validation', updatedAt: new Date() }],
      }),
      getSummary: jest.fn().mockResolvedValue({ open: 1, completed: 2 }),
    } as unknown as TasksService;
    const journalService = {
      findAll: jest.fn().mockResolvedValue({
        data: [{ title: 'Phase 2C journal verified', createdAt: new Date() }],
      }),
    } as unknown as JournalService;
    const memoryService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as MemoryService;
    const brainDumpService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as BrainDumpService;
    const nowService = {
      getCurrent: jest.fn().mockResolvedValue({ focus: 'AI implementation' }),
      getHistory: jest.fn().mockResolvedValue({
        data: [{ focus: 'AI implementation', startedAt: new Date() }],
      }),
    } as unknown as NowService;
    const healthService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as HealthService;
    const remindersService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      getSummary: jest.fn().mockResolvedValue({ pending: 0 }),
    } as unknown as RemindersService;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return {
      service: new HsakaaWeeklyReviewService(
        model,
        aiService,
        tasksService,
        journalService,
        memoryService,
        brainDumpService,
        nowService,
        healthService,
        remindersService,
        configService,
      ),
      findOne,
      findOneAndUpdate,
      generateStructuredResponseMock,
    };
  }

  it('returns the cached current-week review without calling AI again', async () => {
    const { service, generateStructuredResponseMock, findOneAndUpdate } =
      createService({ cached: true });

    const result = await service.getCurrent();

    expect(result.cached).toBe(true);
    expect(result.content.headline).toBe(weeklyContent.headline);
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('generates and persists the weekly review when no cached review exists', async () => {
    const { service, generateStructuredResponseMock, findOneAndUpdate } =
      createService();

    const result = await service.getCurrent();

    expect(result.cached).toBe(false);
    expect(result.content).toEqual(weeklyContent);
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('refreshes the current week without reading the cache first', async () => {
    const { service, generateStructuredResponseMock, findOne } = createService({
      cached: true,
    });

    const result = await service.refreshCurrent();

    expect(result.cached).toBe(false);
    expect(findOne).not.toHaveBeenCalled();
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
  });

  it('returns the latest cached weekly review for private HSAKAA chat', async () => {
    const { service, generateStructuredResponseMock } = createService({
      cached: true,
    });

    const result = await service.getLatestCached();

    expect(result?.cached).toBe(true);
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
  });
});
