import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { AiService } from '../ai/ai.service';
import { MediaCalendarService } from './media-calendar.service';
import { MediaEngagementService } from './media-engagement.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaLearningService } from './media-learning.service';
import { MediaPresenceService } from './media-presence.service';
import {
  MediaPlanningCycle,
  MediaPlanningCycleDocument,
} from './schemas/media-planning-cycle.schema';
import {
  MediaPresenceReview,
  MediaPresenceReviewDocument,
} from './schemas/media-presence-review.schema';
import { MediaPlatform } from './schemas/media-post.schema';

const PLATFORMS = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
];
const TZ = 'Asia/Kolkata';

type PlatformScore = MediaPresenceReview['platformScores'][number];
type GeneratedReview = Pick<
  MediaPresenceReview,
  | 'summary'
  | 'wins'
  | 'risks'
  | 'focusThisWeek'
  | 'avoidThisWeek'
  | 'experiments'
  | 'planningGuidance'
  | 'cadenceAdjustments'
  | 'narrativeAdjustments'
  | 'strategyChangeCandidates'
>;

@Injectable()
export class MediaStrategyAdaptationService {
  constructor(
    @InjectModel(MediaPresenceReview.name)
    private readonly reviewModel: Model<MediaPresenceReviewDocument>,
    @InjectModel(MediaPlanningCycle.name)
    private readonly planningModel: Model<MediaPlanningCycleDocument>,
    private readonly aiService: AiService,
    private readonly presenceService: MediaPresenceService,
    private readonly growthService: MediaGrowthService,
    private readonly learningService: MediaLearningService,
    private readonly engagementService: MediaEngagementService,
    private readonly calendarService: MediaCalendarService,
  ) {}

  async overview() {
    const latest = await this.reviewModel
      .findOne({ isActive: true })
      .sort({ windowEnd: -1, generatedAt: -1 })
      .lean();
    return {
      generatedAt: new Date().toISOString(),
      latest,
      policy: {
        weeklyOverlayMayAdaptAutomatically: true,
        coreThirtyNinetyDayStrategyMutatesAutomatically: false,
        largeStrategyChangesRequireApproval: true,
        scoreUsesOwnMeasuredData: true,
        lowDataConfidenceIsShownExplicitly: true,
        publicFigurePillarSignalsTrackedSeparately: true,
      },
    };
  }

  async planningContext() {
    return this.reviewModel
      .findOne({ isActive: true })
      .sort({ windowEnd: -1, generatedAt: -1 })
      .lean();
  }

  async generate(options: { force?: boolean; notes?: string } = {}) {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 30 * 86_400_000);
    const key = this.weekKey(windowEnd);
    const existing = await this.reviewModel.findOne({ key, isActive: true });
    if (existing && !options.force && !options.notes?.trim()) return existing;

    const [
      presence,
      growth,
      learning,
      engagement,
      calendar,
      latestPlan,
      previous,
    ] = await Promise.all([
      this.presenceService.overview(),
      this.growthService.overview(30),
      this.learningService.overview(90),
      this.engagementService.overview(30),
      this.calendarService.overview(),
      this.planningModel
        .findOne({ isActive: true })
        .sort({ startDate: -1, generatedAt: -1 })
        .lean(),
      this.reviewModel
        .findOne({ isActive: true, key: { $ne: key } })
        .sort({ windowEnd: -1, generatedAt: -1 })
        .lean(),
    ]);

