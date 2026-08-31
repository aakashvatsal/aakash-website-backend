import { Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaAutopilotService } from './media-autopilot.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaContentDirectorService } from './media-content-director.service';
import { MediaEngagementService } from './media-engagement.service';
import { MediaGrowthService } from './media-growth.service';
import {
  MediaAutopilotPriority,
  MediaAutopilotRecommendationKind,
  MediaAutopilotRunDocument,
  MediaAutopilotSettingsDocument,
} from './schemas/media-autopilot.schema';
import { MediaGrowthLearningDirection } from './schemas/media-growth-learning.schema';
import { MediaDeliveryStatus } from './schemas/media-publication.schema';
import { MediaPlatform } from './schemas/media-post.schema';

type RecommendationProbe = {
  buildRecommendations(input: unknown): Array<{
    kind: MediaAutopilotRecommendationKind;
    priority: MediaAutopilotPriority;
  }>;
};

function makeService() {
  const saveSettings = jest.fn().mockResolvedValue(undefined);
  const settings = {
    enabled: true,
    dailyEnabled: true,
    weeklyEnabled: true,
    autoDraftCalendarGaps: true,
    planningHorizonDays: 7,
    maxDailyDraftRuns: 3,
    candidateCount: 4,
    timezone: 'Asia/Kolkata',
    isActive: true,
    save: saveSettings,
  } as unknown as MediaAutopilotSettingsDocument;

  const findOneSettings = jest.fn().mockResolvedValue(settings);
  const findOneAndUpdateSettings = jest.fn().mockResolvedValue(settings);
  const settingsModel = {
    findOne: findOneSettings,
    findOneAndUpdate: findOneAndUpdateSettings,
  } as unknown as Model<MediaAutopilotSettingsDocument>;

  const emptyQuery = () => ({
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  });
  const emptyOneQuery = () => ({
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(null),
  });
  const runModel = {
    find: jest.fn().mockImplementation(emptyQuery),
    findOne: jest.fn().mockImplementation(emptyOneQuery),
  } as unknown as Model<MediaAutopilotRunDocument>;

  return {
    service: new MediaAutopilotService(
      runModel,
      settingsModel,
      {} as AiService,
      {} as MediaCalendarService,
      {} as MediaGrowthService,
      {} as MediaEngagementService,
      {} as MediaContentDirectorService,
    ),
    settings,
    settingsModel,
    findOneSettings,
    findOneAndUpdateSettings,
    saveSettings,
  };
}

