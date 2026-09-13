import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiGenerationUsage, AiService } from '../ai/ai.service';
import { GenerateMediaPlanningCycleDto } from './dto/media-planning.dto';
import { MediaCalendarService } from './media-calendar.service';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaLearningService } from './media-learning.service';
import { MediaLaunchService } from './media-launch.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaSocialPresenceService } from './media-social-presence.service';
import { MediaStrategyAdaptationService } from './media-strategy-adaptation.service';
import {
  MediaPlanningCycle,
  MediaPlanningCycleDocument,
  MediaPlanningDailyStory,
  MediaPlanningExecution,
  MediaPlanningYoutubeCommunityPost,
} from './schemas/media-planning-cycle.schema';
import {
  MEDIA_PUBLIC_IDENTITY_PILLARS,
  MediaPublicIdentityPillar,
} from './media-public-identity';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import {
  MediaDailyExecution,
  MediaDailyExecutionDocument,
  MediaExecutionKind,
  MediaExecutionStatus,
} from './schemas/media-daily-execution.schema';
import {
  MediaDeliveryStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

const GROWTH_PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
];
const TZ = 'Asia/Kolkata';
const ROLLING_PLANNING_EPOCH = '2026-09-07';
const ROLLING_WINDOW_DAYS = 7;
const GROWTH_TARGET_FOLLOWERS = 100_000;
const WHOLE_PERSON_STRATEGY_NARRATIVES = new Set([
  'learning_experiments',
  'building_aakash',
  'human_personality',
]);
const PERSONAL_STRATEGY_NARRATIVES = new Set([
  'learning_experiments',
  'building_aakash',
  'human_personality',
  'personal_intelligence',
]);
const HOBBY_MAX_WEEKLY_SURFACES_PER_SIGNAL = 2;
const VIDEO_FORMATS = new Set<MediaPostType>([
  MediaPostType.REEL,
  MediaPostType.VIDEO,
  MediaPostType.SHORT,
]);
const WHATSAPP_FORMATS = new Set<MediaPostType>([
  MediaPostType.WHATSAPP_MESSAGE,
  MediaPostType.WHATSAPP_STATUS,
  MediaPostType.WHATSAPP_TEMPLATE,
]);
const INTERNAL_MEDIA_STRATEGY_PATTERNS = [
  /early signals? (?:are|is) samples?/i,
  /first (?:few|couple of) posts?/i,
  /posting cadence/i,
  /algorithm strategy/i,
  /format experiments?/i,
  /first[- ]month experimentation/i,
  /impression[- ]testing/i,
  /test(?:ing)? impressions/i,
  /content strategy experiment/i,
];
const PLACEHOLDER_PATTERNS = [
  /\bwrite (?:a|the) post about\b/i,
  /\bcaption idea\b/i,
  /\badd (?:a )?caption\b/i,
  /\binsert (?:your|a) (?:story|example|cta|hook)\b/i,
  /\bfill (?:this|in)\b/i,
  /\bplaceholder\b/i,
  /\btbd\b/i,
  /\bto be written\b/i,
];

type PlanningCadence = {
  longFormVideos: number;
  shortFormAndCarouselsMin: number;
  shortFormAndCarouselsMax: number;
  instagramStories: number;
  youtubeCommunityMin: number;
  youtubeCommunityMax: number;
  platforms: Record<
    string,
    { min: number; preferred: number; max: number; label: string }
  >;
};

type PlanningGrowthObjective = {
  targetFollowers: number;
  currentKnownFollowers: number;
  remainingToTarget: number;
  knownPlatforms: string[];
  unknownPlatforms: string[];
  mode: 'fastest_sustainable';
  priorities: string[];
  guardrails: string[];
};

type GeneratedPlan = Omit<
  MediaPlanningCycle,
  | 'key'
  | 'strategyFingerprint'
  | 'contextFingerprint'
  | 'aiModel'
  | 'aiResponseId'
  | 'generatedAt'
  | 'isActive'
  | 'weekContext'
>;

type PlanningMemory = Awaited<
  ReturnType<MediaContentIntelligenceService['planningFingerprintContext']>
>[number];

type PlanningExecutionSkeleton = Pick<
  MediaPlanningExecution,
  | 'platform'
  | 'action'
  | 'time'
  | 'format'
  | 'opportunityKey'
  | 'storyArcKey'
  | 'reason'
>;

type PlanningBlueprint = Pick<
  GeneratedPlan,
  | 'startDate'
  | 'endDate'
  | 'timezone'
  | 'learningStage'
  | 'summary'
  | 'opportunities'
  | 'storyArcs'
> & {
  days: Array<{
    date: string;
    theme: string;
    workload: string;
    executions: PlanningExecutionSkeleton[];
    instagramStory: Pick<
      MediaPlanningDailyStory,
      | 'action'
      | 'time'
      | 'sourceType'
      | 'sourceEvidenceIds'
      | 'reason'
      | 'captureBrief'
    >;
    youtubeCommunity: Pick<
      MediaPlanningYoutubeCommunityPost,
      | 'action'
      | 'time'
      | 'format'
      | 'sourceType'
      | 'sourceEvidenceIds'
      | 'reason'
    >;
    engagement: GeneratedPlan['days'][number]['engagement'];
  }>;
};

type PlanningStrategyCore = Omit<PlanningBlueprint, 'days'>;

type PlanningCalendarBlueprint = {
  days: PlanningBlueprint['days'];
};

type PlanningWorldContext = Awaited<
  ReturnType<MediaPresenceService['directorContext']>
>['worldContext'];
type PlanningPresenceStrategy = NonNullable<
  Awaited<
    ReturnType<MediaPresenceService['directorContext']>
  >['presenceStrategy']
>;
type PlanningWholeLifeSignal = PlanningWorldContext['wholeLifeSignals'][number];

type PlanningBlueprintRepairContext = {
  startDate: string;
  endDate: string;
  cadence: PlanningCadence;
  worldContext: PlanningWorldContext;
  presenceStrategy: PlanningPresenceStrategy;
  validEvidence: Set<string>;
  mutableDates?: Set<string>;
};

type PlanningEvidenceCatalogEntry = {
  key: string;
  id: string;
  privacy: 'public_safe' | 'internal_safe' | 'identity_safe';
  title: string;
  summary: string;
  kind: string;
  source: string;
  significantChange: boolean;
  companyName?: string;
};

type GeneratedDayPosts = {
  date: string;
  posts: MediaPlanningExecution[];
};

type GeneratedDailyStory = {
  date: string;
  instagramStory: MediaPlanningDailyStory;
};

type GeneratedWeeklyStories = {
  stories: GeneratedDailyStory[];
};

type GeneratedYoutubeCommunityPost = {
  date: string;
  youtubeCommunity: MediaPlanningYoutubeCommunityPost;
};

type GeneratedWeeklyYoutubeCommunity = {
  posts: GeneratedYoutubeCommunityPost[];
};

export type MediaPlanningProgressUpdate = {
  stage: string;
  progress: number;
  completedDays: number;
  totalDays: number;
  usage: AiGenerationUsage & {
    calls: number;
    failedCalls: number;
    retriedCalls: number;
  };
  partialPlan?: Partial<GeneratedPlan> | null;
};

type MediaPlanningProgressCallback = (
  update: MediaPlanningProgressUpdate,
) => void | Promise<void>;

@Injectable()
export class MediaPlanningService {
  constructor(
    @InjectModel(MediaPlanningCycle.name)
    private readonly planModel: Model<MediaPlanningCycleDocument>,
    @InjectModel(MediaDailyExecution.name)
    private readonly dailyExecutionModel: Model<MediaDailyExecutionDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    private readonly aiService: AiService,
    private readonly presenceService: MediaPresenceService,
    private readonly growthService: MediaGrowthService,
    private readonly calendarService: MediaCalendarService,
    private readonly learningService: MediaLearningService,
    private readonly adaptationService: MediaStrategyAdaptationService,
    private readonly launchService: MediaLaunchService,
    private readonly contentIntelligenceService: MediaContentIntelligenceService,
    private readonly socialPresenceService: MediaSocialPresenceService,
  ) {}

  async overview() {
    const rollingStartDate = this.rollingStartDate();
    const rollingEndDate = this.addDays(
      rollingStartDate,
      ROLLING_WINDOW_DAYS - 1,
    );
    const currentWeekKey = this.weekKey(rollingStartDate);
    const [latest, presence, calendar, socialPresence] = await Promise.all([
      this.planModel
        .findOne({
          isActive: true,
          startDate: { $gte: ROLLING_PLANNING_EPOCH, $lte: rollingStartDate },
          endDate: { $gte: rollingStartDate },
        })
        .sort({ generatedAt: -1 })
        .lean(),
      this.presenceService.overview(),
      this.calendarService.overview(),
      this.socialPresenceService.overview(),
    ]);
    const strategy = presence.strategy ?? null;
    const cadence = this.planningCadence(strategy);
    const growthObjective = this.growthObjective(socialPresence);
    const latestMatchesStrategy = Boolean(
      latest &&
      strategy &&
      String(latest.key ?? '').split(':')[1] === String(strategy.version),
    );
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(rollingStartDate, index),
    );
    const expectedDateSet = new Set(expectedDates);
    const liveDays = latestMatchesStrategy
      ? (latest?.days ?? []).filter((day) => expectedDateSet.has(day.date))
      : [];
    const liveDateSet = new Set(liveDays.map((day) => day.date));
    const missingDates = expectedDates.filter((date) => !liveDateSet.has(date));
    const latestWeekContext = latestMatchesStrategy
      ? latest?.weekContext
      : null;
    const needsWeeklyContext = Boolean(
      !latestWeekContext ||
      latestWeekContext.weekKey !== currentWeekKey ||
      latestWeekContext.outingStatus === 'unknown',
    );
    const canAutoRoll = Boolean(
      latestMatchesStrategy &&
      rollingStartDate >= ROLLING_PLANNING_EPOCH &&
      liveDays.length === ROLLING_WINDOW_DAYS - 1 &&
      missingDates.length === 1 &&
      missingDates[0] === rollingEndDate,
    );
    const displayLatest =
      latestMatchesStrategy && latest
        ? {
            ...latest,
            startDate: rollingStartDate,
            endDate: rollingEndDate,
            days: liveDays,
          }
        : null;