    const platformScores = this.calculatePlatformScores({
      growth,
      learning,
      engagement,
      calendar,
      presence,
    });
    const overallScore = this.weightedOverall(platformScores);
    const dataConfidence = this.average(
      platformScores.map((item) => item.dataConfidence),
    );
    const previousScore = previous?.overallScore;
    const scoreDelta = this.round(
      overallScore - (previousScore ?? overallScore),
    );
    const sourceFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          strategy: presence.strategy?.sourceFingerprint ?? null,
          plan: latestPlan?.key ?? null,
          platformScores,
          performance: learning.performance.slice(0, 12).map((item) => ({
            id: item.publicationId,
            percentile: item.percentile,
            period: item.period,
          })),
          audience: learning.audience.slice(0, 12).map((item) => ({
            key: item.key,
            occurrences: item.occurrences,
            confidence: item.confidence,
          })),
        }),
      )
      .digest('hex');

    try {
      const response =
        await this.aiService.generateStructuredResponse<GeneratedReview>({
          name: 'hsakaa_media_presence_weekly_adaptation_v34',
          instructions: [
            "You are HSAKAA, Aakash's weekly Presence strategist. Adapt the next week from measured evidence without turning Aakash into a generic creator.",
            'The supplied numeric Presence Score is deterministic evidence. Explain it; do not overwrite or invent scores.',
            'Weekly focus, cadence and narrative overlays may adapt automatically and will influence the next seven-day plan.',
            'Do NOT rewrite the permanent 30/90-day identity strategy. Any material positioning, audience, narrative architecture or brand change must appear only under strategyChangeCandidates with requiresApproval=true.',
            'Use low-confidence evidence cautiously. Early-stage exploration should preserve experimentation rather than overfitting tiny samples.',
            'Learn mechanisms from winners and failures, never reuse exact hooks, examples, phrases or structures.',
            'Skip or reduce posting where evidence and quality justify it. More volume is not automatically better.',
            'Evaluate the five Aakash identity pillars separately across reach, authority, affinity and engagement. Do not let raw impressions become the sole optimization target and do not collapse the public identity into the current winning professional topic.',
            'Keep LinkedIn, Instagram, YouTube, X and WhatsApp strategically distinct.',
          ].join('\n'),
          input: JSON.stringify({
            owner: 'Aakash',
            timezone: TZ,
            notes: options.notes?.trim() || null,
            currentPresenceStrategy: presence.strategy,
            voiceConfidence: presence.voice?.confidence ?? 0,
            platformScores,
            overallScore,
            previousScore: previousScore ?? null,
            scoreDelta,
            dataConfidence,
            latestPlan,
            publicFigurePillarSignals: learning.pillarSignals,
            performanceIntelligence: learning.performance.slice(0, 20),
            audienceIntelligence: learning.audience.slice(0, 20),
            growthSummary: growth,
            engagementSummary: {
              total: engagement.total,
              needsResponse: engagement.needsResponse,
              replied: engagement.replied,
              byPlatform: engagement.byPlatform,
            },
            calendarCoverage: calendar.coverage,
          }),
          schema: this.reviewSchema(),
          maxOutputTokens: 6000,
          reasoningEffort: 'medium',
          verbosity: 'medium',
        });
      this.assertReview(response.data);
      return this.reviewModel.findOneAndUpdate(
        { key },
        {
          $set: {
            ...response.data,
            key,
            windowStart,
            windowEnd,
            overallScore,
            previousScore,
            scoreDelta,
            dataConfidence,
            platformScores,
            sourceFingerprint,
            aiModel: response.model,
            aiResponseId: response.responseId,
            generatedAt: new Date(),
            isActive: true,
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not adapt the weekly Media Presence strategy. ${error instanceof Error ? error.message : 'Unknown strategy adaptation error.'}`,
      );
    }
  }

  private calculatePlatformScores(input: {
    growth: Awaited<ReturnType<MediaGrowthService['overview']>>;
    learning: Awaited<ReturnType<MediaLearningService['overview']>>;
    engagement: Awaited<ReturnType<MediaEngagementService['overview']>>;
    calendar: Awaited<ReturnType<MediaCalendarService['overview']>>;
    presence: Awaited<ReturnType<MediaPresenceService['overview']>>;
  }): PlatformScore[] {
    return PLATFORMS.map((platform) => {
      const coverageRows = input.calendar.coverage.filter(
        (item) => item.platform === platform,
      );
      const consistency = coverageRows.length
        ? this.average(coverageRows.map((item) => item.coveragePercent))
        : 35;
      const growth = input.growth.platformSummaries.find(
        (item) => item.platform === platform,
      );
      const accountGrowth = input.growth.accountGrowth.filter(
        (item) => item.platform === platform,
      );
      const contentQuality = growth?.averagePerformanceScore ?? 45;
      const meanGrowth = accountGrowth.length
        ? this.average(accountGrowth.map((item) => item.growthPercent))
        : 0;
      const reachMomentum = this.clamp(50 + meanGrowth * 6);
      const engagement = input.engagement.byPlatform.find(
        (item) => item.platform === platform,
      );
      const audienceResponse = engagement?.total
        ? this.clamp(
            55 +
              (engagement.replied / Math.max(1, engagement.total)) * 30 -
              (engagement.needsResponse / Math.max(1, engagement.total)) * 15,
          )
        : 45;
      const performance = input.learning.performance.filter(
        (item) => item.platform === platform,
      );
      const strategicFit = performance.length
        ? this.average(performance.slice(0, 12).map((item) => item.percentile))
        : input.presence.strategy?.platformRoles.some(
              (item) => item.platform === platform,
            )
          ? 55
          : 40;
      const measuredPublications = growth?.publications ?? 0;
      const snapshotCount = accountGrowth.reduce(
        (sum, item) => sum + item.snapshots,
        0,
      );
      const dataConfidence = this.clamp(
        20 +
          Math.min(35, measuredPublications * 5) +
          Math.min(30, snapshotCount * 3) +
          Math.min(15, performance.length * 3),
      );
      const score = this.round(
        consistency * 0.25 +
          reachMomentum * 0.18 +
          contentQuality * 0.25 +
          audienceResponse * 0.14 +
          strategicFit * 0.18,
      );
      return {
        platform,
        score,
        consistency: this.round(consistency),
        reachMomentum: this.round(reachMomentum),
        contentQuality: this.round(contentQuality),
        audienceResponse: this.round(audienceResponse),
        strategicFit: this.round(strategicFit),
        dataConfidence: this.round(dataConfidence),
        rationale:
          dataConfidence < 50
            ? 'Early evidence: keep exploring; the score is directional, not a verdict.'
            : "Score combines Aakash's own consistency, measured content quality, audience response, growth momentum and strategic fit.",
      };
    });
  }

  private weightedOverall(scores: PlatformScore[]) {
    if (!scores.length) return 0;
    const weights = scores.map((item) =>
      Math.max(0.25, item.dataConfidence / 100),
    );
    const totalWeight = weights.reduce((sum, item) => sum + item, 0);
    return this.round(
      scores.reduce(
        (sum, item, index) => sum + item.score * weights[index],
        0,
      ) / Math.max(0.01, totalWeight),
    );
  }

  private weekKey(date: Date) {
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
    const d = new Date(`${local}T12:00:00Z`);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  private assertReview(review: GeneratedReview) {
    const platforms = new Set(
      review.cadenceAdjustments.map((item) => item.platform),
    );
    for (const platform of PLATFORMS) {
      if (!platforms.has(platform)) {
        throw new Error(
          `Weekly adaptation omitted cadence guidance for ${platform}.`,
        );
      }
    }
    if (
      review.strategyChangeCandidates.some((item) => !item.requiresApproval)
    ) {
      throw new Error('Material strategy changes must require owner approval.');
    }
  }

  private reviewSchema(): Record<string, unknown> {
    const strings = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        wins: strings,
        risks: strings,
        focusThisWeek: strings,
        avoidThisWeek: strings,
        experiments: strings,
        planningGuidance: strings,
        cadenceAdjustments: {
          type: 'array',
          minItems: PLATFORMS.length,
          maxItems: PLATFORMS.length,
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: PLATFORMS },
              direction: {
                type: 'string',
                enum: ['increase', 'hold', 'decrease'],
              },
              reason: { type: 'string' },
            },
            required: ['platform', 'direction', 'reason'],
            additionalProperties: false,
          },
        },
        narrativeAdjustments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              narrative: { type: 'string' },
              direction: {
                type: 'string',
                enum: ['increase', 'hold', 'decrease'],
              },
              reason: { type: 'string' },
            },
            required: ['narrative', 'direction', 'reason'],
            additionalProperties: false,
          },
        },
        strategyChangeCandidates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              proposedChange: { type: 'string' },
              reason: { type: 'string' },
              requiresApproval: { type: 'boolean', enum: [true] },
            },
            required: ['field', 'proposedChange', 'reason', 'requiresApproval'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'summary',
        'wins',
        'risks',
        'focusThisWeek',
        'avoidThisWeek',
        'experiments',
        'planningGuidance',
        'cadenceAdjustments',
        'narrativeAdjustments',
        'strategyChangeCandidates',
      ],
      additionalProperties: false,
    };
  }

  private average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, item) => sum + item, 0) / values.length;
  }
  private round(value: number) {
    return Math.round(value * 10) / 10;
  }
  private clamp(value: number) {
    return Math.max(0, Math.min(100, value));
  }
}
