import { MediaTodayService } from './media-today.service';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';

function sortedLean<T>(value: T) {
  return {
    sort: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(value) })),
  };
}

describe('MediaTodayService', () => {
  it('returns one operating view with posts, skips, engagement, publishing and score', async () => {
    const planningModel = {
      findOne: jest.fn(() =>
        sortedLean({
          _id: { toString: () => 'plan-1' },
          startDate: '2026-09-03',
          endDate: '2026-09-09',
          days: [
            {
              date: '2026-09-03',
              theme: 'Builder specificity',
              workload: 'Normal',
              executions: [
                {
                  platform: MediaPlatform.LINKEDIN,
                  action: 'post',
                  time: '10:30',
                  format: MediaPostType.TEXT,
                  title: 'Founder decision',
                  hook: 'Specific hook',
                  estimatedMinutes: 15,
                  productionNotes: 'Final proofread only.',
                },
                {
                  platform: MediaPlatform.YOUTUBE,
                  action: 'skip',
                  time: '19:00',
                  format: MediaPostType.VIDEO,
                  title: '',
                  hook: '',
                  estimatedMinutes: 0,
                  reason: 'Protect quality.',
                },
              ],
              instagramStory: {
                action: 'post',
                time: '18:30',
                sourceType: 'daily_context',
                sourceEvidenceIds: ['evidence:story'],
                reason: 'Show the working context.',
                captureBrief: 'Capture the desk sketch in natural light.',
                frames: [],
                executionReady: true,
                readinessIssues: [],
              },
              youtubeCommunity: {
                action: 'post',
                time: '20:00',
                format: 'text',
                sourceType: 'daily_context',
                sourceEvidenceIds: ['evidence:community'],
                reason: 'Extend the idea natively on YouTube.',
                publishCopy: 'What would you standardize first?',
                pollOptions: [],
                executionReady: true,
                readinessIssues: [],
              },
              engagement: [
                {
                  platform: MediaPlatform.LINKEDIN,
                  time: '09:50',
                  count: 4,
                  purpose: 'Meaningful participation',
                  guidance: 'Add a concrete operator thought.',
                },
              ],
            },
          ],
        }),
      ),
    };
    const calendarService = {
      overview: jest.fn().mockResolvedValue({
        publishingQueue: [
          {
            _id: 'pub-1',
            platform: MediaPlatform.WHATSAPP,
            scheduledAt: '2026-09-03T13:30:00.000Z',
            deliveryStatus: MediaDeliveryStatus.MANUAL_REQUIRED,
          },
        ],
      }),
    };
    const engagementService = {
      overview: jest.fn().mockResolvedValue({
        recent: [{ _id: 'e1', needsResponse: true }],
      }),
    };
    const learningService = {
      overview: jest.fn().mockResolvedValue({
        lifecycle: { due: [{ publicationId: 'p1', period: '24_hours' }] },
      }),
    };
    const adaptationService = {
      overview: jest.fn().mockResolvedValue({
        latest: {
          overallScore: 68,
          scoreDelta: 4,
          dataConfidence: 42,
          platformScores: [],
          focusThisWeek: ['Specific stories'],
          avoidThisWeek: ['Generic motivation'],
          strategyChangeCandidates: [],
        },
      }),
    };
    const executionService = {
      sync: jest
        .fn()
        .mockResolvedValue([
          { key: '2026-09-03:post:linkedin:10:30:0', status: 'pending' },
        ]),
      carryForward: jest
        .fn()
        .mockResolvedValue([
          { key: '2026-09-02:production:instagram:18:00:0', status: 'blocked' },
        ]),
      summary: jest.fn().mockReturnValue({
        total: 1,
        actionable: 1,
        done: 0,
        completionPercent: 0,
        counts: { pending: 1 },
      }),
    };
    const service = new MediaTodayService(
      planningModel as never,
      calendarService as never,
      engagementService as never,
      learningService as never,
      adaptationService as never,
      executionService as never,
    );
    const result = await service.overview('2026-09-03');
    expect(result.day?.theme).toBe('Builder specificity');
    expect(result.posts).toHaveLength(1);
    expect(result.skips).toHaveLength(1);
    expect(result.engagement[0].count).toBe(4);
    expect(result.manualPublishing).toHaveLength(1);
    expect(result.analyticsDue).toHaveLength(1);
    expect(result.presenceScore?.overall).toBe(68);
    expect(result.execution.tasks).toHaveLength(1);
    expect(result.execution.carryForward).toHaveLength(1);
    expect(executionService.sync).toHaveBeenCalled();
    expect(executionService.sync).toHaveBeenCalledWith(
      '2026-09-03',
      expect.arrayContaining([
        expect.objectContaining({
          key: '2026-09-03:post:instagram_story:18:30',
          platform: MediaPlatform.INSTAGRAM,
          sourceKey: 'instagram_story',
        }),
        expect.objectContaining({
          key: '2026-09-03:post:youtube_community:20:00',
          platform: MediaPlatform.YOUTUBE,
          sourceKey: 'youtube_community',
        }),
      ]),
    );
  });

  it('keeps Today available when supporting Media engines are temporarily unavailable', async () => {
    const planningModel = {
      findOne: jest.fn(() => sortedLean(null)),
    };
    const unavailable = jest
      .fn()
      .mockRejectedValue(new Error('temporary failure'));
    const executionService = {
      sync: jest.fn().mockRejectedValue(new Error('execution failure')),
      carryForward: jest.fn().mockRejectedValue(new Error('carry failure')),
      summary: jest.fn().mockReturnValue({
        total: 0,
        actionable: 0,
        done: 0,
        completionPercent: 0,
        counts: {},
      }),
    };
    const service = new MediaTodayService(
      planningModel as never,
      { overview: unavailable } as never,
      { overview: unavailable } as never,
      { overview: unavailable } as never,
      { overview: unavailable } as never,
      executionService as never,
    );

    const result = await service.overview('2026-09-06');

    expect(result.health.degraded).toBe(true);
    expect(result.health.issues.length).toBeGreaterThanOrEqual(4);
    expect(result.posts).toEqual([]);
    expect(result.publishing).toEqual([]);
    expect(result.inboundReplies).toEqual([]);
    expect(result.analyticsDue).toEqual([]);
    expect(result.execution.tasks).toEqual([]);
    expect(result.execution.carryForward).toEqual([]);
    expect(result.theme).toContain('No current seven-day Presence Plan');
  });
});
