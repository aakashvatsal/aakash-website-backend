import { MediaLaunchService } from './media-launch.service';
import { MediaLaunchPhase } from './schemas/media-launch-state.schema';
import { MediaPlatform } from './schemas/media-post.schema';

function profilePlans() {
  return [
    MediaPlatform.LINKEDIN,
    MediaPlatform.INSTAGRAM,
    MediaPlatform.YOUTUBE,
    MediaPlatform.X,
    MediaPlatform.WHATSAPP,
  ].map((platform) => ({
    platform,
    objective: `${platform} objective`,
    headline: `${platform} headline`,
    bio: `${platform} bio`,
    linkStrategy: 'Use the primary personal site or most relevant destination.',
    profileImageGuidance: 'Use one recognisable current portrait.',
    bannerGuidance: 'Keep the visual identity simple and builder-led.',
    pinnedOrFeatured: ['One representative piece of work'],
    setupChecklist: ['Check name', 'Check link'],
  }));
}

describe('MediaLaunchService', () => {
  function makeService(existing: Record<string, unknown> | null = null) {
    const savedState = {
      key: 'primary',
      status: 'active',
      startedAt: new Date(),
      profilePlans: profilePlans().map((item) => ({ ...item, applied: false })),
      experimentPolicy: {
        experimentSharePercent: 35,
        minimumSamplesBeforeConclusion: 5,
        minimumDistinctFormatsPerWeek: 3,
        minimumDistinctNarrativesPerWeek: 3,
        preserveVoiceOverOptimization: true,
        avoidEarlyWinnerLockIn: true,
      },
      strategyFingerprint: 'strategy-fp',
      voiceFingerprint: 'voice-fp',
      aiModel: 'test-model',
      generatedAt: new Date(),
      isActive: true,
    };
    const lean = jest.fn().mockResolvedValue(existing);
    const launchModel = {
      findOne: jest.fn().mockImplementation(() => ({
        lean,
        then: (resolve: (value: unknown) => unknown) => resolve(existing),
      })),
      findOneAndUpdate: jest.fn().mockResolvedValue(savedState),
    };
    const aiService = {
      generateStructuredResponse: jest.fn().mockResolvedValue({
        data: {
          profilePlans: profilePlans(),
          experimentPolicy: savedState.experimentPolicy,
        },
        model: 'test-model',
        responseId: 'launch-response',
      }),
    };
    const presenceService = {
      overview: jest.fn().mockResolvedValue({ strategy: {}, voice: {} }),
      bootstrap: jest.fn().mockResolvedValue({
        strategy: { sourceFingerprint: 'strategy-fp' },
        voice: { sourceFingerprint: 'voice-fp' },
      }),
    };
    const operationsService = {
      overview: jest.fn().mockResolvedValue({
        platforms: profilePlans().map((item) => ({
          platform: item.platform,
          status: 'ready',
          accountName: `${item.platform} account`,
          username: 'aakash',
          issues: [],
        })),
      }),
    };
    const service = new MediaLaunchService(
      launchModel as never,
      aiService as never,
      presenceService as never,
      operationsService as never,
    );
    return { service, aiService, launchModel };
  }

  it('bootstraps all five platform profiles without inventing a creator-only identity', async () => {
    const { service, aiService, launchModel } = makeService();
    const result = await service.bootstrap({
      force: true,
      startDate: '2026-09-03',
    });
    expect(result.profilePlans).toHaveLength(5);
    expect(launchModel.findOneAndUpdate).toHaveBeenCalled();
    expect(aiService.generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'hsakaa_media_day1_launch_v36' }),
    );
  });

  it('defaults planning to deliberate exploration before launch is explicitly bootstrapped', async () => {
    const { service } = makeService(null);
    const context = await service.planningContext();
    expect(context.phase).toBe(MediaLaunchPhase.DAYS_1_30_EXPLORATION);
    expect(context.dayNumber).toBe(1);
    expect(context.experimentPolicy.experimentSharePercent).toBe(35);
    expect(
      context.experimentPolicy.minimumSamplesBeforeConclusion,
    ).toBeGreaterThanOrEqual(5);
  });
});
