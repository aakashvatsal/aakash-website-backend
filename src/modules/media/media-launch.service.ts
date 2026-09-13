import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaOperationsService } from './media-operations.service';
import { MediaPresenceService } from './media-presence.service';
import {
  MediaLaunchPhase,
  MediaLaunchState,
  MediaLaunchStateDocument,
  MediaLaunchStatus,
} from './schemas/media-launch-state.schema';
import { MediaPlatform } from './schemas/media-post.schema';

const PRIMARY_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
] as const;
const TZ = 'Asia/Kolkata';

type GeneratedLaunch = Pick<
  MediaLaunchState,
  'profilePlans' | 'experimentPolicy'
>;

@Injectable()
export class MediaLaunchService {
  constructor(
    @InjectModel(MediaLaunchState.name)
    private readonly launchModel: Model<MediaLaunchStateDocument>,
    private readonly aiService: AiService,
    private readonly presenceService: MediaPresenceService,
    private readonly operationsService: MediaOperationsService,
  ) {}

  async overview() {
    const [state, presence, operations] = await Promise.all([
      this.launchModel.findOne({ key: 'primary', isActive: true }).lean(),
      this.presenceService.overview(),
      this.operationsService.overview(),
    ]);
    const timing = this.resolveTiming(state?.startedAt);
    const profilePlans = state?.profilePlans ?? [];
    const profilesApplied = profilePlans.filter((item) => item.applied).length;
    const platformBlockers = operations.platforms
      .filter((item) => item.status === 'blocked')
      .map((item) => `${item.platform}: ${item.issues.join(' ')}`);

    return {
      generatedAt: new Date().toISOString(),
      state,
      ...timing,
      readiness: {
        presenceStrategyReady: Boolean(presence.strategy),
        voiceProfileReady: Boolean(presence.voice),
        profilePlanReady: profilePlans.length === PRIMARY_PLATFORMS.length,
        profilesApplied,
        totalProfiles: PRIMARY_PLATFORMS.length,
        publishingReadyPlatforms: operations.platforms.filter(
          (item) => item.status !== 'blocked',
        ).length,
        blockedPlatforms: operations.platforms.filter(
          (item) => item.status === 'blocked',
        ).length,
        canPlan: Boolean(presence.strategy && presence.voice),
        canPublishEverywhere: platformBlockers.length === 0,
      },
      blockers: platformBlockers,
      policy: {
        firstThirtyDaysAreExploration: true,
        earlyPerformanceDoesNotRewriteIdentity: true,
        minimumEvidenceBeforeConclusion:
          state?.experimentPolicy.minimumSamplesBeforeConclusion ?? 5,
        preserveAakashVoiceOverOptimization: true,
        profileSetupCanBeAppliedManually: true,
        planningCanStartBeforeEveryConnectorIsReady: true,
        publishingStillRequiresExistingApprovalFlow: true,
      },
    };
  }