    return {
      generatedAt: new Date().toISOString(),
      latest: displayLatest,
      stalePlanDetected: Boolean(latest && !latestMatchesStrategy),
      presenceReady: Boolean(presence.strategy && presence.voice),
      calendarCoverage: calendar.coverage,
      rolling: {
        epoch: ROLLING_PLANNING_EPOCH,
        startDate: rollingStartDate,
        endDate: rollingEndDate,
        expectedDates,
        missingDates,
        canAutoRoll,
        freshStartRequired: !displayLatest,
        needsWeeklyContext,
        weekKey: currentWeekKey,
        weekContext: latestWeekContext ?? {
          outingStatus: 'unknown',
          outingDetails: '',
          weekKey: currentWeekKey,
          capturedAt: null,
        },
      },
      policy: {
        version: 'v3.16.4',
        horizonDays: ROLLING_WINDOW_DAYS,
        timezone: TZ,
        postingEveryDayRequired: false,
        exactPostingTimesRequired: true,
        platformNativeCopyRequired: true,
        canonicalPublishCopyRequired: true,
        legacyCopyFieldsGeneratedByAi: false,
        completeCarouselPackRequired: true,
        completeVideoScriptRequired: true,
        evidenceIdsRequiredForPublicSafeOpportunities: true,
        internalSafeMaySupportAnonymizedFirstPersonReflection: true,
        unresolvedReadinessIssuesAllowed: false,
        engagementTasksIncluded: true,
        publicFigureGrowthObjective: true,
        growthObjective,
        strategyNarratives: (strategy?.narratives ?? []).map((item) => ({
          key: item.key,
          title: item.title,
          targetSharePercent: item.targetSharePercent,
        })),
        publicIdentity: {
          archetype: 'thoughtful_builder_building_companies_and_himself',
          traits: [
            'curious',
            'analytical',
            'ambitious',
            'calm',
            'human',
            'experimental',
            'slightly_unconventional',
          ],
          pillars: MEDIA_PUBLIC_IDENTITY_PILLARS,
          professionalPersonalBalance:
            'professional authority anchors the brand; whole-life context builds familiarity and follow-through',
        },
        sustainableWeeklyCadence: {
          longFormVideos: cadence.longFormVideos,
          shortFormAndCarousels: `${cadence.shortFormAndCarouselsMin}-${cadence.shortFormAndCarouselsMax}`,
          instagramStories: cadence.instagramStories,
          youtubeCommunityPosts: `${cadence.youtubeCommunityMin}-${cadence.youtubeCommunityMax}`,
          linkedinFeedPosts: this.cadenceLabel(cadence, MediaPlatform.LINKEDIN),
          instagramFeedPosts: this.cadenceLabel(
            cadence,
            MediaPlatform.INSTAGRAM,
          ),
          youtubeFeedPosts: this.cadenceLabel(cadence, MediaPlatform.YOUTUBE),
          xFeedPosts: this.cadenceLabel(cadence, MediaPlatform.X),
          whatsappPresence: this.cadenceLabel(cadence, MediaPlatform.WHATSAPP),
        },
        approvalRequiredBeforeCanonicalAcceptanceOrPublishing: true,
        planningUsesHistoricalAntiRepetitionMemory: true,
        planningUsesArchivedPlanAntiRepetitionMemory: true,
        planningUsesDirectHobbiesContext: true,
        planningInspectsAllPersonalOsSections: true,
        crossPlatformDerivativesCountAsOneTopicCluster: true,
        hobbySignalSurfaceCap: HOBBY_MAX_WEEKLY_SURFACES_PER_SIGNAL,
        rollingWindow: {
          epoch: ROLLING_PLANNING_EPOCH,
          todayPlusFutureDays: ROLLING_WINDOW_DAYS,
          singleDayRefreshSupported: true,
          archiveRetainsCompletionAndPublicationSignals: true,
          weeklyOutingContextRequired: true,
        },
      },
    };
  }

  private planningCadence(
    strategy:
      | {
          platformRoles?: Array<{
            platform: MediaPlatform;
            minPostsPerWeek: number;
            preferredPostsPerWeek: number;
            maxPostsPerWeek: number;
          }>;
        }
      | null
      | undefined,
  ): PlanningCadence {
    const defaults: Record<
      string,
      { min: number; preferred: number; max: number; label: string }
    > = {
      [MediaPlatform.LINKEDIN]: {
        min: 2,
        preferred: 3,
        max: 4,
        label: 'LinkedIn',
      },
      [MediaPlatform.INSTAGRAM]: {
        min: 2,
        preferred: 3,
        max: 4,
        label: 'Instagram',
      },
      [MediaPlatform.YOUTUBE]: {
        min: 1,
        preferred: 2,
        max: 2,
        label: 'YouTube',
      },
      [MediaPlatform.X]: { min: 2, preferred: 4, max: 7, label: 'X' },
      [MediaPlatform.WHATSAPP]: {
        min: 0,
        preferred: 1,
        max: 3,
        label: 'WhatsApp',
      },
    };
    for (const role of strategy?.platformRoles ?? []) {
      if (!GROWTH_PLATFORMS.includes(role.platform)) continue;
      defaults[role.platform] = {
        min: Math.max(0, Math.trunc(role.minPostsPerWeek ?? 0)),
        preferred: Math.max(0, Math.trunc(role.preferredPostsPerWeek ?? 0)),
        max: Math.max(0, Math.trunc(role.maxPostsPerWeek ?? 0)),
        label:
          role.platform === MediaPlatform.X
            ? 'X'
            : role.platform.charAt(0).toUpperCase() + role.platform.slice(1),
      };
    }
    const youtube = defaults[MediaPlatform.YOUTUBE];
    return {
      longFormVideos: Math.max(1, Math.min(2, youtube.max || 2)),
      shortFormAndCarouselsMin: 5,
      shortFormAndCarouselsMax: 6,
      instagramStories: 7,
      youtubeCommunityMin: 3,
      youtubeCommunityMax: 5,
      platforms: defaults,
    };
  }

  private cadenceLabel(cadence: PlanningCadence, platform: MediaPlatform) {
    const role = cadence.platforms[platform];
    if (!role) return '0';
    if (role.min === role.max) return `${role.preferred}`;
    if (role.min === 0) return `~${role.preferred} (max ${role.max})`;
    return `${role.min}-${role.max} (pref ${role.preferred})`;
  }

  private growthObjective(
    socialPresence: Awaited<ReturnType<MediaSocialPresenceService['overview']>>,
  ): PlanningGrowthObjective {
    let currentKnownFollowers = 0;
    const knownPlatforms: string[] = [];
    const unknownPlatforms: string[] = [];
    const seen = new Set<string>();
    for (const item of socialPresence.accounts ?? []) {
      const platform = String(item.account.platform);
      if (seen.has(platform) || platform === String(MediaPlatform.WHATSAPP)) {
        continue;
      }
      seen.add(platform);
      const count = item.profile?.followerCount;
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        currentKnownFollowers += count;
        knownPlatforms.push(platform);
      } else {
        unknownPlatforms.push(platform);
      }
    }
    return {
      targetFollowers: GROWTH_TARGET_FOLLOWERS,
      currentKnownFollowers,
      remainingToTarget: Math.max(
        0,
        GROWTH_TARGET_FOLLOWERS - currentKnownFollowers,
      ),
      knownPlatforms,
      unknownPlatforms,
      mode: 'fastest_sustainable',
      priorities: [
        'increase qualified discovery and non-follower reach',
        'convert profile visits and viewers into followers by making the ongoing Aakash journey clear',
        'build recurring series and recognizable formats that reward returning',
        'maximize shares, saves, completion/watch time and meaningful conversation where they predict follow-through',
        'use platform-native distribution rather than identical cross-posts',
      ],
      guardrails: [
        'no bought followers, engagement pods or artificial amplification',
        'no fake controversy, manufactured vulnerability or unrelated trend-chasing',
        'do not sacrifice Aakash voice, privacy or factual integrity for reach',
        'do not increase posting volume when quality or real context is missing',
      ],
    };
  }

  list(limit = 12) {
    const safe = Math.min(Math.max(Math.trunc(limit), 1), 52);
    return this.planModel
      .find({ isActive: true })
      .sort({ startDate: -1, generatedAt: -1 })
      .limit(safe)
      .lean();
  }

  async archive(limitDays = 90) {
    const safeDays = Math.min(Math.max(Math.trunc(limitDays || 90), 7), 365);
    const activeStart = this.currentDate();
    const plans = await this.planModel
      .find({
        isActive: true,
        startDate: { $gte: ROLLING_PLANNING_EPOCH },
      })
      .sort({ generatedAt: -1 })
      .limit(120)
      .lean();

    const dayByDate = new Map<
      string,
      {
        day: MediaPlanningCycle['days'][number];
        planId: string;
        generatedAt: Date;
      }
    >();
    for (const plan of plans) {
      for (const day of plan.days ?? []) {
        if (day.date < ROLLING_PLANNING_EPOCH || day.date >= activeStart)
          continue;
        if (dayByDate.has(day.date)) continue;
        dayByDate.set(day.date, {
          day,
          planId: String(plan._id ?? ''),
          generatedAt: plan.generatedAt,
        });
      }
    }

    const dates = [...dayByDate.keys()]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, safeDays);
    if (!dates.length) return [];
    const oldest = dates[dates.length - 1];
    const newest = dates[0];
    const [tasks, publications] = await Promise.all([
      this.dailyExecutionModel
        .find({
          isActive: true,
          date: { $gte: oldest, $lte: newest },
        })
        .sort({ date: -1, time: 1 })
        .lean(),
      this.publicationModel
        .find({
          isActive: true,
          deliveryStatus: MediaDeliveryStatus.PUBLISHED,
          $or: [
            { publishedAt: { $exists: true, $ne: null } },
            { manualPublishCompletedAt: { $exists: true, $ne: null } },
          ],
        })
        .sort({ publishedAt: -1, manualPublishCompletedAt: -1 })
        .limit(1000)
        .lean(),
    ]);

    const tasksByDate = new Map<string, typeof tasks>();
    for (const task of tasks) {
      const list = tasksByDate.get(task.date) ?? [];
      list.push(task);
      tasksByDate.set(task.date, list);
    }
    const publicationsByDate = new Map<string, typeof publications>();
    for (const publication of publications) {
      const publishedAt =
        publication.publishedAt ?? publication.manualPublishCompletedAt;
      if (!publishedAt) continue;
      const date = this.localDate(publishedAt);
      if (!dates.includes(date)) continue;
      const list = publicationsByDate.get(date) ?? [];
      list.push(publication);
      publicationsByDate.set(date, list);
    }

    return dates.map((date) => {
      const record = dayByDate.get(date)!;
      const dateTasks = tasksByDate.get(date) ?? [];
      const datePublications = publicationsByDate.get(date) ?? [];
      const actionable = dateTasks.filter(
        (task) => task.status !== MediaExecutionStatus.SKIPPED,
      );
      const done = actionable.filter(
        (task) => task.status === MediaExecutionStatus.DONE,
      );
      const plannedPlatforms = [
        ...new Set(
          (record.day.executions ?? [])
            .filter((item) => item.action === 'post')
            .map((item) => item.platform),
        ),
      ];
      const publishedPlatforms = [
        ...new Set(datePublications.map((item) => item.platform)),
      ];
      return {
        date,
        planId: record.planId,
        generatedAt: record.generatedAt,
        day: record.day,
        completion: {
          total: dateTasks.length,
          actionable: actionable.length,
          done: done.length,
          completionPercent: actionable.length
            ? Math.round((done.length / actionable.length) * 100)
            : 0,
          statuses: Object.values(MediaExecutionStatus).reduce<
            Record<string, number>
          >((acc, status) => {
            acc[status] = dateTasks.filter(
              (task) => task.status === status,
            ).length;
            return acc;
          }, {}),
        },
        publication: {
          plannedPlatforms,
          publishedPlatforms,
          publishedCount: datePublications.length,
          allPlannedPlatformsPublished:
            plannedPlatforms.length > 0 &&
            plannedPlatforms.every((platform) =>
              publishedPlatforms.includes(platform),
            ),
        },
      };
    });
  }

  async generate(
    dto: GenerateMediaPlanningCycleDto = {},
    onProgress?: MediaPlanningProgressCallback,
  ) {
    const presence = await this.presenceService.directorContext();
    if (!presence.presenceStrategy || !presence.voiceProfile) {
      throw new BadRequestException(
        'Build the Media Presence Strategy and Aakash Voice Profile before generating the 7-day plan.',
      );
    }

    const requestedStartDate = dto.startDate
      ? this.resolveStartDate(dto.startDate)
      : this.rollingStartDate();
    const startDate =
      requestedStartDate >= ROLLING_PLANNING_EPOCH
        ? requestedStartDate
        : ROLLING_PLANNING_EPOCH;
    const endDate = this.addDays(startDate, ROLLING_WINDOW_DAYS - 1);
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(startDate, index),
    );
    const ensureMode = dto.mode === 'ensure';
    const ensureBase = ensureMode
      ? await this.findRollingBasePlan(
          startDate,
          presence.presenceStrategy.version,
        )
      : null;
    const ensureExistingDates = new Set(
      (ensureBase?.days ?? [])
        .map((day) => day.date)
        .filter((date) => expectedDates.includes(date)),
    );
    const ensureMissingDates = ensureMode
      ? expectedDates.filter((date) => !ensureExistingDates.has(date))
      : expectedDates;
    if (ensureMode && ensureBase && ensureMissingDates.length === 0) {
      return ensureBase;
    }
    const generationTargetDates = ensureMode
      ? ensureMissingDates
      : expectedDates;
    const generationTargetSet = new Set(generationTargetDates);
    const generationTotalDays = generationTargetDates.length;
    if (ensureMode && ensureBase && generationTotalDays === 1) {
      const targetDate = generationTargetDates[0];
      return this.generateSingleDayIntoRollingPlan(
        ensureBase,
        targetDate,
        { ...dto, mode: 'ensure', targetDate },
        onProgress,
      );
    }
    const weekContext = this.resolveWeekContext(
      dto,
      startDate,
      ensureBase?.weekContext,
    );
    const cadence = this.planningCadence(presence.presenceStrategy);
    const usage = this.emptyPlanningUsage();
    const report = async (
      stage: string,
      progress: number,
      completedDays: number,
      partialPlan?: Partial<GeneratedPlan> | null,
    ) => {
      if (!onProgress) return;
      await onProgress({
        stage,
        progress,
        completedDays,
        totalDays: generationTotalDays,
        usage: { ...usage },
        partialPlan: partialPlan ?? null,
      });
    };

    const [weeklyAdaptation, launchContext, socialPresence] = await Promise.all(
      [
        this.adaptationService.planningContext(),
        this.launchService.planningContext(),
        this.socialPresenceService.overview(),
      ],
    );
    const growthObjective = this.growthObjective(socialPresence);
    const baseKey = `${startDate}:${presence.presenceStrategy.version}:${presence.voiceProfile.version}:${weeklyAdaptation?.key ?? 'no-weekly-review'}:${launchContext.phase}:v3.16.4`;
    const existing = await this.planModel.findOne({
      key: baseKey,
      isActive: true,
    });
    const key =
      ensureMode && ensureBase
        ? `${baseKey}:ensure:${Date.now()}`
        : dto.force
          ? `${baseKey}:${Date.now()}`
          : baseKey;
    if (!ensureMode && existing && !dto.force && !dto.notes?.trim())
      return existing;

    const [
      growthLearnings,
      calendar,
      learningIntelligence,
      historicalFingerprints,
    ] = await Promise.all([
      this.growthService.directorLearningContext(GROWTH_PLATFORMS),
      this.calendarService.overview(),
      this.learningService.directorContext(),
      this.contentIntelligenceService.planningFingerprintContext(160),
    ]);

    const archivedPlanningFingerprints =
      await this.plannedContentFingerprintContext();
    const antiRepetitionFingerprints = [
      ...historicalFingerprints,
      ...archivedPlanningFingerprints,
    ] as PlanningMemory[];

    try {
      await report('strategy', 5, 0, null);
      const publicEvidenceIds = this.planningPublicEvidence(
        presence.worldContext,
      ).map((item) => item.id);
      const reflectionEvidenceIds = (
        presence.worldContext.internalSafe ?? []
      ).map((item) => item.id);
      const identityEvidence = this.planningIdentityEvidence(
        presence.worldContext,
      );
      const identityEvidenceIds = identityEvidence.map((item) => item.id);
      const publicEvidenceSet = new Set(publicEvidenceIds);
      const reflectionEvidenceSet = new Set(reflectionEvidenceIds);
      const identityEvidenceSet = new Set(identityEvidenceIds);
      const validEvidence = new Set([
        ...publicEvidenceIds,
        ...reflectionEvidenceIds,
        ...identityEvidenceIds,
      ]);
      const evidenceCatalog = this.buildEvidenceCatalog(presence.worldContext);
      const compactVoiceProfile = this.compactVoiceProfile(
        presence.voiceProfile,
      );
      const blueprintInput = {
        owner: 'Aakash',
        startDate,
        endDate,
        timezone: TZ,
        notes: dto.notes?.trim() || null,
        generationMode: ensureMode ? 'ensure_missing_days' : 'full_week',
        requestedMissingDates: ensureMode ? generationTargetDates : [],
        currentRollingWindow:
          ensureMode && ensureBase
            ? this.compactRollingPlan(ensureBase, '')
            : null,
        learningStage: launchContext.phase,
        launchCalibration: launchContext,
        presenceStrategy: presence.presenceStrategy,
        voiceProfile: presence.voiceProfile,
        worldContext: this.aliasWorldContextEvidence(
          presence.worldContext,
          evidenceCatalog,
        ),
        growthLearnings,
        learningIntelligence,
        weeklyPresenceAdaptation: weeklyAdaptation,
        historicalMediaFingerprints: antiRepetitionFingerprints,
        archivedPlanFingerprints: archivedPlanningFingerprints,
        weeklyOutingContext: weekContext,
        wholeLifePresenceSignals: presence.worldContext.wholeLifeSignals ?? [],
        hobbies: presence.worldContext.hobbies ?? [],
        personalOsSections: presence.worldContext.personalOsSections ?? [],
        personalOsCoverage: presence.worldContext.coverage ?? null,
        growthObjective,
        planningCadence: cadence,
        currentCalendarCoverage: calendar.coverage,
        allowedPlatforms: GROWTH_PLATFORMS,
        allowedFormats: Object.values(MediaPostType),
      };
      let blueprintResponse = await this.generateBlueprint(
        blueprintInput,
        evidenceCatalog,
        usage,
        ensureMode && ensureBase
          ? `ENSURE-MISSING-DAYS MODE: dates ${generationTargetDates.join(', ')} are the only missing dates. Existing dates in currentRollingWindow are immutable and will not be regenerated or replaced. Build a coherent seven-day blueprint that complements those existing days, but only the requested missing dates will be materialized. Avoid repeating the topics, hooks, examples, structures or wording already present in currentRollingWindow.`
          : undefined,
        cadence,
      );
      blueprintResponse.data = this.repairBlueprintPortfolio(
        this.normalizeBlueprintTimes(blueprintResponse.data, validEvidence),
        {
          startDate,
          endDate,
          cadence,
          worldContext: presence.worldContext,
          presenceStrategy: presence.presenceStrategy,
          validEvidence,
        },
      );

      try {
        this.assertBlueprint(
          blueprintResponse.data,
          startDate,
          endDate,
          publicEvidenceIds,
          reflectionEvidenceIds,
          identityEvidenceIds,
          presence.presenceStrategy,
          cadence,
          presence.worldContext.wholeLifeSignals ?? [],
        );
      } catch (error) {
        if (!this.isBlueprintContentStarvationError(error)) throw error;
        blueprintResponse = await this.generateBlueprint(
          blueprintInput,
          evidenceCatalog,
          usage,
          `REPAIR REQUIRED: the previous blueprint starved or malformed the calendar (${this.errorMessage(error)}). Re-plan from the supplied public-safe facts plus internal-safe reflection material. Do not solve evidence uncertainty by skipping the whole week.${ensureMode && ensureBase ? ` Existing dates are immutable; only missing dates ${generationTargetDates.join(', ')} will be materialized, so make those dates complement currentRollingWindow.` : ''}`,
          cadence,
        );
        blueprintResponse.data = this.repairBlueprintPortfolio(
          this.normalizeBlueprintTimes(blueprintResponse.data, validEvidence),
          {
            startDate,
            endDate,
            cadence,
            worldContext: presence.worldContext,
            presenceStrategy: presence.presenceStrategy,
            validEvidence,
          },
        );
        this.assertBlueprint(
          blueprintResponse.data,
          startDate,
          endDate,
          publicEvidenceIds,
          reflectionEvidenceIds,
          identityEvidenceIds,
          presence.presenceStrategy,
          cadence,
          presence.worldContext.wholeLifeSignals ?? [],
        );
      }

      const partialBase: Partial<GeneratedPlan> = {
        startDate: blueprintResponse.data.startDate,
        endDate: blueprintResponse.data.endDate,
        timezone: blueprintResponse.data.timezone,
        learningStage: blueprintResponse.data.learningStage,
        summary: blueprintResponse.data.summary,
        opportunities: blueprintResponse.data.opportunities,
        storyArcs: blueprintResponse.data.storyArcs,
        days: [],
      };
      await report('blueprint_ready', 20, 0, partialBase);

      const materializationBlueprint = ensureMode
        ? {
            ...blueprintResponse.data,
            days: blueprintResponse.data.days.filter((day) =>
              generationTargetSet.has(day.date),
            ),
          }
        : blueprintResponse.data;

      const weeklyStories = await this.generateWeeklyStories(
        materializationBlueprint,
        presence.worldContext,
        compactVoiceProfile,
        usage,
      );
      const weeklyYoutubeCommunity = await this.generateWeeklyYoutubeCommunity(
        materializationBlueprint,
        presence.worldContext,
        compactVoiceProfile,
        usage,
      );

      const generatedDays: GeneratedPlan['days'] = [];
      const responseIds = [
        ...blueprintResponse.responseId.split(',').filter(Boolean),
        ...weeklyStories.responseIds,
        ...weeklyYoutubeCommunity.responseIds,
      ];
      const models = new Set(
        [
          ...blueprintResponse.model.split(',').filter(Boolean),
          ...weeklyStories.models,
          ...weeklyYoutubeCommunity.models,
        ].filter(Boolean),
      );
      const priorWeekCopies: Array<{
        platform: MediaPlatform;
        text: string;
      }> = ensureBase ? this.currentRollingFeedCopies(ensureBase, '') : [];
      const priorStoryCopies: string[] = ensureBase
        ? this.currentRollingStoryCopies(ensureBase, '')
        : [];
      const priorYoutubeCommunityCopies: string[] = ensureBase
        ? this.currentRollingCommunityCopies(ensureBase, '')
        : [];
      const opportunities = new Map(
        blueprintResponse.data.opportunities.map((item) => [item.key, item]),
      );

      for (
        let dayIndex = 0;
        dayIndex < materializationBlueprint.days.length;
        dayIndex += 1
      ) {
        const day = materializationBlueprint.days[dayIndex];
        const expectedPosts = day.executions.filter(
          (item) => item.action === 'post',
        );
        const relevantOpportunityKeys = new Set(
          expectedPosts
            .map((item) => item.opportunityKey)
            .filter((value): value is string => Boolean(value)),
        );
        const relevantOpportunities =
          blueprintResponse.data.opportunities.filter((item) =>
            relevantOpportunityKeys.has(item.key),
          );
        const relevantEvidenceIds = new Set(
          relevantOpportunities.flatMap((item) => item.evidenceIds),
        );
        const relevantEvidence = (
          presence.worldContext.publicSafe ?? []
        ).filter((item) => relevantEvidenceIds.has(item.id));
        const relevantReflectionEvidence = [
          ...(presence.worldContext.internalSafe ?? []),
          ...(presence.worldContext.wholeLifeSignals ?? []),
        ].filter((item) => relevantEvidenceIds.has(item.id));
        const relevantIdentityEvidence = identityEvidence.filter((item) =>
          relevantEvidenceIds.has(item.id),
        );
        const relevantCompanyNames = new Set(
          relevantOpportunities
            .map((item) => item.companyName?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value)),
        );

        const dayInput = {
          owner: 'Aakash',
          date: day.date,
          timezone: TZ,
          weekSummary: blueprintResponse.data.summary,
          dayPlan: {
            date: day.date,
            theme: day.theme,
            workload: day.workload,
            executions: expectedPosts,
          },
          expectedPosts,
          opportunities: relevantOpportunities,
          publicEvidence: relevantEvidence,
          reflectionEvidence: relevantReflectionEvidence,
          identityEvidence: relevantIdentityEvidence,
          companyStrategicContext: (presence.worldContext.companies ?? [])
            .filter((company) =>
              relevantCompanyNames.has(company.name.trim().toLowerCase()),
            )
            .map((company) => ({
              name: company.name,
              currentFocus: company.currentFocus,
              currentPriorities: company.currentPriorities ?? [],
              principles: company.principles ?? [],
            })),
          hsakaaContext: presence.worldContext.hsakaa ?? {},
          voiceProfile: compactVoiceProfile,
          alreadyGeneratedThisWeek: priorWeekCopies.slice(-12),
          archivedPlanFingerprints: archivedPlanningFingerprints,
          weeklyOutingContext: weekContext,
        };

        const posts = await this.generateReliableDayPosts({
          day,
          expectedPosts,
          dayInput,
          opportunities,
          publicEvidenceSet,
          reflectionEvidenceSet,
          identityEvidenceSet,
          historicalFingerprints: antiRepetitionFingerprints,
          priorWeekCopies,
          usage,
          responseIds,
          models,
        });

        const instagramStory = await this.resolveReliableDailyStory({
          day,
          candidate: weeklyStories.byDate.get(day.date),
          worldContext: presence.worldContext,
          voiceProfile: compactVoiceProfile,
          priorStoryCopies,
          usage,
          responseIds,
          models,
          validEvidence: new Set([
            ...publicEvidenceIds,
            ...reflectionEvidenceIds,
            ...identityEvidenceIds,
          ]),
        });
        const youtubeCommunity = await this.resolveReliableYoutubeCommunity({
          day,
          candidate: weeklyYoutubeCommunity.byDate.get(day.date),
          worldContext: presence.worldContext,
          voiceProfile: compactVoiceProfile,
          priorCopies: priorYoutubeCommunityCopies,
          usage,
          responseIds,
          models,
          validEvidence: new Set([
            ...publicEvidenceIds,
            ...reflectionEvidenceIds,
            ...identityEvidenceIds,
          ]),
        });

        const executions = this.mergeDayExecutions(day.executions, posts);
        const generatedDay = {
          date: day.date,
          theme: day.theme,
          workload: day.workload,
          executions,
          instagramStory,
          youtubeCommunity,
          engagement: day.engagement,
        };
        generatedDays.push(generatedDay);

        for (const item of executions) {
          if (item.action !== 'post') continue;
          priorWeekCopies.push({
            platform: item.platform,
            text: this.executionPublicText(item),
          });
        }
        if (instagramStory.action === 'post') {
          priorStoryCopies.push(this.storyCopy(instagramStory));
        }
        if (youtubeCommunity.action === 'post') {
          priorYoutubeCommunityCopies.push(youtubeCommunity.publishCopy);
        }

        await report(
          'generating_days',
          Math.min(
            92,
            25 +
              Math.round(
                ((dayIndex + 1) / Math.max(1, generationTotalDays)) * 67,
              ),
          ),
          generatedDays.length,
          { ...partialBase, days: generatedDays },
        );
      }

      const candidatePlan: GeneratedPlan = {
        startDate: blueprintResponse.data.startDate,
        endDate: blueprintResponse.data.endDate,
        timezone: blueprintResponse.data.timezone,
        learningStage: blueprintResponse.data.learningStage,
        summary: blueprintResponse.data.summary,
        opportunities: blueprintResponse.data.opportunities,
        storyArcs: blueprintResponse.data.storyArcs,
        days: generatedDays,
      };
      const plan = ensureBase
        ? this.mergeMissingGeneratedDays(
            ensureBase,
            candidatePlan,
            startDate,
            endDate,
            generationTargetSet,
          )
        : candidatePlan;

      if (!ensureBase) {
        this.assertPlan(
          plan,
          startDate,
          endDate,
          publicEvidenceIds,
          reflectionEvidenceIds,
          identityEvidenceIds,
          antiRepetitionFingerprints,
        );
      } else {
        this.assertRollingWindowDates(plan, startDate, endDate);
      }
      await report('saving_plan', 96, generationTotalDays, plan);
      const saved = await this.planModel.findOneAndUpdate(
        { key },
        {
          $set: {
            ...plan,
            key,
            startDate,
            endDate,
            timezone: TZ,
            strategyFingerprint: presence.presenceStrategy.sourceFingerprint,
            contextFingerprint: presence.worldContext.fingerprint,
            aiModel: [...models].join(','),
            aiResponseId: responseIds.join(','),
            generatedAt: new Date(),
            weekContext,
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      await report('completed', 100, generationTotalDays, plan);
      return saved;
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not generate the seven-day Media Presence plan. ${error instanceof Error ? error.message : 'Unknown planning error.'}`,
      );
    }
  }

  async refreshDay(
    date: string,
    dto: GenerateMediaPlanningCycleDto = {},
    onProgress?: MediaPlanningProgressCallback,
  ) {
    const targetDate = date.slice(0, 10);
    const startDate = this.rollingStartDate();
    const endDate = this.addDays(startDate, ROLLING_WINDOW_DAYS - 1);
    if (targetDate < startDate || targetDate > endDate) {
      throw new BadRequestException(
        `Refresh a day inside the active rolling window (${startDate} to ${endDate}).`,
      );
    }
    const presence = await this.presenceService.directorContext();
    if (!presence.presenceStrategy || !presence.voiceProfile) {
      throw new BadRequestException(
        'Build the Media Presence Strategy and Aakash Voice Profile before refreshing a planning day.',
      );
    }
    const base = await this.findRollingBasePlan(
      startDate,
      presence.presenceStrategy.version,
    );
    if (!base) {
      throw new BadRequestException(
        'Generate the fresh rolling seven-day plan first, then refresh individual days.',
      );
    }
    return this.generateSingleDayIntoRollingPlan(
      base,
      targetDate,
      { ...dto, mode: 'day', targetDate },
      onProgress,
    );
  }

  async rollForward(
    dto: GenerateMediaPlanningCycleDto = {},
    onProgress?: MediaPlanningProgressCallback,
  ) {
    const startDate = this.rollingStartDate();
    const endDate = this.addDays(startDate, ROLLING_WINDOW_DAYS - 1);
    const presence = await this.presenceService.directorContext();
    if (!presence.presenceStrategy || !presence.voiceProfile) {
      throw new BadRequestException(
        'Build the Media Presence Strategy and Aakash Voice Profile before rolling the plan forward.',
      );
    }
    const base = await this.findRollingBasePlan(
      startDate,
      presence.presenceStrategy.version,
    );
    if (!base) {
      throw new BadRequestException(
        'A fresh rolling plan is required. Create the seven-day rolling window first.',
      );
    }
    const inheritedContext = this.resolveWeekContext(
      dto,
      startDate,
      base.weekContext,
    );
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(startDate, index),
    );
    const available = new Set((base.days ?? []).map((day) => day.date));
    const missing = expectedDates.filter((date) => !available.has(date));
    if (!missing.length) return base;
    if (missing.length !== 1 || missing[0] !== endDate) {
      throw new BadRequestException(
        'The rolling plan has more than one missing day. Rebuild the full seven-day window instead of filling multiple gaps silently.',
      );
    }
    return this.generateSingleDayIntoRollingPlan(
      base,
      endDate,
      {
        ...dto,
        mode: 'roll',
        targetDate: endDate,
        outingStatus: inheritedContext.outingStatus,
        outingDetails: inheritedContext.outingDetails,
      },
      onProgress,
    );
  }

  private async generateSingleDayIntoRollingPlan(
    base: MediaPlanningCycle,
    targetDate: string,
    dto: GenerateMediaPlanningCycleDto,
    onProgress?: MediaPlanningProgressCallback,
  ) {
    const startDate = this.rollingStartDate();
    const endDate = this.addDays(startDate, ROLLING_WINDOW_DAYS - 1);
    const presence = await this.presenceService.directorContext();
    if (!presence.presenceStrategy || !presence.voiceProfile) {
      throw new BadRequestException('Media Presence is not ready.');
    }
    const cadence = this.planningCadence(presence.presenceStrategy);
    const usage = this.emptyPlanningUsage();
    const report = async (
      stage: string,
      progress: number,
      completedDays: number,
      partialPlan?: Partial<GeneratedPlan> | null,
    ) => {
      if (!onProgress) return;
      await onProgress({
        stage,
        progress,
        completedDays,
        totalDays: 1,
        usage: { ...usage },
        partialPlan: partialPlan ?? null,
      });
    };

    const [weeklyAdaptation, launchContext, socialPresence] = await Promise.all(
      [
        this.adaptationService.planningContext(),
        this.launchService.planningContext(),
        this.socialPresenceService.overview(),
      ],
    );
    const [
      growthLearnings,
      calendar,
      learningIntelligence,
      historicalFingerprints,
    ] = await Promise.all([
      this.growthService.directorLearningContext(GROWTH_PLATFORMS),
      this.calendarService.overview(),
      this.learningService.directorContext(),
      this.contentIntelligenceService.planningFingerprintContext(160),
    ]);
    const archivedPlanningFingerprints =
      await this.plannedContentFingerprintContext();
    const antiRepetitionFingerprints = [
      ...historicalFingerprints,
      ...archivedPlanningFingerprints,
    ] as PlanningMemory[];
    const weekContext = this.resolveWeekContext(
      dto,
      startDate,
      base.weekContext,
    );
    const growthObjective = this.growthObjective(socialPresence);
    const publicEvidenceIds = this.planningPublicEvidence(
      presence.worldContext,
    ).map((item) => item.id);
    const reflectionEvidenceIds = (
      presence.worldContext.internalSafe ?? []
    ).map((item) => item.id);
    const identityEvidence = this.planningIdentityEvidence(
      presence.worldContext,
    );
    const identityEvidenceIds = identityEvidence.map((item) => item.id);
    const publicEvidenceSet = new Set(publicEvidenceIds);
    const reflectionEvidenceSet = new Set(reflectionEvidenceIds);
    const identityEvidenceSet = new Set(identityEvidenceIds);
    const validEvidence = new Set([
      ...publicEvidenceIds,
      ...reflectionEvidenceIds,
      ...identityEvidenceIds,
    ]);
    const evidenceCatalog = this.buildEvidenceCatalog(presence.worldContext);
    const compactVoiceProfile = this.compactVoiceProfile(presence.voiceProfile);
    const currentRollingWindow = this.compactRollingPlan(base, targetDate);

    try {
      await report('single_day_strategy', 10, 0, null);
      const blueprintInput = {
        owner: 'Aakash',
        startDate: targetDate,
        endDate: targetDate,
        timezone: TZ,
        notes: dto.notes?.trim() || null,
        generationMode: dto.mode ?? 'day',
        learningStage: launchContext.phase,
        launchCalibration: launchContext,
        presenceStrategy: presence.presenceStrategy,
        voiceProfile: presence.voiceProfile,
        worldContext: this.aliasWorldContextEvidence(
          presence.worldContext,
          evidenceCatalog,
        ),
        growthLearnings,
        learningIntelligence,
        weeklyPresenceAdaptation: weeklyAdaptation,
        historicalMediaFingerprints: antiRepetitionFingerprints,
        archivedPlanFingerprints: archivedPlanningFingerprints,
        currentRollingWindow,
        weeklyOutingContext: weekContext,
        wholeLifePresenceSignals: presence.worldContext.wholeLifeSignals ?? [],
        hobbies: presence.worldContext.hobbies ?? [],
        personalOsSections: presence.worldContext.personalOsSections ?? [],
        personalOsCoverage: presence.worldContext.coverage ?? null,
        growthObjective,
        planningCadence: cadence,
        currentCalendarCoverage: calendar.coverage,
        allowedPlatforms: GROWTH_PLATFORMS,
        allowedFormats: Object.values(MediaPostType),
      };

      let blueprintResponse = await this.generateBlueprint(
        blueprintInput,
        evidenceCatalog,
        usage,
        undefined,
        cadence,
        1,
      );
      blueprintResponse.data = this.namespaceSingleDayBlueprint(
        this.normalizeBlueprintTimes(blueprintResponse.data, validEvidence),
        targetDate,
      );
      this.assertSingleDayBlueprintBasics(
        blueprintResponse.data,
        targetDate,
        validEvidence,
        presence.presenceStrategy,
      );

      let skeletonMerged = this.repairBlueprintPortfolio(
        this.mergeRollingBlueprint(
          base,
          blueprintResponse.data,
          startDate,
          endDate,
          targetDate,
        ),
        {
          startDate,
          endDate,
          cadence,
          worldContext: presence.worldContext,
          presenceStrategy: presence.presenceStrategy,
          validEvidence,
          mutableDates: new Set([targetDate]),
        },
      );
      blueprintResponse.data = this.applyRepairedSingleDayBlueprint(
        blueprintResponse.data,
        skeletonMerged,
        targetDate,
      );
      try {
        this.assertBlueprint(
          skeletonMerged,
          startDate,
          endDate,
          publicEvidenceIds,
          reflectionEvidenceIds,
          identityEvidenceIds,
          presence.presenceStrategy,
          cadence,
          presence.worldContext.wholeLifeSignals ?? [],
        );
      } catch (error) {
        blueprintResponse = await this.generateBlueprint(
          blueprintInput,
          evidenceCatalog,
          usage,
          `SINGLE-DAY REPAIR REQUIRED: the candidate would make the rolling week invalid (${this.errorMessage(error)}). Replace only the requested day with a different topic/format mix that complements the six preserved days.`,
          cadence,
          1,
        );
        blueprintResponse.data = this.namespaceSingleDayBlueprint(
          this.normalizeBlueprintTimes(blueprintResponse.data, validEvidence),
          targetDate,
        );
        this.assertSingleDayBlueprintBasics(
          blueprintResponse.data,
          targetDate,
          validEvidence,
          presence.presenceStrategy,
        );
        skeletonMerged = this.repairBlueprintPortfolio(
          this.mergeRollingBlueprint(
            base,
            blueprintResponse.data,
            startDate,
            endDate,
            targetDate,
          ),
          {
            startDate,
            endDate,
            cadence,
            worldContext: presence.worldContext,
            presenceStrategy: presence.presenceStrategy,
            validEvidence,
            mutableDates: new Set([targetDate]),
          },
        );
        blueprintResponse.data = this.applyRepairedSingleDayBlueprint(
          blueprintResponse.data,
          skeletonMerged,
          targetDate,
        );
        this.assertBlueprint(
          skeletonMerged,
          startDate,
          endDate,
          publicEvidenceIds,
          reflectionEvidenceIds,
          identityEvidenceIds,
          presence.presenceStrategy,
          cadence,
          presence.worldContext.wholeLifeSignals ?? [],
        );
      }

      await report('single_day_blueprint_ready', 35, 0, {
        startDate,
        endDate,
        timezone: TZ,
        learningStage: base.learningStage,
        summary: base.summary,
        opportunities: skeletonMerged.opportunities,
        storyArcs: skeletonMerged.storyArcs,
        days: [],
      });

      const day = blueprintResponse.data.days[0];
      const weeklyStories = await this.generateWeeklyStories(
        blueprintResponse.data,
        presence.worldContext,
        compactVoiceProfile,
        usage,
      );
      const weeklyYoutubeCommunity = await this.generateWeeklyYoutubeCommunity(
        blueprintResponse.data,
        presence.worldContext,
        compactVoiceProfile,
        usage,
      );
      const responseIds = [
        ...blueprintResponse.responseId.split(',').filter(Boolean),
        ...weeklyStories.responseIds,
        ...weeklyYoutubeCommunity.responseIds,
      ];
      const models = new Set(
        [
          ...blueprintResponse.model.split(',').filter(Boolean),
          ...weeklyStories.models,
          ...weeklyYoutubeCommunity.models,
        ].filter(Boolean),
      );
      const opportunities = new Map(
        blueprintResponse.data.opportunities.map((item) => [item.key, item]),
      );
      const expectedPosts = day.executions.filter(
        (item) => item.action === 'post',
      );
      const relevantOpportunityKeys = new Set(
        expectedPosts
          .map((item) => item.opportunityKey)
          .filter((value): value is string => Boolean(value)),
      );
      const relevantOpportunities = blueprintResponse.data.opportunities.filter(
        (item) => relevantOpportunityKeys.has(item.key),
      );
      const relevantEvidenceIds = new Set(
        relevantOpportunities.flatMap((item) => item.evidenceIds),
      );
      const priorWeekCopies = this.currentRollingFeedCopies(base, targetDate);
      const priorStoryCopies = this.currentRollingStoryCopies(base, targetDate);
      const priorYoutubeCommunityCopies = this.currentRollingCommunityCopies(
        base,
        targetDate,
      );
      const dayInput = {
        owner: 'Aakash',
        date: targetDate,
        timezone: TZ,
        weekSummary: base.summary,
        dayPlan: {
          date: targetDate,
          theme: day.theme,
          workload: day.workload,
          executions: expectedPosts,
        },
        expectedPosts,
        opportunities: relevantOpportunities,
        publicEvidence: (presence.worldContext.publicSafe ?? []).filter(
          (item) => relevantEvidenceIds.has(item.id),
        ),
        reflectionEvidence: [
          ...(presence.worldContext.internalSafe ?? []),
          ...(presence.worldContext.wholeLifeSignals ?? []),
        ].filter((item) => relevantEvidenceIds.has(item.id)),
        identityEvidence: identityEvidence.filter((item) =>
          relevantEvidenceIds.has(item.id),
        ),
        companyStrategicContext: (presence.worldContext.companies ?? [])
          .filter((company) =>
            relevantOpportunities.some(
              (opportunity) =>
                opportunity.companyName?.trim().toLowerCase() ===
                company.name.trim().toLowerCase(),
            ),
          )
          .map((company) => ({
            name: company.name,
            currentFocus: company.currentFocus,
            currentPriorities: company.currentPriorities ?? [],
            principles: company.principles ?? [],
          })),
        hsakaaContext: presence.worldContext.hsakaa ?? {},
        voiceProfile: compactVoiceProfile,
        alreadyGeneratedThisWeek: priorWeekCopies.slice(-20),
        archivedPlanFingerprints: archivedPlanningFingerprints,
        weeklyOutingContext: weekContext,
      };
      const posts = await this.generateReliableDayPosts({
        day,
        expectedPosts,
        dayInput,
        opportunities,
        publicEvidenceSet,
        reflectionEvidenceSet,
        identityEvidenceSet,
        historicalFingerprints: antiRepetitionFingerprints,
        priorWeekCopies,
        usage,
        responseIds,
        models,
      });
      const instagramStory = await this.resolveReliableDailyStory({
        day,
        candidate: weeklyStories.byDate.get(targetDate),
        worldContext: presence.worldContext,
        voiceProfile: compactVoiceProfile,
        priorStoryCopies,
        usage,
        responseIds,
        models,
        validEvidence,
      });
      const youtubeCommunity = await this.resolveReliableYoutubeCommunity({
        day,
        candidate: weeklyYoutubeCommunity.byDate.get(targetDate),
        worldContext: presence.worldContext,
        voiceProfile: compactVoiceProfile,
        priorCopies: priorYoutubeCommunityCopies,
        usage,
        responseIds,
        models,
        validEvidence,
      });
      const generatedDay: GeneratedPlan['days'][number] = {
        date: targetDate,
        theme: day.theme,
        workload: day.workload,
        executions: this.mergeDayExecutions(day.executions, posts),
        instagramStory,
        youtubeCommunity,
        engagement: day.engagement,
      };

      const mergedPlan = this.mergeRollingGeneratedPlan(
        base,
        skeletonMerged,
        generatedDay,
        startDate,
        endDate,
        targetDate,
      );
      this.assertPlan(
        mergedPlan,
        startDate,
        endDate,
        publicEvidenceIds,
        reflectionEvidenceIds,
        identityEvidenceIds,
        antiRepetitionFingerprints,
        { historicalNoveltyDates: new Set([targetDate]) },
      );

      await report('saving_single_day', 92, 1, mergedPlan);
      const key = `${startDate}:${presence.presenceStrategy.version}:${presence.voiceProfile.version}:${weeklyAdaptation?.key ?? 'no-weekly-review'}:${launchContext.phase}:v3.16.4:${dto.mode ?? 'day'}:${targetDate}:${Date.now()}`;
      const saved = await this.planModel.findOneAndUpdate(
        { key },
        {
          $set: {
            ...mergedPlan,
            key,
            startDate,
            endDate,
            timezone: TZ,
            strategyFingerprint: presence.presenceStrategy.sourceFingerprint,
            contextFingerprint: presence.worldContext.fingerprint,
            aiModel: [...models].join(','),
            aiResponseId: responseIds.join(','),
            generatedAt: new Date(),
            weekContext,
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      await this.dailyExecutionModel.updateMany(
        {
          date: targetDate,
          isActive: true,
          status: { $ne: MediaExecutionStatus.DONE },
          kind: {
            $in: [
              MediaExecutionKind.POST,
              MediaExecutionKind.PRODUCTION,
              MediaExecutionKind.ENGAGEMENT,
            ],
          },
        },
        { $set: { isActive: false } },
      );
      await report('completed', 100, 1, mergedPlan);
      return saved;
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not ${dto.mode === 'roll' ? 'roll the planning window forward' : `refresh ${targetDate}`}. ${this.errorMessage(error)}`,
      );
    }
  }

  private emptyPlanningUsage() {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
      calls: 0,
      failedCalls: 0,
      retriedCalls: 0,
    };
  }

  private addUsage(
    target: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
    next: AiGenerationUsage | undefined,
  ) {
    if (!next) return;
    target.inputTokens += next.inputTokens ?? 0;
    target.outputTokens += next.outputTokens ?? 0;
    target.totalTokens += next.totalTokens ?? 0;
    target.cachedInputTokens += next.cachedInputTokens ?? 0;
    target.reasoningTokens += next.reasoningTokens ?? 0;
  }

  private captureFailureUsage(
    target: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
    error: unknown,
  ) {
    if (!(error instanceof Error)) return;
    const output = error.message.match(/outputTokens=(\d+)/i);
    const reasoning = error.message.match(/reasoningTokens=(\d+)/i);
    const outputTokens = output ? Number(output[1]) : 0;
    const reasoningTokens = reasoning ? Number(reasoning[1]) : 0;
    target.outputTokens += outputTokens;
    target.reasoningTokens += reasoningTokens;
    target.totalTokens += outputTokens;
  }

  private async generateTrackedStructuredResponse<T>(
    request: {
      name: string;
      schema: Record<string, unknown>;
      instructions: string;
      input: string;
      verbosity?: 'low' | 'medium' | 'high';
      reasoningEffort?:
        'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
      maxOutputTokens?: number;
    },
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
    isRetry = false,
  ) {
    usage.calls += 1;
    if (isRetry) usage.retriedCalls += 1;
    try {
      const response =
        await this.aiService.generateStructuredResponse<T>(request);
      this.addUsage(usage, response.usage);
      return response;
    } catch (error) {
      usage.failedCalls += 1;
      this.captureFailureUsage(usage, error);
      throw error;
    }
  }

  private compactVoiceProfile(
    voiceProfile: Awaited<
      ReturnType<MediaPresenceService['directorContext']>
    >['voiceProfile'],
  ) {
    if (!voiceProfile) return null;
    return {
      summary: voiceProfile.summary,
      principles: (voiceProfile.principles ?? []).slice(0, 8),
      sentenceRhythm: voiceProfile.sentenceRhythm,
      vocabulary: voiceProfile.vocabulary,
      humour: voiceProfile.humour,
      profanity: voiceProfile.profanity,
      technicalDepth: voiceProfile.technicalDepth,
      emotionalOpenness: voiceProfile.emotionalOpenness,
      storytelling: voiceProfile.storytelling,
      doMore: (voiceProfile.doMore ?? []).slice(0, 8),
      doNot: (voiceProfile.doNot ?? []).slice(0, 8),
      avoidPhrases: (voiceProfile.avoidPhrases ?? []).slice(0, 12),
      authenticityChecks: (voiceProfile.authenticityChecks ?? []).slice(0, 8),
    };
  }

  private async generateWeeklyStories(
    blueprint: PlanningBlueprint,
    worldContext: PlanningWorldContext,
    voiceProfile: Record<string, unknown> | null,
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
  ) {
    const planned = blueprint.days.filter(
      (day) => day.instagramStory.action === 'post',
    );
    const byDate = new Map<string, MediaPlanningDailyStory>();
    const responseIds: string[] = [];
    const models = new Set<string>();
    if (!planned.length) return { byDate, responseIds, models: [...models] };

    const evidenceIds = new Set(
      planned.flatMap((day) => day.instagramStory.sourceEvidenceIds),
    );
    const input = {
      owner: 'Aakash',
      timezone: TZ,
      weekSummary: blueprint.summary,
      storyPlans: planned.map((day) => ({
        date: day.date,
        ...day.instagramStory,
      })),
      publicEvidence: (worldContext.publicSafe ?? []).filter((item) =>
        evidenceIds.has(item.id),
      ),
      reflectionEvidence: [
        ...(worldContext.internalSafe ?? []),
        ...(worldContext.wholeLifeSignals ?? []),
      ].filter((item) => evidenceIds.has(item.id)),
      identityEvidence: this.planningIdentityEvidence(worldContext).filter(
        (item) => evidenceIds.has(item.id),
      ),
      voiceProfile,
    };

    try {
      const response =
        await this.generateTrackedStructuredResponse<GeneratedWeeklyStories>(
          {
            name: 'hsakaa_media_presence_weekly_stories_v3125',
            instructions: [
              this.dailyStoryInstructions(),
              'Generate all supplied Story plans in one compact weekly pack. Return exactly one story object per supplied date and do not add dates.',
              'Keep each Story to 1-3 lightweight frames. Do not repeat the same visual concept or opening wording on adjacent days.',
            ].join('\n'),
            input: JSON.stringify(input),
            verbosity: 'medium',
            reasoningEffort: 'low',
            maxOutputTokens: 5600,
            schema: this.weeklyStoriesSchema(),
          },
          usage,
        );
      responseIds.push(response.responseId);
      models.add(response.model);
      for (const item of response.data.stories ?? []) {
        if (planned.some((day) => day.date === item.date)) {
          byDate.set(item.date, item.instagramStory);
        }
      }
    } catch {
      // The weekly pack is an optimisation. Missing days are repaired individually later.
    }

    return { byDate, responseIds, models: [...models] };
  }

  private async generateWeeklyYoutubeCommunity(
    blueprint: PlanningBlueprint,
    worldContext: PlanningWorldContext,
    voiceProfile: Record<string, unknown> | null,
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
  ) {
    const planned = blueprint.days.filter(
      (day) => day.youtubeCommunity?.action === 'post',
    );
    const byDate = new Map<string, MediaPlanningYoutubeCommunityPost>();
    const responseIds: string[] = [];
    const models = new Set<string>();
    if (!planned.length) return { byDate, responseIds, models: [...models] };

    const evidenceIds = new Set(
      planned.flatMap((day) => day.youtubeCommunity?.sourceEvidenceIds ?? []),
    );
    const input = {
      owner: 'Aakash',
      timezone: TZ,
      weekSummary: blueprint.summary,
      communityPlans: planned.map((day) => ({
        date: day.date,
        ...day.youtubeCommunity,
      })),
      publicEvidence: (worldContext.publicSafe ?? []).filter((item) =>
        evidenceIds.has(item.id),
      ),
      reflectionEvidence: [
        ...(worldContext.internalSafe ?? []),
        ...(worldContext.wholeLifeSignals ?? []),
      ].filter((item) => evidenceIds.has(item.id)),
      identityEvidence: this.planningIdentityEvidence(worldContext).filter(
        (item) => evidenceIds.has(item.id),
      ),
      voiceProfile,
    };

    try {
      const response =
        await this.generateTrackedStructuredResponse<GeneratedWeeklyYoutubeCommunity>(
          {
            name: 'hsakaa_media_presence_youtube_community_v3131',
            instructions: [
              this.youtubeCommunityInstructions(),
              'Generate all supplied YouTube Community plans in one compact weekly pack. Return exactly one post object per supplied date and do not add dates.',
              'Keep each post lightweight and native. Do not duplicate the same-day YouTube video/Short title, hook or caption; Community should extend the relationship, ask a useful question, share a small thought, or offer a visual/poll.',
            ].join('\n'),
            input: JSON.stringify(input),
            verbosity: 'low',
            reasoningEffort: 'low',
            maxOutputTokens: 3200,
            schema: this.weeklyYoutubeCommunitySchema(),
          },
          usage,
        );
      responseIds.push(response.responseId);
      models.add(response.model);
      for (const item of response.data.posts ?? []) {
        if (planned.some((day) => day.date === item.date)) {
          byDate.set(item.date, item.youtubeCommunity);
        }
      }
    } catch {
      // Weekly generation is an optimisation. Missing/invalid items are repaired individually.
    }

    return { byDate, responseIds, models: [...models] };
  }

  private async resolveReliableYoutubeCommunity(params: {
    day: PlanningBlueprint['days'][number];
    candidate: MediaPlanningYoutubeCommunityPost | undefined;
    worldContext: PlanningWorldContext;
    voiceProfile: Record<string, unknown> | null;
    priorCopies: string[];
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>;
    responseIds: string[];
    models: Set<string>;
    validEvidence: Set<string>;
  }) {
    const {
      day,
      worldContext,
      voiceProfile,
      priorCopies,
      usage,
      responseIds,
      models,
      validEvidence,
    } = params;
    const skeleton = day.youtubeCommunity;
    if (!skeleton || skeleton.action !== 'post') {
      return this.skipYoutubeCommunity(skeleton);
    }

    let normalized = params.candidate
      ? this.normalizeYoutubeCommunity(params.candidate, skeleton)
      : undefined;
    let failure = normalized
      ? this.youtubeCommunityPreflightError(
          normalized,
          day.date,
          validEvidence,
          priorCopies,
        )
      : 'Weekly YouTube Community pack did not return this date.';

    if (failure) {
      const evidenceIds = new Set(skeleton.sourceEvidenceIds);
      try {
        const response =
          await this.generateTrackedStructuredResponse<GeneratedYoutubeCommunityPost>(
            {
              name: 'hsakaa_media_presence_youtube_community_repair_v3131',
              instructions: [
                this.youtubeCommunityInstructions(),
                'Return only this date. Preserve the supplied source evidence, format and time. Repair the execution contract without adding a new topic.',
              ].join('\n'),
              input: JSON.stringify({
                owner: 'Aakash',
                date: day.date,
                communityPlan: skeleton,
                priorCommunityCopies: priorCopies.slice(-3),
                publicEvidence: (worldContext.publicSafe ?? []).filter((item) =>
                  evidenceIds.has(item.id),
                ),
                reflectionEvidence: [
                  ...(worldContext.internalSafe ?? []),
                  ...(worldContext.wholeLifeSignals ?? []),
                ].filter((item) => evidenceIds.has(item.id)),
                identityEvidence: this.planningIdentityEvidence(
                  worldContext,
                ).filter((item) => evidenceIds.has(item.id)),
                voiceProfile,
              }),
              verbosity: 'low',
              reasoningEffort: 'low',
              maxOutputTokens: 1400,
              schema: this.youtubeCommunitySchema(),
            },
            usage,
            true,
          );
        responseIds.push(response.responseId);
        models.add(response.model);
        normalized = this.normalizeYoutubeCommunity(
          response.data.youtubeCommunity,
          skeleton,
        );
        failure = this.youtubeCommunityPreflightError(
          normalized,
          day.date,
          validEvidence,
          priorCopies,
        );
      } catch {
        // Isolate this lightweight post rather than failing the paid weekly run.
      }
    }

    return normalized && !failure
      ? normalized
      : this.skipYoutubeCommunity({
          ...skeleton,
          reason: `YouTube Community isolated after execution repair: ${failure || 'unknown issue'}`,
        });
  }

  private normalizeYoutubeCommunity(
    candidate: MediaPlanningYoutubeCommunityPost,
    skeleton: NonNullable<
      PlanningBlueprint['days'][number]['youtubeCommunity']
    >,
  ): MediaPlanningYoutubeCommunityPost {
    const format = ['text', 'image', 'poll'].includes(candidate.format)
      ? candidate.format
      : skeleton.format;
    const imageBrief = candidate.imageBrief ?? this.emptyImageBrief();
    return {
      action: 'post',
      time: this.normalizeLocalTime(candidate.time || skeleton.time, '16:30'),
      format,
      sourceType: skeleton.sourceType,
      sourceEvidenceIds: skeleton.sourceEvidenceIds,
      reason: candidate.reason?.trim() || skeleton.reason,
      publishCopy: candidate.publishCopy?.trim() || '',
      imageBrief,
      pollQuestion: candidate.pollQuestion?.trim() || '',
      pollOptions: (candidate.pollOptions ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      executionReady: Boolean(candidate.executionReady),
      readinessIssues: candidate.readinessIssues ?? [],
    };
  }

  private youtubeCommunityPreflightError(
    post: MediaPlanningYoutubeCommunityPost,
    date: string,
    validEvidence: Set<string>,
    priorCopies: string[],
  ) {
    try {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(post.time)) {
        throw new Error(
          `Invalid YouTube Community time ${post.time} on ${date}.`,
        );
      }
      if (!post.sourceEvidenceIds.length) {
        throw new Error(
          `YouTube Community post on ${date} needs HSAKAA evidence.`,
        );
      }
      const missing = post.sourceEvidenceIds.filter(
        (id) => !validEvidence.has(id),
      );
      if (missing.length) {
        throw new Error(
          `YouTube Community post on ${date} references unavailable evidence IDs: ${missing.join(', ')}.`,
        );
      }
      if (!post.publishCopy || post.publishCopy.length < 20) {
        throw new Error(
          `YouTube Community post on ${date} has no publish-ready copy.`,
        );
      }
      this.assertNoPlaceholderCopy(
        post.publishCopy,
        MediaPlatform.YOUTUBE,
        date,
      );
      if (post.format === 'poll') {
        if (
          !post.pollQuestion.trim() ||
          post.pollOptions.length < 2 ||
          post.pollOptions.length > 4
        ) {
          throw new Error(
            `YouTube Community poll on ${date} needs a question and 2-4 options.`,
          );
        }
      }
      if (post.format === 'image') {
        if (post.imageBrief.mode === 'none') {
          throw new Error(
            `YouTube Community image post on ${date} needs a complete image brief.`,
          );
        }
        this.assertImageBrief(
          post.imageBrief,
          `YouTube Community image on ${date}`,
        );
      }
      if (!post.executionReady || post.readinessIssues.length) {
        throw new Error(
          `YouTube Community post on ${date} is not execution-ready.`,
        );
      }
      for (const previous of priorCopies.slice(-3)) {
        if (this.textSimilarity(post.publishCopy, previous) >= 0.88) {
          throw new Error(
            `YouTube Community post on ${date} is too similar to a recent Community post.`,
          );
        }
      }
      return '';
    } catch (error) {
      return this.errorMessage(error);
    }
  }

  private emptyImageBrief(): MediaPlanningYoutubeCommunityPost['imageBrief'] {
    return {
      mode: 'none',
      aspectRatio: '',
      overlayText: '',
      prompt: '',
      description: '',
      sourceGuidance: '',
    };
  }

  private assertImageBrief(
    imageBrief: MediaPlanningYoutubeCommunityPost['imageBrief'],
    label: string,
  ) {
    if (!imageBrief.aspectRatio.trim()) {
      throw new Error(`${label} is missing aspect ratio.`);
    }
    if (
      imageBrief.mode === 'ai_generation' &&
      imageBrief.prompt.trim().length < 60
    ) {
      throw new Error(`${label} has an incomplete AI image prompt.`);
    }
    if (
      imageBrief.mode !== 'ai_generation' &&
      imageBrief.description.trim().length < 40
    ) {
      throw new Error(
        `${label} needs a complete real-photo/design description.`,
      );
    }
  }

  private skipYoutubeCommunity(
    post?: PlanningBlueprint['days'][number]['youtubeCommunity'],
  ): MediaPlanningYoutubeCommunityPost {
    return {
      action: 'skip',
      time: '',
      format: post?.format ?? 'text',
      sourceType: post?.sourceType ?? 'human_moment',
      sourceEvidenceIds: post?.sourceEvidenceIds ?? [],
      reason: post?.reason || 'No YouTube Community moment planned.',
      publishCopy: '',
      imageBrief: this.emptyImageBrief(),
      pollQuestion: '',
      pollOptions: [],
      executionReady: false,
      readinessIssues: [],
    };
  }

  private async generateReliableDayPosts(params: {
    day: PlanningBlueprint['days'][number];
    expectedPosts: PlanningExecutionSkeleton[];
    dayInput: Record<string, unknown>;
    opportunities: Map<string, GeneratedPlan['opportunities'][number]>;
    publicEvidenceSet: Set<string>;
    reflectionEvidenceSet: Set<string>;
    identityEvidenceSet: Set<string>;
    historicalFingerprints: PlanningMemory[];
    priorWeekCopies: Array<{ platform: MediaPlatform; text: string }>;
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>;
    responseIds: string[];
    models: Set<string>;
  }) {
    const {
      day,
      expectedPosts,
      dayInput,
      opportunities,
      publicEvidenceSet,
      reflectionEvidenceSet,
      identityEvidenceSet,
      historicalFingerprints,
      priorWeekCopies,
      usage,
      responseIds,
      models,
    } = params;
    if (!expectedPosts.length) return [];

    const candidateByPlatform = new Map<
      MediaPlatform,
      MediaPlanningExecution
    >();
    try {
      const response =
        await this.generateTrackedStructuredResponse<GeneratedDayPosts>(
          {
            name: 'hsakaa_media_presence_day_pack_v3125',
            instructions: this.dayPackInstructions(),
            input: JSON.stringify(dayInput),
            verbosity: 'medium',
            reasoningEffort: 'low',
            maxOutputTokens: 9000,
            schema: this.dayPostsSchema(),
          },
          usage,
        );
      responseIds.push(response.responseId);
      models.add(response.model);
      if (response.data.date === day.date) {
        for (const post of response.data.posts ?? []) {
          if (!candidateByPlatform.has(post.platform)) {
            candidateByPlatform.set(post.platform, post);
          }
        }
      }
    } catch {
      // Fall through to bounded per-post generation. One bad daily pack must not kill the week.
    }

    const ready: MediaPlanningExecution[] = [];
    for (const skeleton of expectedPosts) {
      let candidate: MediaPlanningExecution | null | undefined =
        candidateByPlatform.get(skeleton.platform);
      if (!candidate) {
        candidate = await this.tryGenerateSinglePost(
          day,
          skeleton,
          dayInput,
          usage,
          responseIds,
          models,
          null,
        );
      }
      if (!candidate) continue;

      let normalized = this.normalizeExecutionPack(
        candidate,
        skeleton,
        opportunities.get(skeleton.opportunityKey ?? ''),
      );
      normalized = this.repairReflectionOnlyExecutions(
        [normalized],
        [...opportunities.values()],
        publicEvidenceSet,
        reflectionEvidenceSet,
        identityEvidenceSet,
      )[0];

      let failure = this.executionPreflightError(
        normalized,
        day.date,
        opportunities,
        publicEvidenceSet,
        reflectionEvidenceSet,
        identityEvidenceSet,
        historicalFingerprints,
        [
          ...priorWeekCopies,
          ...ready.map((item) => ({
            platform: item.platform,
            text: this.executionPublicText(item),
          })),
        ],
      );

      for (
        let repairAttempt = 0;
        failure && repairAttempt < 2;
        repairAttempt += 1
      ) {
        const repaired = await this.tryGenerateSinglePost(
          day,
          skeleton,
          dayInput,
          usage,
          responseIds,
          models,
          { candidate: normalized, failure },
        );
        if (!repaired) break;

        normalized = this.normalizeExecutionPack(
          repaired,
          skeleton,
          opportunities.get(skeleton.opportunityKey ?? ''),
        );
        normalized = this.repairReflectionOnlyExecutions(
          [normalized],
          [...opportunities.values()],
          publicEvidenceSet,
          reflectionEvidenceSet,
          identityEvidenceSet,
        )[0];
        failure = this.executionPreflightError(
          normalized,
          day.date,
          opportunities,
          publicEvidenceSet,
          reflectionEvidenceSet,
          identityEvidenceSet,
          historicalFingerprints,
          [
            ...priorWeekCopies,
            ...ready.map((item) => ({
              platform: item.platform,
              text: this.executionPublicText(item),
            })),
          ],
        );
      }

      if (!failure) ready.push(normalized);
    }

    return ready;
  }

  private async tryGenerateSinglePost(
    day: PlanningBlueprint['days'][number],
    skeleton: PlanningExecutionSkeleton,
    dayInput: Record<string, unknown>,
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
    responseIds: string[],
    models: Set<string>,
    repair: { candidate: MediaPlanningExecution; failure: string } | null,
  ) {
    try {
      const response =
        await this.generateTrackedStructuredResponse<GeneratedDayPosts>(
          {
            name: repair
              ? 'hsakaa_media_presence_single_post_repair_v3125'
              : 'hsakaa_media_presence_single_post_v3125',
            instructions: [
              this.dayPackInstructions(),
              repair
                ? `REPAIR ONLY THIS ONE POST. The prior candidate failed the deterministic contract for this reason: ${repair.failure}. Return a corrected final asset; do not change platform/date/format/opportunity/evidence thesis.`
                : 'BOUNDED FALLBACK: generate exactly this one expected post. Return one complete final asset and nothing else.',
              'Keep compatibility caption/script/description fields concise. Put the finished publishable content in the canonical execution fields.',
            ].join('\n'),
            input: JSON.stringify({
              owner: dayInput.owner,
              date: day.date,
              timezone: TZ,
              weekSummary: dayInput.weekSummary,
              dayPlan: {
                date: day.date,
                theme: day.theme,
                workload: day.workload,
                executions: [skeleton],
              },
              expectedPosts: [skeleton],
              opportunities: dayInput.opportunities,
              publicEvidence: dayInput.publicEvidence,
              reflectionEvidence: dayInput.reflectionEvidence,
              voiceProfile: dayInput.voiceProfile,
              alreadyGeneratedThisWeek: dayInput.alreadyGeneratedThisWeek,
              previousCandidate: repair?.candidate ?? null,
            }),
            verbosity: 'medium',
            reasoningEffort: 'low',
            maxOutputTokens: 8500,
            schema: this.dayPostsSchema(),
          },
          usage,
          true,
        );
      if (response.data.date !== day.date || response.data.posts.length !== 1) {
        return null;
      }
      responseIds.push(response.responseId);
      models.add(response.model);
      return response.data.posts[0];
    } catch {
      return null;
    }
  }

  private normalizeExecutionPack(
    candidate: MediaPlanningExecution,
    skeleton: PlanningExecutionSkeleton,
    opportunity: GeneratedPlan['opportunities'][number] | undefined,
  ): MediaPlanningExecution {
    const strings = (value: unknown) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
    const whatsappSequence = strings(candidate.whatsappSequence);
    const xThread = strings(candidate.xThread);
    const evidenceIds = strings(candidate.evidenceIds).filter((id) =>
      opportunity?.evidenceIds?.includes(id),
    );
    const canonicalEvidenceIds = evidenceIds.length
      ? evidenceIds
      : [...(opportunity?.evidenceIds ?? [])];

    const firstAvailable = (...values: Array<string | undefined | null>) =>
      values
        .find((value) => typeof value === 'string' && value.trim())
        ?.trim() ?? '';

    const sequenceText =
      skeleton.platform === MediaPlatform.WHATSAPP
        ? whatsappSequence.join('\n\n').trim()
        : skeleton.platform === MediaPlatform.X &&
            skeleton.format === MediaPostType.THREAD
          ? xThread.join('\n\n').trim()
          : '';
    const videoScript = candidate.videoPack?.fullScript?.trim() ?? '';
    const carouselCopy = Array.isArray(candidate.carouselSlides)
      ? candidate.carouselSlides
          .map((slide) =>
            `${slide.headline ?? ''}\n${slide.bodyCopy ?? ''}`.trim(),
          )
          .filter(Boolean)
          .join('\n\n')
      : '';

    const publishCopy = firstAvailable(
      candidate.publishCopy,
      sequenceText,
      candidate.copyPasteCaption,
      candidate.copyPasteText,
      candidate.caption,
      candidate.description,
      carouselCopy,
      videoScript,
      candidate.script,
    );
    // Keep old fields populated for downstream compatibility, but do not ask the
    // model to spend tokens generating two versions of the same post.
    const copyPasteText = publishCopy;
    const copyPasteCaption = publishCopy;

    const hook = firstAvailable(
      candidate.hook,
      candidate.title,
      publishCopy.split(/\n|[.!?]\s/)[0],
    );

    return {
      ...candidate,
      platform: skeleton.platform,
      action: 'post',
      time: this.normalizeLocalTime(
        skeleton.time || candidate.time,
        this.defaultPostingTime(skeleton.platform),
      ),
      format: skeleton.format,
      opportunityKey: skeleton.opportunityKey,
      storyArcKey: skeleton.storyArcKey ?? '',
      reason: skeleton.reason || candidate.reason,
      hook,
      caption: firstAvailable(candidate.caption, publishCopy),
      script: candidate.script ?? '',
      description: firstAvailable(candidate.description, publishCopy),
      cta: candidate.cta ?? '',
      hashtags: strings(candidate.hashtags),
      slides: strings(candidate.slides),
      publishCopy,
      copyPasteText,
      copyPasteCaption,
      evidenceIds: canonicalEvidenceIds,
      xThread,
      whatsappSequence:
        skeleton.platform === MediaPlatform.WHATSAPP &&
        !whatsappSequence.length &&
        publishCopy
          ? [publishCopy]
          : whatsappSequence,
      carouselSlides: Array.isArray(candidate.carouselSlides)
        ? candidate.carouselSlides
        : [],
      imageBrief: candidate.imageBrief ?? {
        mode: 'none',
        aspectRatio: '',
        overlayText: '',
        prompt: '',
        description: '',
        sourceGuidance: '',
      },
      videoPack: candidate.videoPack ?? {
        fullScript: '',
        targetDurationSeconds: 0,
        deliveryInstructions: '',
        cameraInstructions: '',
        punchIns: [],
        broll: [],
        onScreenText: [],
        musicDirection: '',
        coverDirection: '',
      },
      executionReady: true,
      readinessIssues: [],
      estimatedMinutes: Number.isFinite(candidate.estimatedMinutes)
        ? candidate.estimatedMinutes
        : 0,
      requiresApproval: true,
    };
  }

  private executionPreflightError(
    item: MediaPlanningExecution,
    date: string,
    opportunities: Map<string, GeneratedPlan['opportunities'][number]>,
    publicEvidence: Set<string>,
    reflectionEvidence: Set<string>,
    identityEvidence: Set<string>,
    historicalFingerprints: PlanningMemory[],
    weekCopies: Array<{ platform: MediaPlatform; text: string }>,
  ) {
    try {
      this.assertExecutionReady(item, date, opportunities);
      const combined = this.executionPublicText(item);
      const opportunity = opportunities.get(item.opportunityKey ?? '');
      this.assertReflectionSafeCopy(
        combined,
        item,
        opportunity,
        publicEvidence,
        reflectionEvidence,
        identityEvidence,
        date,
      );
      this.assertNoInternalStrategyLeak(combined, item.platform, date);
      this.assertNoPlaceholderCopy(combined, item.platform, date);
      this.assertHistoricalNovelty(combined, historicalFingerprints, item);
      for (const previous of weekCopies) {
        if (this.textSimilarity(combined, previous.text) >= 0.82) {
          throw new Error(
            `Same-week copy is too similar to ${previous.platform}; rewrite with a platform-native angle and opening.`,
          );
        }
      }
      return '';
    } catch (error) {
      return this.errorMessage(error);
    }
  }

  private async resolveReliableDailyStory(params: {
    day: PlanningBlueprint['days'][number];
    candidate: MediaPlanningDailyStory | undefined;
    worldContext: PlanningWorldContext;
    voiceProfile: Record<string, unknown> | null;
    priorStoryCopies: string[];
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>;
    responseIds: string[];
    models: Set<string>;
    validEvidence: Set<string>;
  }) {
    const {
      day,
      worldContext,
      voiceProfile,
      priorStoryCopies,
      usage,
      responseIds,
      models,
      validEvidence,
    } = params;
    if (day.instagramStory.action !== 'post') {
      return this.skipDailyStory(day.instagramStory);
    }

    let candidate = params.candidate;
    let normalized = candidate
      ? this.normalizeDailyStory(candidate, day.instagramStory)
      : null;
    let failure = normalized
      ? this.storyPreflightError(
          normalized,
          day.date,
          validEvidence,
          priorStoryCopies,
        )
      : 'Weekly Story pack did not return this date.';

    if (failure) {
      const evidenceIds = new Set(day.instagramStory.sourceEvidenceIds);
      try {
        const response =
          await this.generateTrackedStructuredResponse<GeneratedDailyStory>(
            {
              name: 'hsakaa_media_presence_story_repair_v3125',
              instructions: [
                this.dailyStoryInstructions(),
                `BOUNDED STORY REPAIR: ${failure}`,
                'Return only this date. Preserve the supplied evidence IDs/source type/time and make the Story execution-ready.',
              ].join('\n'),
              input: JSON.stringify({
                owner: 'Aakash',
                date: day.date,
                timezone: TZ,
                storyPlan: day.instagramStory,
                previousCandidate: normalized,
                publicEvidence: (worldContext.publicSafe ?? []).filter((item) =>
                  evidenceIds.has(item.id),
                ),
                reflectionEvidence: [
                  ...(worldContext.internalSafe ?? []),
                  ...(worldContext.wholeLifeSignals ?? []),
                ].filter((item) => evidenceIds.has(item.id)),
                identityEvidence: this.planningIdentityEvidence(
                  worldContext,
                ).filter((item) => evidenceIds.has(item.id)),
                voiceProfile,
                recentStoryCopies: priorStoryCopies.slice(-2),
              }),
              verbosity: 'low',
              reasoningEffort: 'low',
              maxOutputTokens: 2400,
              schema: this.dailyStorySchema(),
            },
            usage,
            true,
          );
        responseIds.push(response.responseId);
        models.add(response.model);
        if (response.data.date === day.date) {
          candidate = response.data.instagramStory;
          normalized = this.normalizeDailyStory(candidate, day.instagramStory);
          failure = this.storyPreflightError(
            normalized,
            day.date,
            validEvidence,
            priorStoryCopies,
          );
        }
      } catch {
        // Isolate this Story rather than failing the paid weekly run.
      }
    }

    return !failure && normalized
      ? normalized
      : this.skipDailyStory({
          ...day.instagramStory,
          action: 'skip',
          reason: `Story isolated after execution repair: ${failure || 'unknown issue'}`,
        });
  }

  private normalizeDailyStory(
    candidate: MediaPlanningDailyStory,
    skeleton: PlanningBlueprint['days'][number]['instagramStory'],
  ): MediaPlanningDailyStory {
    const frames = Array.isArray(candidate.frames)
      ? candidate.frames.map((frame, index) => ({
          ...frame,
          order: index + 1,
          overlayText: frame.overlayText?.trim() ?? '',
          spokenText: frame.spokenText?.trim() ?? '',
          visualDescription: frame.visualDescription?.trim() ?? '',
          captureInstruction: frame.captureInstruction?.trim() ?? '',
          interactiveElement: frame.interactiveElement?.trim() ?? '',
        }))
      : [];
    return {
      ...candidate,
      action: 'post',
      time: this.normalizeLocalTime(skeleton.time, '08:30'),
      sourceType: skeleton.sourceType,
      sourceEvidenceIds: [...skeleton.sourceEvidenceIds],
      reason: skeleton.reason || candidate.reason,
      captureBrief: candidate.captureBrief?.trim() || skeleton.captureBrief,
      frames,
      executionReady: true,
      readinessIssues: [],
    };
  }

  private storyCopy(story: MediaPlanningDailyStory) {
    return (story.frames ?? [])
      .map((frame) =>
        `${frame.overlayText ?? ''} ${frame.spokenText ?? ''}`.trim(),
      )
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private storyPreflightError(
    story: MediaPlanningDailyStory,
    date: string,
    validEvidence: Set<string>,
    priorStoryCopies: string[],
  ) {
    try {
      this.assertDailyStoryReady(story, date, validEvidence);
      const copy = this.storyCopy(story);
      this.assertNoInternalStrategyLeak(copy, MediaPlatform.INSTAGRAM, date);
      this.assertNoPlaceholderCopy(copy, MediaPlatform.INSTAGRAM, date);
      for (const previous of priorStoryCopies.slice(-2)) {
        if (copy && this.textSimilarity(copy, previous) >= 0.86) {
          throw new Error('Story copy is too similar to a recent Story.');
        }
      }
      return '';
    } catch (error) {
      return this.errorMessage(error);
    }
  }

  private async generateBlueprint(
    blueprintInput: Record<string, unknown>,
    evidenceCatalog: PlanningEvidenceCatalogEntry[],
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>,
    repairInstruction: string | undefined,
    cadence: PlanningCadence,
    dayCount = ROLLING_WINDOW_DAYS,
  ) {
    const baseInstructions = [
      this.blueprintInstructions(),
      repairInstruction ?? '',
      dayCount === 1
        ? 'SINGLE-DAY MODE: create one fresh day that complements the supplied current rolling window. Do not try to satisfy the entire weekly cadence in this one day. Avoid every archived/current topic cluster, thesis, hook, example and wording unless an explicit intentional continuation is supplied.'
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    let strategicCoreResponse =
      await this.generateBlueprintStage<PlanningStrategyCore>({
        name: repairInstruction
          ? 'hsakaa_media_presence_strategy_core_repair_v3122'
          : 'hsakaa_media_presence_strategy_core_v3122',
        instructions: [
          baseInstructions,
          'STAGE 1 OF 2 — STRATEGY CORE ONLY. Return startDate, endDate, timezone, learningStage, summary, opportunities and storyArcs. Do NOT return days.',
          dayCount === 1
            ? 'Keep this stage very compact: return 2-5 fresh opportunities and at most 1 story arc for this one day. The calendar is generated separately.'
            : 'Keep this stage compact: prefer 6-10 strong opportunities over 14 weak ones; use at most 2 story arcs; titles and reasons should be concise. The calendar is generated separately.',
          'EVIDENCE REFERENCES: worldContext.publicSafe[].id, worldContext.internalSafe[].id and worldContext.wholeLifeSignals[].id are short evidence keys such as E001. For every usable public_safe opportunity, evidenceIds MUST contain one or more of those exact E### keys. Never put an opportunity key (opp_...), title, source name or invented identifier in evidenceIds.',
        ].join('\n'),
        input: JSON.stringify(blueprintInput),
        maxOutputTokens: 5200,
        schema: this.blueprintStrategySchema(dayCount),
        usage,
      });

    let evidenceResolution = this.resolveStrategyCoreEvidence(
      strategicCoreResponse.data,
      evidenceCatalog,
    );

    if (evidenceResolution.unresolvedOpportunityKeys.length) {
      const evidenceRepairResponse =
        await this.generateBlueprintStage<PlanningStrategyCore>({
          name: 'hsakaa_media_presence_strategy_evidence_repair_v3122',
          instructions: [
            baseInstructions,
            'EVIDENCE REPAIR ONLY. Return a complete strategy core using the same dates and overall strategic intent.',
            'Some usable opportunities in the prior strategy core were not grounded to real evidence. Repair or replace those opportunities instead of leaving evidenceIds empty.',
            'Every usable public_safe opportunity MUST cite one or more exact E### keys visible in worldContext.publicSafe, worldContext.internalSafe or worldContext.wholeLifeSignals. Do not use opp_ keys as evidence. If an idea cannot be grounded, set privacy=needs_review and usable=false and replace it with a different grounded opportunity so the week still has enough usable material.',
            `Unresolved opportunity keys: ${evidenceResolution.unresolvedOpportunityKeys.join(', ')}`,
          ].join('\n'),
          input: JSON.stringify({
            ...blueprintInput,
            previousStrategyCore: evidenceResolution.data,
          }),
          maxOutputTokens: 5200,
          schema: this.blueprintStrategySchema(dayCount),
          usage,
        });
      strategicCoreResponse = evidenceRepairResponse;
      evidenceResolution = this.resolveStrategyCoreEvidence(
        evidenceRepairResponse.data,
        evidenceCatalog,
      );
    }

    const strategyCore = evidenceResolution.data;

    const calendarResponse =
      await this.generateBlueprintStage<PlanningCalendarBlueprint>({
        name: repairInstruction
          ? 'hsakaa_media_presence_calendar_repair_v3122'
          : 'hsakaa_media_presence_calendar_v3122',
        instructions: [
          baseInstructions,
          dayCount === 1
            ? 'STAGE 2 OF 2 — SINGLE-DAY CALENDAR ONLY. Return exactly one day for the requested date. Do NOT repeat opportunities or storyArcs in the response.'
            : 'STAGE 2 OF 2 — WEEKLY CALENDAR ONLY. Return exactly seven days. Do NOT repeat opportunities or storyArcs in the response.',
          'Use strategyCore as fixed source material. Keep theme/workload/reasons concise. Return exactly five POST/SKIP decisions per day, the Instagram Story skeleton, and only engagement tasks that are strategically useful.',
          'LIGHTWEIGHT EVIDENCE SELF-CHECK: every Instagram Story POST and every YouTube Community POST must carry 1-3 sourceEvidenceIds copied exactly from real supplied HSAKAA context/strategy evidence. Never return action=POST with an empty evidence array, aliases that are not supplied, or invented IDs. If a lightweight surface cannot be grounded, choose another grounded context signal rather than emitting an ungrounded POST.',
          dayCount === 1
            ? 'Before returning, audit the candidate day against currentRollingWindow and planningCadence. The merged seven-day window must remain inside every platform range and the weekly long-form/short-form/Story/Community contract. Also preserve the 100K growth portfolio across distinct topicClusterKeys: at least two discovery clusters, one conversion cluster and one authority cluster.'
            : 'CADENCE + GROWTH SELF-CHECK BEFORE RETURN: count the calendar you are returning. It must contain exactly planningCadence.longFormVideos YouTube VIDEO posts; planningCadence.shortFormAndCarouselsMin..Max REEL/SHORT/CAROUSEL feed pieces; exactly planningCadence.instagramStories Instagram Story POST skeletons; planningCadence.youtubeCommunityMin..Max Community POST skeletons; and each platform POST count must stay within planningCadence.platforms[platform].min..max. Then count DISTINCT topicClusterKeys actually used by POST feed executions: use at least four distinct clusters so the 100K portfolio can include at least two discovery clusters, one conversion cluster and one authority cluster. Cross-platform derivatives of one topicClusterKey still count as one cluster. Fix the calendar yourself before returning it. Do not rely on downstream validation.',
        ].join('\n'),
        input: JSON.stringify({
          startDate: blueprintInput.startDate,
          endDate: blueprintInput.endDate,
          timezone: blueprintInput.timezone,
          learningStage: blueprintInput.learningStage,
          notes: blueprintInput.notes,
          strategyCore,
          cadence,
          allowedPlatforms: blueprintInput.allowedPlatforms,
          allowedFormats: blueprintInput.allowedFormats,
        }),
        maxOutputTokens: 5600,
        schema: this.blueprintCalendarSchema(dayCount),
        usage,
      });

    const resolvedCalendar = this.resolveCalendarEvidenceAliases(
      calendarResponse.data,
      evidenceCatalog,
    );

    return {
      data: {
        ...strategyCore,
        days: resolvedCalendar.days,
      } satisfies PlanningBlueprint,
      model: [strategicCoreResponse.model, calendarResponse.model]
        .filter(Boolean)
        .join(','),
      responseId: [
        strategicCoreResponse.responseId,
        calendarResponse.responseId,
      ]
        .filter(Boolean)
        .join(','),
    };
  }

  private async generateBlueprintStage<T>(request: {
    name: string;
    instructions: string;
    input: string;
    maxOutputTokens: number;
    schema: Record<string, unknown>;
    usage: ReturnType<MediaPlanningService['emptyPlanningUsage']>;
  }) {
    try {
      const { usage, ...params } = request;
      return await this.generateTrackedStructuredResponse<T>(
        { ...params, verbosity: 'medium', reasoningEffort: 'medium' },
        usage,
      );
    } catch (error) {
      if (!this.isOutputTokenLimitError(error)) throw error;
      const { usage, ...params } = request;
      return this.generateTrackedStructuredResponse<T>(
        {
          ...params,
          name: `${request.name}_token_fallback`,
          instructions: [
            request.instructions,
            'TOKEN FALLBACK: the prior structured response hit its output ceiling. Be maximally concise while preserving every required schema field. Do not add explanations outside the schema.',
          ].join('\n'),
          verbosity: 'low',
          reasoningEffort: 'low',
          maxOutputTokens: 12000,
        },
        usage,
        true,
      );
    }
  }

  private blueprintInstructions() {
    return [
      'You are HSAKAA Media V3.14, the strategic public-figure growth system for Aakash. Build only the compact seven-day BLUEPRINT; final copy is generated later.',
      'PRIMARY OBJECTIVE: reach the supplied 100K-follower growthObjective as quickly as sustainably possible while making Aakash increasingly recognisable, trusted and worth following across topics. Optimise for discovery + follower conversion + retention/recognition + authority + affinity. Never buy reach with spam, fake controversy, trend-chasing disconnected from Aakash or generic viral bait.',
      'PUBLIC IDENTITY: Aakash is the thoughtful builder who is deliberately building companies and himself. He should feel curious, analytical, ambitious, calm, human, experimental and slightly unconventional—not like a product-management instructor, AI influencer, motivational creator or lifestyle influencer.',
      'For every opportunity set identityPillar for backward-compatible high-level identity AND strategyNarrativeKey copied exactly from presenceStrategy.narratives[].key. Also set a stable topicClusterKey: all derivatives of the same underlying idea/event must share one cluster key even across platforms. Set growthIntent to authority, discovery, conversion, affinity or conversation based on the primary growth job of the idea.',
      'Do not translate every personal signal into a professional framework. A chess moment may simply be about chess; a guitar/voice/fitness/reading moment may simply show the journey, struggle, taste or curiosity. Human_unfiltered content should usually contain no business analogy. Building_aakash should centre Aakash improving himself. Learning_experiments should centre the journey/progress/question before any generalized lesson.',
      'WHOLE-PERSONAL-OS CONTEXT: inspect every supplied Personal OS source across Tasks, Brain Dump, Journal, Library, Highlights, Decisions, Health, Hobbies, Media history, Companies and HSAKAA. PEOPLE and MEMORY are intentionally excluded from Media and must never be inferred, reconstructed or requested through another source. By owner policy, every other supplied Personal OS source is PUBLIC_SAFE Media context.',
      'ROUTINES + HEALTH: Health is PUBLIC_SAFE Media context by owner policy. Source-grounded workouts, sleep/recovery/fitness metrics, diet/supplement context, progress and routines may be used when supplied. Never invent a diagnosis, result, improvement or completed activity; distinguish a planned routine from a completed one.',
      'HOBBIES + SKILLS: worldContext.hobbies is the first-class source of truth for active HSAKAA Hobbies. Prefer actual active/maintenance tracks, current stage, real recorded practice pace and latest coaching focus. A keyword appearing elsewhere is not enough to make a hobby a weekly theme. Never invent practice. A normal hobby event gets one primary content surface plus at most one lightweight secondary surface; do not flood YouTube + X + WhatsApp + Stories with the same chess/guitar/voice moment.',
      'BOOKS + LEARNING: books/highlights can inspire thinking, but vary the expression: a question, disagreement, passage reaction, experiment, visual note or changed view. Do not make every reading signal a framework post and do not claim reading progress unless evidence supports it.',
      'Professional authority should come from lived builder/operator reasoning, real decisions, mistakes, trade-offs and company-building experience—not generic product-management education. Prefer “what I am seeing/trying/changing” over textbook frameworks.',
      'Use whole-HSAKAA context to understand who Aakash is. The context is creative/strategic memory and anti-repetition memory; it is NOT a requirement that every personal reflection was previously approved as a public claim.',
      'Aakash should be seen as a builder/operator/technologist with real depth across startups, AI, grassroots sports-tech, freight-tech, product thinking and operations, while also showing learning, books, health/routine, experiments and human personality. Do not make the brand only about companies or only about motivation.',
      'CADENCE: obey planningCadence from input, which is derived from the active Presence Strategy platformRoles. Never substitute old hard-coded channel cadences. Feed posting every day is NOT required and WhatsApp must stay deliberately low-volume when the strategy says so.',
      'LIGHTWEIGHT PRESENCE IS FIRST-CLASS: Instagram Stories should be planned 7/7 when usable context exists. YouTube Stories was retired by YouTube, so use YouTube Community posts as the native lightweight equivalent roughly 3-5 times per week. Community posts may be text, image or poll and should deepen familiarity/conversation rather than duplicate the same-day video.',
      'Instagram Stories are a separate daily lightweight presence layer. Plan one Story pack for every day when any usable context exists, usually 1-3 frames. Derive it from known routine/current work/learning/personal growth/professional context. Never fabricate that Aakash completed an activity: when based on a routine, make the captureBrief contingent (for example, “during the morning walk, capture…”).',
      'PORTFOLIO: use presenceStrategy.narratives as the real weekly narrative system. Aim broadly toward their targetSharePercent across DISTINCT topic clusters, not raw cross-platform post count. Use at least five distinct strategy narratives when enough grounded context exists. No single narrative or company should dominate simply because one source idea is easy to repurpose.',
      'OWNED BUILDER JOURNEY IS MANDATORY: when worldContext.companies contains one or more configured companies, the seven-day plan must use at least one DISTINCT topic cluster that names one of those companies and shows Aakash actually building/operating it. Configured company fields and supplied company evidence are PUBLIC_SAFE by owner policy, so current focus, priorities, products, markets, principles, target customer, status and stage may be used exactly when supplied. Never invent a customer name, metric, launch, capability, outcome or implementation detail that is not in supplied evidence.',
      'HSAKAA / PERSONAL INTELLIGENCE: treat HSAKAA as an owned public builder journey, not merely an internal planning system. Supplied HSAKAA brief/review context is PUBLIC_SAFE by owner policy. Actively look for a truthful builder checkpoint, design decision, failure, boundary, experiment or before/after learning. Use only the supplied detail and never invent implementation status or capability.',
      'REPURPOSING: cross-platform derivatives count as ONE topic cluster for diversity. A strong source can have native derivatives, but do not use repurposing to fake diversity or saturate the week. Personal/hobby clusters should normally appear on no more than two surfaces total. Professional anchor clusters may travel farther only when each treatment has a distinct job.',
      'Every day must still contain one explicit POST or SKIP decision for LinkedIn, Instagram feed, YouTube, X and WhatsApp so the calendar is unambiguous. SKIP is healthy when no feed asset is needed. A blank/invalid time on SKIP is acceptable; actual POST times must be exact local HH:MM Asia/Kolkata.',
      'For WhatsApp, follow the Presence Strategy cadence and keep it personal/high-trust. Default to Status when genuinely relevant; direct whatsapp_message needs a real warm-contact reason. Never prepend generic templates such as “One thing I have been learning in my own work” to unrelated hobbies, astronomy or human moments.',
      "HSAKAA is a content creation system, not an evidence-review checklist. Use the broad PUBLIC_SAFE Personal OS context aggressively enough that Aakash's real companies, health/routines, learning and current work remain visible. PEOPLE and MEMORY stay excluded. If a fact is absent from supplied evidence, remove only that unsupported fact rather than erasing the whole narrative.",
      'INTERNAL MEDIA STRATEGY IS NEVER PUBLIC CONTENT. Cadence tests, algorithm experiments, first-post strategy, impression testing and HSAKAA operating instructions guide planning but can never be selected as a public thesis.',
      'Create 8-14 ranked opportunities from real whole-HSAKAA context where possible. Every opportunity must include strategyNarrativeKey, topicClusterKey and growthIntent. Plan at least two authentic discovery-oriented opportunities and at least one conversion-oriented opportunity that gives a new viewer a reason to follow Aakash for the ongoing journey, without generic “follow for more” copy. Prefer a conversion opportunity with a concrete continuation: baseline -> experiment -> checkpoint -> result, an unresolved build decision, or a promised future comparison. Evidence IDs shown in worldContext are short backend-issued keys such as E001. For every usable public_safe opportunity, evidenceIds must contain one or more exact E### keys copied from worldContext.publicSafe[].id, worldContext.companyEvidence[].id, worldContext.hsakaaEvidence[].id, worldContext.wholeLifeSignals[].id or worldContext.identityEvidence[].id. worldContext.internalSafe exists only for backward compatibility and should normally be empty. Never put opp_ opportunity keys in evidenceIds and never invent evidence references.',
      'Evidence has two active modes plus one legacy compatibility mode. PUBLIC_SAFE may support factual public claims exactly as supplied and now covers every Media source except PEOPLE and MEMORY. IDENTITY_SAFE may support stable identity-level facts explicitly supplied in identityEvidence. INTERNAL_SAFE is legacy/backward-compatible only. Never infer PEOPLE or MEMORY details, and never invent metrics, capabilities, outcomes or facts absent from supplied evidence.',
      'An opportunity should normally be privacy=public_safe whenever its evidence comes from the supplied non-People/non-Memory Personal OS context. A named company opportunity may use PUBLIC_SAFE companyEvidence for supplied facts and IDENTITY_SAFE evidence for stable identity facts. Do not clear companyName merely because a particular company field is absent; remove only the unsupported field.',
      'needs_review opportunities must have usable=false and cannot be referenced by a POST. PEOPLE and MEMORY are never supplied as Media evidence.',
      'Historical fingerprints are hard anti-repetition memory. Avoid repeating topic+thesis+angle, hook archetype, opening pattern, stories/examples, structure, CTA pattern, visual concept, key phrases and lexical signature. Also avoid repeating the same routine Story concept on consecutive days.',
      'Use Buffer/direct-platform performance to calibrate format, hooks, timing, length and topic mix, but never turn analytics strategy into public content and never blindly repeat a previously successful post.',
      'Create 1-3 story arcs where continuity helps. Prefer repeatable SERIES that can compound recognition toward 100K rather than one-off random themes. The goal is recognisable continuity across weeks, not disconnected daily posts.',
      'For each feed execution return only planning decision fields in the schema. Final copy, captions, carousel slides and scripts are generated in a bounded second stage.',
      'For instagramStory return only the Story planning skeleton: action, time, sourceType, sourceEvidenceIds, reason and captureBrief. Final Story frames are generated separately.',
      'For youtubeCommunity return only the lightweight Community skeleton: action, time, format (text|image|poll), sourceType, sourceEvidenceIds and reason. Plan 3-5 POSTs/week when usable context exists; final Community copy/visual/poll execution is generated separately.',
      'LONG-FORM BALANCE: when real whole-person context exists, at least one of the two weekly long-form YouTube videos should come from learning_experiments, building_aakash or human_personality rather than making both long videos professional systems/technology essays.',
      'This plan never publishes autonomously. Aakash approval remains required before canonical acceptance or publishing.',
    ].join('\n');
  }

  private dayPackInstructions() {
    return [
      'You are HSAKAA Media V3.14. Turn ONLY the supplied feed POST decisions for one day into complete execution-ready content. Do not add posts, remove posts, change platforms, change dates, change formats, change posting times or change opportunity references.',
      'Write for the long-term public-figure objective: Aakash should become recognisable for a distinct point of view, useful operator depth and a human personality. Prefer specificity and lived thinking over generic advice, influencer language or motivational filler.',
      'Return exactly one full execution object for every expectedPosts item and no SKIP objects. The service will merge intentional skips deterministically.',
      'Every returned post must be completely publish-ready: executionReady=true, readinessIssues=[], one exact platform-native publishCopy, final hook, final CTA, and hashtags when useful. Never output duplicate post-text/caption variants, “write a post about”, “caption idea”, placeholders, TODOs or instructions for Aakash to finish the copy.',
      'supplied publicEvidence may support factual public claims exactly as supplied; by owner policy it covers every Media context source except PEOPLE and MEMORY. supplied reflectionEvidence is legacy INTERNAL_SAFE context and should normally be empty. supplied identityEvidence may support stable configured identity facts. evidenceIds must come from the referenced opportunity and must never be invented.',
      'NAMED COMPANY / HSAKAA EXECUTION: preserve the owned builder identity in final copy instead of abstracting it into generic product advice. PUBLIC_SAFE company/HSAKAA evidence may support the exact focus, priority, product, market, principle, target-customer, status, stage or checkpoint supplied. Never invent a feature, launch, customer name, metric, result, status or capability absent from evidence.',
      'CONVERSION CONTENT: when growthIntent=conversion, the final copy must create a specific reason to come back—what is being tested, what remains unresolved, the next checkpoint, or what Aakash will compare later. Do not use generic “follow for more” language.',
      'When legacy reflectionEvidence is used without publicEvidence, keep it first-person and abstract. PEOPLE and MEMORY must never be reconstructed. Do not quote book highlights verbatim; turn them into Aakash’s own reflection. PUBLIC_SAFE evidence may be stated as sourced fact, while any inference must be clearly framed as Aakash’s view.',
      'INTERNAL MEDIA STRATEGY IS NEVER PUBLIC CONTENT. Never publish cadence tests, algorithm experiments, first-post strategy, early-signal/sample language, impression testing or HSAKAA operating instructions.',
      'For IMAGE choose exactly one imageBrief mode: ai_generation, real_photo or designed_graphic. AI generation requires a complete detailed prompt. Real photo or designed graphic requires a full visual description. Always provide aspect ratio, overlay text and source guidance.',
      'For CAROUSEL provide the complete carouselSlides array. Every slide needs final headline, final bodyCopy, visualType, overlayText, and either a complete imagePrompt for ai_image or a complete visualDescription otherwise.',
      'For REEL, SHORT or VIDEO provide videoPack.fullScript word-for-word, targetDurationSeconds, deliveryInstructions, cameraInstructions, punchIns, broll, onScreenText, musicDirection and coverDirection. A YouTube long-form video must contain the full script, never an outline.',
      'For an X THREAD, write every post in xThread in exact order. For WhatsApp messages/status/templates, write every exact frame/message in whatsappSequence.',
      'Legacy caption/script/description/slides fields are compatibility fields: keep them concise and do not duplicate long content there. The canonical public-facing text belongs in publishCopy; specialized assets belong in carouselSlides, videoPack, xThread and whatsappSequence. For X threads and WhatsApp Status, publishCopy may be a compact intro while the exact sequence is authoritative.',
      'Use historicalMediaFingerprints and alreadyGeneratedThisWeek as hard anti-repetition memory. Same-week platform-native wording must be genuinely distinct.',
      'Preserve Aakash voice: thoughtful, specific, human, evidence-led, not a generic creator. This is execution, not ideation.',
    ].join('\n');
  }

  private dailyStoryInstructions() {
    return [
      'You are HSAKAA Media V3.14 generating ONLY Aakash’s Instagram Story pack for the supplied day.',
      'Stories are the daily lightweight human-presence layer, not miniature feed posts. Return 1-3 frames that feel natural, current and easy to capture.',
      'Use the supplied storyPlan and evidence only. publicEvidence may support factual claims exactly as supplied and covers all Media context except PEOPLE and MEMORY. reflectionEvidence is legacy only. identityEvidence supports stable identity facts. If sourceType=routine and evidence describes a plan rather than completion, write capture instructions conditionally so you never claim completion before it happens.',
      'For a company/HSAKAA Story, preserve the named builder journey. PUBLIC_SAFE evidence may support supplied priorities/products/markets/checkpoints/metrics; identity-only evidence must stay at identity level. Never invent capabilities, customers, metrics or outcomes.',
      'Each frame must include exact overlayText, optional spokenText, a concrete visualDescription/captureInstruction, and an interactiveElement only when genuinely useful (poll/question/slider or empty string).',
      'Stories are the human-presence layer, not mini LinkedIn posts. Prefer real routine/current-life moments: work desk/building, books/learning, walk/gym/training, recording, guitar/voice/chess/other hobbies, travel, food/drink/environment, small frustrations, wins, mistakes and reflective micro-thoughts. Use wholeLifeSignals when relevant. Health details may be used when source-grounded. Do not force a business lesson onto the moment. Never expose or infer PEOPLE/MEMORY content or internal Media strategy.',
      'Do not repeat yesterday’s Story concept or wording. Keep it low-production and authentic enough to sustain daily.',
      'executionReady must be true and readinessIssues must be empty for a POST Story pack.',
    ].join('\n');
  }

  private youtubeCommunityInstructions() {
    return [
      'You are HSAKAA Media V3.14 generating ONLY Aakash’s YouTube Community post for the supplied date.',
      'YouTube Stories no longer exists. Community posts are the lightweight relationship layer on YouTube, alongside Shorts and long-form video.',
      'Keep Community native and low-production: a concise text thought, one image-backed note, or a poll. Do not write a miniature YouTube description or simply repeat the same-day video/Short.',
      'Use the supplied source evidence only. publicEvidence may support factual claims exactly as supplied and covers all Media context except PEOPLE and MEMORY. reflectionEvidence is legacy only; identityEvidence supports stable configured identity facts.',
      'For company/HSAKAA Community content, keep the named builder journey. PUBLIC_SAFE evidence may support supplied priorities/products/markets/checkpoints/metrics; identity-only evidence stays at identity level. Never invent a capability, customer, metric, launch or outcome.',
      'For format=text: write one exact publishCopy and leave imageBrief mode=none and poll fields empty.',
      'For format=image: write exact publishCopy plus a complete imageBrief. Prefer a real/current photo when the supplied plan is personal or routine-led; otherwise use a restrained designed graphic. Never invent an event that did not happen.',
      'For format=poll: write a short publishCopy, exact pollQuestion and 2-4 concise pollOptions. Use polls to create genuine conversation, not generic engagement bait.',
      'Keep it useful but more conversational than feed essays. Human/unfiltered, routines, hobbies, books/learning and building-Aakash moments are welcome and do not need a business lesson. Use wholeLifeSignals to keep Aakash present as a real person between uploads.',
      'Never expose or infer PEOPLE/MEMORY content or raw evidence IDs. Use company/health detail only when it is present in supplied PUBLIC_SAFE evidence. Internal Media strategy remains non-public.',
      'executionReady must be true and readinessIssues must be empty for a POST.',
    ].join('\n');
  }

  private planningPublicCompanyEvidence(worldContext: PlanningWorldContext) {
    return (worldContext.companies ?? []).map((company) => ({
      id: `public:company:${company.id}`,
      title: `${company.name} · public company context`,
      summary: [
        `${company.name} is a configured company Aakash is building/operating.`,
        company.roles?.length
          ? `Aakash roles: ${company.roles.slice(0, 6).join(', ')}.`
          : '',
        company.industries?.length
          ? `Industries: ${company.industries.slice(0, 6).join(', ')}.`
          : '',
        company.products?.length
          ? `Products: ${company.products.slice(0, 8).join(', ')}.`
          : '',
        company.markets?.length
          ? `Markets: ${company.markets.slice(0, 8).join(', ')}.`
          : '',
        company.currentFocus ? `Current focus: ${company.currentFocus}.` : '',
        company.currentPriorities?.length
          ? `Current priorities: ${company.currentPriorities.slice(0, 8).join(', ')}.`
          : '',
        company.principles?.length
          ? `Principles: ${company.principles.slice(0, 8).join(', ')}.`
          : '',
        company.targetCustomer
          ? `Target customer: ${company.targetCustomer}.`
          : '',
        company.status ? `Status: ${company.status}.` : '',
        company.stage ? `Stage: ${company.stage}.` : '',
        'Owner Media policy classifies supplied company context as PUBLIC_SAFE. Use exactly what is supplied; never invent missing customers, metrics, capabilities, launches or outcomes.',
      ]
        .filter(Boolean)
        .join(' '),
      kind: 'company_context',
      source: 'company',
      significantChange: false,
      companyName: company.name,
    }));
  }

  private planningPublicHsakaaEvidence(worldContext: PlanningWorldContext) {
    const evidence: Array<{
      id: string;
      title: string;
      summary: string;
      kind: string;
      source: string;
      significantChange: boolean;
      companyName?: string;
    }> = [];
    if (worldContext.hsakaa?.latestBrief) {
      const brief = worldContext.hsakaa.latestBrief;
      evidence.push({
        id: 'public:hsakaa:latest-brief',
        title: brief.headline || 'HSAKAA latest brief',
        summary: [
          brief.summary,
          brief.opportunities?.length
            ? `Opportunities: ${brief.opportunities.slice(0, 8).join('; ')}.`
            : '',
          brief.generatedAt ? `Generated at: ${brief.generatedAt}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        kind: 'hsakaa_brief',
        source: 'hsakaa',
        significantChange: true,
      });
    }
    if (worldContext.hsakaa?.latestWeeklyReview) {
      const review = worldContext.hsakaa.latestWeeklyReview;
      evidence.push({
        id: 'public:hsakaa:weekly-review',
        title: review.headline || 'HSAKAA weekly review',
        summary: [
          review.summary,
          review.lessons?.length
            ? `Lessons: ${review.lessons.slice(0, 8).join('; ')}.`
            : '',
          review.nextWeekPriorities?.length
            ? `Next priorities: ${review.nextWeekPriorities.slice(0, 8).join('; ')}.`
            : '',
          review.generatedAt ? `Generated at: ${review.generatedAt}.` : '',
        ]
          .filter(Boolean)
          .join(' '),
        kind: 'hsakaa_weekly_review',
        source: 'hsakaa',
        significantChange: true,
      });
    }
    return evidence;
  }

  private planningPublicEvidence(worldContext: PlanningWorldContext) {
    return [
      ...(worldContext.publicSafe ?? []),
      ...(worldContext.wholeLifeSignals ?? []),
      ...this.planningPublicCompanyEvidence(worldContext),
      ...this.planningPublicHsakaaEvidence(worldContext),
    ];
  }

  private planningIdentityEvidence(worldContext: PlanningWorldContext) {
    const companyEvidence = (worldContext.companies ?? []).map((company) => ({
      id: `identity:company:${company.id}`,
      title: `${company.name} · builder identity`,
      summary: [
        `${company.name} is a configured company in Aakash's Personal OS.`,
        company.roles?.length
          ? `Aakash roles: ${company.roles.slice(0, 4).join(', ')}.`
          : '',
        company.industries?.length
          ? `Broad industries: ${company.industries.slice(0, 4).join(', ')}.`
          : '',
        company.markets?.length
          ? `Broad markets: ${company.markets.slice(0, 4).join(', ')}.`
          : '',
        'This identity evidence permits naming the company and these stable identity-level fields only. It does not verify current priorities, products/capabilities, customers, metrics, launches, outcomes or status.',
      ]
        .filter(Boolean)
        .join(' '),
      kind: 'company_identity',
      source: 'company_identity',
      significantChange: false,
      companyName: company.name,
    }));

    return [
      ...companyEvidence,
      {
        id: 'identity:hsakaa',
        title: 'HSAKAA · personal intelligence builder identity',
        summary:
          'Aakash is building HSAKAA as his personal intelligence / digital-twin system. This identity evidence permits naming HSAKAA and the fact that Aakash is building it. It does not verify any specific capability, integration, autonomy level, implementation status, performance result or outcome unless separate PUBLIC_SAFE evidence supports that claim.',
        kind: 'hsakaa_identity',
        source: 'hsakaa_identity',
        significantChange: false,
        companyName: '',
      },
    ];
  }

  private buildEvidenceCatalog(
    worldContext: PlanningWorldContext,
  ): PlanningEvidenceCatalogEntry[] {
    const entries: PlanningEvidenceCatalogEntry[] = [];
    const seenIds = new Set<string>();
    const append = (
      items: Array<{
        id: string;
        title?: string;
        summary?: string;
        kind?: string;
        source?: unknown;
        significantChange?: boolean;
        companyName?: string;
      }>,
      privacy: PlanningEvidenceCatalogEntry['privacy'],
    ) => {
      for (const item of items ?? []) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        entries.push({
          key: `E${String(entries.length + 1).padStart(3, '0')}`,
          id: item.id,
          privacy,
          title: item.title ?? '',
          summary: item.summary ?? '',
          kind: item.kind ?? '',
          source: typeof item.source === 'string' ? item.source : '',
          significantChange: Boolean(item.significantChange),
          companyName: item.companyName?.trim() || undefined,
        });
      }
    };
    append(this.planningPublicEvidence(worldContext), 'public_safe');
    append(worldContext.internalSafe ?? [], 'internal_safe');
    append(this.planningIdentityEvidence(worldContext), 'identity_safe');
    return entries;
  }

  private aliasWorldContextEvidence(
    worldContext: PlanningWorldContext,
    catalog: PlanningEvidenceCatalogEntry[],
  ) {
    const keyById = new Map(catalog.map((entry) => [entry.id, entry.key]));
    const alias = <T extends { id: string }>(items: T[]) =>
      (items ?? []).map((item) => ({
        ...item,
        id: keyById.get(item.id) ?? item.id,
      }));
    return {
      ...worldContext,
      publicSafe: alias(this.planningPublicEvidence(worldContext)),
      internalSafe: alias(worldContext.internalSafe ?? []),
      wholeLifeSignals: alias(worldContext.wholeLifeSignals ?? []),
      companyEvidence: alias(this.planningPublicCompanyEvidence(worldContext)),
      hsakaaEvidence: alias(this.planningPublicHsakaaEvidence(worldContext)),
      identityEvidence: alias(this.planningIdentityEvidence(worldContext)),
    };
  }

  private resolveCalendarEvidenceAliases(
    calendar: PlanningCalendarBlueprint,
    catalog: PlanningEvidenceCatalogEntry[],
  ): PlanningCalendarBlueprint {
    const byKey = new Map(catalog.map((entry) => [entry.key, entry.id]));
    const byId = new Set(catalog.map((entry) => entry.id));
    const resolve = (refs: string[]) => [
      ...new Set(
        (refs ?? [])
          .map((ref) => {
            const normalized = ref.trim();
            return (
              byKey.get(normalized) ??
              (byId.has(normalized) ? normalized : normalized)
            );
          })
          .filter(Boolean),
      ),
    ];

    return {
      days: calendar.days.map((day) => ({
        ...day,
        instagramStory: {
          ...day.instagramStory,
          sourceEvidenceIds: resolve(day.instagramStory.sourceEvidenceIds),
        },
        youtubeCommunity: {
          ...day.youtubeCommunity,
          sourceEvidenceIds: resolve(day.youtubeCommunity.sourceEvidenceIds),
        },
      })),
    };
  }

  private resolveStrategyCoreEvidence(
    strategyCore: PlanningStrategyCore,
    catalog: PlanningEvidenceCatalogEntry[],
  ) {
    const byKey = new Map(catalog.map((entry) => [entry.key, entry]));
    const byId = new Map(catalog.map((entry) => [entry.id, entry]));
    const unresolvedOpportunityKeys: string[] = [];

    const opportunities = strategyCore.opportunities.map((opportunity) => {
      const resolved = [
        ...new Set(
          (opportunity.evidenceIds ?? []).flatMap((ref) => {
            const normalized = ref.trim();
            if (!normalized) return [];
            const entry = byKey.get(normalized) ?? byId.get(normalized);
            return entry ? [entry.id] : [];
          }),
        ),
      ];

      let evidenceIds = resolved;
      if (
        opportunity.privacy === 'public_safe' &&
        opportunity.usable &&
        !evidenceIds.length
      ) {
        evidenceIds = this.inferOpportunityEvidence(opportunity, catalog);
      }
      const companyName = opportunity.companyName?.trim() ?? '';
      const requiredIdentityEvidence = catalog
        .filter(
          (entry) =>
            entry.privacy === 'identity_safe' &&
            ((companyName &&
              entry.companyName?.trim().toLowerCase() ===
                companyName.toLowerCase()) ||
              (!companyName &&
                opportunity.strategyNarrativeKey === 'personal_intelligence' &&
                entry.kind === 'hsakaa_identity')),
        )
        .map((entry) => entry.id)
        .slice(0, 1);
      if (requiredIdentityEvidence.length) {
        evidenceIds = [
          ...new Set([...evidenceIds, ...requiredIdentityEvidence]),
        ];
      }

      const evidenceEntries = evidenceIds
        .map((id) => byId.get(id))
        .filter((entry): entry is PlanningEvidenceCatalogEntry =>
          Boolean(entry),
        );
      const hasMatchingIdentityEvidence = evidenceEntries.some(
        (entry) =>
          entry.privacy === 'identity_safe' &&
          (!companyName ||
            entry.companyName?.trim().toLowerCase() ===
              companyName.toLowerCase() ||
            (opportunity.strategyNarrativeKey === 'personal_intelligence' &&
              entry.kind === 'hsakaa_identity')),
      );

      if (
        opportunity.privacy === 'public_safe' &&
        opportunity.usable &&
        (!evidenceIds.length ||
          (companyName &&
            !hasMatchingIdentityEvidence &&
            !evidenceEntries.some((entry) => entry.privacy === 'public_safe')))
      ) {
        unresolvedOpportunityKeys.push(opportunity.key);
        return {
          ...opportunity,
          evidenceIds: [],
          privacy: 'needs_review' as const,
          usable: false,
          evidenceStrength: Math.min(opportunity.evidenceStrength, 25),
        };
      }

      return {
        ...opportunity,
        evidenceIds,
      };
    });

    return {
      data: { ...strategyCore, opportunities },
      unresolvedOpportunityKeys,
    };
  }

  private inferOpportunityEvidence(
    opportunity: PlanningStrategyCore['opportunities'][number],
    catalog: PlanningEvidenceCatalogEntry[],
  ) {
    const searchText = [
      opportunity.title,
      opportunity.thesis,
      opportunity.whyNow,
      opportunity.sourceSummary,
      opportunity.narrative,
      opportunity.strategyNarrativeKey,
      opportunity.companyName,
    ]
      .filter(Boolean)
      .join(' ');
    const searchTokens = this.tokens(searchText);
    if (!searchTokens.length) return [];

    const companyName = opportunity.companyName?.trim().toLowerCase() ?? '';
    const identityMatches = catalog.filter((entry) => {
      if (entry.privacy !== 'identity_safe') return false;
      if (companyName) {
        return entry.companyName?.trim().toLowerCase() === companyName;
      }
      return (
        opportunity.strategyNarrativeKey === 'personal_intelligence' &&
        entry.kind === 'hsakaa_identity'
      );
    });

    const ranked = catalog
      .map((entry) => {
        const evidenceTokens = this.tokens(
          [entry.title, entry.summary, entry.kind, entry.source].join(' '),
        );
        const intersection = searchTokens.filter((token) =>
          evidenceTokens.includes(token),
        ).length;
        const similarity = this.jaccard(searchTokens, evidenceTokens);
        const score =
          intersection * 2 +
          similarity * 5 +
          (entry.significantChange ? 0.25 : 0) +
          (entry.privacy === 'identity_safe' ? 0.5 : 0);
        return { entry, score };
      })
      .filter((candidate) => candidate.score >= 2)
      .sort((left, right) => right.score - left.score);

    return [
      ...new Set([
        ...identityMatches.slice(0, 1).map((entry) => entry.id),
        ...ranked.slice(0, 2).map((candidate) => candidate.entry.id),
      ]),
    ].slice(0, 3);
  }

  private repairBlueprintPortfolio(
    blueprint: PlanningBlueprint,
    context: PlanningBlueprintRepairContext,
  ): PlanningBlueprint {
    const {
      cadence,
      worldContext,
      presenceStrategy,
      validEvidence,
      mutableDates,
      startDate,
      endDate,
    } = context;
    const wholeLifeSignals = worldContext.wholeLifeSignals ?? [];

    // AI output is a strategy draft. Product invariants are deterministic.
    // Repair every recoverable structural/portfolio miss before validation so
    // a good paid generation is not discarded because one counter or key drifted.
    let repaired = this.repairBlueprintIntegrity(
      blueprint,
      startDate,
      endDate,
      presenceStrategy,
      worldContext,
      validEvidence,
      mutableDates,
    );
    repaired = this.normalizeBlueprintTimes(repaired, validEvidence);

    // Run a small fixed-point loop because one repair can legitimately affect
    // another (for example, cadence can remove a discovery surface; diversity
    // can replace a duplicate and change platform mix). Three passes are enough
    // for a seven-day/five-platform calendar and avoid unbounded mutation.
    for (let pass = 0; pass < 3; pass += 1) {
      repaired = this.repairPlatformCadence(repaired, cadence, mutableDates);
      repaired = this.repairMinimumPostVolume(
        repaired,
        cadence,
        worldContext,
        mutableDates,
      );
      repaired = this.repairLongFormCadence(
        repaired,
        cadence,
        wholeLifeSignals,
        mutableDates,
      );
      repaired = this.repairShortFormCadence(repaired, cadence, mutableDates);
      repaired = this.repairHobbySurfaceSaturation(
        repaired,
        wholeLifeSignals,
        mutableDates,
      );
      repaired = this.repairPersonalClusterSaturation(repaired, mutableDates);
      repaired = this.repairOwnedBuilderJourney(
        repaired,
        worldContext,
        presenceStrategy,
        mutableDates,
      );
      repaired = this.repairNarrativePortfolio(
        repaired,
        presenceStrategy,
        mutableDates,
      );
      repaired = this.repairGrowthPortfolio(repaired, mutableDates);
      repaired = this.repairGrowthPortfolioSafetyNet(
        repaired,
        worldContext,
        presenceStrategy,
        mutableDates,
      );
    }

    // Final lightweight grounding and cadence pass. This intentionally happens
    // after every strategic repair so the object that reaches assertBlueprint is
    // the object that has actually been reconciled.
    repaired = this.normalizeBlueprintTimes(repaired, validEvidence);
    repaired = this.repairPlatformCadence(repaired, cadence, mutableDates);
    repaired = this.repairLongFormCadence(
      repaired,
      cadence,
      wholeLifeSignals,
      mutableDates,
    );
    repaired = this.repairShortFormCadence(repaired, cadence, mutableDates);
    repaired = this.repairGrowthPortfolio(repaired, mutableDates);
    repaired = this.repairGrowthPortfolioSafetyNet(
      repaired,
      worldContext,
      presenceStrategy,
      mutableDates,
    );
    repaired = this.repairOwnedBuilderJourney(
      repaired,
      worldContext,
      presenceStrategy,
      mutableDates,
    );
    return repaired;
  }

  private repairBlueprintIntegrity(
    blueprint: PlanningBlueprint,
    startDate: string,
    endDate: string,
    presenceStrategy: PlanningPresenceStrategy,
    worldContext: PlanningWorldContext,
    validEvidence: Set<string>,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const narrativeKeys = (presenceStrategy.narratives ?? []).map(
      (item) => item.key,
    );
    const narrativeSet = new Set(narrativeKeys);
    const identityEvidence = this.planningIdentityEvidence(worldContext);
    const identityByCompany = new Map(
      identityEvidence
        .filter((item) => item.companyName?.trim())
        .map((item) => [item.companyName.trim().toLowerCase(), item.id]),
    );
    const hsakaaIdentity = identityEvidence.find(
      (item) => item.id === 'identity:hsakaa',
    )?.id;

    const fallbackNarrative = (
      opportunity: GeneratedPlan['opportunities'][number],
    ) => {
      if (!narrativeKeys.length) return opportunity.strategyNarrativeKey;
      const text = [
        opportunity.title,
        opportunity.thesis,
        opportunity.narrative,
        opportunity.companyName,
        opportunity.identityPillar,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const preferred: string[] = [];
      if (/8lete|sport|academy|grassroot/.test(text)) {
        preferred.push('sports_workflows');
      }
      if (/frayto|freight|shipment|logistics/.test(text)) {
        preferred.push('freight_workflows');
      }
      if (/hsakaa|digital twin|personal intelligence|personal ai/.test(text)) {
        preferred.push('personal_intelligence');
      }
      if (opportunity.identityPillar === 'builder_operator') {
        preferred.push('builder_operator');
      } else if (opportunity.identityPillar === 'ideas_thinking') {
        preferred.push('ideas_thinking');
      } else if (opportunity.identityPillar === 'learning_experiments') {
        preferred.push('learning_experiments');
      } else if (opportunity.identityPillar === 'building_aakash') {
        preferred.push('building_aakash');
      } else if (opportunity.identityPillar === 'human_unfiltered') {
        preferred.push('human_personality');
      }
      return preferred.find((key) => narrativeSet.has(key)) ?? narrativeKeys[0];
    };

    repaired.opportunities = repaired.opportunities.map(
      (opportunity, index) => {
        let evidenceIds = this.validPlanningEvidenceIds(
          opportunity.evidenceIds ?? [],
          validEvidence,
        );
        let companyName = opportunity.companyName?.trim() ?? '';
        if (companyName) {
          const identityId = identityByCompany.get(companyName.toLowerCase());
          const hasIdentity = Boolean(
            identityId && evidenceIds.includes(identityId),
          );
          const hasPublicLikeEvidence = evidenceIds.some(
            (id) => !id.startsWith('identity:'),
          );
          if (identityId && !hasIdentity && validEvidence.has(identityId)) {
            evidenceIds = [...new Set([...evidenceIds, identityId])];
          } else if (!identityId && !hasPublicLikeEvidence) {
            // Do not let a model-invented company name poison an otherwise safe
            // opportunity. The owned-company repair below can insert a real one.
            companyName = '';
          }
        } else if (
          opportunity.strategyNarrativeKey === 'personal_intelligence' &&
          hsakaaIdentity &&
          validEvidence.has(hsakaaIdentity) &&
          !evidenceIds.includes(hsakaaIdentity)
        ) {
          evidenceIds = [...new Set([...evidenceIds, hsakaaIdentity])];
        }

        const publicSafeWithoutEvidence =
          opportunity.privacy === 'public_safe' &&
          opportunity.usable &&
          evidenceIds.length === 0;
        const strategyNarrativeKey = narrativeSet.has(
          opportunity.strategyNarrativeKey,
        )
          ? opportunity.strategyNarrativeKey
          : fallbackNarrative(opportunity);
        const topicClusterKey =
          opportunity.topicClusterKey?.trim() ||
          `cluster_repaired_${this.planningKeyFragment(opportunity.key || opportunity.title || String(index + 1))}`;

        return {
          ...opportunity,
          companyName,
          evidenceIds,
          strategyNarrativeKey,
          topicClusterKey,
          usable:
            opportunity.privacy === 'needs_review' || publicSafeWithoutEvidence
              ? false
              : opportunity.usable,
          privacy: publicSafeWithoutEvidence
            ? ('needs_review' as const)
            : opportunity.privacy,
        };
      },
    );

    const opportunityByKey = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );
    const usable = repaired.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        item.evidenceIds.length > 0,
    );
    const chooseOpportunity = (platform: MediaPlatform) =>
      [...usable].sort((left, right) => {
        const score = (item: (typeof usable)[number]) =>
          ((item.platforms ?? []).includes(platform) ? 40 : 0) +
          (item.companyName?.trim() ? 10 : 0) +
          (item.strategicFit ?? 0) / 5 +
          (item.novelty ?? 0) / 10;
        return score(right) - score(left);
      })[0];

    const expectedDates =
      repaired.days.length === 1
        ? [startDate]
        : Array.from({ length: ROLLING_WINDOW_DAYS }, (_, index) =>
            this.addDays(startDate, index),
          );
    repaired.startDate = startDate;
    repaired.endDate = endDate;
    repaired.timezone = TZ;

    const sourceDays = repaired.days.slice(0, expectedDates.length);
    repaired.days = expectedDates.map((date, index) => {
      const day = sourceDays[index] ?? {
        date,
        theme: 'Aakash presence',
        workload: 'light',
        executions: [],
        instagramStory: this.fallbackInstagramStorySkeleton(
          usable[index % Math.max(usable.length, 1)],
          index,
          validEvidence,
        ),
        youtubeCommunity: this.skipYoutubeCommunitySkeleton(
          usable[index % Math.max(usable.length, 1)],
        ),
        engagement: [],
      };
      const mutable = !mutableDates || mutableDates.has(date);
      const choices = new Map<MediaPlatform, PlanningExecutionSkeleton>();
      for (const item of day.executions ?? []) {
        if (!GROWTH_PLATFORMS.includes(item.platform)) continue;
        const existing = choices.get(item.platform);
        if (
          !existing ||
          (existing.action === 'skip' && item.action === 'post')
        ) {
          choices.set(item.platform, { ...item });
        }
      }
      const executions = GROWTH_PLATFORMS.map((platform) => {
        const existing = choices.get(platform);
        if (!existing) {
          return {
            platform,
            action: 'skip' as const,
            time: '',
            format: this.fallbackFormatForPlatform(platform),
            opportunityKey: '',
            storyArcKey: '',
            reason:
              'Missing platform decision repaired deterministically; downstream cadence may activate this slot from grounded strategy material.',
          };
        }
        if (existing.action === 'skip') {
          return {
            ...existing,
            time: '',
            opportunityKey: '',
          };
        }
        const opportunity = opportunityByKey.get(existing.opportunityKey ?? '');
        if (
          opportunity?.usable &&
          opportunity.privacy === 'public_safe' &&
          opportunity.evidenceIds.length
        ) {
          return existing;
        }
        if (!mutable)
          return {
            ...existing,
            action: 'skip' as const,
            time: '',
            opportunityKey: '',
          };
        const replacement = chooseOpportunity(platform);
        if (!replacement) {
          return {
            ...existing,
            action: 'skip' as const,
            time: '',
            opportunityKey: '',
            storyArcKey: '',
            reason:
              'Invalid/ungrounded opportunity reference isolated instead of failing the whole week.',
          };
        }
        return {
          ...existing,
          opportunityKey: replacement.key,
          storyArcKey: '',
          reason:
            'Invalid/unknown opportunity reference re-grounded deterministically from a usable HSAKAA opportunity.',
        };
      });

      return {
        ...day,
        date,
        theme: day.theme?.trim() || 'Aakash presence',
        workload: day.workload?.trim() || 'light',
        executions,
        instagramStory: {
          ...(day.instagramStory ??
            this.fallbackInstagramStorySkeleton(usable[0], index)),
          sourceEvidenceIds: this.validPlanningEvidenceIds(
            day.instagramStory?.sourceEvidenceIds ?? [],
            validEvidence,
          ),
        },
        youtubeCommunity: {
          ...(day.youtubeCommunity ??
            this.skipYoutubeCommunitySkeleton(usable[0])),
          sourceEvidenceIds: this.validPlanningEvidenceIds(
            day.youtubeCommunity?.sourceEvidenceIds ?? [],
            validEvidence,
          ),
        },
        engagement: day.engagement ?? [],
      };
    });

    return repaired;
  }

  private planningKeyFragment(value: string) {
    return (
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48) || 'topic'
    );
  }

  private fallbackFormatForPlatform(platform: MediaPlatform) {
    if (platform === MediaPlatform.INSTAGRAM) return MediaPostType.IMAGE;
    if (platform === MediaPlatform.YOUTUBE) return MediaPostType.VIDEO;
    if (platform === MediaPlatform.WHATSAPP)
      return MediaPostType.WHATSAPP_STATUS;
    return MediaPostType.TEXT;
  }

  private repairMinimumPostVolume(
    blueprint: PlanningBlueprint,
    cadence: PlanningCadence,
    worldContext: PlanningWorldContext,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const usableEvidenceCount =
      this.planningPublicEvidence(worldContext).length +
      (worldContext.internalSafe ?? []).length;
    const minimumPosts =
      usableEvidenceCount >= 3 ? 10 : usableEvidenceCount > 0 ? 3 : 0;
    let count = repaired.days.reduce(
      (total, day) =>
        total + day.executions.filter((item) => item.action === 'post').length,
      0,
    );
    if (count >= minimumPosts) return repaired;

    const opportunities = repaired.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        item.evidenceIds.length > 0,
    );
    if (!opportunities.length) return repaired;
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const platformCount = (platform: MediaPlatform) =>
      repaired.days.reduce(
        (total, day) =>
          total +
          day.executions.filter(
            (item) => item.platform === platform && item.action === 'post',
          ).length,
        0,
      );

    for (const day of repaired.days) {
      if (count >= minimumPosts) break;
      if (!mutable(day.date)) continue;
      for (const execution of day.executions) {
        if (count >= minimumPosts) break;
        if (execution.action !== 'skip') continue;
        const target = cadence.platforms[execution.platform];
        if (target && platformCount(execution.platform) >= target.max) continue;
        const opportunity = [...opportunities].sort((left, right) => {
          const score = (item: (typeof opportunities)[number]) =>
            ((item.platforms ?? []).includes(execution.platform) ? 30 : 0) +
            (item.growthIntent === 'conversion' ? 12 : 0) +
            (item.growthIntent === 'discovery' ? 8 : 0) +
            (item.strategicFit ?? 0) / 5;
          return score(right) - score(left);
        })[0];
        if (!opportunity) continue;
        execution.action = 'post';
        execution.time = this.defaultPostingTime(execution.platform);
        execution.format = this.fallbackFormatForPlatform(execution.platform);
        execution.opportunityKey = opportunity.key;
        execution.storyArcKey = '';
        execution.reason =
          'Minimum viable weekly presence restored from grounded strategy material instead of failing the entire plan.';
        count += 1;
      }
    }
    return repaired;
  }

  private repairOwnedBuilderJourney(
    blueprint: PlanningBlueprint,
    worldContext: PlanningWorldContext,
    presenceStrategy: PlanningPresenceStrategy,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const companies = worldContext.companies ?? [];
    if (!companies.length) return blueprint;
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const identityEvidence = this.planningIdentityEvidence(worldContext);
    const companyIdentityIds = new Map(
      identityEvidence
        .filter((item) => item.companyName?.trim())
        .map((item) => [item.companyName.trim().toLowerCase(), item.id]),
    );
    const companyPublicIds = new Map(
      this.planningPublicCompanyEvidence(worldContext).map((item) => [
        item.companyName.trim().toLowerCase(),
        item.id,
      ]),
    );
    const usedKeys = new Set(
      repaired.days.flatMap((day) =>
        day.executions
          .filter((item) => item.action === 'post')
          .map((item) => item.opportunityKey)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const alreadyOwned = repaired.opportunities.some(
      (item) =>
        usedKeys.has(item.key) &&
        item.companyName?.trim() &&
        item.evidenceIds.some(
          (id) =>
            id.startsWith('identity:company:') ||
            id.startsWith('public:company:'),
        ),
    );
    if (alreadyOwned) return repaired;

    let candidate = repaired.opportunities
      .filter(
        (item) =>
          item.usable &&
          item.privacy === 'public_safe' &&
          item.companyName?.trim() &&
          item.evidenceIds.some(
            (id) =>
              id.startsWith('identity:company:') ||
              id.startsWith('public:company:'),
          ),
      )
      .sort(
        (a, b) =>
          (b.strategicFit ?? 0) +
          (b.novelty ?? 0) -
          ((a.strategicFit ?? 0) + (a.novelty ?? 0)),
      )[0];

    if (!candidate) {
      const company = companies[0];
      const companyKey = company.name.trim().toLowerCase();
      const identityId = companyIdentityIds.get(companyKey);
      const publicCompanyId = companyPublicIds.get(companyKey);
      if (!identityId && !publicCompanyId) return repaired;
      const narrativeKeys = new Set(
        (presenceStrategy.narratives ?? []).map((item) => item.key),
      );
      const contextText = [
        company.name,
        ...(company.industries ?? []),
        ...(company.markets ?? []),
      ]
        .join(' ')
        .toLowerCase();
      const strategyNarrativeKey = /sport|academy|grassroot/.test(contextText)
        ? narrativeKeys.has('sports_workflows')
          ? 'sports_workflows'
          : narrativeKeys.has('builder_operator')
            ? 'builder_operator'
            : [...narrativeKeys][0] || 'builder_operator'
        : /freight|logistic|shipment/.test(contextText)
          ? narrativeKeys.has('freight_workflows')
            ? 'freight_workflows'
            : narrativeKeys.has('builder_operator')
              ? 'builder_operator'
              : [...narrativeKeys][0] || 'builder_operator'
          : narrativeKeys.has('builder_operator')
            ? 'builder_operator'
            : [...narrativeKeys][0] || 'builder_operator';
      const fragment = this.planningKeyFragment(company.name);
      candidate = {
        key: `repair_owned_builder_${fragment}`,
        title: `${company.name}: one honest builder checkpoint`,
        thesis: `Keep ${company.name} visible through a real builder question, decision, priority, constraint or checkpoint grounded in supplied public company context.`,
        whyNow:
          "This is part of Aakash's ongoing builder journey. Show one real unresolved question or next checkpoint so a viewer has a reason to return.",
        sourceSummary:
          'Configured-company context is PUBLIC_SAFE by owner policy. Use only supplied company fields and do not invent missing facts.',
        evidenceIds: [publicCompanyId, identityId].filter(
          (value): value is string => Boolean(value),
        ),
        companyName: company.name,
        narrative: 'owned_builder_journey',
        strategyNarrativeKey,
        topicClusterKey: `cluster_owned_builder_${fragment}`,
        growthIntent: 'authority',
        identityPillar: 'builder_operator',
        platforms: [
          MediaPlatform.LINKEDIN,
          MediaPlatform.INSTAGRAM,
          MediaPlatform.YOUTUBE,
          MediaPlatform.X,
        ],
        formats: [
          MediaPostType.TEXT,
          MediaPostType.CAROUSEL,
          MediaPostType.VIDEO,
          MediaPostType.REEL,
        ],
        strategicFit: 95,
        novelty: 80,
        evidenceStrength: 70,
        privacy: 'public_safe',
        usable: true,
      };
      repaired.opportunities.push(candidate);
    }

    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const byKey = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );
    const clusterCounts = new Map<string, number>();
    for (const day of repaired.days) {
      for (const execution of day.executions) {
        if (execution.action !== 'post') continue;
        const opportunity = byKey.get(execution.opportunityKey ?? '');
        if (!opportunity?.topicClusterKey) continue;
        clusterCounts.set(
          opportunity.topicClusterKey,
          (clusterCounts.get(opportunity.topicClusterKey) ?? 0) + 1,
        );
      }
    }

    const platformOrder = [
      MediaPlatform.LINKEDIN,
      MediaPlatform.X,
      MediaPlatform.YOUTUBE,
      MediaPlatform.INSTAGRAM,
      MediaPlatform.WHATSAPP,
    ];
    for (const platform of platformOrder) {
      for (const day of repaired.days) {
        if (!mutable(day.date)) continue;
        const skip = day.executions.find(
          (item) => item.platform === platform && item.action === 'skip',
        );
        if (!skip) continue;
        skip.action = 'post';
        skip.time = this.defaultPostingTime(platform);
        skip.format = this.fallbackFormatForPlatform(platform);
        skip.opportunityKey = candidate.key;
        skip.storyArcKey = '';
        skip.reason =
          'Owned company-builder journey restored deterministically from identity-safe context.';
        return repaired;
      }
    }

    const replaceable = repaired.days
      .flatMap((day) => day.executions.map((execution) => ({ day, execution })))
      .filter(({ day, execution }) => {
        if (!mutable(day.date) || execution.action !== 'post') return false;
        const opportunity = byKey.get(execution.opportunityKey ?? '');
        return Boolean(
          opportunity &&
          !opportunity.companyName?.trim() &&
          (clusterCounts.get(opportunity.topicClusterKey) ?? 0) > 1,
        );
      })[0];
    if (replaceable) {
      replaceable.execution.opportunityKey = candidate.key;
      replaceable.execution.storyArcKey = '';
      replaceable.execution.reason =
        'A duplicate derivative was replaced by the owned company-builder journey instead of letting companies disappear from the week.';
    }
    return repaired;
  }

  private repairNarrativePortfolio(
    blueprint: PlanningBlueprint,
    presenceStrategy: PlanningPresenceStrategy,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const requiredNarratives = (presenceStrategy.narratives ?? []).map(
      (item) => item.key,
    );
    if (requiredNarratives.length < 5) return repaired;
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const byKey = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );

    const clusterInfo = () => {
      const clusters = new Map<
        string,
        {
          narrative: string;
          surfaces: Array<{
            date: string;
            execution: PlanningExecutionSkeleton;
          }>;
        }
      >();
      for (const day of repaired.days) {
        for (const execution of day.executions) {
          if (execution.action !== 'post') continue;
          const opportunity = byKey.get(execution.opportunityKey ?? '');
          if (!opportunity?.topicClusterKey) continue;
          const info = clusters.get(opportunity.topicClusterKey) ?? {
            narrative: opportunity.strategyNarrativeKey,
            surfaces: [],
          };
          info.surfaces.push({ date: day.date, execution });
          clusters.set(opportunity.topicClusterKey, info);
        }
      }
      return clusters;
    };

    for (let pass = 0; pass < 5; pass += 1) {
      const clusters = clusterInfo();
      if (clusters.size < 5) break;
      const counts = new Map<string, number>();
      for (const info of clusters.values()) {
        counts.set(info.narrative, (counts.get(info.narrative) ?? 0) + 1);
      }
      const missing = requiredNarratives.filter((key) => !counts.has(key));
      const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const needsDominanceRepair = Boolean(
        dominant && dominant[1] / clusters.size > 0.4,
      );
      if (!missing.length && !needsDominanceRepair) break;

      const targetNarrative =
        missing[0] ??
        requiredNarratives.find((key) => (counts.get(key) ?? 0) === 0) ??
        requiredNarratives.sort(
          (a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0),
        )[0];
      const usedClusters = new Set(clusters.keys());
      const replacementOpportunity = repaired.opportunities
        .filter(
          (item) =>
            item.usable &&
            item.privacy === 'public_safe' &&
            item.evidenceIds.length > 0 &&
            item.strategyNarrativeKey === targetNarrative &&
            !usedClusters.has(item.topicClusterKey),
        )
        .sort(
          (a, b) =>
            (b.novelty ?? 0) +
            (b.strategicFit ?? 0) -
            ((a.novelty ?? 0) + (a.strategicFit ?? 0)),
        )[0];
      if (!replacementOpportunity) break;

      const sourceNarrative = dominant?.[0] ?? '';
      const replaceableCluster = [...clusters.entries()]
        .filter(([, info]) =>
          sourceNarrative ? info.narrative === sourceNarrative : true,
        )
        .sort((a, b) => b[1].surfaces.length - a[1].surfaces.length)
        .find(([, info]) =>
          info.surfaces.some((surface) => mutable(surface.date)),
        );
      if (!replaceableCluster) break;
      const surface = replaceableCluster[1].surfaces.find((item) =>
        mutable(item.date),
      );
      if (!surface) break;
      surface.execution.opportunityKey = replacementOpportunity.key;
      surface.execution.storyArcKey = '';
      surface.execution.reason =
        'Narrative diversity reconciled automatically by replacing a repeated cluster with another grounded Presence narrative.';
    }
    return repaired;
  }

  private repairPersonalClusterSaturation(
    blueprint: PlanningBlueprint,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const byKey = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );
    const usableAlternatives = () =>
      repaired.opportunities.filter(
        (item) =>
          item.usable &&
          item.privacy === 'public_safe' &&
          item.evidenceIds.length > 0,
      );

    for (let pass = 0; pass < 4; pass += 1) {
      const surfaces = new Map<
        string,
        Array<{ date: string; execution: PlanningExecutionSkeleton }>
      >();
      for (const day of repaired.days) {
        for (const execution of day.executions) {
          if (execution.action !== 'post') continue;
          const opportunity = byKey.get(execution.opportunityKey ?? '');
          if (
            !opportunity?.topicClusterKey ||
            !PERSONAL_STRATEGY_NARRATIVES.has(opportunity.strategyNarrativeKey)
          ) {
            continue;
          }
          const items = surfaces.get(opportunity.topicClusterKey) ?? [];
          items.push({ date: day.date, execution });
          surfaces.set(opportunity.topicClusterKey, items);
        }
      }
      const over = [...surfaces.entries()].find(
        ([, items]) => items.length > 2,
      );
      if (!over) break;
      const extra = over[1].slice(2).find((item) => mutable(item.date));
      if (!extra) break;
      const usedClusterCounts = new Map<string, number>();
      for (const [cluster, items] of surfaces)
        usedClusterCounts.set(cluster, items.length);
      const replacement = usableAlternatives()
        .filter((item) => item.topicClusterKey !== over[0])
        .sort((a, b) => {
          const aCount = usedClusterCounts.get(a.topicClusterKey) ?? 0;
          const bCount = usedClusterCounts.get(b.topicClusterKey) ?? 0;
          if (aCount !== bCount) return aCount - bCount;
          return (b.novelty ?? 0) - (a.novelty ?? 0);
        })[0];
      if (!replacement) break;
      extra.execution.opportunityKey = replacement.key;
      extra.execution.storyArcKey = '';
      extra.execution.reason =
        'Personal topic saturation reconciled automatically; keep one primary and at most one secondary feed treatment.';
    }
    return repaired;
  }

  private cloneBlueprintForPortfolioRepair(
    blueprint: PlanningBlueprint,
  ): PlanningBlueprint {
    return {
      ...blueprint,
      opportunities: blueprint.opportunities.map((item) => ({
        ...item,
        evidenceIds: [...(item.evidenceIds ?? [])],
        platforms: [...(item.platforms ?? [])],
        formats: [...(item.formats ?? [])],
      })),
      storyArcs: blueprint.storyArcs.map((item) => ({
        ...item,
        beats: (item.beats ?? []).map((beat) => ({
          ...beat,
          platforms: [...(beat.platforms ?? [])],
        })),
      })),
      days: blueprint.days.map((day) => ({
        ...day,
        executions: day.executions.map((item) => ({ ...item })),
        instagramStory: {
          ...day.instagramStory,
          sourceEvidenceIds: [...(day.instagramStory.sourceEvidenceIds ?? [])],
        },
        youtubeCommunity: {
          ...day.youtubeCommunity,
          sourceEvidenceIds: [
            ...(day.youtubeCommunity?.sourceEvidenceIds ?? []),
          ],
        },
        engagement: [...(day.engagement ?? [])],
      })),
    };
  }

  private repairPlatformCadence(
    blueprint: PlanningBlueprint,
    cadence: PlanningCadence,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const opportunities = repaired.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        item.evidenceIds.length,
    );
    if (!opportunities.length) return repaired;

    const platformCount = (platform: MediaPlatform) =>
      repaired.days.reduce(
        (total, day) =>
          total +
          day.executions.filter(
            (item) => item.platform === platform && item.action === 'post',
          ).length,
        0,
      );
    const clusterSurfaceCount = (clusterKey: string) =>
      repaired.days.reduce(
        (total, day) =>
          total +
          day.executions.filter((item) => {
            if (item.action !== 'post') return false;
            const opportunity = repaired.opportunities.find(
              (candidate) => candidate.key === item.opportunityKey,
            );
            return opportunity?.topicClusterKey === clusterKey;
          }).length,
        0,
      );
    const opportunityFor = (platform: MediaPlatform, date: string) => {
      const day = repaired.days.find((item) => item.date === date);
      const usedKeys = new Set(
        (day?.executions ?? [])
          .filter((item) => item.action === 'post')
          .map((item) => item.opportunityKey),
      );
      return [...opportunities].sort((left, right) => {
        const score = (item: (typeof opportunities)[number]) => {
          const surfaces = clusterSurfaceCount(item.topicClusterKey);
          const personal = PERSONAL_STRATEGY_NARRATIVES.has(
            item.strategyNarrativeKey,
          );
          return (
            ((item.platforms ?? []).includes(platform) ? 35 : 0) +
            (item.companyName?.trim() ? 18 : 0) +
            (item.growthIntent === 'conversion' ? 14 : 0) +
            (item.growthIntent === 'discovery' ? 10 : 0) +
            (item.strategicFit ?? 0) / 5 +
            (item.novelty ?? 0) / 8 -
            (usedKeys.has(item.key) ? 12 : 0) -
            (personal && surfaces >= 2 ? 1000 : surfaces * 4)
          );
        };
        return score(right) - score(left);
      })[0];
    };
    const fallbackFormat = (platform: MediaPlatform) => {
      if (platform === MediaPlatform.INSTAGRAM) return MediaPostType.IMAGE;
      if (platform === MediaPlatform.YOUTUBE) return MediaPostType.VIDEO;
      if (platform === MediaPlatform.X) return MediaPostType.TEXT;
      if (platform === MediaPlatform.WHATSAPP) {
        return MediaPostType.WHATSAPP_STATUS;
      }
      return MediaPostType.TEXT;
    };

    for (const platform of GROWTH_PLATFORMS) {
      const target = cadence.platforms[platform];
      if (!target) continue;

      let count = platformCount(platform);
      if (count > target.max) {
        const removable = repaired.days
          .flatMap((day, dayIndex) =>
            day.executions.map((execution, executionIndex) => ({
              day,
              dayIndex,
              execution,
              executionIndex,
            })),
          )
          .filter(
            ({ day, execution }) =>
              mutable(day.date) &&
              execution.platform === platform &&
              execution.action === 'post',
          )
          .sort((left, right) => {
            const score = (candidate: (typeof removable)[number]) => {
              const opportunity = repaired.opportunities.find(
                (item) => item.key === candidate.execution.opportunityKey,
              );
              return (
                (candidate.execution.platform === MediaPlatform.YOUTUBE &&
                candidate.execution.format === MediaPostType.VIDEO
                  ? 100
                  : 0) +
                (opportunity?.companyName?.trim() ? 30 : 0) +
                (opportunity?.growthIntent === 'conversion' ? 25 : 0) +
                (opportunity?.growthIntent === 'authority' ? 15 : 0) +
                (opportunity?.strategicFit ?? 0) / 10
              );
            };
            return score(left) - score(right);
          });
        for (const candidate of removable) {
          if (count <= target.max) break;
          repaired.days[candidate.dayIndex].executions[
            candidate.executionIndex
          ] = {
            ...candidate.execution,
            action: 'skip',
            time: '',
            opportunityKey: '',
            storyArcKey: '',
            reason:
              'Cadence reconciled automatically: this extra feed surface was removed to stay inside the active Presence Strategy range.',
          };
          count -= 1;
        }
      }

      count = platformCount(platform);
      if (count >= target.min) continue;
      for (const day of repaired.days) {
        if (count >= target.min) break;
        if (!mutable(day.date)) continue;
        const execution = day.executions.find(
          (item) => item.platform === platform && item.action === 'skip',
        );
        if (!execution) continue;
        const opportunity = opportunityFor(platform, day.date);
        if (!opportunity) continue;
        execution.action = 'post';
        execution.time = this.defaultPostingTime(platform);
        execution.format = fallbackFormat(platform);
        execution.opportunityKey = opportunity.key;
        execution.storyArcKey = '';
        execution.reason =
          'Cadence reconciled automatically from a grounded opportunity so a minor model count miss does not invalidate the whole week.';
        count += 1;
      }
    }

    return repaired;
  }

  private repairLongFormCadence(
    blueprint: PlanningBlueprint,
    cadence: PlanningCadence,
    wholeLifeSignals: PlanningWholeLifeSignal[],
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const usable = repaired.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        item.evidenceIds.length,
    );
    if (!usable.length) return repaired;

    const youtubePosts = () =>
      repaired.days.flatMap((day, dayIndex) =>
        day.executions
          .map((execution, executionIndex) => ({
            day,
            dayIndex,
            execution,
            executionIndex,
          }))
          .filter(
            ({ execution }) =>
              execution.platform === MediaPlatform.YOUTUBE &&
              execution.action === 'post',
          ),
      );
    const longPosts = () =>
      youtubePosts().filter(
        ({ execution }) => execution.format === MediaPostType.VIDEO,
      );
    const pickOpportunity = (wholePersonOnly = false) =>
      [...usable]
        .filter(
          (item) =>
            !wholePersonOnly ||
            WHOLE_PERSON_STRATEGY_NARRATIVES.has(item.strategyNarrativeKey),
        )
        .sort((left, right) => {
          const score = (item: (typeof usable)[number]) =>
            ((item.platforms ?? []).includes(MediaPlatform.YOUTUBE) ? 30 : 0) +
            ((item.formats ?? []).includes(MediaPostType.VIDEO) ? 20 : 0) +
            (item.growthIntent === 'conversion' ? 18 : 0) +
            (item.strategicFit ?? 0) / 4 +
            (item.novelty ?? 0) / 8;
          return score(right) - score(left);
        })[0];

    let longCount = longPosts().length;
    for (const candidate of youtubePosts()) {
      if (longCount >= cadence.longFormVideos) break;
      if (!mutable(candidate.day.date)) continue;
      if (candidate.execution.format === MediaPostType.VIDEO) continue;
      candidate.execution.format = MediaPostType.VIDEO;
      candidate.execution.reason =
        'YouTube format reconciled automatically to preserve the active long-form cadence.';
      longCount += 1;
    }

    if (longCount < cadence.longFormVideos) {
      for (const day of repaired.days) {
        if (longCount >= cadence.longFormVideos) break;
        if (!mutable(day.date)) continue;
        const execution = day.executions.find(
          (item) =>
            item.platform === MediaPlatform.YOUTUBE && item.action === 'skip',
        );
        if (!execution) continue;
        const opportunity = pickOpportunity();
        if (!opportunity) continue;
        execution.action = 'post';
        execution.time = this.defaultPostingTime(MediaPlatform.YOUTUBE);
        execution.format = MediaPostType.VIDEO;
        execution.opportunityKey = opportunity.key;
        execution.storyArcKey = '';
        execution.reason =
          'YouTube long-form slot restored automatically from grounded strategy material.';
        longCount += 1;
      }
    }

    const hasWholePersonEvidence = (wholeLifeSignals ?? []).some((item) =>
      ['hobby', 'routine', 'learning', 'human'].includes(item.category),
    );
    if (cadence.longFormVideos >= 2 && hasWholePersonEvidence) {
      const hasWholePersonLongForm = longPosts().some(({ execution }) => {
        const opportunity = repaired.opportunities.find(
          (item) => item.key === execution.opportunityKey,
        );
        return Boolean(
          opportunity &&
          WHOLE_PERSON_STRATEGY_NARRATIVES.has(
            opportunity.strategyNarrativeKey,
          ),
        );
      });
      if (!hasWholePersonLongForm) {
        const wholePersonOpportunity = pickOpportunity(true);
        const replaceable = longPosts().find(({ day }) => mutable(day.date));
        if (wholePersonOpportunity && replaceable) {
          replaceable.execution.opportunityKey = wholePersonOpportunity.key;
          replaceable.execution.storyArcKey = '';
          replaceable.execution.reason =
            'Long-form balance reconciled automatically so one weekly video shows Aakash as a whole person, not only professional systems thinking.';
        }
      }
    }

    return repaired;
  }

  private repairGrowthPortfolio(
    blueprint: PlanningBlueprint,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    type Opportunity = GeneratedPlan['opportunities'][number];
    type GrowthIntent = Opportunity['growthIntent'];
    type UsedCluster = {
      key: string;
      opportunityKeys: Set<string>;
      platforms: Set<MediaPlatform>;
      surfaceCount: number;
      mutable: boolean;
      immutable: boolean;
    };

    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const opportunities = repaired.opportunities;
    const byKey = new Map<string, Opportunity>(
      opportunities.map((item) => [item.key, item]),
    );
    const isMutable = (date: string) => !mutableDates || mutableDates.has(date);
    const minimum = (intent: GrowthIntent) =>
      intent === 'discovery'
        ? 2
        : intent === 'conversion' || intent === 'authority'
          ? 1
          : 0;

    const collectClusters = () => {
      const result = new Map<string, UsedCluster>();
      for (const day of repaired.days) {
        for (const execution of day.executions) {
          if (execution.action !== 'post') continue;
          const opportunity = byKey.get(execution.opportunityKey ?? '');
          if (!opportunity?.topicClusterKey) continue;
          const cluster = result.get(opportunity.topicClusterKey) ?? {
            key: opportunity.topicClusterKey,
            opportunityKeys: new Set<string>(),
            platforms: new Set<MediaPlatform>(),
            surfaceCount: 0,
            mutable: false,
            immutable: false,
          };
          cluster.opportunityKeys.add(opportunity.key);
          cluster.platforms.add(execution.platform);
          cluster.surfaceCount += 1;
          if (isMutable(day.date)) cluster.mutable = true;
          else cluster.immutable = true;
          result.set(cluster.key, cluster);
        }
      }
      return result;
    };

    let clusters = collectClusters();
    const representative = (cluster: UsedCluster) => {
      for (const key of cluster.opportunityKeys) {
        const opportunity = byKey.get(key);
        if (opportunity) return opportunity;
      }
      return undefined;
    };
    const intentFor = (cluster: UsedCluster): GrowthIntent =>
      representative(cluster)?.growthIntent ?? 'affinity';
    const counts = () => {
      const result = new Map<GrowthIntent, number>();
      for (const cluster of clusters.values()) {
        const intent = intentFor(cluster);
        result.set(intent, (result.get(intent) ?? 0) + 1);
      }
      return result;
    };
    const eligibleForRetag = (cluster: UsedCluster) =>
      cluster.mutable && (!mutableDates || !cluster.immutable);

    const applyIntent = (clusterKey: string, target: GrowthIntent) => {
      for (const opportunity of opportunities) {
        if (opportunity.topicClusterKey !== clusterKey) continue;
        opportunity.growthIntent = target;
        if (target === 'conversion') {
          const conversionCue =
            "Shape this as one concrete step in Aakash's ongoing journey: show what is changing, what remains unresolved or what comes next so a new viewer has a real reason to return. Never use generic follow-for-more language.";
          if (!opportunity.whyNow.includes(conversionCue)) {
            opportunity.whyNow =
              `${opportunity.whyNow} ${conversionCue}`.trim();
          }
        }
      }
    };

    const opportunityScore = (
      opportunity: Opportunity,
      target: GrowthIntent,
      platform?: MediaPlatform,
    ) => {
      let score =
        (opportunity.strategicFit ?? 0) +
        (opportunity.novelty ?? 0) +
        (opportunity.growthIntent === target ? 80 : 0) +
        (platform && (opportunity.platforms ?? []).includes(platform) ? 25 : 0);
      if (target === 'conversion') {
        if (opportunity.strategyNarrativeKey === 'building_aakash')
          score += 140;
        else if (opportunity.strategyNarrativeKey === 'learning_experiments')
          score += 125;
        else if (opportunity.strategyNarrativeKey === 'human_personality')
          score += 115;
        else if (opportunity.strategyNarrativeKey === 'personal_intelligence')
          score += 100;
        if (!opportunity.companyName?.trim()) score += 25;
      } else if (target === 'discovery') {
        score += (opportunity.novelty ?? 0) * 1.5;
        if (platform === MediaPlatform.INSTAGRAM) score += 20;
        if (platform === MediaPlatform.YOUTUBE) score += 15;
        if (platform === MediaPlatform.X) score += 10;
      } else if (target === 'authority') {
        score += (opportunity.evidenceStrength ?? 0) * 1.5;
        if (
          [
            'builder_operator',
            'ideas_thinking',
            'sports_workflows',
            'freight_workflows',
            'personal_intelligence',
          ].includes(opportunity.strategyNarrativeKey)
        ) {
          score += 60;
        }
        if (platform === MediaPlatform.LINKEDIN) score += 20;
        if (platform === MediaPlatform.YOUTUBE) score += 10;
      }
      return score;
    };

    const retagExistingCluster = (target: GrowthIntent) => {
      const currentCounts = counts();
      const candidate = [...clusters.values()]
        .filter((cluster) => {
          if (!eligibleForRetag(cluster)) return false;
          const currentIntent = intentFor(cluster);
          if (currentIntent === target) return false;
          return (
            (currentCounts.get(currentIntent) ?? 0) - 1 >=
            minimum(currentIntent)
          );
        })
        .sort((left, right) => {
          const leftOpportunity = representative(left);
          const rightOpportunity = representative(right);
          return (
            (rightOpportunity
              ? opportunityScore(rightOpportunity, target)
              : -Infinity) -
            (leftOpportunity
              ? opportunityScore(leftOpportunity, target)
              : -Infinity)
          );
        })[0];
      if (!candidate) return false;
      applyIntent(candidate.key, target);
      return true;
    };

    // If every currently-used cluster is already carrying a minimum-required
    // job (for example authority + conversion + only one discovery), retagging
    // cannot create the fourth distinct cluster mathematically required by the
    // 100K portfolio. In that case replace one mutable duplicate derivative
    // with an unused, evidence-grounded opportunity. Post volume stays the same
    // and no new facts are invented.
    const materializeUnusedCluster = (target: GrowthIntent) => {
      const usedClusterKeys = new Set(clusters.keys());
      const unused = opportunities
        .filter(
          (item) =>
            item.usable &&
            item.privacy === 'public_safe' &&
            item.evidenceIds.length > 0 &&
            item.topicClusterKey?.trim() &&
            !usedClusterKeys.has(item.topicClusterKey),
        )
        .sort(
          (left, right) =>
            opportunityScore(right, target) - opportunityScore(left, target),
        );
      if (!unused.length) return false;

      const currentCounts = counts();
      const companyClusters = new Set(
        [...clusters.values()]
          .filter((cluster) => representative(cluster)?.companyName?.trim())
          .map((cluster) => cluster.key),
      );

      let best:
        | {
            opportunity: Opportunity;
            execution: PlanningExecutionSkeleton;
            score: number;
          }
        | undefined;

      for (const opportunity of unused) {
        for (const day of repaired.days) {
          if (!isMutable(day.date)) continue;
          for (const execution of day.executions) {
            if (execution.action !== 'post') continue;
            const currentOpportunity = byKey.get(
              execution.opportunityKey ?? '',
            );
            if (!currentOpportunity?.topicClusterKey) continue;
            const currentCluster = clusters.get(
              currentOpportunity.topicClusterKey,
            );
            if (!currentCluster) continue;
            const currentIntent = intentFor(currentCluster);
            const keepsCurrentCluster = currentCluster.surfaceCount > 1;
            const canLoseCurrentCluster =
              (currentCounts.get(currentIntent) ?? 0) - 1 >=
              minimum(currentIntent);
            if (!keepsCurrentCluster && !canLoseCurrentCluster) continue;
            if (
              !keepsCurrentCluster &&
              currentOpportunity.companyName?.trim() &&
              companyClusters.size <= 1
            ) {
              continue;
            }

            const score =
              opportunityScore(opportunity, target, execution.platform) +
              (keepsCurrentCluster ? 120 : 0) +
              ((opportunity.formats ?? []).includes(execution.format) ? 20 : 0);
            if (!best || score > best.score) {
              best = { opportunity, execution, score };
            }
          }
        }
      }

      if (!best) return false;
      applyIntent(best.opportunity.topicClusterKey, target);
      best.execution.opportunityKey = best.opportunity.key;
      best.execution.storyArcKey = '';
      best.execution.reason = `100K growth portfolio reconciled automatically: a duplicate derivative was replaced with a distinct grounded ${target} topic cluster instead of failing the whole week.`;
      clusters = collectClusters();
      return true;
    };

    const targets: Array<{ intent: GrowthIntent; min: number }> = [
      { intent: 'conversion', min: 1 },
      { intent: 'authority', min: 1 },
      { intent: 'discovery', min: 2 },
    ];

    for (const target of targets) {
      let safety = 0;
      while ((counts().get(target.intent) ?? 0) < target.min && safety < 8) {
        safety += 1;
        if (retagExistingCluster(target.intent)) continue;
        if (materializeUnusedCluster(target.intent)) continue;
        break;
      }
    }

    return repaired;
  }

  private repairGrowthPortfolioSafetyNet(
    blueprint: PlanningBlueprint,
    worldContext: PlanningWorldContext,
    presenceStrategy: PlanningPresenceStrategy,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    type Opportunity = GeneratedPlan['opportunities'][number];
    type GrowthIntent = Opportunity['growthIntent'];
    type EvidenceSeed = {
      id: string;
      title: string;
      kind: string;
      companyName?: string;
      category?: string;
    };

    const repaired = this.cloneBlueprintForPortfolioRepair(blueprint);
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);
    const narrativeKeys = new Set(
      (presenceStrategy.narratives ?? []).map((item) => item.key),
    );
    const byKey = () =>
      new Map(repaired.opportunities.map((item) => [item.key, item]));

    const collect = () => {
      const map = byKey();
      const clusters = new Map<
        string,
        {
          intent: GrowthIntent;
          surfaces: Array<{
            date: string;
            execution: PlanningExecutionSkeleton;
          }>;
          company: boolean;
        }
      >();
      for (const day of repaired.days) {
        for (const execution of day.executions) {
          if (execution.action !== 'post') continue;
          const opportunity = map.get(execution.opportunityKey ?? '');
          if (!opportunity?.topicClusterKey) continue;
          const info = clusters.get(opportunity.topicClusterKey) ?? {
            intent: opportunity.growthIntent,
            surfaces: [],
            company: Boolean(opportunity.companyName?.trim()),
          };
          info.intent = opportunity.growthIntent;
          info.company =
            info.company || Boolean(opportunity.companyName?.trim());
          info.surfaces.push({ date: day.date, execution });
          clusters.set(opportunity.topicClusterKey, info);
        }
      }
      const counts = new Map<GrowthIntent, number>();
      for (const info of clusters.values()) {
        counts.set(info.intent, (counts.get(info.intent) ?? 0) + 1);
      }
      return { clusters, counts };
    };

    const identitySeeds: EvidenceSeed[] = this.planningIdentityEvidence(
      worldContext,
    ).map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
      companyName: item.companyName,
    }));
    const wholeLifeSeeds: EvidenceSeed[] = (
      worldContext.wholeLifeSignals ?? []
    ).map((item) => ({
      id: item.id,
      title: item.title ?? item.summary ?? item.category,
      kind: 'whole_life',
      category: item.category,
    }));
    const publicSeeds: EvidenceSeed[] = this.planningPublicEvidence(
      worldContext,
    ).map((item) => ({
      id: item.id,
      title: item.title ?? item.summary ?? item.kind ?? 'current context',
      kind: item.kind ?? 'public_context',
      companyName:
        'companyName' in item && typeof item.companyName === 'string'
          ? item.companyName
          : undefined,
    }));
    const reflectionSeeds: EvidenceSeed[] = (
      worldContext.internalSafe ?? []
    ).map((item) => ({
      id: item.id,
      title: item.title ?? item.summary ?? item.kind ?? 'current reflection',
      kind: item.kind ?? 'internal_context',
    }));
    const seeds = [
      ...identitySeeds,
      ...wholeLifeSeeds,
      ...publicSeeds,
      ...reflectionSeeds,
    ].filter(
      (seed, index, items) =>
        items.findIndex((item) => item.id === seed.id) === index,
    );
    if (!seeds.length) return repaired;

    const chooseNarrative = (seed: EvidenceSeed, target: GrowthIntent) => {
      const text = [seed.title, seed.kind, seed.companyName, seed.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const preferred: string[] = [];
      if (/8lete|sport|academy|grassroot/.test(text))
        preferred.push('sports_workflows');
      if (/frayto|freight|logistic|shipment/.test(text))
        preferred.push('freight_workflows');
      if (/hsakaa|personal intelligence|digital twin/.test(text)) {
        preferred.push('personal_intelligence');
      }
      if (/hobby|learn|book|guitar|voice|japanese|chess/.test(text)) {
        preferred.push('learning_experiments', 'building_aakash');
      }
      if (/routine|gym|walk|run|practice/.test(text))
        preferred.push('building_aakash');
      if (target === 'authority')
        preferred.push('builder_operator', 'ideas_thinking');
      if (target === 'conversion') {
        preferred.push(
          'personal_intelligence',
          'building_aakash',
          'learning_experiments',
          'builder_operator',
        );
      }
      if (target === 'discovery') {
        preferred.push(
          'learning_experiments',
          'human_personality',
          'ideas_thinking',
        );
      }
      return (
        preferred.find((key) => narrativeKeys.has(key)) ??
        [...narrativeKeys][0] ??
        'ideas_thinking'
      );
    };

    const createOpportunity = (
      target: GrowthIntent,
      seed: EvidenceSeed,
      serial: number,
    ): Opportunity => {
      const fragment = this.planningKeyFragment(
        `${seed.companyName || seed.title || seed.kind}_${target}_${serial}`,
      );
      const strategyNarrativeKey = chooseNarrative(seed, target);
      const identityPillar: MediaPublicIdentityPillar = seed.companyName
        ? 'builder_operator'
        : strategyNarrativeKey === 'building_aakash'
          ? 'building_aakash'
          : strategyNarrativeKey === 'learning_experiments'
            ? 'learning_experiments'
            : strategyNarrativeKey === 'human_personality'
              ? 'human_unfiltered'
              : strategyNarrativeKey === 'builder_operator' ||
                  strategyNarrativeKey === 'sports_workflows' ||
                  strategyNarrativeKey === 'freight_workflows'
                ? 'builder_operator'
                : 'ideas_thinking';
      const subject = seed.companyName?.trim() || seed.title || 'this journey';
      const title =
        target === 'conversion'
          ? `${subject}: the next checkpoint`
          : target === 'discovery'
            ? `One open question from ${subject}`
            : `What I am learning while working on ${subject}`;
      const whyNow =
        target === 'conversion'
          ? "Make the future payoff explicit: this is one step in Aakash's ongoing journey, with a real unresolved question, next checkpoint or future comparison worth returning for. Never use generic follow-for-more language."
          : target === 'discovery'
            ? 'Use a specific, native, curiosity-led angle that can introduce Aakash to people who do not know him yet without inventing facts.'
            : 'Use first-person builder/operator reasoning grounded in the supplied context; avoid generic textbook advice.';
      return {
        key: `repair_growth_${fragment}`,
        title,
        thesis:
          target === 'conversion'
            ? `Document a truthful current checkpoint and what comes next; do not claim an outcome that has not happened.`
            : target === 'discovery'
              ? `Turn this grounded context into one concrete question, contrast or visual idea with broad entry value.`
              : `Extract one bounded first-person operating judgment from this grounded context.`,
        whyNow,
        sourceSummary:
          seed.kind.startsWith('company') || seed.kind === 'hsakaa_identity'
            ? 'Identity-safe evidence. Only stable identity-level facts may be asserted; all current work detail must remain first-person, conditional or abstract unless separately public-safe.'
            : 'Grounded HSAKAA context used only within its privacy/evidence boundary.',
        evidenceIds: [seed.id],
        companyName: seed.companyName?.trim() || '',
        narrative: `repair_${target}_journey`,
        strategyNarrativeKey,
        topicClusterKey: `cluster_repair_growth_${fragment}`,
        growthIntent: target,
        identityPillar,
        platforms: [
          MediaPlatform.LINKEDIN,
          MediaPlatform.INSTAGRAM,
          MediaPlatform.YOUTUBE,
          MediaPlatform.X,
        ],
        formats: [
          MediaPostType.TEXT,
          MediaPostType.CAROUSEL,
          MediaPostType.REEL,
          MediaPostType.SHORT,
          MediaPostType.VIDEO,
        ],
        strategicFit: 88,
        novelty: target === 'discovery' ? 92 : 82,
        evidenceStrength: 70,
        privacy: 'public_safe',
        usable: true,
      };
    };

    const minimum = (intent: GrowthIntent) =>
      intent === 'discovery'
        ? 2
        : intent === 'conversion' || intent === 'authority'
          ? 1
          : 0;

    const assignDistinctCluster = (opportunity: Opportunity) => {
      const { clusters, counts } = collect();
      const map = byKey();
      const companyClusterCount = [...clusters.values()].filter(
        (item) => item.company,
      ).length;
      const replaceable = [...clusters.entries()]
        .flatMap(([clusterKey, info]) =>
          info.surfaces.map((surface) => ({ clusterKey, info, surface })),
        )
        .filter(({ info, surface }) => {
          if (!mutable(surface.date)) return false;
          if (info.surfaces.length > 1) return true;
          if (info.company && companyClusterCount <= 1) return false;
          return (counts.get(info.intent) ?? 0) - 1 >= minimum(info.intent);
        })
        .sort((left, right) => {
          const leftDuplicate = left.info.surfaces.length > 1 ? 1 : 0;
          const rightDuplicate = right.info.surfaces.length > 1 ? 1 : 0;
          if (leftDuplicate !== rightDuplicate)
            return rightDuplicate - leftDuplicate;
          const leftOpportunity = map.get(
            left.surface.execution.opportunityKey ?? '',
          );
          const rightOpportunity = map.get(
            right.surface.execution.opportunityKey ?? '',
          );
          return (
            (leftOpportunity?.strategicFit ?? 0) -
            (rightOpportunity?.strategicFit ?? 0)
          );
        })[0];
      if (replaceable) {
        replaceable.surface.execution.opportunityKey = opportunity.key;
        replaceable.surface.execution.storyArcKey = '';
        replaceable.surface.execution.reason = `Growth portfolio safety-net replaced a redundant derivative with a distinct grounded ${opportunity.growthIntent} cluster.`;
        return true;
      }

      for (const day of repaired.days) {
        if (!mutable(day.date)) continue;
        const slot = day.executions.find(
          (item) =>
            item.action === 'skip' && item.platform !== MediaPlatform.WHATSAPP,
        );
        if (!slot) continue;
        slot.action = 'post';
        slot.time = this.defaultPostingTime(slot.platform);
        slot.format = this.fallbackFormatForPlatform(slot.platform);
        slot.opportunityKey = opportunity.key;
        slot.storyArcKey = '';
        slot.reason = `Growth portfolio safety-net activated a grounded ${opportunity.growthIntent} slot instead of failing the week.`;
        return true;
      }
      return false;
    };

    const targets: Array<{ intent: GrowthIntent; min: number }> = [
      { intent: 'conversion', min: 1 },
      { intent: 'authority', min: 1 },
      { intent: 'discovery', min: 2 },
    ];
    let seedIndex = 0;
    let serial = 0;
    for (const target of targets) {
      let safety = 0;
      while (
        (collect().counts.get(target.intent) ?? 0) < target.min &&
        safety < 6
      ) {
        safety += 1;
        const usedEvidence = new Set(
          repaired.opportunities
            .filter((item) =>
              [...collect().clusters.keys()].includes(item.topicClusterKey),
            )
            .flatMap((item) => item.evidenceIds),
        );
        const seed =
          seeds.find((item) => !usedEvidence.has(item.id)) ??
          seeds[seedIndex % seeds.length];
        seedIndex += 1;
        serial += 1;
        const opportunity = createOpportunity(target.intent, seed, serial);
        repaired.opportunities.push(opportunity);
        if (!assignDistinctCluster(opportunity)) break;
      }
    }

    return repaired;
  }

  private repairShortFormCadence(
    blueprint: PlanningBlueprint,
    cadence: PlanningCadence,
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const shortFormats = new Set<MediaPostType>([
      MediaPostType.REEL,
      MediaPostType.SHORT,
      MediaPostType.CAROUSEL,
    ]);
    const countShortForm = (days: PlanningBlueprint['days']) =>
      days.reduce(
        (total, day) =>
          total +
          day.executions.filter(
            (item) => item.action === 'post' && shortFormats.has(item.format),
          ).length,
        0,
      );

    let shortCount = countShortForm(blueprint.days);
    if (
      shortCount >= cadence.shortFormAndCarouselsMin &&
      shortCount <= cadence.shortFormAndCarouselsMax
    ) {
      return blueprint;
    }

    const days = blueprint.days.map((day) => ({
      ...day,
      executions: day.executions.map((item) => ({ ...item })),
      instagramStory: {
        ...day.instagramStory,
        sourceEvidenceIds: [...(day.instagramStory.sourceEvidenceIds ?? [])],
      },
      youtubeCommunity: {
        ...day.youtubeCommunity,
        sourceEvidenceIds: [...(day.youtubeCommunity?.sourceEvidenceIds ?? [])],
      },
      engagement: [...(day.engagement ?? [])],
    }));
    const repaired: PlanningBlueprint = { ...blueprint, days };
    const opportunities = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);

    const preferredShortFormats = (platform: MediaPlatform) => {
      if (platform === MediaPlatform.INSTAGRAM) {
        return [MediaPostType.REEL, MediaPostType.CAROUSEL];
      }
      if (platform === MediaPlatform.LINKEDIN) {
        return [MediaPostType.CAROUSEL];
      }
      if (platform === MediaPlatform.YOUTUBE) {
        return [MediaPostType.SHORT];
      }
      return [];
    };

    const preferredLongFormats = (platform: MediaPlatform) => {
      if (platform === MediaPlatform.LINKEDIN) {
        return [MediaPostType.TEXT, MediaPostType.IMAGE, MediaPostType.ARTICLE];
      }
      if (platform === MediaPlatform.INSTAGRAM) {
        return [MediaPostType.IMAGE];
      }
      if (platform === MediaPlatform.X) {
        return [MediaPostType.TEXT, MediaPostType.THREAD, MediaPostType.IMAGE];
      }
      return [];
    };

    type CadenceCandidate = {
      dayIndex: number;
      executionIndex: number;
      targetFormat: MediaPostType;
      score: number;
    };

    const candidateFor = (
      dayIndex: number,
      executionIndex: number,
      direction: 'add_short' | 'remove_short',
    ): CadenceCandidate | null => {
      const day = repaired.days[dayIndex];
      const execution = day?.executions[executionIndex];
      if (
        !day ||
        !execution ||
        execution.action !== 'post' ||
        !mutable(day.date)
      ) {
        return null;
      }
      if (
        direction === 'add_short' &&
        (shortFormats.has(execution.format) ||
          (execution.platform === MediaPlatform.YOUTUBE &&
            execution.format === MediaPostType.VIDEO))
      ) {
        return null;
      }
      if (direction === 'remove_short' && !shortFormats.has(execution.format)) {
        return null;
      }

      const opportunity = opportunities.get(execution.opportunityKey ?? '');
      if (!opportunity?.usable || opportunity.privacy !== 'public_safe') {
        return null;
      }
      const targets =
        direction === 'add_short'
          ? preferredShortFormats(execution.platform)
          : preferredLongFormats(execution.platform);
      // Opportunity.formats is a planning preference, not a safety gate. If
      // the model forgot to advertise CAROUSEL/REEL for an otherwise-grounded
      // idea, the deterministic calendar is still allowed to choose a
      // platform-native short format. Final execution is generated later from
      // the same opportunity and evidence.
      const targetFormat =
        targets.find((format) =>
          (opportunity.formats ?? []).includes(format),
        ) ?? targets[0];
      if (!targetFormat) return null;

      const platformScore =
        execution.platform === MediaPlatform.INSTAGRAM
          ? 40
          : execution.platform === MediaPlatform.LINKEDIN
            ? 30
            : execution.platform === MediaPlatform.YOUTUBE
              ? 20
              : 10;
      const growthScore =
        opportunity.growthIntent === 'discovery'
          ? 18
          : opportunity.growthIntent === 'conversion'
            ? 14
            : opportunity.growthIntent === 'affinity'
              ? 8
              : 4;
      return {
        dayIndex,
        executionIndex,
        targetFormat,
        score: platformScore + growthScore + (opportunity.novelty ?? 0) / 10,
      };
    };

    if (shortCount < cadence.shortFormAndCarouselsMin) {
      const candidates: CadenceCandidate[] = [];
      for (const [dayIndex, day] of repaired.days.entries()) {
        for (const [executionIndex] of day.executions.entries()) {
          const candidate = candidateFor(dayIndex, executionIndex, 'add_short');
          if (candidate) candidates.push(candidate);
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      for (const candidate of candidates) {
        if (shortCount >= cadence.shortFormAndCarouselsMin) break;
        const execution =
          repaired.days[candidate.dayIndex].executions[
            candidate.executionIndex
          ];
        execution.format = candidate.targetFormat;
        execution.reason =
          'Format rebalanced automatically to meet the sustainable weekly short-form/carousel cadence without adding another topic or post.';
        shortCount += 1;
      }

      // If format conversion alone cannot close the gap, fill an existing SKIP
      // on LinkedIn/Instagram from a grounded opportunity. This handles severe
      // model misses such as 3 planned shorts against a 5-6 contract without
      // forcing a second paid blueprint generation.
      if (shortCount < cadence.shortFormAndCarouselsMin) {
        const platformCounts = new Map<MediaPlatform, number>();
        for (const day of repaired.days) {
          for (const execution of day.executions) {
            if (execution.action !== 'post') continue;
            platformCounts.set(
              execution.platform,
              (platformCounts.get(execution.platform) ?? 0) + 1,
            );
          }
        }
        const usableOpportunities = repaired.opportunities
          .filter(
            (item) =>
              item.usable &&
              item.privacy === 'public_safe' &&
              item.evidenceIds.length,
          )
          .sort((left, right) => {
            const score = (item: (typeof repaired.opportunities)[number]) =>
              (PERSONAL_STRATEGY_NARRATIVES.has(item.strategyNarrativeKey)
                ? 0
                : 80) +
              (item.companyName?.trim() ? 20 : 0) +
              (item.growthIntent === 'conversion' ? 15 : 0) +
              (item.strategicFit ?? 0) / 5 +
              (item.novelty ?? 0) / 10;
            return score(right) - score(left);
          });
        const fillPlatforms = [MediaPlatform.INSTAGRAM, MediaPlatform.LINKEDIN];
        for (const platform of fillPlatforms) {
          if (shortCount >= cadence.shortFormAndCarouselsMin) break;
          const platformTarget = cadence.platforms[platform];
          if (!platformTarget) continue;
          for (const day of repaired.days) {
            if (shortCount >= cadence.shortFormAndCarouselsMin) break;
            if (!mutable(day.date)) continue;
            if ((platformCounts.get(platform) ?? 0) >= platformTarget.max) {
              break;
            }
            const execution = day.executions.find(
              (item) => item.platform === platform && item.action === 'skip',
            );
            if (!execution) continue;
            const opportunity =
              usableOpportunities.find((item) =>
                (item.platforms ?? []).includes(platform),
              ) ?? usableOpportunities[0];
            if (!opportunity) break;
            const targetFormat = preferredShortFormats(platform)[0];
            if (!targetFormat) continue;
            execution.action = 'post';
            execution.time = this.defaultPostingTime(platform);
            execution.format = targetFormat;
            execution.opportunityKey = opportunity.key;
            execution.storyArcKey = '';
            execution.reason =
              'Missing short-form cadence slot restored automatically from grounded strategy material; no new factual claim was introduced.';
            platformCounts.set(
              platform,
              (platformCounts.get(platform) ?? 0) + 1,
            );
            shortCount += 1;
          }
        }
      }
    } else if (shortCount > cadence.shortFormAndCarouselsMax) {
      const candidates: CadenceCandidate[] = [];
      for (const [dayIndex, day] of repaired.days.entries()) {
        for (const [executionIndex] of day.executions.entries()) {
          const candidate = candidateFor(
            dayIndex,
            executionIndex,
            'remove_short',
          );
          if (candidate) candidates.push(candidate);
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      for (const candidate of candidates) {
        if (shortCount <= cadence.shortFormAndCarouselsMax) break;
        const execution =
          repaired.days[candidate.dayIndex].executions[
            candidate.executionIndex
          ];
        execution.format = candidate.targetFormat;
        execution.reason =
          'Format rebalanced automatically to keep the weekly short-form/carousel cadence sustainable without deleting the underlying topic.';
        shortCount -= 1;
      }
    }

    return repaired;
  }

  private repairHobbySurfaceSaturation(
    blueprint: PlanningBlueprint,
    wholeLifeSignals: PlanningWholeLifeSignal[],
    mutableDates?: Set<string>,
  ): PlanningBlueprint {
    const hobbyEvidenceIds = new Set(
      (wholeLifeSignals ?? [])
        .filter((item) => item.category === 'hobby')
        .map((item) => item.id),
    );
    if (!hobbyEvidenceIds.size) return blueprint;

    const days = blueprint.days.map((day) => ({
      ...day,
      executions: day.executions.map((item) => ({ ...item })),
      instagramStory: {
        ...day.instagramStory,
        sourceEvidenceIds: [...(day.instagramStory.sourceEvidenceIds ?? [])],
      },
      youtubeCommunity: {
        ...day.youtubeCommunity,
        sourceEvidenceIds: [...(day.youtubeCommunity?.sourceEvidenceIds ?? [])],
      },
      engagement: [...(day.engagement ?? [])],
    }));
    const repaired: PlanningBlueprint = { ...blueprint, days };
    const opportunities = new Map(
      repaired.opportunities.map((item) => [item.key, item]),
    );
    const mutable = (date: string) => !mutableDates || mutableDates.has(date);

    type HobbySurfaceUse = {
      evidenceId: string;
      date: string;
      kind: 'feed' | 'story' | 'community';
      dayIndex: number;
      executionIndex?: number;
      score: number;
      mutable: boolean;
    };

    const surfaceUses = () => {
      const uses = new Map<string, HobbySurfaceUse[]>();
      const add = (use: HobbySurfaceUse) => {
        const items = uses.get(use.evidenceId) ?? [];
        items.push(use);
        uses.set(use.evidenceId, items);
      };
      for (const [dayIndex, day] of repaired.days.entries()) {
        for (const [executionIndex, execution] of day.executions.entries()) {
          if (execution.action !== 'post') continue;
          const opportunity = opportunities.get(execution.opportunityKey ?? '');
          if (!opportunity) continue;
          const platformScore =
            execution.platform === MediaPlatform.INSTAGRAM
              ? 105
              : execution.platform === MediaPlatform.YOUTUBE
                ? execution.format === MediaPostType.VIDEO
                  ? 110
                  : 100
                : execution.platform === MediaPlatform.X
                  ? 70
                  : execution.platform === MediaPlatform.LINKEDIN
                    ? 60
                    : 50;
          for (const evidenceId of opportunity.evidenceIds ?? []) {
            if (!hobbyEvidenceIds.has(evidenceId)) continue;
            add({
              evidenceId,
              date: day.date,
              kind: 'feed',
              dayIndex,
              executionIndex,
              score: platformScore,
              mutable: mutable(day.date),
            });
          }
        }
        if (day.instagramStory.action === 'post') {
          for (const evidenceId of day.instagramStory.sourceEvidenceIds ?? []) {
            if (!hobbyEvidenceIds.has(evidenceId)) continue;
            add({
              evidenceId,
              date: day.date,
              kind: 'story',
              dayIndex,
              score: 95,
              mutable: mutable(day.date),
            });
          }
        }
        if (day.youtubeCommunity?.action === 'post') {
          for (const evidenceId of day.youtubeCommunity.sourceEvidenceIds ??
            []) {
            if (!hobbyEvidenceIds.has(evidenceId)) continue;
            add({
              evidenceId,
              date: day.date,
              kind: 'community',
              dayIndex,
              score: 75,
              mutable: mutable(day.date),
            });
          }
        }
      }
      return uses;
    };

    const clusterUseCounts = () => {
      const counts = new Map<string, number>();
      for (const day of repaired.days) {
        for (const execution of day.executions) {
          if (execution.action !== 'post') continue;
          const opportunity = opportunities.get(execution.opportunityKey ?? '');
          if (!opportunity?.topicClusterKey) continue;
          counts.set(
            opportunity.topicClusterKey,
            (counts.get(opportunity.topicClusterKey) ?? 0) + 1,
          );
        }
      }
      return counts;
    };

    const chooseAlternativeOpportunity = (
      platform: MediaPlatform | undefined,
      format: MediaPostType | undefined,
      blockedEvidenceId: string,
    ) => {
      const clusterCounts = clusterUseCounts();
      return repaired.opportunities
        .filter((item) => {
          const currentClusterUses =
            clusterCounts.get(item.topicClusterKey) ?? 0;
          return (
            item.usable &&
            item.privacy === 'public_safe' &&
            !(item.evidenceIds ?? []).some((id) => hobbyEvidenceIds.has(id)) &&
            !(item.evidenceIds ?? []).includes(blockedEvidenceId) &&
            !(
              PERSONAL_STRATEGY_NARRATIVES.has(item.strategyNarrativeKey) &&
              currentClusterUses >= 2
            )
          );
        })
        .sort((a, b) => {
          const aCount = clusterCounts.get(a.topicClusterKey) ?? 0;
          const bCount = clusterCounts.get(b.topicClusterKey) ?? 0;
          if (aCount !== bCount) return aCount - bCount;
          const aPlatform = platform && a.platforms?.includes(platform) ? 1 : 0;
          const bPlatform = platform && b.platforms?.includes(platform) ? 1 : 0;
          if (aPlatform !== bPlatform) return bPlatform - aPlatform;
          const aFormat = format && a.formats?.includes(format) ? 1 : 0;
          const bFormat = format && b.formats?.includes(format) ? 1 : 0;
          if (aFormat !== bFormat) return bFormat - aFormat;
          if ((a.novelty ?? 0) !== (b.novelty ?? 0)) {
            return (b.novelty ?? 0) - (a.novelty ?? 0);
          }
          return (b.strategicFit ?? 0) - (a.strategicFit ?? 0);
        })[0];
    };

    const repairUse = (use: HobbySurfaceUse) => {
      if (!use.mutable) return false;
      const day = repaired.days[use.dayIndex];
      if (!day) return false;

      if (use.kind === 'feed' && use.executionIndex !== undefined) {
        const execution = day.executions[use.executionIndex];
        if (!execution || execution.action !== 'post') return false;
        const replacement = chooseAlternativeOpportunity(
          execution.platform,
          execution.format,
          use.evidenceId,
        );
        if (!replacement) return false;
        execution.opportunityKey = replacement.key;
        execution.storyArcKey = '';
        execution.reason =
          'Rebalanced automatically to keep one hobby signal from saturating the weekly plan.';
        return true;
      }

      if (use.kind === 'story') {
        const remaining = day.instagramStory.sourceEvidenceIds.filter(
          (id) => id !== use.evidenceId,
        );
        if (remaining.length) {
          day.instagramStory.sourceEvidenceIds = remaining;
          return true;
        }
        const replacement = chooseAlternativeOpportunity(
          MediaPlatform.INSTAGRAM,
          undefined,
          use.evidenceId,
        );
        if (!replacement?.evidenceIds?.length) return false;
        day.instagramStory.sourceEvidenceIds = replacement.evidenceIds.slice(
          0,
          3,
        );
        day.instagramStory.sourceType = this.sourceTypeForPillar(
          replacement.identityPillar,
        );
        day.instagramStory.reason =
          'Use a different real context signal so one hobby does not dominate the week.';
        day.instagramStory.captureBrief =
          'Capture one small private-safe moment from this context only if it actually happens today; do not stage or invent the moment.';
        return true;
      }

      if (use.kind === 'community') {
        const remaining = day.youtubeCommunity.sourceEvidenceIds.filter(
          (id) => id !== use.evidenceId,
        );
        if (remaining.length) {
          day.youtubeCommunity.sourceEvidenceIds = remaining;
          return true;
        }
        const replacement = chooseAlternativeOpportunity(
          MediaPlatform.YOUTUBE,
          undefined,
          use.evidenceId,
        );
        if (!replacement?.evidenceIds?.length) return false;
        day.youtubeCommunity.sourceEvidenceIds = replacement.evidenceIds.slice(
          0,
          3,
        );
        day.youtubeCommunity.sourceType = this.sourceTypeForPillar(
          replacement.identityPillar,
        );
        day.youtubeCommunity.reason =
          'Use a different real context signal so one hobby does not dominate the week.';
        return true;
      }
      return false;
    };

    for (let pass = 0; pass < 4; pass += 1) {
      const uses = surfaceUses();
      let changed = false;
      for (const [evidenceId, items] of uses) {
        if (items.length <= HOBBY_MAX_WEEKLY_SURFACES_PER_SIGNAL) continue;
        const immutableItems = items.filter((item) => !item.mutable);
        const mutableItems = items
          .filter((item) => item.mutable)
          .sort((a, b) => b.score - a.score);
        const keepMutableCount = Math.max(
          0,
          HOBBY_MAX_WEEKLY_SURFACES_PER_SIGNAL - immutableItems.length,
        );
        const extras = mutableItems.slice(keepMutableCount);
        for (const extra of extras) {
          changed = repairUse({ ...extra, evidenceId }) || changed;
        }
      }
      if (!changed) break;
    }

    return repaired;
  }

  private applyRepairedSingleDayBlueprint(
    fresh: PlanningBlueprint,
    merged: PlanningBlueprint,
    targetDate: string,
  ): PlanningBlueprint {
    const repairedDay = merged.days.find((day) => day.date === targetDate);
    if (!repairedDay) return fresh;
    const referencedOpportunityKeys = new Set(
      repairedDay.executions
        .filter((item) => item.action === 'post')
        .map((item) => item.opportunityKey)
        .filter((value): value is string => Boolean(value)),
    );
    const freshOpportunityKeys = new Set(
      fresh.opportunities.map((item) => item.key),
    );
    const borrowedOpportunities = merged.opportunities.filter(
      (item) =>
        referencedOpportunityKeys.has(item.key) &&
        !freshOpportunityKeys.has(item.key),
    );
    return {
      ...fresh,
      opportunities: [...fresh.opportunities, ...borrowedOpportunities],
      days: [repairedDay],
    };
  }

  private assertBlueprint(
    blueprint: PlanningBlueprint,
    startDate: string,
    endDate: string,
    publicEvidenceIds: string[],
    reflectionEvidenceIds: string[],
    identityEvidenceIds: string[],
    presenceStrategy: PlanningPresenceStrategy,
    cadence: PlanningCadence,
    wholeLifeSignals: PlanningWholeLifeSignal[],
  ) {
    if (blueprint.days.length !== 7) {
      throw new Error(
        `Planner blueprint must return exactly 7 days; received ${blueprint.days.length}.`,
      );
    }
    if (
      blueprint.startDate !== startDate ||
      blueprint.endDate !== endDate ||
      blueprint.days[0]?.date !== startDate ||
      blueprint.days[6]?.date !== endDate
    ) {
      throw new Error(
        'Planner blueprint returned dates outside the requested seven-day window.',
      );
    }

    const publicEvidence = new Set(publicEvidenceIds);
    const reflectionEvidence = new Set(reflectionEvidenceIds);
    const identityEvidence = new Set(identityEvidenceIds);
    const validEvidence = new Set([
      ...publicEvidenceIds,
      ...reflectionEvidenceIds,
      ...identityEvidenceIds,
    ]);
    const strategyNarrativeKeys = new Set(
      (presenceStrategy.narratives ?? []).map((item) => item.key),
    );
    const hobbyEvidenceIds = new Set(
      (wholeLifeSignals ?? [])
        .filter((item) => item.category === 'hobby')
        .map((item) => item.id),
    );
    const opportunities = new Map(
      blueprint.opportunities.map((item) => [item.key, item]),
    );

    for (const opportunity of blueprint.opportunities) {
      if (opportunity.privacy === 'needs_review' && opportunity.usable) {
        throw new Error(
          `Opportunity ${opportunity.key} is needs_review and cannot be automatically usable.`,
        );
      }
      if (
        strategyNarrativeKeys.size &&
        !strategyNarrativeKeys.has(opportunity.strategyNarrativeKey)
      ) {
        throw new Error(
          `Opportunity ${opportunity.key} uses unknown Presence narrative ${opportunity.strategyNarrativeKey}.`,
        );
      }
      if (!opportunity.topicClusterKey?.trim()) {
        throw new Error(
          `Opportunity ${opportunity.key} must declare a topicClusterKey so derivatives count as one idea.`,
        );
      }
      if (
        ![
          'authority',
          'discovery',
          'conversion',
          'affinity',
          'conversation',
        ].includes(opportunity.growthIntent)
      ) {
        throw new Error(
          `Opportunity ${opportunity.key} must declare a valid growthIntent.`,
        );
      }
      if (opportunity.privacy === 'public_safe') {
        if (!opportunity.evidenceIds.length) {
          throw new Error(
            `Public-safe opportunity ${opportunity.key} must reference real HSAKAA evidence IDs.`,
          );
        }
        const fabricated = opportunity.evidenceIds.filter(
          (id) => !validEvidence.has(id),
        );
        if (fabricated.length) {
          throw new Error(
            `Opportunity ${opportunity.key} references fabricated or unavailable HSAKAA evidence IDs: ${fabricated.join(', ')}.`,
          );
        }
        const hasPublicEvidence = opportunity.evidenceIds.some((id) =>
          publicEvidence.has(id),
        );
        const hasIdentityEvidence = opportunity.evidenceIds.some((id) =>
          identityEvidence.has(id),
        );
        if (
          opportunity.companyName?.trim() &&
          !hasPublicEvidence &&
          !hasIdentityEvidence
        ) {
          throw new Error(
            `Named-company opportunity ${opportunity.key} requires identity-safe evidence when no public company evidence is available.`,
          );
        }
      }
    }

    let weeklyPostCount = 0;
    let longFormVideos = 0;
    let wholePersonLongFormVideos = 0;
    let shortFormAndCarousels = 0;
    let instagramStoryDays = 0;
    let youtubeCommunityDays = 0;
    const weeklyPlatformPosts = new Map<MediaPlatform, number>();
    const clusterNarrative = new Map<string, string>();
    const clusterGrowthIntent = new Map<string, string>();
    const clusterFeedSurfaces = new Map<string, Set<string>>();
    const hobbySurfaces = new Map<string, Set<string>>();
    const ownedCompanyClusters = new Set<string>();

    const addHobbySurface = (evidenceId: string, surface: string) => {
      if (!hobbyEvidenceIds.has(evidenceId)) return;
      const surfaces = hobbySurfaces.get(evidenceId) ?? new Set<string>();
      surfaces.add(surface);
      hobbySurfaces.set(evidenceId, surfaces);
    };

    for (const day of blueprint.days) {
      if (day.executions.length !== GROWTH_PLATFORMS.length) {
        throw new Error(
          `Planner blueprint must return exactly one POST or SKIP decision for each primary platform on ${day.date}; received ${day.executions.length}.`,
        );
      }
      const seen = new Set<MediaPlatform>();
      for (const item of day.executions) {
        if (seen.has(item.platform)) {
          throw new Error(
            `Planner blueprint returned multiple decisions for ${item.platform} on ${day.date}.`,
          );
        }
        seen.add(item.platform);
        if (item.action !== 'post') continue;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) {
          throw new Error(`Invalid posting time ${item.time} on ${day.date}.`);
        }
        weeklyPostCount += 1;
        weeklyPlatformPosts.set(
          item.platform,
          (weeklyPlatformPosts.get(item.platform) ?? 0) + 1,
        );
        if (!item.opportunityKey?.trim()) {
          throw new Error(
            `POST decision for ${item.platform} on ${day.date} must reference an opportunity.`,
          );
        }
        const opportunity = opportunities.get(item.opportunityKey);
        if (!opportunity) {
          throw new Error(
            `POST decision for ${item.platform} on ${day.date} references unknown opportunity ${item.opportunityKey}.`,
          );
        }
        if (opportunity.privacy !== 'public_safe' || !opportunity.usable) {
          throw new Error(
            `POST decision for ${item.platform} on ${day.date} references evidence that is not approved public-safe planning material.`,
          );
        }
        if (
          !MEDIA_PUBLIC_IDENTITY_PILLARS.includes(opportunity.identityPillar)
        ) {
          throw new Error(
            `Opportunity ${opportunity.key} has invalid identity pillar ${String(opportunity.identityPillar)}.`,
          );
        }

        clusterNarrative.set(
          opportunity.topicClusterKey,
          opportunity.strategyNarrativeKey,
        );
        clusterGrowthIntent.set(
          opportunity.topicClusterKey,
          opportunity.growthIntent,
        );
        if (
          opportunity.companyName?.trim() &&
          opportunity.evidenceIds.some(
            (id) => publicEvidence.has(id) || identityEvidence.has(id),
          )
        ) {
          ownedCompanyClusters.add(opportunity.topicClusterKey);
        }
        const feedSurfaces =
          clusterFeedSurfaces.get(opportunity.topicClusterKey) ??
          new Set<string>();
        feedSurfaces.add(`${day.date}:${item.platform}`);
        clusterFeedSurfaces.set(opportunity.topicClusterKey, feedSurfaces);
        for (const evidenceId of opportunity.evidenceIds) {
          addHobbySurface(evidenceId, `${day.date}:${item.platform}:feed`);
        }

        if (
          item.platform === MediaPlatform.YOUTUBE &&
          item.format === MediaPostType.VIDEO
        ) {
          longFormVideos += 1;
          if (
            WHOLE_PERSON_STRATEGY_NARRATIVES.has(
              opportunity.strategyNarrativeKey,
            )
          ) {
            wholePersonLongFormVideos += 1;
          }
        }
        if (
          [
            MediaPostType.REEL,
            MediaPostType.SHORT,
            MediaPostType.CAROUSEL,
          ].includes(item.format)
        ) {
          shortFormAndCarousels += 1;
        }
      }

      if (day.instagramStory.action === 'post') {
        instagramStoryDays += 1;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.instagramStory.time)) {
          throw new Error(
            `Invalid Instagram Story time ${day.instagramStory.time} on ${day.date}.`,
          );
        }
        if (!day.instagramStory.sourceEvidenceIds.length) {
          throw new Error(
            `Instagram Story on ${day.date} must reference HSAKAA context evidence.`,
          );
        }
        const fabricatedStoryEvidence =
          day.instagramStory.sourceEvidenceIds.filter(
            (id) => !validEvidence.has(id),
          );
        if (fabricatedStoryEvidence.length) {
          throw new Error(
            `Instagram Story on ${day.date} references unavailable evidence IDs: ${fabricatedStoryEvidence.join(', ')}.`,
          );
        }
        for (const evidenceId of day.instagramStory.sourceEvidenceIds) {
          addHobbySurface(evidenceId, `${day.date}:instagram:story`);
        }
      }

      if (day.youtubeCommunity?.action === 'post') {
        youtubeCommunityDays += 1;
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.youtubeCommunity.time)) {
          throw new Error(
            `Invalid YouTube Community time ${day.youtubeCommunity.time} on ${day.date}.`,
          );
        }
        if (!day.youtubeCommunity.sourceEvidenceIds.length) {
          throw new Error(
            `YouTube Community post on ${day.date} must reference HSAKAA context evidence.`,
          );
        }
        const fabricatedCommunityEvidence =
          day.youtubeCommunity.sourceEvidenceIds.filter(
            (id) => !validEvidence.has(id),
          );
        if (fabricatedCommunityEvidence.length) {
          throw new Error(
            `YouTube Community post on ${day.date} references unavailable evidence IDs: ${fabricatedCommunityEvidence.join(', ')}.`,
          );
        }
        for (const evidenceId of day.youtubeCommunity.sourceEvidenceIds) {
          addHobbySurface(evidenceId, `${day.date}:youtube:community`);
        }
      }

      for (const platform of GROWTH_PLATFORMS) {
        if (!seen.has(platform)) {
          throw new Error(
            `Planner blueprint omitted ${platform} on ${day.date}; every primary platform needs an explicit POST or SKIP decision.`,
          );
        }
      }
    }

    const usableEvidenceCount = publicEvidence.size + reflectionEvidence.size;
    const minimumPosts =
      usableEvidenceCount >= 3 ? 10 : usableEvidenceCount > 0 ? 3 : 0;
    if (usableEvidenceCount < 3) return;

    // Everything below this point is a strategic quality target, not a
    // truth/safety boundary. The deterministic repair layer above gets first
    // responsibility for cadence, portfolio, diversity and saturation. If the
    // supplied grounded context makes one target mathematically impossible, do
    // not burn the entire paid seven-day run. Preserve the best truthful week
    // and allow future context/performance learning to improve it.
    const strategicIssues: string[] = [];
    if (weeklyPostCount < minimumPosts) {
      strategicIssues.push(
        `weekly POST volume ${weeklyPostCount}/${minimumPosts}`,
      );
    }
    if (longFormVideos !== cadence.longFormVideos) {
      strategicIssues.push(
        `long-form ${longFormVideos}/${cadence.longFormVideos}`,
      );
    }
    if (
      shortFormAndCarousels < cadence.shortFormAndCarouselsMin ||
      shortFormAndCarousels > cadence.shortFormAndCarouselsMax
    ) {
      strategicIssues.push(
        `short-form ${shortFormAndCarousels}/${cadence.shortFormAndCarouselsMin}-${cadence.shortFormAndCarouselsMax}`,
      );
    }
    if (instagramStoryDays !== cadence.instagramStories) {
      strategicIssues.push(
        `Instagram Stories ${instagramStoryDays}/${cadence.instagramStories}`,
      );
    }
    if (
      youtubeCommunityDays < cadence.youtubeCommunityMin ||
      youtubeCommunityDays > cadence.youtubeCommunityMax
    ) {
      strategicIssues.push(
        `YouTube Community ${youtubeCommunityDays}/${cadence.youtubeCommunityMin}-${cadence.youtubeCommunityMax}`,
      );
    }
    for (const platform of GROWTH_PLATFORMS) {
      const target = cadence.platforms[platform];
      if (!target) continue;
      const count = weeklyPlatformPosts.get(platform) ?? 0;
      if (count < target.min || count > target.max) {
        strategicIssues.push(
          `${target.label} ${count}/${target.min}-${target.max}`,
        );
      }
    }

    const hasConfiguredCompanyIdentity = identityEvidenceIds.some((id) =>
      id.startsWith('identity:company:'),
    );
    if (hasConfiguredCompanyIdentity && ownedCompanyClusters.size < 1) {
      strategicIssues.push('owned company-builder journey missing');
    }

    const clusterCount = clusterNarrative.size;
    const usedNarratives = new Set(clusterNarrative.values());
    const minimumNarratives = Math.min(
      5,
      Math.max(1, strategyNarrativeKeys.size),
      clusterCount,
    );
    if (
      strategyNarrativeKeys.size >= 5 &&
      clusterCount >= 5 &&
      usedNarratives.size < minimumNarratives
    ) {
      strategicIssues.push(
        `narrative diversity ${usedNarratives.size}/${minimumNarratives}`,
      );
    }
    if (clusterCount >= 5) {
      const counts = new Map<string, number>();
      for (const narrative of clusterNarrative.values()) {
        counts.set(narrative, (counts.get(narrative) ?? 0) + 1);
      }
      for (const [narrative, count] of counts) {
        if (count / clusterCount > 0.4) {
          strategicIssues.push(
            `narrative saturation ${narrative}:${Math.round((count / clusterCount) * 100)}%`,
          );
        }
      }
    }

    const growthIntentCounts = new Map<string, number>();
    for (const intent of clusterGrowthIntent.values()) {
      growthIntentCounts.set(intent, (growthIntentCounts.get(intent) ?? 0) + 1);
    }
    if ((growthIntentCounts.get('discovery') ?? 0) < 2) {
      strategicIssues.push('growth portfolio discovery<2');
    }
    if ((growthIntentCounts.get('conversion') ?? 0) < 1) {
      strategicIssues.push('growth portfolio conversion<1');
    }
    if ((growthIntentCounts.get('authority') ?? 0) < 1) {
      strategicIssues.push('growth portfolio authority<1');
    }

    const hasWholePersonEvidence = (wholeLifeSignals ?? []).some((item) =>
      ['hobby', 'routine', 'learning', 'human'].includes(item.category),
    );
    if (
      cadence.longFormVideos >= 2 &&
      hasWholePersonEvidence &&
      wholePersonLongFormVideos < 1
    ) {
      strategicIssues.push('whole-person long-form balance missing');
    }

    for (const [cluster, surfaces] of clusterFeedSurfaces) {
      const narrative = clusterNarrative.get(cluster) ?? '';
      if (PERSONAL_STRATEGY_NARRATIVES.has(narrative) && surfaces.size > 2) {
        strategicIssues.push(
          `personal cluster ${cluster} surfaces=${surfaces.size}`,
        );
      }
    }
    for (const [evidenceId, surfaces] of hobbySurfaces) {
      if (surfaces.size > HOBBY_MAX_WEEKLY_SURFACES_PER_SIGNAL) {
        strategicIssues.push(`hobby ${evidenceId} surfaces=${surfaces.size}`);
      }
    }

    // Intentionally non-fatal after deterministic repair. Keep the variable so
    // this audit remains easy to instrument later without reintroducing throws.
    void strategicIssues;
  }

  private isBlueprintContentStarvationError(error: unknown) {
    return (
      error instanceof Error &&
      /under-produced public content|omitted weekly POST coverage|Strategic cadence|cadence must stay within|Daily lightweight presence|Presence narrative|topicClusterKey|growthIntent|100K growth portfolio|Long-form balance|over-distributed|real HSAKAA evidence IDs|fabricated or unavailable HSAKAA evidence IDs|references unknown opportunity|references evidence that is not approved public-safe|Instagram Story.+(?:evidence|unavailable)|Reflection-only opportunity|Owned builder journey|Named-company opportunity/i.test(
        error.message,
      )
    );
  }

  private isOutputTokenLimitError(error: unknown) {
    return (
      error instanceof Error &&
      /max_output_tokens|output token/i.test(error.message)
    );
  }

  private mergeDayExecutions(
    skeletons: PlanningExecutionSkeleton[],
    generatedPosts: MediaPlanningExecution[],
  ) {
    const byPlatform = new Map<MediaPlatform, MediaPlanningExecution>();
    for (const post of generatedPosts) {
      if (!byPlatform.has(post.platform)) byPlatform.set(post.platform, post);
    }

    return skeletons.map((skeleton) => {
      if (skeleton.action === 'skip') return this.skipExecution(skeleton);
      const generated = byPlatform.get(skeleton.platform);
      if (!generated || generated.action !== 'post') {
        return this.skipExecution({
          ...skeleton,
          action: 'skip',
          time: '',
          reason:
            'HSAKAA isolated this one asset after deterministic validation/repair failed; the rest of the paid weekly plan was preserved.',
        });
      }
      return {
        ...generated,
        platform: skeleton.platform,
        action: 'post' as const,
        time: skeleton.time,
        format: skeleton.format,
        opportunityKey: skeleton.opportunityKey,
        storyArcKey: skeleton.storyArcKey,
        reason: skeleton.reason,
      };
    });
  }

  private skipExecution(
    skeleton: PlanningExecutionSkeleton,
  ): MediaPlanningExecution {
    return {
      platform: skeleton.platform,
      action: 'skip',
      time: skeleton.time,
      format: skeleton.format,
      formatIntent: 'Intentional skip',
      opportunityKey: '',
      storyArcKey: skeleton.storyArcKey ?? '',
      reason: skeleton.reason,
      whyThisFormat: 'No public asset is required for an intentional skip.',
      whyThisTime: 'The time is reserved only as a planning checkpoint.',
      title: '',
      hook: '',
      caption: '',
      script: '',
      description: '',
      cta: '',
      hashtags: [],
      slides: [],
      coverText: '',
      thumbnailText: '',
      pinnedComment: '',
      storyFollowUp: '',
      productionNotes: '',
      publishCopy: '',
      copyPasteText: '',
      copyPasteCaption: '',
      evidenceIds: [],
      imageBrief: {
        mode: 'none',
        aspectRatio: '',
        overlayText: '',
        prompt: '',
        description: '',
        sourceGuidance: '',
      },
      carouselSlides: [],
      videoPack: {
        fullScript: '',
        targetDurationSeconds: 0,
        deliveryInstructions: '',
        cameraInstructions: '',
        punchIns: [],
        broll: [],
        onScreenText: [],
        musicDirection: '',
        coverDirection: '',
      },
      xThread: [],
      whatsappSequence: [],
      executionReady: false,
      readinessIssues: [],
      estimatedMinutes: 0,
      requiresApproval: true,
    };
  }

  private skipDailyStory(
    story: PlanningBlueprint['days'][number]['instagramStory'],
  ): MediaPlanningDailyStory {
    return {
      action: 'skip',
      time: '',
      sourceType: story.sourceType ?? 'human_moment',
      sourceEvidenceIds: [],
      reason: story.reason || 'No lightweight Story moment planned.',
      captureBrief: '',
      frames: [],
      executionReady: false,
      readinessIssues: [],
    };
  }

  private normalizeBlueprintTimes(
    blueprint: PlanningBlueprint,
    validEvidence?: Set<string>,
  ): PlanningBlueprint {
    const usableOpportunities = blueprint.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        this.validPlanningEvidenceIds(item.evidenceIds, validEvidence).length,
    );
    let days = blueprint.days.map((day, index) => {
      const fallbackOpportunity = this.fallbackOpportunityForDay(
        blueprint,
        day,
        index,
      );
      const instagramStory =
        day.instagramStory ??
        this.fallbackInstagramStorySkeleton(fallbackOpportunity, index);
      const youtubeCommunity =
        day.youtubeCommunity ??
        this.skipYoutubeCommunitySkeleton(fallbackOpportunity);
      return {
        ...day,
        executions: day.executions.map((item) => ({
          ...item,
          time:
            item.action === 'post'
              ? this.normalizeLocalTime(
                  item.time,
                  this.defaultPostingTime(item.platform),
                )
              : this.normalizeLocalTime(item.time, ''),
        })),
        instagramStory: {
          ...instagramStory,
          time:
            instagramStory.action === 'post'
              ? this.normalizeLocalTime(instagramStory.time, '08:30')
              : this.normalizeLocalTime(instagramStory.time, ''),
        },
        youtubeCommunity: {
          ...youtubeCommunity,
          time:
            youtubeCommunity.action === 'post'
              ? this.normalizeLocalTime(youtubeCommunity.time, '16:30')
              : this.normalizeLocalTime(youtubeCommunity.time, ''),
        },
        engagement: (day.engagement ?? []).map((task) => ({
          ...task,
          time: this.normalizeLocalTime(task.time, '17:30'),
        })),
      };
    });

    if (usableOpportunities.length) {
      days = this.ensureInstagramStoryCadence(
        days,
        usableOpportunities,
        validEvidence,
      );
      days = this.ensureYoutubeCommunityCadence(
        days,
        usableOpportunities,
        validEvidence,
      );
    }
    return { ...blueprint, days };
  }

  private fallbackOpportunityForDay(
    blueprint: PlanningBlueprint,
    day: PlanningBlueprint['days'][number],
    index: number,
    validEvidence?: Set<string>,
  ) {
    const referencedKeys = day.executions
      .filter((item) => item.action === 'post' && item.opportunityKey)
      .map((item) => item.opportunityKey as string);
    const referenced = referencedKeys
      .map((key) => blueprint.opportunities.find((item) => item.key === key))
      .find(
        (item) =>
          item?.usable &&
          item.privacy === 'public_safe' &&
          this.validPlanningEvidenceIds(item.evidenceIds, validEvidence).length,
      );
    if (referenced) return referenced;
    const usable = blueprint.opportunities.filter(
      (item) =>
        item.usable &&
        item.privacy === 'public_safe' &&
        this.validPlanningEvidenceIds(item.evidenceIds, validEvidence).length,
    );
    return usable[index % Math.max(usable.length, 1)];
  }

  private validPlanningEvidenceIds(
    evidenceIds: string[] | undefined,
    validEvidence?: Set<string>,
    limit = 3,
  ) {
    const ids = [...new Set((evidenceIds ?? []).filter(Boolean))];
    const grounded = validEvidence
      ? ids.filter((id) => validEvidence.has(id))
      : ids;
    return grounded.slice(0, limit);
  }

  private fallbackContextEvidenceIds(
    index: number,
    validEvidence?: Set<string>,
  ) {
    if (!validEvidence?.size) return [];
    const ids = [...validEvidence];
    return [ids[index % ids.length]];
  }

  private sourceTypeForPillar(
    pillar: MediaPublicIdentityPillar | undefined,
  ): MediaPlanningDailyStory['sourceType'] {
    if (pillar === 'learning_experiments') return 'learning';
    if (pillar === 'building_aakash') return 'personal_growth';
    if (pillar === 'human_unfiltered') return 'human_moment';
    if (pillar === 'builder_operator') return 'current_work';
    return 'professional';
  }

  private fallbackInstagramStorySkeleton(
    opportunity: GeneratedPlan['opportunities'][number] | undefined,
    index: number,
    validEvidence?: Set<string>,
  ): PlanningBlueprint['days'][number]['instagramStory'] {
    if (!opportunity) {
      return {
        action: 'skip',
        time: '',
        sourceType: 'human_moment',
        sourceEvidenceIds: [],
        reason: 'No usable context exists for a truthful Instagram Story.',
        captureBrief: '',
      };
    }
    return {
      action: 'post',
      time: index % 2 === 0 ? '09:15' : '18:15',
      sourceType: this.sourceTypeForPillar(opportunity.identityPillar),
      sourceEvidenceIds: this.validPlanningEvidenceIds(
        opportunity.evidenceIds,
        validEvidence,
      ),
      reason:
        'Maintain lightweight human familiarity from a real Aakash context signal.',
      captureBrief:
        'Capture one small private-safe moment related to this context only if it is actually happening today; do not manufacture an activity or convert it into a polished feed post.',
    };
  }

  private skipYoutubeCommunitySkeleton(
    opportunity: GeneratedPlan['opportunities'][number] | undefined,
  ): NonNullable<PlanningBlueprint['days'][number]['youtubeCommunity']> {
    return {
      action: 'skip',
      time: '',
      format: 'text',
      sourceType: this.sourceTypeForPillar(opportunity?.identityPillar),
      sourceEvidenceIds: opportunity?.evidenceIds.slice(0, 3) ?? [],
      reason: 'No YouTube Community moment selected for this day.',
    };
  }

  private ensureInstagramStoryCadence(
    days: PlanningBlueprint['days'],
    opportunities: GeneratedPlan['opportunities'],
    validEvidence?: Set<string>,
  ) {
    return days.map((day, index) => {
      const current = day.instagramStory;
      const currentEvidence = this.validPlanningEvidenceIds(
        current?.sourceEvidenceIds,
        validEvidence,
      );
      if (current?.action === 'post' && currentEvidence.length) {
        if (
          currentEvidence.length === (current.sourceEvidenceIds ?? []).length
        ) {
          return day;
        }
        return {
          ...day,
          instagramStory: {
            ...current,
            sourceEvidenceIds: currentEvidence,
            reason:
              current.reason ||
              'Story evidence references were normalized to available HSAKAA context.',
          },
        };
      }

      const opportunity = this.fallbackOpportunityForDay(
        {
          startDate: '',
          endDate: '',
          timezone: TZ,
          learningStage: '',
          summary: '',
          opportunities,
          storyArcs: [],
          days,
        },
        day,
        index,
        validEvidence,
      );
      if (opportunity) {
        const fallback = this.fallbackInstagramStorySkeleton(
          opportunity,
          index,
          validEvidence,
        );
        if (fallback.sourceEvidenceIds.length) {
          return {
            ...day,
            instagramStory: {
              ...fallback,
              time: this.normalizeLocalTime(current?.time, fallback.time),
              reason:
                current?.action === 'post'
                  ? 'Story grounding repaired automatically from a real HSAKAA context signal.'
                  : fallback.reason,
            },
          };
        }
      }

      const contextEvidence = this.fallbackContextEvidenceIds(
        index,
        validEvidence,
      );
      if (!contextEvidence.length) return day;
      return {
        ...day,
        instagramStory: {
          action: 'post' as const,
          time: this.normalizeLocalTime(
            current?.time,
            index % 2 === 0 ? '09:15' : '18:15',
          ),
          sourceType: current?.sourceType ?? 'human_moment',
          sourceEvidenceIds: contextEvidence,
          reason:
            'Story grounding repaired automatically from available HSAKAA context evidence.',
          captureBrief:
            current?.captureBrief?.trim() ||
            'Capture one small private-safe moment related to this context only if it actually happens today; do not stage or invent it.',
        },
      };
    });
  }

  private ensureYoutubeCommunityCadence(
    days: PlanningBlueprint['days'],
    opportunities: GeneratedPlan['opportunities'],
    validEvidence?: Set<string>,
  ) {
    days = days.map((day, index) => {
      if (day.youtubeCommunity?.action !== 'post') return day;
      const currentEvidence = this.validPlanningEvidenceIds(
        day.youtubeCommunity.sourceEvidenceIds,
        validEvidence,
      );
      if (currentEvidence.length) {
        return currentEvidence.length ===
          (day.youtubeCommunity.sourceEvidenceIds ?? []).length
          ? day
          : {
              ...day,
              youtubeCommunity: {
                ...day.youtubeCommunity,
                sourceEvidenceIds: currentEvidence,
              },
            };
      }
      const opportunity = this.fallbackOpportunityForDay(
        {
          startDate: '',
          endDate: '',
          timezone: TZ,
          learningStage: '',
          summary: '',
          opportunities,
          storyArcs: [],
          days,
        },
        day,
        index,
        validEvidence,
      );
      const replacementEvidence = opportunity
        ? this.validPlanningEvidenceIds(opportunity.evidenceIds, validEvidence)
        : this.fallbackContextEvidenceIds(index, validEvidence);
      if (!replacementEvidence.length) return day;
      return {
        ...day,
        youtubeCommunity: {
          ...day.youtubeCommunity,
          sourceType: opportunity
            ? this.sourceTypeForPillar(opportunity.identityPillar)
            : day.youtubeCommunity.sourceType,
          sourceEvidenceIds: replacementEvidence,
          reason:
            'YouTube Community grounding repaired automatically from available HSAKAA context evidence.',
        },
      };
    });
    const postIndexes = days
      .map((day, index) =>
        day.youtubeCommunity?.action === 'post' ? index : -1,
      )
      .filter((index) => index >= 0);
    if (postIndexes.length > 5) {
      const allowed = new Set(postIndexes.slice(0, 5));
      days = days.map((day, index) =>
        day.youtubeCommunity?.action === 'post' && !allowed.has(index)
          ? {
              ...day,
              youtubeCommunity: {
                ...day.youtubeCommunity,
                action: 'skip' as const,
                time: '',
                reason:
                  'YouTube Community cadence capped to keep lightweight presence sustainable.',
              },
            }
          : day,
      );
    }

    let count = days.filter(
      (day) => day.youtubeCommunity?.action === 'post',
    ).length;
    const target = Math.min(4, days.length);
    if (count >= 3) return days;

    const preferredIndexes = [1, 3, 5, 0, 6, 2, 4].filter(
      (index) => index < days.length,
    );
    for (const index of preferredIndexes) {
      if (count >= target) break;
      const day = days[index];
      if (day.youtubeCommunity?.action === 'post') continue;
      const opportunity = this.fallbackOpportunityForDay(
        {
          startDate: '',
          endDate: '',
          timezone: TZ,
          learningStage: '',
          summary: '',
          opportunities,
          storyArcs: [],
          days,
        },
        day,
        index,
        validEvidence,
      );
      if (!opportunity) continue;
      const formats = ['text', 'poll', 'image', 'text'] as const;
      days[index] = {
        ...day,
        youtubeCommunity: {
          action: 'post',
          time: this.normalizeLocalTime(day.youtubeCommunity?.time, '16:30'),
          format: formats[count % formats.length],
          sourceType: this.sourceTypeForPillar(opportunity.identityPillar),
          sourceEvidenceIds: this.validPlanningEvidenceIds(
            opportunity.evidenceIds,
            validEvidence,
          ),
          reason:
            'Use YouTube Community as the lightweight conversation layer between Shorts and long-form uploads.',
        },
      };
      count += 1;
    }
    return days;
  }

  private normalizeLocalTime(
    value: string | null | undefined,
    fallback: string,
  ) {
    const raw = (value ?? '').trim();
    if (!raw) return fallback;

    const cleaned = raw
      .toUpperCase()
      .replace(/\b(?:IST|ASIA\/KOLKATA|HRS?|HOURS?)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const isoTime = cleaned.match(/T(\d{1,2}):(\d{2})/);
    if (isoTime)
      return this.formatHourMinute(
        Number(isoTime[1]),
        Number(isoTime[2]),
        fallback,
      );

    const ampm = cleaned.match(/^(\d{1,2})(?::|\.)(\d{2})\s*(AM|PM)$/);
    if (ampm) {
      let hour = Number(ampm[1]);
      const minute = Number(ampm[2]);
      if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
        if (ampm[3] === 'AM' && hour === 12) hour = 0;
        if (ampm[3] === 'PM' && hour !== 12) hour += 12;
        return this.formatHourMinute(hour, minute, fallback);
      }
    }

    const hourOnlyAmPm = cleaned.match(/^(\d{1,2})\s*(AM|PM)$/);
    if (hourOnlyAmPm) {
      let hour = Number(hourOnlyAmPm[1]);
      if (hour >= 1 && hour <= 12) {
        if (hourOnlyAmPm[2] === 'AM' && hour === 12) hour = 0;
        if (hourOnlyAmPm[2] === 'PM' && hour !== 12) hour += 12;
        return this.formatHourMinute(hour, 0, fallback);
      }
    }

    const twentyFourHour = cleaned.match(/^(\d{1,2})(?::|\.)(\d{2})$/);
    if (twentyFourHour) {
      return this.formatHourMinute(
        Number(twentyFourHour[1]),
        Number(twentyFourHour[2]),
        fallback,
      );
    }

    const compact = cleaned.match(/^(\d{3,4})$/);
    if (compact) {
      const digits = compact[1].padStart(4, '0');
      return this.formatHourMinute(
        Number(digits.slice(0, 2)),
        Number(digits.slice(2)),
        fallback,
      );
    }

    return fallback;
  }

  private formatHourMinute(hour: number, minute: number, fallback: string) {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  private defaultPostingTime(platform: MediaPlatform) {
    switch (platform) {
      case MediaPlatform.LINKEDIN:
        return '09:30';
      case MediaPlatform.INSTAGRAM:
        return '18:30';
      case MediaPlatform.YOUTUBE:
        return '19:00';
      case MediaPlatform.X:
        return '12:30';
      case MediaPlatform.WHATSAPP:
        return '18:45';
      default:
        return '18:00';
    }
  }

  private resolveStartDate(value?: string) {
    if (value) return value.slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private addDays(date: string, days: number) {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private currentDate() {
    const today = this.resolveStartDate();
    return today < ROLLING_PLANNING_EPOCH ? ROLLING_PLANNING_EPOCH : today;
  }

  private rollingStartDate() {
    return this.currentDate();
  }

  private weekKey(date: string) {
    const value = new Date(`${date}T12:00:00Z`);
    const day = value.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0, 10);
  }

  private resolveWeekContext(
    dto: GenerateMediaPlanningCycleDto,
    startDate: string,
    prior?: MediaPlanningCycle['weekContext'] | null,
  ): MediaPlanningCycle['weekContext'] {
    const weekKey = this.weekKey(startDate);
    const supplied = dto.outingStatus;
    if (supplied) {
      return {
        outingStatus: supplied,
        outingDetails: dto.outingDetails?.trim() ?? '',
        weekKey,
        capturedAt: new Date(),
      };
    }
    if (prior && prior.weekKey === weekKey) {
      return {
        outingStatus: prior.outingStatus ?? 'unknown',
        outingDetails: prior.outingDetails ?? '',
        weekKey,
        capturedAt: prior.capturedAt ? new Date(prior.capturedAt) : new Date(),
      };
    }
    return {
      outingStatus: 'unknown',
      outingDetails: '',
      weekKey,
      capturedAt: new Date(),
    };
  }

  private localDate(value: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  private async findRollingBasePlan(
    startDate: string,
    strategyVersion: number,
  ) {
    const escapedVersion = String(strategyVersion).replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
    return this.planModel
      .findOne({
        isActive: true,
        startDate: { $gte: ROLLING_PLANNING_EPOCH, $lte: startDate },
        endDate: { $gte: startDate },
        key: { $regex: new RegExp(`^[^:]+:${escapedVersion}:`) },
      })
      .sort({ generatedAt: -1 })
      .lean();
  }

  private async plannedContentFingerprintContext() {
    const plans = await this.planModel
      .find({
        isActive: true,
        startDate: { $gte: ROLLING_PLANNING_EPOCH },
      })
      .sort({ generatedAt: -1 })
      .limit(40)
      .lean();
    const fingerprints: Array<Record<string, unknown>> = [];
    for (const plan of plans) {
      const opportunities = new Map(
        (plan.opportunities ?? []).map((item) => [item.key, item]),
      );
      for (const day of plan.days ?? []) {
        for (const item of day.executions ?? []) {
          if (item.action !== 'post') continue;
          const opportunity = opportunities.get(item.opportunityKey ?? '');
          const text = this.executionPublicText(item);
          fingerprints.push({
            _id: `planned:${String(plan._id ?? plan.key)}:${day.date}:${item.platform}`,
            scope: 'planning_archive',
            platform: item.platform,
            format: item.format,
            title: item.title || opportunity?.title || '',
            topic: opportunity?.topicClusterKey || opportunity?.title || '',
            thesis: opportunity?.thesis || '',
            angle: opportunity?.whyNow || item.reason || '',
            hookArchetype: item.hook || '',
            openingPattern: text.split(/\n|[.!?]\s/)[0] ?? '',
            storyKeys: opportunity?.strategyNarrativeKey
              ? [opportunity.strategyNarrativeKey]
              : [],
            exampleKeys: opportunity?.evidenceIds ?? [],
            structure: item.format,
            ctaArchetype: item.cta || '',
            visualConcept:
              item.imageBrief?.description ||
              item.imageBrief?.overlayText ||
              '',
            keyPhrases: this.tokens(text).slice(0, 20),
            lexicalSignature: this.tokens(text),
            normalizedText: text,
            createdAt: plan.generatedAt,
          });
        }
        if (day.instagramStory?.action === 'post') {
          const text = this.storyCopy(day.instagramStory);
          fingerprints.push({
            _id: `planned:${String(plan._id ?? plan.key)}:${day.date}:instagram_story`,
            scope: 'planning_archive',
            platform: MediaPlatform.INSTAGRAM,
            format: 'story',
            title: day.theme,
            topic: day.instagramStory.sourceType,
            thesis: day.instagramStory.reason,
            angle: day.instagramStory.captureBrief,
            hookArchetype: text.split(/\n|[.!?]\s/)[0] ?? '',
            lexicalSignature: this.tokens(text),
            normalizedText: text,
            createdAt: plan.generatedAt,
          });
        }
        if (day.youtubeCommunity?.action === 'post') {
          const text = day.youtubeCommunity.publishCopy ?? '';
          fingerprints.push({
            _id: `planned:${String(plan._id ?? plan.key)}:${day.date}:youtube_community`,
            scope: 'planning_archive',
            platform: MediaPlatform.YOUTUBE,
            format: 'community',
            title: day.theme,
            topic: day.youtubeCommunity.sourceType,
            thesis: day.youtubeCommunity.reason,
            angle: day.youtubeCommunity.format,
            hookArchetype: text.split(/\n|[.!?]\s/)[0] ?? '',
            lexicalSignature: this.tokens(text),
            normalizedText: text,
            createdAt: plan.generatedAt,
          });
        }
      }
      if (fingerprints.length >= 240) break;
    }
    return fingerprints.slice(0, 240) as unknown as PlanningMemory[];
  }

  private compactRollingPlan(base: MediaPlanningCycle, excludeDate: string) {
    const usedOpportunityKeys = new Set(
      (base.days ?? [])
        .filter((day) => day.date !== excludeDate)
        .flatMap((day) =>
          (day.executions ?? [])
            .filter((item) => item.action === 'post')
            .map((item) => item.opportunityKey)
            .filter((value): value is string => Boolean(value)),
        ),
    );
    return {
      startDate: base.startDate,
      endDate: base.endDate,
      summary: base.summary,
      weekContext: base.weekContext,
      opportunities: (base.opportunities ?? [])
        .filter((item) => usedOpportunityKeys.has(item.key))
        .map((item) => ({
          key: item.key,
          title: item.title,
          thesis: item.thesis,
          strategyNarrativeKey: item.strategyNarrativeKey,
          topicClusterKey: item.topicClusterKey,
          growthIntent: item.growthIntent,
        })),
      days: (base.days ?? [])
        .filter((day) => day.date !== excludeDate)
        .map((day) => ({
          date: day.date,
          theme: day.theme,
          posts: (day.executions ?? [])
            .filter((item) => item.action === 'post')
            .map((item) => ({
              platform: item.platform,
              format: item.format,
              opportunityKey: item.opportunityKey,
              title: item.title,
              hook: item.hook,
              publishCopy: this.executionPublicText(item),
            })),
          instagramStory:
            day.instagramStory?.action === 'post'
              ? this.storyCopy(day.instagramStory)
              : '',
          youtubeCommunity:
            day.youtubeCommunity?.action === 'post'
              ? day.youtubeCommunity.publishCopy
              : '',
        })),
    };
  }

  private namespaceSingleDayBlueprint(
    blueprint: PlanningBlueprint,
    targetDate: string,
  ): PlanningBlueprint {
    const prefix = `d${targetDate.replaceAll('-', '')}_${Date.now().toString(36)}`;
    const opportunityMap = new Map<string, string>();
    for (const [index, item] of blueprint.opportunities.entries()) {
      opportunityMap.set(item.key, `${prefix}_opp_${index + 1}`);
    }
    const arcMap = new Map<string, string>();
    for (const [index, item] of blueprint.storyArcs.entries()) {
      arcMap.set(item.key, `${prefix}_arc_${index + 1}`);
    }
    return {
      ...blueprint,
      opportunities: blueprint.opportunities.map((item, index) => ({
        ...item,
        key: opportunityMap.get(item.key) ?? `${prefix}_opp_${index + 1}`,
        topicClusterKey: `${prefix}_${item.topicClusterKey || `cluster_${index + 1}`}`,
      })),
      storyArcs: blueprint.storyArcs.map((arc, index) => ({
        ...arc,
        key: arcMap.get(arc.key) ?? `${prefix}_arc_${index + 1}`,
        beats: (arc.beats ?? []).map((beat) => ({
          ...beat,
          opportunityKey: beat.opportunityKey
            ? (opportunityMap.get(beat.opportunityKey) ?? '')
            : '',
        })),
      })),
      days: blueprint.days.map((day) => ({
        ...day,
        executions: day.executions.map((item) => ({
          ...item,
          opportunityKey: item.opportunityKey
            ? (opportunityMap.get(item.opportunityKey) ?? '')
            : '',
          storyArcKey: item.storyArcKey
            ? (arcMap.get(item.storyArcKey) ?? '')
            : '',
        })),
      })),
    };
  }

  private assertSingleDayBlueprintBasics(
    blueprint: PlanningBlueprint,
    targetDate: string,
    validEvidence: Set<string>,
    presenceStrategy: PlanningPresenceStrategy,
  ) {
    if (
      blueprint.days.length !== 1 ||
      blueprint.startDate !== targetDate ||
      blueprint.endDate !== targetDate ||
      blueprint.days[0]?.date !== targetDate
    ) {
      throw new Error(
        'Single-day planner must return exactly the requested date.',
      );
    }
    const narrativeKeys = new Set(
      (presenceStrategy.narratives ?? []).map((item) => item.key),
    );
    const opportunities = new Map(
      blueprint.opportunities.map((item) => [item.key, item]),
    );
    for (const opportunity of blueprint.opportunities) {
      if (
        narrativeKeys.size &&
        !narrativeKeys.has(opportunity.strategyNarrativeKey)
      ) {
        throw new Error(
          `Single-day opportunity ${opportunity.key} uses unknown Presence narrative ${opportunity.strategyNarrativeKey}.`,
        );
      }
      if (opportunity.privacy === 'public_safe') {
        if (!opportunity.evidenceIds.length) {
          throw new Error(
            `Single-day opportunity ${opportunity.key} needs real evidence.`,
          );
        }
        const invalid = opportunity.evidenceIds.filter(
          (id) => !validEvidence.has(id),
        );
        if (invalid.length) {
          throw new Error(
            `Single-day opportunity ${opportunity.key} references unavailable evidence: ${invalid.join(', ')}.`,
          );
        }
      }
    }
    const day = blueprint.days[0];
    if (day.executions.length !== GROWTH_PLATFORMS.length) {
      throw new Error(
        'Single-day planner must return one decision per primary platform.',
      );
    }
    const seen = new Set<MediaPlatform>();
    for (const item of day.executions) {
      if (seen.has(item.platform)) {
        throw new Error(`Single-day planner duplicated ${item.platform}.`);
      }
      seen.add(item.platform);
      if (item.action === 'post') {
        const opportunity = opportunities.get(item.opportunityKey ?? '');
        if (
          !opportunity ||
          !opportunity.usable ||
          opportunity.privacy !== 'public_safe'
        ) {
          throw new Error(
            `Single-day ${item.platform} post does not reference a usable public-safe opportunity.`,
          );
        }
      }
    }
    for (const evidenceId of [
      ...(day.instagramStory?.sourceEvidenceIds ?? []),
      ...(day.youtubeCommunity?.sourceEvidenceIds ?? []),
    ]) {
      if (!validEvidence.has(evidenceId)) {
        throw new Error(
          `Single-day lightweight content references unavailable evidence ${evidenceId}.`,
        );
      }
    }
  }

  private planningStorySkeleton(
    story: MediaPlanningDailyStory | undefined,
  ): PlanningBlueprint['days'][number]['instagramStory'] {
    return story
      ? {
          action: story.action,
          time: story.time,
          sourceType: story.sourceType,
          sourceEvidenceIds: story.sourceEvidenceIds ?? [],
          reason: story.reason,
          captureBrief: story.captureBrief,
        }
      : {
          action: 'skip',
          time: '',
          sourceType: 'human_moment',
          sourceEvidenceIds: [],
          reason: 'No Story planned.',
          captureBrief: '',
        };
  }

  private planningCommunitySkeleton(
    post: MediaPlanningYoutubeCommunityPost | undefined,
  ): PlanningBlueprint['days'][number]['youtubeCommunity'] {
    return post
      ? {
          action: post.action,
          time: post.time,
          format: post.format,
          sourceType: post.sourceType,
          sourceEvidenceIds: post.sourceEvidenceIds ?? [],
          reason: post.reason,
        }
      : {
          action: 'skip',
          time: '',
          format: 'text',
          sourceType: 'human_moment',
          sourceEvidenceIds: [],
          reason: 'No Community post planned.',
        };
  }

  private mergeRollingBlueprint(
    base: MediaPlanningCycle,
    fresh: PlanningBlueprint,
    startDate: string,
    endDate: string,
    targetDate: string,
  ): PlanningBlueprint {
    const freshDay = fresh.days[0];
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(startDate, index),
    );
    const baseByDate = new Map((base.days ?? []).map((day) => [day.date, day]));
    const days: PlanningBlueprint['days'] = expectedDates.map((date) => {
      if (date === targetDate) return freshDay;
      const day = baseByDate.get(date);
      if (!day) {
        throw new Error(
          `Cannot preserve rolling day ${date}; rebuild the full seven-day window.`,
        );
      }
      return {
        date: day.date,
        theme: day.theme,
        workload: day.workload,
        executions: (day.executions ?? []).map((item) => ({
          platform: item.platform,
          action: item.action,
          time: item.time,
          format: item.format,
          opportunityKey: item.opportunityKey,
          storyArcKey: item.storyArcKey,
          reason: item.reason,
        })),
        instagramStory: this.planningStorySkeleton(day.instagramStory),
        youtubeCommunity: this.planningCommunitySkeleton(day.youtubeCommunity),
        engagement: day.engagement ?? [],
      };
    });
    const referencedOpportunityKeys = new Set(
      days.flatMap((day) =>
        day.executions
          .map((item) => item.opportunityKey)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const freshKeys = new Set(fresh.opportunities.map((item) => item.key));
    const opportunities = [
      ...(base.opportunities ?? []).filter(
        (item) =>
          referencedOpportunityKeys.has(item.key) && !freshKeys.has(item.key),
      ),
      ...fresh.opportunities,
    ];
    const referencedArcKeys = new Set(
      days.flatMap((day) =>
        day.executions
          .map((item) => item.storyArcKey)
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const freshArcKeys = new Set(fresh.storyArcs.map((item) => item.key));
    const storyArcs = [
      ...(base.storyArcs ?? []).filter(
        (item) =>
          referencedArcKeys.has(item.key) && !freshArcKeys.has(item.key),
      ),
      ...fresh.storyArcs,
    ];
    return {
      startDate,
      endDate,
      timezone: TZ,
      learningStage: base.learningStage,
      summary: base.summary,
      opportunities,
      storyArcs,
      days,
    };
  }

  private mergeMissingGeneratedDays(
    base: MediaPlanningCycle,
    candidate: GeneratedPlan,
    startDate: string,
    endDate: string,
    generatedDateSet: Set<string>,
  ): GeneratedPlan {
    const baseByDate = new Map((base.days ?? []).map((day) => [day.date, day]));
    const generatedByDate = new Map(
      (candidate.days ?? []).map((day) => [day.date, day]),
    );
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(startDate, index),
    );
    const days = expectedDates.map((date) => {
      const existing = baseByDate.get(date);
      if (existing) return existing;
      if (!generatedDateSet.has(date)) {
        throw new Error(
          `Rolling Media day ${date} is missing and was not selected for generation.`,
        );
      }
      const generated = generatedByDate.get(date);
      if (!generated) {
        throw new Error(`HSAKAA did not generate missing Media day ${date}.`);
      }
      return generated;
    });

    const opportunityByKey = new Map(
      (base.opportunities ?? []).map((item) => [item.key, item]),
    );
    for (const item of candidate.opportunities ?? []) {
      if (!opportunityByKey.has(item.key)) opportunityByKey.set(item.key, item);
    }
    const storyArcByKey = new Map(
      (base.storyArcs ?? []).map((item) => [item.key, item]),
    );
    for (const item of candidate.storyArcs ?? []) {
      if (!storyArcByKey.has(item.key)) storyArcByKey.set(item.key, item);
    }

    return {
      startDate,
      endDate,
      timezone: TZ,
      learningStage: base.learningStage,
      summary: base.summary,
      opportunities: [...opportunityByKey.values()],
      storyArcs: [...storyArcByKey.values()],
      days,
    };
  }

  private assertRollingWindowDates(
    plan: GeneratedPlan,
    startDate: string,
    endDate: string,
  ) {
    const expectedDates = Array.from(
      { length: ROLLING_WINDOW_DAYS },
      (_, index) => this.addDays(startDate, index),
    );
    const actualDates = (plan.days ?? []).map((day) => day.date);
    if (
      plan.startDate !== startDate ||
      plan.endDate !== endDate ||
      actualDates.length !== expectedDates.length ||
      new Set(actualDates).size !== expectedDates.length ||
      expectedDates.some((date) => !actualDates.includes(date))
    ) {
      throw new Error(
        `Rolling Media plan must contain exactly ${ROLLING_WINDOW_DAYS} days from ${startDate} through ${endDate}.`,
      );
    }
  }

  private mergeRollingGeneratedPlan(
    base: MediaPlanningCycle,
    repairedSkeleton: PlanningBlueprint,
    generatedDay: GeneratedPlan['days'][number],
    startDate: string,
    endDate: string,
    targetDate: string,
  ): GeneratedPlan {
    const baseByDate = new Map((base.days ?? []).map((day) => [day.date, day]));
    const skeletonByDate = new Map(
      (repairedSkeleton.days ?? []).map((day) => [day.date, day]),
    );
    const opportunityByKey = new Map(
      repairedSkeleton.opportunities.map((item) => [item.key, item]),
    );
    const days = Array.from({ length: ROLLING_WINDOW_DAYS }, (_, index) =>
      this.addDays(startDate, index),
    ).map((date) => {
      if (date === targetDate) return generatedDay;
      const existing = baseByDate.get(date);
      const skeletonDay = skeletonByDate.get(date);
      if (!existing) {
        throw new Error(
          `Rolling day ${date} is missing from the preserved plan.`,
        );
      }
      if (!skeletonDay) {
        throw new Error(
          `Rolling day ${date} is missing from the repaired planning skeleton.`,
        );
      }

      const existingByPlatform = new Map(
        (existing.executions ?? []).map((item) => [item.platform, item]),
      );
      const executions = skeletonDay.executions.map((skeletonExecution) => {
        if (skeletonExecution.action === 'skip') {
          return this.skipExecution(skeletonExecution);
        }

        const existingExecution = existingByPlatform.get(
          skeletonExecution.platform,
        );
        const opportunity = opportunityByKey.get(
          skeletonExecution.opportunityKey ?? '',
        );
        const canPreserveExistingPost = Boolean(
          existingExecution?.action === 'post' &&
          existingExecution.opportunityKey ===
            skeletonExecution.opportunityKey &&
          opportunity?.privacy === 'public_safe' &&
          opportunity.usable &&
          existingExecution.evidenceIds.every((id) =>
            opportunity.evidenceIds.includes(id),
          ),
        );

        if (!canPreserveExistingPost || !existingExecution) {
          return this.skipExecution({
            ...skeletonExecution,
            action: 'skip',
            time: '',
            opportunityKey: '',
            storyArcKey: '',
            reason:
              'Preserved rolling post was isolated because its previous HSAKAA evidence is no longer available in the repaired planning context.',
          });
        }

        return {
          ...existingExecution,
          time: skeletonExecution.time,
          format: skeletonExecution.format,
          opportunityKey: skeletonExecution.opportunityKey,
          storyArcKey: skeletonExecution.storyArcKey,
          reason: skeletonExecution.reason,
        };
      });

      const sameEvidence = (left: string[] = [], right: string[] = []) => {
        const leftSet = new Set(left);
        const rightSet = new Set(right);
        return (
          leftSet.size === rightSet.size &&
          [...leftSet].every((id) => rightSet.has(id))
        );
      };

      const instagramStory =
        skeletonDay.instagramStory.action === 'post' &&
        existing.instagramStory?.action === 'post' &&
        sameEvidence(
          existing.instagramStory.sourceEvidenceIds,
          skeletonDay.instagramStory.sourceEvidenceIds,
        )
          ? existing.instagramStory
          : this.skipDailyStory(skeletonDay.instagramStory);

      const youtubeCommunity =
        skeletonDay.youtubeCommunity?.action === 'post' &&
        existing.youtubeCommunity?.action === 'post' &&
        sameEvidence(
          existing.youtubeCommunity.sourceEvidenceIds,
          skeletonDay.youtubeCommunity.sourceEvidenceIds,
        )
          ? existing.youtubeCommunity
          : this.skipYoutubeCommunity({
              ...skeletonDay.youtubeCommunity,
              sourceEvidenceIds: [],
            });

      return {
        ...existing,
        executions,
        instagramStory,
        youtubeCommunity,
      };
    });
    return {
      startDate,
      endDate,
      timezone: TZ,
      learningStage: base.learningStage,
      summary: base.summary,
      opportunities: repairedSkeleton.opportunities,
      storyArcs: repairedSkeleton.storyArcs,
      days,
    };
  }

  private currentRollingFeedCopies(
    base: MediaPlanningCycle,
    excludeDate: string,
  ) {
    return (base.days ?? [])
      .filter((day) => day.date !== excludeDate)
      .flatMap((day) =>
        (day.executions ?? [])
          .filter((item) => item.action === 'post')
          .map((item) => ({
            platform: item.platform,
            text: this.executionPublicText(item),
          })),
      );
  }

  private currentRollingStoryCopies(
    base: MediaPlanningCycle,
    excludeDate: string,
  ) {
    return (base.days ?? [])
      .filter(
        (day) =>
          day.date !== excludeDate && day.instagramStory?.action === 'post',
      )
      .map((day) => this.storyCopy(day.instagramStory));
  }

  private currentRollingCommunityCopies(
    base: MediaPlanningCycle,
    excludeDate: string,
  ) {
    return (base.days ?? [])
      .filter(
        (day) =>
          day.date !== excludeDate && day.youtubeCommunity?.action === 'post',
      )
      .map((day) => day.youtubeCommunity?.publishCopy ?? '')
      .filter(Boolean);
  }

  private assertPlan(
    plan: GeneratedPlan,
    startDate: string,
    endDate: string,
    publicEvidenceIds: string[],
    reflectionEvidenceIds: string[],
    identityEvidenceIds: string[],
    historicalFingerprints: PlanningMemory[],
    options: { historicalNoveltyDates?: Set<string> } = {},
  ) {
    if (plan.days.length !== 7) {
      throw new Error(
        `Planner must return exactly 7 days; received ${plan.days.length}.`,
      );
    }
    if (plan.days[0]?.date !== startDate || plan.days[6]?.date !== endDate) {
      throw new Error(
        'Planner returned dates outside the requested seven-day window.',
      );
    }

    const publicEvidence = new Set(publicEvidenceIds);
    const reflectionEvidence = new Set(reflectionEvidenceIds);
    const identityEvidence = new Set(identityEvidenceIds);
    const validEvidence = new Set([
      ...publicEvidenceIds,
      ...reflectionEvidenceIds,
      ...identityEvidenceIds,
    ]);
    const opportunities = new Map(
      plan.opportunities.map((item) => [item.key, item]),
    );
    for (const opportunity of plan.opportunities) {
      if (opportunity.privacy === 'needs_review' && opportunity.usable) {
        throw new Error(
          `Opportunity ${opportunity.key} is needs_review and cannot be automatically usable.`,
        );
      }
      if (opportunity.privacy === 'public_safe') {
        if (!opportunity.evidenceIds.length) {
          throw new Error(
            `Public-safe opportunity ${opportunity.key} must reference real HSAKAA evidence IDs.`,
          );
        }
        const fabricated = opportunity.evidenceIds.filter(
          (id) => !validEvidence.has(id),
        );
        if (fabricated.length) {
          throw new Error(
            `Opportunity ${opportunity.key} references fabricated or unavailable HSAKAA evidence IDs: ${fabricated.join(', ')}.`,
          );
        }
        const hasPublicEvidence = opportunity.evidenceIds.some((id) =>
          publicEvidence.has(id),
        );
        const hasIdentityEvidence = opportunity.evidenceIds.some((id) =>
          identityEvidence.has(id),
        );
        if (
          opportunity.companyName?.trim() &&
          !hasPublicEvidence &&
          !hasIdentityEvidence
        ) {
          throw new Error(
            `Named-company opportunity ${opportunity.key} requires identity-safe evidence when no public company evidence is available.`,
          );
        }
      }
    }

    const weekCopies: Array<{ platform: MediaPlatform; text: string }> = [];
    const weekStoryCopies: string[] = [];
    const weekYoutubeCommunityCopies: string[] = [];
    for (const day of plan.days) {
      if (day.executions.length !== GROWTH_PLATFORMS.length) {
        throw new Error(
          `Planner must return exactly one POST or SKIP decision for each primary platform on ${day.date}; received ${day.executions.length}.`,
        );
      }
      const duplicate = new Set<string>();
      for (const item of day.executions) {
        if (duplicate.has(item.platform)) {
          throw new Error(
            `Planner returned multiple primary executions for ${item.platform} on ${day.date}.`,
          );
        }
        duplicate.add(item.platform);
        if (item.action === 'post') {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) {
            throw new Error(
              `Invalid posting time ${item.time} on ${day.date}.`,
            );
          }
          this.assertExecutionReady(item, day.date, opportunities);
          const combined = this.executionPublicText(item);
          const opportunity = opportunities.get(item.opportunityKey ?? '');
          this.assertReflectionSafeCopy(
            combined,
            item,
            opportunity,
            publicEvidence,
            reflectionEvidence,
            identityEvidence,
            day.date,
          );
          this.assertNoInternalStrategyLeak(combined, item.platform, day.date);
          this.assertNoPlaceholderCopy(combined, item.platform, day.date);
          if (
            !options.historicalNoveltyDates ||
            options.historicalNoveltyDates.has(day.date)
          ) {
            this.assertHistoricalNovelty(
              combined,
              historicalFingerprints,
              item,
            );
          }
          for (const previous of weekCopies) {
            if (this.textSimilarity(combined, previous.text) >= 0.82) {
              throw new Error(
                `Same-week copy for ${item.platform} on ${day.date} is too similar to ${previous.platform}; platform-native wording must be distinct.`,
              );
            }
          }
          weekCopies.push({ platform: item.platform, text: combined });
        }
      }
      if (day.instagramStory?.action === 'post') {
        this.assertDailyStoryReady(day.instagramStory, day.date, validEvidence);
        const storyCopy = day.instagramStory.frames
          .map((frame) => `${frame.overlayText} ${frame.spokenText}`.trim())
          .join('\n')
          .trim();
        this.assertNoInternalStrategyLeak(
          storyCopy,
          MediaPlatform.INSTAGRAM,
          day.date,
        );
        this.assertNoPlaceholderCopy(
          storyCopy,
          MediaPlatform.INSTAGRAM,
          day.date,
        );
        for (const previous of weekStoryCopies.slice(-2)) {
          if (storyCopy && this.textSimilarity(storyCopy, previous) >= 0.86) {
            throw new Error(
              `Instagram Story on ${day.date} is too similar to a recent Story; daily presence must stay varied.`,
            );
          }
        }
        weekStoryCopies.push(storyCopy);
      }

      if (day.youtubeCommunity?.action === 'post') {
        const communityError = this.youtubeCommunityPreflightError(
          day.youtubeCommunity,
          day.date,
          validEvidence,
          weekYoutubeCommunityCopies,
        );
        if (communityError) throw new Error(communityError);
        this.assertNoInternalStrategyLeak(
          day.youtubeCommunity.publishCopy,
          MediaPlatform.YOUTUBE,
          day.date,
        );
        weekYoutubeCommunityCopies.push(day.youtubeCommunity.publishCopy);
      }

      for (const platform of GROWTH_PLATFORMS) {
        if (!duplicate.has(platform)) {
          throw new Error(
            `Planner omitted ${platform} on ${day.date}; every primary platform needs an explicit POST or SKIP decision.`,
          );
        }
      }
    }
  }

  private assertDailyStoryReady(
    story: MediaPlanningDailyStory,
    date: string,
    validEvidence: Set<string>,
  ) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(story.time)) {
      throw new Error(`Invalid Instagram Story time ${story.time} on ${date}.`);
    }
    if (!story.executionReady || story.readinessIssues.length) {
      throw new Error(`Instagram Story on ${date} is not execution-ready.`);
    }
    if (!story.sourceEvidenceIds.length) {
      throw new Error(
        `Instagram Story on ${date} has no HSAKAA source evidence.`,
      );
    }
    if (story.sourceEvidenceIds.some((id) => !validEvidence.has(id))) {
      throw new Error(
        `Instagram Story on ${date} uses unavailable HSAKAA evidence.`,
      );
    }
    if (!story.captureBrief.trim()) {
      throw new Error(`Instagram Story on ${date} has no capture brief.`);
    }
    if (story.frames.length < 1 || story.frames.length > 3) {
      throw new Error(`Instagram Story on ${date} must contain 1-3 frames.`);
    }
    for (const frame of story.frames) {
      if (!frame.overlayText.trim() && !frame.spokenText.trim()) {
        throw new Error(
          `Instagram Story on ${date} contains a frame with no final copy.`,
        );
      }
      if (!frame.visualDescription.trim() || !frame.captureInstruction.trim()) {
        throw new Error(
          `Instagram Story on ${date} contains an incomplete visual/capture brief.`,
        );
      }
    }
  }

  private assertExecutionReady(
    item: MediaPlanningExecution,
    date: string,
    opportunities: Map<string, GeneratedPlan['opportunities'][number]>,
  ) {
    if (!item.executionReady || item.readinessIssues.length) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} is not execution-ready.`,
      );
    }
    if (!item.publishCopy?.trim()) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} has no canonical publishCopy.`,
      );
    }
    if (!item.hook.trim()) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} has no final hook.`,
      );
    }
    if (!item.opportunityKey?.trim()) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} must reference an opportunity.`,
      );
    }
    const opportunity = opportunities.get(item.opportunityKey);
    if (!opportunity) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} references unknown opportunity ${item.opportunityKey}.`,
      );
    }
    if (opportunity.privacy !== 'public_safe' || !opportunity.usable) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} references evidence that is not approved public-safe planning material.`,
      );
    }
    if (!item.evidenceIds.length) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} must carry evidenceIds.`,
      );
    }
    const opportunityEvidence = new Set(opportunity.evidenceIds);
    if (item.evidenceIds.some((id) => !opportunityEvidence.has(id))) {
      throw new Error(
        `Post execution for ${item.platform} on ${date} uses evidence not attached to its opportunity.`,
      );
    }

    if (item.format === MediaPostType.IMAGE) {
      if (item.imageBrief.mode === 'none') {
        throw new Error(
          `Image execution for ${item.platform} on ${date} is missing an image brief.`,
        );
      }
      if (!item.imageBrief.aspectRatio.trim()) {
        throw new Error(
          `Image execution for ${item.platform} on ${date} is missing aspect ratio.`,
        );
      }
      if (
        item.imageBrief.mode === 'ai_generation' &&
        item.imageBrief.prompt.trim().length < 60
      ) {
        throw new Error(
          `Image execution for ${item.platform} on ${date} has an incomplete AI image prompt.`,
        );
      }
      if (
        item.imageBrief.mode !== 'ai_generation' &&
        item.imageBrief.description.trim().length < 40
      ) {
        throw new Error(
          `Image execution for ${item.platform} on ${date} needs a complete real-photo/design description.`,
        );
      }
    }

    if (item.format === MediaPostType.CAROUSEL) {
      if (item.carouselSlides.length < 2) {
        throw new Error(
          `Carousel execution for ${item.platform} on ${date} must contain complete slide-by-slide content.`,
        );
      }
      for (const slide of item.carouselSlides) {
        if (!slide.headline.trim() || !slide.bodyCopy.trim()) {
          throw new Error(
            `Carousel slide ${slide.slideNumber} for ${item.platform} on ${date} is missing final copy.`,
          );
        }
        if (
          slide.visualType === 'ai_image' &&
          slide.imagePrompt.trim().length < 50
        ) {
          throw new Error(
            `Carousel slide ${slide.slideNumber} for ${item.platform} on ${date} has an incomplete AI image prompt.`,
          );
        }
        if (
          slide.visualType !== 'ai_image' &&
          slide.visualDescription.trim().length < 25
        ) {
          throw new Error(
            `Carousel slide ${slide.slideNumber} for ${item.platform} on ${date} needs a complete visual description.`,
          );
        }
      }
    }

    if (VIDEO_FORMATS.has(item.format)) {
      if (item.videoPack.fullScript.trim().length < 100) {
        throw new Error(
          `Video execution for ${item.platform} on ${date} must contain a full word-for-word script, not an outline.`,
        );
      }
      if (
        item.videoPack.targetDurationSeconds <= 0 ||
        !item.videoPack.deliveryInstructions.trim() ||
        !item.videoPack.cameraInstructions.trim() ||
        !item.videoPack.musicDirection.trim() ||
        !item.videoPack.coverDirection.trim()
      ) {
        throw new Error(
          `Video execution for ${item.platform} on ${date} has an incomplete production pack.`,
        );
      }
    }

    if (
      item.platform === MediaPlatform.X &&
      item.format === MediaPostType.THREAD
    ) {
      if (
        item.xThread.length < 2 ||
        item.xThread.some((part) => !part.trim())
      ) {
        throw new Error(`X thread on ${date} must contain every final post.`);
      }
    }

    if (
      item.platform === MediaPlatform.WHATSAPP ||
      WHATSAPP_FORMATS.has(item.format)
    ) {
      if (
        item.whatsappSequence.length < 1 ||
        item.whatsappSequence.some((part) => !part.trim())
      ) {
        throw new Error(
          `WhatsApp execution on ${date} must contain every final message/status frame.`,
        );
      }
    }
  }

  private assertNoPlaceholderCopy(
    text: string,
    platform: MediaPlatform,
    date: string,
  ) {
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error(
        `Post execution for ${platform} on ${date} contains planning-placeholder language instead of final copy.`,
      );
    }
  }

  private executionPublicText(item: MediaPlanningExecution) {
    return (
      item.publishCopy?.trim() ||
      item.copyPasteCaption?.trim() ||
      item.copyPasteText?.trim() ||
      item.caption?.trim() ||
      item.description?.trim() ||
      ''
    );
  }

  private repairReflectionOnlyExecutions(
    posts: MediaPlanningExecution[],
    opportunities: GeneratedPlan['opportunities'],
    publicEvidence: Set<string>,
    reflectionEvidence: Set<string>,
    identityEvidence: Set<string>,
  ) {
    void opportunities;
    return posts.map((post) => {
      if (post.action !== 'post') return post;
      const usesReflectionEvidence = post.evidenceIds.some((id) =>
        reflectionEvidence.has(id),
      );
      const usesIdentityEvidence = post.evidenceIds.some((id) =>
        identityEvidence.has(id),
      );
      const hasPublicEvidence = post.evidenceIds.some((id) =>
        publicEvidence.has(id),
      );
      if (
        (!usesReflectionEvidence && !usesIdentityEvidence) ||
        hasPublicEvidence
      ) {
        return post;
      }

      const combined = this.executionPublicText(post);
      if (this.isFirstPersonReflectionText(combined)) return post;

      const lead = this.reflectionLead(post.platform);
      const frame = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed || this.isFirstPersonReflectionText(trimmed)) return value;
        return `${lead}\n\n${trimmed}`;
      };

      const repaired = {
        ...post,
        hook: this.isFirstPersonReflectionText(post.hook)
          ? post.hook
          : lead.replace(/:$/, ''),
        publishCopy: frame(post.publishCopy),
        copyPasteText: frame(post.publishCopy),
        copyPasteCaption: frame(post.publishCopy),
        caption: frame(post.caption),
        script: frame(post.script),
        description: frame(post.description),
        videoPack: {
          ...post.videoPack,
          fullScript: frame(post.videoPack.fullScript),
        },
        xThread:
          post.xThread.length > 0
            ? [frame(post.xThread[0]), ...post.xThread.slice(1)]
            : post.xThread,
        whatsappSequence:
          post.whatsappSequence.length > 0
            ? [
                frame(post.whatsappSequence[0]),
                ...post.whatsappSequence.slice(1),
              ]
            : post.whatsappSequence,
        carouselSlides:
          post.carouselSlides.length > 0
            ? post.carouselSlides.map((slide, index) =>
                index === 0
                  ? { ...slide, bodyCopy: frame(slide.bodyCopy) }
                  : slide,
              )
            : post.carouselSlides,
      };

      return repaired;
    });
  }

  private reflectionLead(platform: MediaPlatform) {
    switch (platform) {
      case MediaPlatform.LINKEDIN:
        return "A pattern I've been noticing in my own work — not a universal rule:";
      case MediaPlatform.INSTAGRAM:
        return "Something I've been learning from my own experience:";
      case MediaPlatform.YOUTUBE:
        return "One lesson I've been refining for myself:";
      case MediaPlatform.X:
        return "I've been thinking about this from my own experience:";
      case MediaPlatform.WHATSAPP:
        return "One thing I've been learning in my own work:";
      default:
        return 'From my own experience, this is how I currently think about it:';
    }
  }

  private isFirstPersonReflectionText(text: string) {
    return /\b(?:i|i'm|i’ve|i've|i am|my|me|for me|i think|i learned|i learnt|i noticed|i keep|i ask|i found|i realised|i realized|i've been|i’ve been)\b/i.test(
      text,
    );
  }

  private assertReflectionSafeCopy(
    text: string,
    item: MediaPlanningExecution,
    opportunity: GeneratedPlan['opportunities'][number] | undefined,
    publicEvidence: Set<string>,
    reflectionEvidence: Set<string>,
    identityEvidence: Set<string>,
    date: string,
  ) {
    const usesReflectionEvidence = item.evidenceIds.some((id) =>
      reflectionEvidence.has(id),
    );
    const usesIdentityEvidence = item.evidenceIds.some((id) =>
      identityEvidence.has(id),
    );
    if (!usesReflectionEvidence && !usesIdentityEvidence) return;

    const hasPublicEvidence = item.evidenceIds.some((id) =>
      publicEvidence.has(id),
    );
    if (hasPublicEvidence) return;

    if (opportunity?.companyName?.trim() && !usesIdentityEvidence) {
      throw new Error(
        `Named-company post for ${item.platform} on ${date} needs matching identity-safe evidence when no public company evidence is supplied.`,
      );
    }

    if (!this.isFirstPersonReflectionText(text)) {
      throw new Error(
        `Non-public evidence post for ${item.platform} on ${date} must be framed as Aakash's first-person reflection rather than an asserted company/project fact.`,
      );
    }
  }

  private assertNoInternalStrategyLeak(
    text: string,
    platform: MediaPlatform,
    date: string,
  ) {
    if (
      INTERNAL_MEDIA_STRATEGY_PATTERNS.some((pattern) => pattern.test(text))
    ) {
      throw new Error(
        `Post execution for ${platform} on ${date} leaks internal Media strategy into public content.`,
      );
    }
  }

  private assertHistoricalNovelty(
    text: string,
    historicalFingerprints: PlanningMemory[],
    item: MediaPlanningExecution,
  ) {
    const currentTokens = this.tokens(text);
    for (const memory of historicalFingerprints) {
      const lexical = Array.isArray(memory.lexicalSignature)
        ? memory.lexicalSignature
        : [];
      const lexicalScore = this.jaccard(currentTokens, lexical);
      const normalizedScore = this.textSimilarity(
        text,
        typeof memory.normalizedText === 'string' ? memory.normalizedText : '',
      );
      if (Math.max(lexicalScore, normalizedScore) >= 0.86) {
        throw new Error(
          `Planned ${item.platform} copy is too close to historical Media memory ${String(memory._id)}; create a genuinely new angle/wording.`,
        );
      }
    }
  }

  private textSimilarity(a: string, b: string) {
    if (!a.trim() || !b.trim()) return 0;
    return this.jaccard(this.tokens(a), this.tokens(b));
  }

  private tokens(value: string) {
    return [...new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter(
      (token) => token.length > 2,
    );
  }

  private jaccard(a: string[], b: string[]) {
    if (!a.length || !b.length) return 0;
    const left = new Set(a);
    const right = new Set(b);
    let intersection = 0;
    for (const token of left) if (right.has(token)) intersection += 1;
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown blueprint error.';
  }

  private blueprintStrategySchema(
    dayCount = ROLLING_WINDOW_DAYS,
  ): Record<string, unknown> {
    const schema = this.blueprintSchema() as {
      properties: Record<string, unknown>;
    };
    const opportunities = {
      ...(schema.properties.opportunities as Record<string, unknown>),
      ...(dayCount === 1 ? { minItems: 2, maxItems: 6 } : {}),
    };
    const storyArcs = {
      ...(schema.properties.storyArcs as Record<string, unknown>),
      ...(dayCount === 1 ? { maxItems: 1 } : {}),
    };
    return {
      type: 'object',
      properties: {
        startDate: schema.properties.startDate,
        endDate: schema.properties.endDate,
        timezone: schema.properties.timezone,
        learningStage: schema.properties.learningStage,
        summary: schema.properties.summary,
        opportunities,
        storyArcs,
      },
      required: [
        'startDate',
        'endDate',
        'timezone',
        'learningStage',
        'summary',
        'opportunities',
        'storyArcs',
      ],
      additionalProperties: false,
    };
  }

  private blueprintCalendarSchema(
    dayCount = ROLLING_WINDOW_DAYS,
  ): Record<string, unknown> {
    const schema = this.blueprintSchema() as {
      properties: Record<string, unknown>;
    };
    const days = {
      ...(schema.properties.days as Record<string, unknown>),
      minItems: dayCount,
      maxItems: dayCount,
    };
    return {
      type: 'object',
      properties: { days },
      required: ['days'],
      additionalProperties: false,
    };
  }

  private blueprintSchema(): Record<string, unknown> {
    const strings = { type: 'array', items: { type: 'string' } };
    const opportunity = {
      type: 'object',
      properties: {
        key: { type: 'string' },
        title: { type: 'string' },
        thesis: { type: 'string' },
        whyNow: { type: 'string' },
        sourceSummary: { type: 'string' },
        evidenceIds: strings,
        companyName: { type: 'string' },
        narrative: { type: 'string' },
        strategyNarrativeKey: { type: 'string' },
        topicClusterKey: { type: 'string' },
        growthIntent: {
          type: 'string',
          enum: [
            'authority',
            'discovery',
            'conversion',
            'affinity',
            'conversation',
          ],
        },
        identityPillar: {
          type: 'string',
          enum: MEDIA_PUBLIC_IDENTITY_PILLARS,
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: GROWTH_PLATFORMS },
        },
        formats: {
          type: 'array',
          items: { type: 'string', enum: Object.values(MediaPostType) },
        },
        strategicFit: { type: 'integer', minimum: 0, maximum: 100 },
        novelty: { type: 'integer', minimum: 0, maximum: 100 },
        evidenceStrength: { type: 'integer', minimum: 0, maximum: 100 },
        privacy: {
          type: 'string',
          enum: ['public_safe', 'needs_review'],
        },
        usable: { type: 'boolean' },
      },
      required: [
        'key',
        'title',
        'thesis',
        'whyNow',
        'sourceSummary',
        'evidenceIds',
        'companyName',
        'narrative',
        'strategyNarrativeKey',
        'topicClusterKey',
        'growthIntent',
        'identityPillar',
        'platforms',
        'formats',
        'strategicFit',
        'novelty',
        'evidenceStrength',
        'privacy',
        'usable',
      ],
      additionalProperties: false,
    };
    const storyArc = {
      type: 'object',
      properties: {
        key: { type: 'string' },
        title: { type: 'string' },
        purpose: { type: 'string' },
        narrative: { type: 'string' },
        companyName: { type: 'string' },
        durationDays: { type: 'integer', minimum: 1, maximum: 30 },
        beats: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'integer', minimum: 1 },
              title: { type: 'string' },
              purpose: { type: 'string' },
              opportunityKey: { type: 'string' },
              platforms: {
                type: 'array',
                items: { type: 'string', enum: GROWTH_PLATFORMS },
              },
            },
            required: [
              'order',
              'title',
              'purpose',
              'opportunityKey',
              'platforms',
            ],
            additionalProperties: false,
          },
        },
      },
      required: [
        'key',
        'title',
        'purpose',
        'narrative',
        'companyName',
        'durationDays',
        'beats',
      ],
      additionalProperties: false,
    };
    const executionSkeleton = {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: GROWTH_PLATFORMS },
        action: { type: 'string', enum: ['post', 'skip'] },
        time: { type: 'string' },
        format: { type: 'string', enum: Object.values(MediaPostType) },
        opportunityKey: { type: 'string' },
        storyArcKey: { type: 'string' },
        reason: { type: 'string' },
      },
      required: [
        'platform',
        'action',
        'time',
        'format',
        'opportunityKey',
        'storyArcKey',
        'reason',
      ],
      additionalProperties: false,
    };
    const instagramStory = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['post', 'skip'] },
        time: { type: 'string' },
        sourceType: {
          type: 'string',
          enum: [
            'routine',
            'current_work',
            'learning',
            'hobby',
            'personal_growth',
            'professional',
            'human_moment',
          ],
        },
        sourceEvidenceIds: strings,
        reason: { type: 'string' },
        captureBrief: { type: 'string' },
      },
      required: [
        'action',
        'time',
        'sourceType',
        'sourceEvidenceIds',
        'reason',
        'captureBrief',
      ],
      additionalProperties: false,
    };
    const youtubeCommunity = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['post', 'skip'] },
        time: { type: 'string' },
        format: { type: 'string', enum: ['text', 'image', 'poll'] },
        sourceType: {
          type: 'string',
          enum: [
            'routine',
            'current_work',
            'learning',
            'hobby',
            'personal_growth',
            'professional',
            'human_moment',
          ],
        },
        sourceEvidenceIds: strings,
        reason: { type: 'string' },
      },
      required: [
        'action',
        'time',
        'format',
        'sourceType',
        'sourceEvidenceIds',
        'reason',
      ],
      additionalProperties: false,
    };
    const engagement = {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: GROWTH_PLATFORMS },
        time: { type: 'string' },
        count: { type: 'integer', minimum: 0, maximum: 30 },
        purpose: { type: 'string' },
        guidance: { type: 'string' },
      },
      required: ['platform', 'time', 'count', 'purpose', 'guidance'],
      additionalProperties: false,
    };

    return {
      type: 'object',
      properties: {
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        timezone: { type: 'string' },
        learningStage: { type: 'string' },
        summary: { type: 'string' },
        opportunities: {
          type: 'array',
          minItems: 6,
          maxItems: 14,
          items: opportunity,
        },
        storyArcs: {
          type: 'array',
          maxItems: 3,
          items: storyArc,
        },
        days: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              theme: { type: 'string' },
              workload: { type: 'string' },
              executions: {
                type: 'array',
                minItems: 5,
                maxItems: 5,
                items: executionSkeleton,
              },
              instagramStory,
              youtubeCommunity,
              engagement: {
                type: 'array',
                maxItems: 5,
                items: engagement,
              },
            },
            required: [
              'date',
              'theme',
              'workload',
              'executions',
              'instagramStory',
              'youtubeCommunity',
              'engagement',
            ],
            additionalProperties: false,
          },
        },
      },
      required: [
        'startDate',
        'endDate',
        'timezone',
        'learningStage',
        'summary',
        'opportunities',
        'storyArcs',
        'days',
      ],
      additionalProperties: false,
    };
  }

  private weeklyStoriesSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        stories: {
          type: 'array',
          minItems: 1,
          maxItems: 7,
          items: this.dailyStorySchema(),
        },
      },
      required: ['stories'],
      additionalProperties: false,
    };
  }

  private dailyStorySchema(): Record<string, unknown> {
    const frame = {
      type: 'object',
      properties: {
        order: { type: 'integer', minimum: 1, maximum: 3 },
        overlayText: { type: 'string' },
        spokenText: { type: 'string' },
        visualDescription: { type: 'string' },
        captureInstruction: { type: 'string' },
        interactiveElement: { type: 'string' },
      },
      required: [
        'order',
        'overlayText',
        'spokenText',
        'visualDescription',
        'captureInstruction',
        'interactiveElement',
      ],
      additionalProperties: false,
    };
    return {
      type: 'object',
      properties: {
        date: { type: 'string' },
        instagramStory: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['post'] },
            time: { type: 'string' },
            sourceType: {
              type: 'string',
              enum: [
                'routine',
                'current_work',
                'learning',
                'hobby',
                'personal_growth',
                'professional',
                'human_moment',
              ],
            },
            sourceEvidenceIds: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
            captureBrief: { type: 'string' },
            frames: { type: 'array', minItems: 1, maxItems: 3, items: frame },
            executionReady: { type: 'boolean' },
            readinessIssues: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'action',
            'time',
            'sourceType',
            'sourceEvidenceIds',
            'reason',
            'captureBrief',
            'frames',
            'executionReady',
            'readinessIssues',
          ],
          additionalProperties: false,
        },
      },
      required: ['date', 'instagramStory'],
      additionalProperties: false,
    };
  }

  private weeklyYoutubeCommunitySchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          minItems: 1,
          maxItems: 5,
          items: this.youtubeCommunitySchema(),
        },
      },
      required: ['posts'],
      additionalProperties: false,
    };
  }

  private youtubeCommunitySchema(): Record<string, unknown> {
    const imageBrief = {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['none', 'ai_generation', 'real_photo', 'designed_graphic'],
        },
        aspectRatio: { type: 'string' },
        overlayText: { type: 'string' },
        prompt: { type: 'string' },
        description: { type: 'string' },
        sourceGuidance: { type: 'string' },
      },
      required: [
        'mode',
        'aspectRatio',
        'overlayText',
        'prompt',
        'description',
        'sourceGuidance',
      ],
      additionalProperties: false,
    };
    const community = {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['post'] },
        time: { type: 'string' },
        format: { type: 'string', enum: ['text', 'image', 'poll'] },
        sourceType: {
          type: 'string',
          enum: [
            'routine',
            'current_work',
            'learning',
            'hobby',
            'personal_growth',
            'professional',
            'human_moment',
          ],
        },
        sourceEvidenceIds: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
        publishCopy: { type: 'string' },
        imageBrief,
        pollQuestion: { type: 'string' },
        pollOptions: { type: 'array', items: { type: 'string' }, maxItems: 4 },
        executionReady: { type: 'boolean' },
        readinessIssues: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'action',
        'time',
        'format',
        'sourceType',
        'sourceEvidenceIds',
        'reason',
        'publishCopy',
        'imageBrief',
        'pollQuestion',
        'pollOptions',
        'executionReady',
        'readinessIssues',
      ],
      additionalProperties: false,
    };
    return {
      type: 'object',
      properties: {
        date: { type: 'string' },
        youtubeCommunity: community,
      },
      required: ['date', 'youtubeCommunity'],
      additionalProperties: false,
    };
  }

  private dayPostsSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        date: { type: 'string' },
        posts: {
          type: 'array',
          maxItems: 5,
          items: this.executionPackSchema(),
        },
      },
      required: ['date', 'posts'],
      additionalProperties: false,
    };
  }

  private executionPackSchema(): Record<string, unknown> {
    const strings = { type: 'array', items: { type: 'string' } };
    const timedDirections = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          at: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['at', 'instruction'],
        additionalProperties: false,
      },
    };
    return {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: GROWTH_PLATFORMS },
        action: { type: 'string', enum: ['post'] },
        time: { type: 'string' },
        format: { type: 'string', enum: Object.values(MediaPostType) },
        formatIntent: { type: 'string' },
        opportunityKey: { type: 'string' },
        storyArcKey: { type: 'string' },
        reason: { type: 'string' },
        whyThisFormat: { type: 'string' },
        whyThisTime: { type: 'string' },
        title: { type: 'string' },
        hook: { type: 'string' },
        caption: { type: 'string' },
        script: { type: 'string' },
        description: { type: 'string' },
        cta: { type: 'string' },
        hashtags: strings,
        slides: strings,
        coverText: { type: 'string' },
        thumbnailText: { type: 'string' },
        pinnedComment: { type: 'string' },
        storyFollowUp: { type: 'string' },
        productionNotes: { type: 'string' },
        publishCopy: { type: 'string' },
        evidenceIds: strings,
        imageBrief: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['none', 'ai_generation', 'real_photo', 'designed_graphic'],
            },
            aspectRatio: { type: 'string' },
            overlayText: { type: 'string' },
            prompt: { type: 'string' },
            description: { type: 'string' },
            sourceGuidance: { type: 'string' },
          },
          required: [
            'mode',
            'aspectRatio',
            'overlayText',
            'prompt',
            'description',
            'sourceGuidance',
          ],
          additionalProperties: false,
        },
        carouselSlides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'integer', minimum: 1 },
              headline: { type: 'string' },
              bodyCopy: { type: 'string' },
              visualType: {
                type: 'string',
                enum: [
                  'ai_image',
                  'real_photo',
                  'designed_graphic',
                  'text_only',
                ],
              },
              imagePrompt: { type: 'string' },
              visualDescription: { type: 'string' },
              overlayText: { type: 'string' },
            },
            required: [
              'slideNumber',
              'headline',
              'bodyCopy',
              'visualType',
              'imagePrompt',
              'visualDescription',
              'overlayText',
            ],
            additionalProperties: false,
          },
        },
        videoPack: {
          type: 'object',
          properties: {
            fullScript: { type: 'string' },
            targetDurationSeconds: {
              type: 'integer',
              minimum: 0,
              maximum: 7200,
            },
            deliveryInstructions: { type: 'string' },
            cameraInstructions: { type: 'string' },
            punchIns: timedDirections,
            broll: timedDirections,
            onScreenText: timedDirections,
            musicDirection: { type: 'string' },
            coverDirection: { type: 'string' },
          },
          required: [
            'fullScript',
            'targetDurationSeconds',
            'deliveryInstructions',
            'cameraInstructions',
            'punchIns',
            'broll',
            'onScreenText',
            'musicDirection',
            'coverDirection',
          ],
          additionalProperties: false,
        },
        xThread: strings,
        whatsappSequence: strings,
        executionReady: { type: 'boolean' },
        readinessIssues: strings,
        estimatedMinutes: { type: 'integer', minimum: 0, maximum: 240 },
        requiresApproval: { type: 'boolean' },
      },
      required: [
        'platform',
        'action',
        'time',
        'format',
        'formatIntent',
        'opportunityKey',
        'storyArcKey',
        'reason',
        'whyThisFormat',
        'whyThisTime',
        'title',
        'hook',
        'caption',
        'script',
        'description',
        'cta',
        'hashtags',
        'slides',
        'coverText',
        'thumbnailText',
        'pinnedComment',
        'storyFollowUp',
        'productionNotes',
        'publishCopy',
        'evidenceIds',
        'imageBrief',
        'carouselSlides',
        'videoPack',
        'xThread',
        'whatsappSequence',
        'executionReady',
        'readinessIssues',
        'estimatedMinutes',
        'requiresApproval',
      ],
      additionalProperties: false,
    };
  }

  private planSchema(): Record<string, unknown> {
    const strings = { type: 'array', items: { type: 'string' } };
    const timedDirections = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          at: { type: 'string' },
          instruction: { type: 'string' },
        },
        required: ['at', 'instruction'],
        additionalProperties: false,
      },
    };
    const imageBrief = {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['none', 'ai_generation', 'real_photo', 'designed_graphic'],
        },
        aspectRatio: { type: 'string' },
        overlayText: { type: 'string' },
        prompt: { type: 'string' },
        description: { type: 'string' },
        sourceGuidance: { type: 'string' },
      },
      required: [
        'mode',
        'aspectRatio',
        'overlayText',
        'prompt',
        'description',
        'sourceGuidance',
      ],
      additionalProperties: false,
    };
    const carouselSlides = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slideNumber: { type: 'integer', minimum: 1 },
          headline: { type: 'string' },
          bodyCopy: { type: 'string' },
          visualType: {
            type: 'string',
            enum: ['ai_image', 'real_photo', 'designed_graphic', 'text_only'],
          },
          imagePrompt: { type: 'string' },
          visualDescription: { type: 'string' },
          overlayText: { type: 'string' },
        },
        required: [
          'slideNumber',
          'headline',
          'bodyCopy',
          'visualType',
          'imagePrompt',
          'visualDescription',
          'overlayText',
        ],
        additionalProperties: false,
      },
    };
    const videoPack = {
      type: 'object',
      properties: {
        fullScript: { type: 'string' },
        targetDurationSeconds: { type: 'integer', minimum: 0, maximum: 7200 },
        deliveryInstructions: { type: 'string' },
        cameraInstructions: { type: 'string' },
        punchIns: timedDirections,
        broll: timedDirections,
        onScreenText: timedDirections,
        musicDirection: { type: 'string' },
        coverDirection: { type: 'string' },
      },
      required: [
        'fullScript',
        'targetDurationSeconds',
        'deliveryInstructions',
        'cameraInstructions',
        'punchIns',
        'broll',
        'onScreenText',
        'musicDirection',
        'coverDirection',
      ],
      additionalProperties: false,
    };
    const execution = {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: GROWTH_PLATFORMS },
        action: { type: 'string', enum: ['post', 'skip'] },
        time: { type: 'string' },
        format: { type: 'string', enum: Object.values(MediaPostType) },
        formatIntent: { type: 'string' },
        opportunityKey: { type: 'string' },
        storyArcKey: { type: 'string' },
        reason: { type: 'string' },
        whyThisFormat: { type: 'string' },
        whyThisTime: { type: 'string' },
        title: { type: 'string' },
        hook: { type: 'string' },
        caption: { type: 'string' },
        script: { type: 'string' },
        description: { type: 'string' },
        cta: { type: 'string' },
        hashtags: strings,
        slides: strings,
        coverText: { type: 'string' },
        thumbnailText: { type: 'string' },
        pinnedComment: { type: 'string' },
        storyFollowUp: { type: 'string' },
        productionNotes: { type: 'string' },
        publishCopy: { type: 'string' },
        evidenceIds: strings,
        imageBrief,
        carouselSlides,
        videoPack,
        xThread: strings,
        whatsappSequence: strings,
        executionReady: { type: 'boolean' },
        readinessIssues: strings,
        estimatedMinutes: { type: 'integer', minimum: 0, maximum: 240 },
        requiresApproval: { type: 'boolean' },
      },
      required: [
        'platform',
        'action',
        'time',
        'format',
        'formatIntent',
        'opportunityKey',
        'storyArcKey',
        'reason',
        'whyThisFormat',
        'whyThisTime',
        'title',
        'hook',
        'caption',
        'script',
        'description',
        'cta',
        'hashtags',
        'slides',
        'coverText',
        'thumbnailText',
        'pinnedComment',
        'storyFollowUp',
        'productionNotes',
        'publishCopy',
        'evidenceIds',
        'imageBrief',
        'carouselSlides',
        'videoPack',
        'xThread',
        'whatsappSequence',
        'executionReady',
        'readinessIssues',
        'estimatedMinutes',
        'requiresApproval',
      ],
      additionalProperties: false,
    };
    return {
      type: 'object',
      properties: {
        startDate: { type: 'string' },
        endDate: { type: 'string' },
        timezone: { type: 'string' },
        learningStage: { type: 'string' },
        summary: { type: 'string' },
        opportunities: {
          type: 'array',
          minItems: 6,
          maxItems: 12,
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              thesis: { type: 'string' },
              whyNow: { type: 'string' },
              sourceSummary: { type: 'string' },
              evidenceIds: strings,
              companyName: { type: 'string' },
              narrative: { type: 'string' },
              platforms: {
                type: 'array',
                items: { type: 'string', enum: GROWTH_PLATFORMS },
              },
              formats: {
                type: 'array',
                items: { type: 'string', enum: Object.values(MediaPostType) },
              },
              strategicFit: { type: 'integer', minimum: 0, maximum: 100 },
              novelty: { type: 'integer', minimum: 0, maximum: 100 },
              evidenceStrength: { type: 'integer', minimum: 0, maximum: 100 },
              privacy: {
                type: 'string',
                enum: ['public_safe', 'needs_review'],
              },
              usable: { type: 'boolean' },
            },
            required: [
              'key',
              'title',
              'thesis',
              'whyNow',
              'sourceSummary',
              'evidenceIds',
              'companyName',
              'narrative',
              'platforms',
              'formats',
              'strategicFit',
              'novelty',
              'evidenceStrength',
              'privacy',
              'usable',
            ],
            additionalProperties: false,
          },
        },
        storyArcs: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              title: { type: 'string' },
              purpose: { type: 'string' },
              narrative: { type: 'string' },
              companyName: { type: 'string' },
              durationDays: { type: 'integer', minimum: 1, maximum: 30 },
              beats: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    order: { type: 'integer', minimum: 1 },
                    title: { type: 'string' },
                    purpose: { type: 'string' },
                    opportunityKey: { type: 'string' },
                    platforms: {
                      type: 'array',
                      items: { type: 'string', enum: GROWTH_PLATFORMS },
                    },
                  },
                  required: [
                    'order',
                    'title',
                    'purpose',
                    'opportunityKey',
                    'platforms',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'key',
              'title',
              'purpose',
              'narrative',
              'companyName',
              'durationDays',
              'beats',
            ],
            additionalProperties: false,
          },
        },
        days: {
          type: 'array',
          minItems: 7,
          maxItems: 7,
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              theme: { type: 'string' },
              workload: { type: 'string' },
              executions: {
                type: 'array',
                minItems: 5,
                maxItems: 5,
                items: execution,
              },
              engagement: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    platform: { type: 'string', enum: GROWTH_PLATFORMS },
                    time: { type: 'string' },
                    count: { type: 'integer', minimum: 0, maximum: 30 },
                    purpose: { type: 'string' },
                    guidance: { type: 'string' },
                  },
                  required: [
                    'platform',
                    'time',
                    'count',
                    'purpose',
                    'guidance',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['date', 'theme', 'workload', 'executions', 'engagement'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'startDate',
        'endDate',
        'timezone',
        'learningStage',
        'summary',
        'opportunities',
        'storyArcs',
        'days',
      ],
      additionalProperties: false,
    };
  }
}
