/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { HsakaaDailyJournalService } from './hsakaa-daily-journal.service';

function queryFor<T>(value: T) {
  return {
    lean: jest.fn().mockResolvedValue(value),
    then: (
      resolve: (resolved: T) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(value).then(resolve, reject),
  };
}

function setup() {
  const stored = new Map<string, any>();
  const privateId = new Types.ObjectId();
  const publicId = new Types.ObjectId();

  function makeDocument(input: Record<string, unknown>) {
    const document: any = {
      _id: String(input.sourceExternalId).startsWith('hsakaa-public')
        ? publicId
        : privateId,
      ...input,
    };
    document.save = jest.fn(async () => {
      stored.set(String(document.sourceExternalId), document);
      return document;
    });
    document.toObject = jest.fn(() => ({
      ...document,
      save: undefined,
      toObject: undefined,
    }));
    return document;
  }

  const JournalModel: any = jest
    .fn()
    .mockImplementation((input) => makeDocument(input));
  JournalModel.findOne = jest.fn((query: Record<string, unknown>) => {
    if (query.sourceExternalId) {
      return queryFor(stored.get(String(query.sourceExternalId)) ?? null);
    }
    if (query._id) {
      const id = String(query._id);
      const document = [...stored.values()].find(
        (item) => String(item._id) === id,
      );
      return queryFor(document ?? null);
    }
    return queryFor(null);
  });

  const privateGeneration = {
    title: 'A day of building',
    content: 'Today I strengthened the Personal OS memory system.',
    highlight: 'Made the day auditable before synthesis.',
    wins: ['Shipped the deterministic snapshot'],
    lessons: ['Audit trails make synthesis trustworthy'],
    decisions: ['Keep public and private journals separate'],
    ideas: ['Use the public-safe snapshot for Open Notebook'],
    gratitude: [],
    challenges: ['Keeping the privacy boundary explicit'],
    tags: ['building', 'personal-os'],
  };
  const publicGeneration = {
    title: 'Building with clearer boundaries',
    content: 'I shipped a public update to the Personal OS today.',
    highlight:
      'Public reflection can stay useful without exposing private context.',
    wins: ['Published a Personal OS update'],
    lessons: ['Boundaries improve systems'],
    decisions: [],
    ideas: [],
    gratitude: [],
    challenges: [],
    tags: ['building'],
  };

  const aiService = {
    generateStructuredResponse: jest.fn().mockImplementation(({ name }) =>
      Promise.resolve({
        data: name.includes('public') ? publicGeneration : privateGeneration,
        model: 'test-model',
        responseId: name.includes('public') ? 'resp_public' : 'resp_private',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }),
    ),
  };

  const libraryId = new Types.ObjectId();
  const context = {
    dateKey: '2026-08-28',
    version: 2,
    privacyVersion: 1,
    privacyReviewStatus: 'clear',
    publicSourceFingerprint: 'fingerprint-v1',
    items: [
      {
        id: 'task:1',
        source: 'task',
        kind: 'task_completed',
        title: 'Ship 4F',
        summary: 'Completed the work',
        occurredAt: '2026-08-28T10:00:00.000Z',
        sourceId: new Types.ObjectId().toString(),
        privacy: 'internal_safe',
        significantChange: true,
        metadata: {},
      },
      {
        id: 'health:1',
        source: 'health',
        kind: 'health_activity',
        title: 'PRIVATE HEALTH MARKER',
        summary: 'PRIVATE SLEEP MARKER',
        occurredAt: '2026-08-28T06:00:00.000Z',
        sourceId: new Types.ObjectId().toString(),
        privacy: 'private_only',
        significantChange: false,
        metadata: {
          sleepDurationHours: 7.25,
          sleepPerformancePercentage: 88,
          recoveryScore: 73,
          steps: 9123,
          workoutCompleted: true,
          workoutType: 'push',
          workoutTitle: 'Push day',
          workoutDurationMinutes: 52,
        },
      },
      {
        id: 'library:1',
        source: 'library',
        kind: 'reading_activity',
        title: 'The Pragmatic Programmer',
        summary: 'Progress 42%',
        occurredAt: '2026-08-28T19:00:00.000Z',
        sourceId: libraryId.toString(),
        privacy: 'internal_safe',
        significantChange: false,
        metadata: {
          title: 'The Pragmatic Programmer',
          author: 'David Thomas, Andrew Hunt',
          progressPercentage: 42,
        },
      },
      {
        id: 'media:1',
        source: 'media',
        kind: 'media_published',
        title: 'PUBLIC MEDIA MARKER',
        summary: 'Published a Personal OS build update',
        occurredAt: '2026-08-28T18:00:00.000Z',
        sourceId: new Types.ObjectId().toString(),
        privacy: 'public_safe',
        significantChange: true,
        metadata: {},
      },
    ],
    changes: [],
  };
  const dailyContextService = {
    getDateKey: jest.fn(() => '2026-08-28'),
    getPreviousDateKey: jest.fn(() => '2026-08-27'),
    capture: jest.fn().mockResolvedValue(context),
    get: jest.fn().mockResolvedValue(context),
  };

  return {
    service: new HsakaaDailyJournalService(
      aiService as never,
      dailyContextService as never,
      JournalModel as never,
    ),
    aiService,
    dailyContextService,
    context,
    stored,
  };
}

describe('HsakaaDailyJournalService', () => {
  it('creates a structured private journal and a separate public-safe draft', async () => {
    const { service, aiService } = setup();
    const result = await service.generate('2026-08-28');

    expect(aiService.generateStructuredResponse).toHaveBeenCalledTimes(2);
    expect(result.journal.metadata.approvalStatus).toBe('pending_approval');
    expect(result.journal.metadata.dailyJournalKind).toBe('private');
    expect(result.journal.visibility).toBe('private');
    expect(result.journal.isPublished).toBe(false);
    expect(result.journal.wins).toEqual(['Shipped the deterministic snapshot']);
    expect(result.journal.sleep.durationHours).toBe(7.25);
    expect(result.journal.sleep.recoveryScore).toBe(73);
    expect(result.journal.steps).toBe(9123);
    expect(result.journal.workout.title).toBe('Push day');
    expect(result.journal.reading.title).toBe('The Pragmatic Programmer');

    expect(result.publicJournal.metadata.dailyJournalKind).toBe('public');
    expect(result.publicJournal.visibility).toBe('public');
    expect(result.publicJournal.isPublished).toBe(false);
  });

  it('never sends private or needs-review context to the public AI generation', async () => {
    const { service, aiService } = setup();
    await service.generate('2026-08-28');

    const calls = aiService.generateStructuredResponse.mock.calls;
    const privateCall = calls.find(([params]) =>
      params.name.includes('private'),
    )?.[0];
    const publicCall = calls.find(([params]) =>
      params.name.includes('public'),
    )?.[0];

    expect(privateCall.input).toContain('PRIVATE HEALTH MARKER');
    expect(privateCall.input).toContain('PRIVATE SLEEP MARKER');
    expect(publicCall.input).toContain('PUBLIC MEDIA MARKER');
    expect(publicCall.input).not.toContain('PRIVATE HEALTH MARKER');
    expect(publicCall.input).not.toContain('PRIVATE SLEEP MARKER');
    expect(publicCall.input).not.toContain('7.25');
    expect(publicCall.input).not.toContain('9123');
  });

  it('does not create a public journal when there is no public-safe context', async () => {
    const { service, aiService, dailyContextService } = setup();
    dailyContextService.capture.mockResolvedValue({
      dateKey: '2026-08-28',
      version: 3,
      items: [
        {
          id: 'private:1',
          source: 'health',
          kind: 'health_activity',
          title: 'Private',
          summary: 'Private',
          occurredAt: '2026-08-28T06:00:00.000Z',
          sourceId: new Types.ObjectId().toString(),
          privacy: 'private_only',
          significantChange: false,
          metadata: {},
        },
      ],
      changes: [],
    });

    const result = await service.generate('2026-08-28');
    expect(aiService.generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(result.publicJournal).toBeNull();
  });

  it('does not silently replace an approved private journal', async () => {
    const { service } = setup();
    const generated = await service.generate('2026-08-28');
    await service.approve(String(generated.journal._id));

    await expect(service.generate('2026-08-28', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('approves the public derivative without publishing it', async () => {
    const { service } = setup();
    const generated = await service.generate('2026-08-28');
    const approved = await service.approvePublic(
      String(generated.publicJournal._id),
    );

    expect(approved.metadata.approvalStatus).toBe('approved');
    expect(approved.visibility).toBe('public');
    expect(approved.isPublished).toBe(false);
  });

  it('invalidates approval when the public-safe source fingerprint changes', async () => {
    const { service, dailyContextService, context } = setup();
    const generated = await service.generate('2026-08-28');
    const approved = await service.approvePublic(
      String(generated.publicJournal._id),
    );

    expect(approved.metadata.approvalStatus).toBe('approved');

    dailyContextService.get.mockResolvedValue({
      ...context,
      privacyVersion: 2,
      publicSourceFingerprint: 'changed-public-source-set',
    });

    await expect(
      service.approvePublic(String(generated.publicJournal._id)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks public approval while any source still needs privacy review', async () => {
    const { service, dailyContextService, context } = setup();
    const generated = await service.generate('2026-08-28');

    dailyContextService.get.mockResolvedValue({
      ...context,
      privacyReviewStatus: 'needs_review',
    });

    await expect(
      service.approvePublic(String(generated.publicJournal._id)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
