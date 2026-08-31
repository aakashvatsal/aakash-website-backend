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
import { HsakaaPatternService } from './hsakaa-pattern.service';
import {
  HsakaaPatternContent,
  HsakaaPatternDocument,
} from './schemas/hsakaa-pattern.schema';

const patternContent: HsakaaPatternContent = {
  headline: 'Focus repeatedly fragments when unresolved work accumulates.',
  overview:
    'Recent records show one repeated operational pattern and one cross-domain relationship worth watching.',
  patterns: [
    {
      title: 'Unfinished work repeatedly returns to the top of attention',
      category: 'cross_domain',
      confidence: 0.84,
      significance: 'high',
      observation:
        'The same focus area appears across active tasks and multiple Now statuses.',
      implication:
        'Closing or explicitly dropping the repeated item may reduce attention switching.',
      evidence: [
        {
          source: 'tasks_recent',
          label: 'Finish Phase 3B',
          detail: 'High-priority task remained active during the window.',
          occurredAt: '2026-08-26T08:00:00.000Z',
        },
        {
          source: 'now_history',
          label: 'AI implementation',
          detail: 'The same focus appeared in a previous Now status.',
          occurredAt: '2026-08-25T08:00:00.000Z',
        },
      ],
      suggestedPrompt:
        'Which repeated priority should I finish, delegate or deliberately drop?',
    },
  ],
  correlations: [],
  recurringThemes: ['focus', 'unfinished work'],
  suggestedPrompts: ['What should I deliberately stop carrying forward?'],
};

describe('HsakaaPatternService', () => {
  function createService(options?: { cached?: boolean }) {
    const cached = options?.cached
      ? {
          _id: 'pattern-id',
          dateKey: '2026-08-27',
          timezone: 'Asia/Kolkata',
          windowDays: 30,
          windowStart: new Date('2026-07-28T00:00:00.000Z'),
          windowEnd: new Date('2026-08-27T00:00:00.000Z'),
          content: patternContent,
          aiModel: 'gpt-test',
          aiResponseId: 'resp-cached',
          usage: null,
          sources: ['tasks_recent', 'now_history'],
          generatedAt: new Date('2026-08-27T06:00:00.000Z'),
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
      _id: 'generated-pattern-id',
      dateKey: '2026-08-27',
      timezone: 'Asia/Kolkata',
      windowDays: 30,
      windowStart: new Date('2026-07-28T00:00:00.000Z'),
      windowEnd: new Date('2026-08-27T00:00:00.000Z'),
      content: patternContent,
      aiModel: 'gpt-test',
      aiResponseId: 'resp-generated',
      usage: {
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
        cachedInputTokens: 0,
        reasoningTokens: 20,
      },
      sources: ['tasks_recent', 'now_history', 'health_window'],
      generatedAt: new Date('2026-08-27T06:10:00.000Z'),
    };

    const updateExec = jest.fn().mockResolvedValue(saved);
    const updateLean = jest.fn().mockReturnValue({ exec: updateExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean: updateLean });

    const model = {
      findOne,
      findOneAndUpdate,
    } as unknown as Model<HsakaaPatternDocument>;

    const generateStructuredResponseMock = jest.fn().mockResolvedValue({
      data: patternContent,
      model: 'gpt-test',
      responseId: 'resp-generated',
      usage: saved.usage,
    });
    const aiService = {
      generateStructuredResponse: generateStructuredResponseMock,
    } as unknown as AiService;

    const tasksService = {
      findAll: jest.fn().mockResolvedValue({
        data: [{ title: 'Finish Phase 3B', updatedAt: new Date() }],
      }),
      getSummary: jest.fn().mockResolvedValue({ open: 1 }),
    } as unknown as TasksService;
    const journalService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
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
      getSummary: jest.fn().mockResolvedValue({ pending: 0 }),
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as RemindersService;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return {
      service: new HsakaaPatternService(
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

  it('returns a cached report without calling AI again', async () => {
    const { service, generateStructuredResponseMock, findOneAndUpdate } =
      createService({ cached: true });

    const result = await service.getCurrent();

    expect(result.cached).toBe(true);
    expect(result.content.headline).toBe(patternContent.headline);
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('generates and persists pattern intelligence when no report exists', async () => {
    const { service, generateStructuredResponseMock, findOneAndUpdate } =
      createService();

    const result = await service.getCurrent();

    expect(result.cached).toBe(false);
    expect(result.content).toEqual(patternContent);
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('refreshes without checking the current-day cache first', async () => {
    const { service, generateStructuredResponseMock, findOne } = createService({
      cached: true,
    });

    const result = await service.refreshCurrent();

    expect(result.cached).toBe(false);
    expect(findOne).not.toHaveBeenCalled();
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
  });

  it('returns the latest cached report for HSAKAA chat without regenerating', async () => {
    const { service, generateStructuredResponseMock } = createService({
      cached: true,
    });

    const result = await service.getLatestCached();

    expect(result?.cached).toBe(true);
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
  });
});
