import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import { HsakaaBriefService } from './hsakaa-brief.service';
import { HsakaaToolsService } from './hsakaa-tools.service';
import {
  HsakaaBriefDocument,
  HsakaaDailyBriefContent,
} from './schemas/hsakaa-brief.schema';

const briefContent: HsakaaDailyBriefContent = {
  greeting: 'Good morning.',
  headline: 'Protect focus and clear the highest-leverage work.',
  summary: 'Today is about one clear priority and keeping the rest contained.',
  signals: {
    tasks: { status: 'watch', text: 'Two tasks deserve attention.' },
    reminders: { status: 'good', text: 'No urgent reminder pressure.' },
    health: { status: 'unknown', text: 'Health data is incomplete.' },
    mentalLoad: { status: 'watch', text: 'Brain Dump still has open items.' },
  },
  priorities: [
    {
      title: 'Finish the key task',
      reason: 'It is the clearest active priority.',
      urgency: 'high',
      source: 'tasks',
    },
  ],
  risks: [],
  opportunities: [],
  suggestedActions: [],
};

describe('HsakaaBriefService', () => {
  function createService(options?: { cached?: boolean }) {
    const existing = options?.cached
      ? {
          _id: 'brief-id',
          dateKey: '2026-08-27',
          timezone: 'Asia/Kolkata',
          content: briefContent,
          aiModel: 'gpt-test',
          aiResponseId: 'resp-cached',
          usage: null,
          sources: ['get_now_status'],
          generationSource: 'manual' as const,
          generatedAt: new Date('2026-08-27T06:00:00.000Z'),
        }
      : null;

    const findOneExec = jest.fn().mockResolvedValue(existing);
    const findOneLean = jest.fn().mockReturnValue({ exec: findOneExec });
    const findOne = jest.fn().mockReturnValue({ lean: findOneLean });

    const saved = {
      _id: 'generated-brief-id',
      dateKey: '2026-08-27',
      timezone: 'Asia/Kolkata',
      content: briefContent,
      aiModel: 'gpt-test',
      aiResponseId: 'resp-generated',
      usage: {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cachedInputTokens: 0,
        reasoningTokens: 0,
      },
      sources: ['get_now_status', 'get_task_summary'],
      generationSource: 'manual' as const,
      generatedAt: new Date('2026-08-27T06:10:00.000Z'),
    };

    const updateExec = jest.fn().mockResolvedValue(saved);
    const updateLean = jest.fn().mockReturnValue({ exec: updateExec });
    const findOneAndUpdate = jest.fn().mockReturnValue({ lean: updateLean });
    const exists = jest.fn().mockResolvedValue(null);

    const model = {
      findOne,
      findOneAndUpdate,
      exists,
    } as unknown as Model<HsakaaBriefDocument>;

    const generateStructuredResponseMock = jest.fn().mockResolvedValue({
      data: briefContent,
      model: 'gpt-test',
      responseId: 'resp-generated',
      usage: saved.usage,
    });
    const aiService = {
      generateStructuredResponse: generateStructuredResponseMock,
    } as unknown as AiService;

    const readTool = (name: string) => ({
      definition: { name },
      execute: jest.fn().mockResolvedValue({ ok: true, source: name }),
    });

    const getPrivateToolsMock = jest
      .fn()
      .mockReturnValue([
        readTool('get_now_status'),
        readTool('get_task_summary'),
        readTool('search_tasks'),
        readTool('get_today_reminders'),
        readTool('get_health_dashboard'),
        readTool('get_brain_dump_inbox'),
        readTool('search_journal'),
        readTool('search_companies'),
      ]);
    const toolsService = {
      getPrivateTools: getPrivateToolsMock,
    } as unknown as HsakaaToolsService;

    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return {
      service: new HsakaaBriefService(
        model,
        aiService,
        toolsService,
        configService,
      ),
      findOne,
      findOneAndUpdate,
      exists,
      aiService,
      toolsService,
      generateStructuredResponseMock,
      getPrivateToolsMock,
    };
  }

  it('returns the cached brief without calling AI again', async () => {
    const { service, generateStructuredResponseMock, findOneAndUpdate } =
      createService({
        cached: true,
      });

    const result = await service.getToday();

    expect(result.cached).toBe(true);
    expect(result.content.headline).toBe(briefContent.headline);
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('generates and persists a brief when none exists', async () => {
    const {
      service,
      generateStructuredResponseMock,
      getPrivateToolsMock,
      findOneAndUpdate,
    } = createService();

    const result = await service.getToday();

    expect(result.cached).toBe(false);
    expect(result.content).toEqual(briefContent);
    expect(getPrivateToolsMock).toHaveBeenCalled();
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('refreshes even when a current brief could already exist', async () => {
    const { service, generateStructuredResponseMock, findOne } = createService({
      cached: true,
    });

    const result = await service.refreshToday();

    expect(result.cached).toBe(false);
    expect(findOne).not.toHaveBeenCalled();
    expect(generateStructuredResponseMock).toHaveBeenCalledTimes(1);
  });

  it('does not generate a scheduled duplicate when today already exists', async () => {
    const { service, exists, generateStructuredResponseMock } = createService();
    exists.mockResolvedValue({ _id: 'existing' });

    const result = await service.ensureScheduledToday();

    expect(result).toBeNull();
    expect(generateStructuredResponseMock).not.toHaveBeenCalled();
  });
});