describe('MediaAutopilotService', () => {
  it('initializes primary settings with an atomic upsert', async () => {
    const { service, findOneAndUpdateSettings, settings } = makeService();

    await expect(service.getSettings()).resolves.toBe(settings);

    expect(findOneAndUpdateSettings).toHaveBeenCalledWith(
      { key: 'primary' },
      {
        $setOnInsert: {
          enabled: true,
          dailyEnabled: true,
          weeklyEnabled: true,
          autoDraftCalendarGaps: true,
          planningHorizonDays: 7,
          maxDailyDraftRuns: 3,
          candidateCount: 4,
          timezone: 'Asia/Kolkata',
          isActive: true,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  });

  it('recovers when concurrent first-load initialization hits a duplicate key', async () => {
    const { service, findOneSettings, findOneAndUpdateSettings, settings } =
      makeService();
    findOneAndUpdateSettings.mockRejectedValueOnce({ code: 11000 });
    findOneSettings.mockResolvedValueOnce(settings);

    await expect(service.getSettings()).resolves.toBe(settings);
    expect(findOneSettings).toHaveBeenCalledWith({ key: 'primary' });
  });

  it('keeps the seven-day planning horizon as a hard minimum', async () => {
    const { service, settings, saveSettings } = makeService();

    await service.updateSettings({ planningHorizonDays: 3 });

    expect(settings.planningHorizonDays).toBe(7);
    expect(saveSettings).toHaveBeenCalled();
  });

  it('exposes a policy that never grants autonomous public actions', async () => {
    const { service } = makeService();

    const overview = await service.overview();

    expect(overview.policy.minimumPlanningHorizonDays).toBe(7);
    expect(overview.policy.autopilotMayGenerateDraftCandidates).toBe(true);
    expect(overview.policy.autopilotMayAcceptCanonicalContent).toBe(false);
    expect(overview.policy.autopilotMaySchedule).toBe(false);
    expect(overview.policy.autopilotMayPublish).toBe(false);
    expect(overview.policy.autopilotMaySendEngagementReplies).toBe(false);
  });

  it('turns calendar, delivery, engagement and growth signals into prioritized recommendations', () => {
    const { service } = makeService();
    const probe = service as unknown as RecommendationProbe;
    const recommendations = probe.buildRecommendations({
      calendar: {
        coverage: [
          {
            accountId: '66f000000000000000000001',
            platform: MediaPlatform.INSTAGRAM,
            displayName: 'Instagram',
            horizonDays: 7,
            requiredSlots: 4,
            assignedSlots: 2,
            openSlots: 2,
            productionGaps: 1,
            coveragePercent: 50,
            covered: false,
          },
        ],
        readyUnscheduled: [],
        publishingQueue: [
          {
            _id: { toString: () => 'publication-1' },
            platform: MediaPlatform.X,
            title: 'Failed post',
            deliveryStatus: MediaDeliveryStatus.FAILED,
            due: true,
            publishAttempts: 2,
            lastPublishError: 'Provider rejected the request.',
          },
        ],
      },
      growth: {
        analyticsProviders: {},
      },
      engagement: {
        recent: [
          {
            _id: { toString: () => 'engagement-1' },
            platform: MediaPlatform.LINKEDIN,
            priority: 'urgent',
            needsResponse: true,
            intent: 'lead',
            sentiment: 'positive',
            canReply: true,
            text: 'Can you help our academy?',
            aiSummary: 'Potential academy lead.',
          },
        ],
      },
      learnings: [
        {
          _id: { toString: () => 'learning-1' },
          platform: MediaPlatform.YOUTUBE,
          value: 'specific founder story',
          direction: MediaGrowthLearningDirection.POSITIVE,
          confidence: 82,
          liftPercent: 24,
          sampleSize: 6,
          summary: 'Specific stories outperform baseline.',
          recommendedAction: 'Use fresh specific stories.',
        },
      ],
      experiments: [{ status: 'running' }],
    });

    expect(recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: MediaAutopilotRecommendationKind.CALENDAR_GAP,
        }),
        expect.objectContaining({
          kind: MediaAutopilotRecommendationKind.PRODUCTION_GAP,
        }),
        expect.objectContaining({
          kind: MediaAutopilotRecommendationKind.PUBLISHING_FAILURE,
          priority: MediaAutopilotPriority.URGENT,
        }),
        expect.objectContaining({
          kind: MediaAutopilotRecommendationKind.ENGAGEMENT,
          priority: MediaAutopilotPriority.URGENT,
        }),
        expect.objectContaining({
          kind: MediaAutopilotRecommendationKind.GROWTH_OPPORTUNITY,
        }),
      ]),
    );
  });

  it('does not turn a running growth experiment into another experiment recommendation', () => {
    const { service } = makeService();
    const probe = service as unknown as RecommendationProbe;
    const recommendations = probe.buildRecommendations({
      calendar: { coverage: [], readyUnscheduled: [], publishingQueue: [] },
      growth: { analyticsProviders: {} },
      engagement: { recent: [] },
      learnings: [
        {
          _id: { toString: () => 'learning-1' },
          platform: MediaPlatform.LINKEDIN,
          value: 'morning',
          direction: MediaGrowthLearningDirection.POSITIVE,
          confidence: 65,
          liftPercent: 8,
          sampleSize: 4,
          summary: 'Morning may be stronger.',
        },
      ],
      experiments: [{ status: 'running' }],
    });

    expect(
      recommendations.some(
        (item) => item.kind === MediaAutopilotRecommendationKind.EXPERIMENT,
      ),
    ).toBe(false);
  });
});