  async bootstrap(
    input: {
      force?: boolean;
      startDate?: string;
      notes?: string;
    } = {},
  ) {
    const presence = await this.presenceService.bootstrap({
      force: input.force,
      notes: input.notes,
    });
    if (!presence.strategy || !presence.voice) {
      throw new BadRequestException(
        'Media Presence Strategy and Aakash Voice Profile are required before launch calibration.',
      );
    }
    const existing = await this.launchModel.findOne({
      key: 'primary',
      isActive: true,
    });
    const strategyFingerprint = presence.strategy.sourceFingerprint;
    const voiceFingerprint = presence.voice.sourceFingerprint;
    if (
      existing &&
      !input.force &&
      existing.strategyFingerprint === strategyFingerprint &&
      existing.voiceFingerprint === voiceFingerprint
    ) {
      return existing;
    }

    try {
      const operations = await this.operationsService.overview();
      const response =
        await this.aiService.generateStructuredResponse<GeneratedLaunch>({
          name: 'hsakaa_media_day1_launch_v36',
          instructions: [
            "You are HSAKAA launching Aakash's real social presence from Day 1.",
            'Do not turn Aakash into a generic creator, startup guru, motivational page or engagement farmer. Preserve the supplied Presence Strategy and Voice Profile.',
            'Create one profile setup brief for each of LinkedIn, Instagram, YouTube, X and WhatsApp. The copy must be usable now but conservative: no invented achievements, metrics, titles or claims.',
            "Platform profiles should reinforce one umbrella identity while respecting each platform's job. Do not mechanically copy the same bio everywhere.",
            'For days 1-30 optimize for deliberate exploration, not premature exploitation. Require format and narrative diversity and enough samples before declaring a winner.',
            'The launch policy must reserve meaningful experiment capacity while keeping workload realistic. Aakash is a builder first, not a full-time creator.',
            'Profile setup guidance may be manual. Publishing and replies remain approval-controlled.',
          ].join('\n'),
          input: JSON.stringify({
            owner: 'Aakash',
            timezone: TZ,
            notes: input.notes?.trim() || null,
            presenceStrategy: presence.strategy,
            voiceProfile: presence.voice,
            platformOperations: operations.platforms.map((item) => ({
              platform: item.platform,
              status: item.status,
              accountName: item.accountName,
              username: item.username,
              issues: item.issues,
            })),
            requiredPlatforms: PRIMARY_PLATFORMS,
          }),
          verbosity: 'medium',
          reasoningEffort: 'medium',
          maxOutputTokens: 7000,
          schema: this.schema(),
        });
      this.assertGenerated(response.data);
      const startedAt = this.resolveStartDate(
        input.startDate,
        existing?.startedAt,
      );
      const preservedApplied = new Map(
        (existing?.profilePlans ?? []).map((item) => [
          item.platform,
          { applied: item.applied, appliedAt: item.appliedAt },
        ]),
      );
      const profilePlans = response.data.profilePlans.map((item) => ({
        ...item,
        applied: preservedApplied.get(item.platform)?.applied ?? false,
        appliedAt: preservedApplied.get(item.platform)?.appliedAt,
      }));
      return this.launchModel.findOneAndUpdate(
        { key: 'primary' },
        {
          $set: {
            key: 'primary',
            status: MediaLaunchStatus.ACTIVE,
            startedAt,
            notes: input.notes?.trim() || existing?.notes || '',
            profilePlans,
            experimentPolicy: response.data.experimentPolicy,
            aiModel: response.model,
            aiResponseId: response.responseId,
            strategyFingerprint,
            voiceFingerprint,
            generatedAt: new Date(),
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not bootstrap Media Day-1 launch calibration. ${error instanceof Error ? error.message : 'Unknown launch error.'}`,
      );
    }
  }

  async updateProfileApplied(platform: MediaPlatform, applied: boolean) {
    if (
      !PRIMARY_PLATFORMS.includes(
        platform as (typeof PRIMARY_PLATFORMS)[number],
      )
    ) {
      throw new BadRequestException(
        'Launch profile tracking is limited to the five primary growth platforms.',
      );
    }
    const state = await this.launchModel.findOne({
      key: 'primary',
      isActive: true,
    });
    if (!state) throw new BadRequestException('Bootstrap Media launch first.');
    const plan = state.profilePlans.find((item) => item.platform === platform);
    if (!plan)
      throw new BadRequestException(
        `No launch profile plan exists for ${platform}.`,
      );
    plan.applied = applied;
    plan.appliedAt = applied ? new Date() : undefined;
    await state.save();
    return state;
  }

  async planningContext() {
    const state = await this.launchModel
      .findOne({ key: 'primary', isActive: true })
      .lean();
    const timing = this.resolveTiming(state?.startedAt);
    const defaults = this.policyForPhase(timing.phase);
    return {
      ...timing,
      launchStarted: Boolean(state),
      experimentPolicy: state?.experimentPolicy ?? defaults,
      guidance: this.guidanceForPhase(timing.phase),
    };
  }

  private resolveStartDate(value?: string, existing?: Date) {
    if (existing && !value) return existing;
    if (value) return new Date(`${value.slice(0, 10)}T00:00:00+05:30`);
    return new Date();
  }

  private resolveTiming(startedAt?: Date) {
    if (!startedAt) {
      return {
        phase: MediaLaunchPhase.DAYS_1_30_EXPLORATION,
        dayNumber: 1,
        launchStartedAt: null,
      };
    }
    const start = new Date(startedAt).getTime();
    const dayNumber = Math.max(
      1,
      Math.floor((Date.now() - start) / 86_400_000) + 1,
    );
    const phase =
      dayNumber <= 30
        ? MediaLaunchPhase.DAYS_1_30_EXPLORATION
        : dayNumber <= 90
          ? MediaLaunchPhase.DAYS_31_90_PATTERN_DISCOVERY
          : MediaLaunchPhase.DAY_91_PLUS_COMPOUNDING;
    return {
      phase,
      dayNumber,
      launchStartedAt: new Date(startedAt).toISOString(),
    };
  }

  private policyForPhase(phase: MediaLaunchPhase) {
    if (phase === MediaLaunchPhase.DAYS_1_30_EXPLORATION) {
      return {
        experimentSharePercent: 35,
        minimumSamplesBeforeConclusion: 5,
        minimumDistinctFormatsPerWeek: 3,
        minimumDistinctNarrativesPerWeek: 3,
        preserveVoiceOverOptimization: true,
        avoidEarlyWinnerLockIn: true,
      };
    }
    if (phase === MediaLaunchPhase.DAYS_31_90_PATTERN_DISCOVERY) {
      return {
        experimentSharePercent: 25,
        minimumSamplesBeforeConclusion: 7,
        minimumDistinctFormatsPerWeek: 2,
        minimumDistinctNarrativesPerWeek: 3,
        preserveVoiceOverOptimization: true,
        avoidEarlyWinnerLockIn: true,
      };
    }
    return {
      experimentSharePercent: 15,
      minimumSamplesBeforeConclusion: 10,
      minimumDistinctFormatsPerWeek: 2,
      minimumDistinctNarrativesPerWeek: 2,
      preserveVoiceOverOptimization: true,
      avoidEarlyWinnerLockIn: false,
    };
  }

  private guidanceForPhase(phase: MediaLaunchPhase) {
    if (phase === MediaLaunchPhase.DAYS_1_30_EXPLORATION)
      return 'Explore deliberately across formats, narratives and platform-native styles. Do not overfit to one early winner.';
    if (phase === MediaLaunchPhase.DAYS_31_90_PATTERN_DISCOVERY)
      return 'Start leaning into repeated evidence while preserving a meaningful experiment budget and voice authenticity.';
    return "Compound proven mechanisms, keep a smaller experiment budget, and protect Aakash's identity from optimization drift.";
  }

  private assertGenerated(value: GeneratedLaunch) {
    const platforms = new Set(value.profilePlans.map((item) => item.platform));
    if (
      value.profilePlans.length !== PRIMARY_PLATFORMS.length ||
      PRIMARY_PLATFORMS.some((platform) => !platforms.has(platform))
    ) {
      throw new Error(
        'Launch profile plan must cover LinkedIn, Instagram, YouTube, X and WhatsApp exactly once.',
      );
    }
    if (value.experimentPolicy.minimumSamplesBeforeConclusion < 3) {
      throw new Error(
        'Day-1 calibration requires at least three comparable samples before drawing a conclusion.',
      );
    }
  }

  private schema(): Record<string, unknown> {
    const strings = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      properties: {
        profilePlans: {
          type: 'array',
          minItems: 5,
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: PRIMARY_PLATFORMS },
              objective: { type: 'string' },
              headline: { type: 'string' },
              bio: { type: 'string' },
              linkStrategy: { type: 'string' },
              profileImageGuidance: { type: 'string' },
              bannerGuidance: { type: 'string' },
              pinnedOrFeatured: strings,
              setupChecklist: strings,
            },
            required: [
              'platform',
              'objective',
              'headline',
              'bio',
              'linkStrategy',
              'profileImageGuidance',
              'bannerGuidance',
              'pinnedOrFeatured',
              'setupChecklist',
            ],
            additionalProperties: false,
          },
        },
        experimentPolicy: {
          type: 'object',
          properties: {
            experimentSharePercent: {
              type: 'number',
              minimum: 10,
              maximum: 50,
            },
            minimumSamplesBeforeConclusion: {
              type: 'integer',
              minimum: 3,
              maximum: 20,
            },
            minimumDistinctFormatsPerWeek: {
              type: 'integer',
              minimum: 2,
              maximum: 5,
            },
            minimumDistinctNarrativesPerWeek: {
              type: 'integer',
              minimum: 2,
              maximum: 5,
            },
            preserveVoiceOverOptimization: { type: 'boolean' },
            avoidEarlyWinnerLockIn: { type: 'boolean' },
          },
          required: [
            'experimentSharePercent',
            'minimumSamplesBeforeConclusion',
            'minimumDistinctFormatsPerWeek',
            'minimumDistinctNarrativesPerWeek',
            'preserveVoiceOverOptimization',
            'avoidEarlyWinnerLockIn',
          ],
          additionalProperties: false,
        },
      },
      required: ['profilePlans', 'experimentPolicy'],
      additionalProperties: false,
    };
  }
}
