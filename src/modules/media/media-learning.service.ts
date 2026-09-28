import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";

import { AiService } from "../ai/ai.service";
import { MediaGrowthService } from "./media-growth.service";
import {
  MEDIA_PUBLIC_IDENTITY_PILLARS,
  resolveMediaPublicIdentityPillar,
} from "./media-public-identity";
import {
  MediaAudienceInsight,
  MediaAudienceInsightDocument,
  MediaAudienceSignalType,
} from "./schemas/media-audience-insight.schema";
import {
  MediaContentItem,
  MediaContentItemDocument,
} from "./schemas/media-content-item.schema";
import {
  MediaEngagementIntent,
  MediaEngagementItem,
  MediaEngagementItemDocument,
} from "./schemas/media-engagement-item.schema";
import {
  MediaMetricSnapshot,
  MediaMetricSnapshotDocument,
  MetricSnapshotPeriod,
} from "./schemas/media-metric-snapshot.schema";
import {
  MediaPerformanceInsight,
  MediaPerformanceInsightDocument,
} from "./schemas/media-performance-insight.schema";
import {
  MediaPublication,
  MediaPublicationDocument,
} from "./schemas/media-publication.schema";

interface GeneratedPerformanceInsight {
  publicationId: string;
  summary: string;
  whyItWorked: string;
  whatLimitedIt: string;
  doMore: string[];
  doLess: string[];
  nextExperiment: string;
  mechanisms: string[];
  pinDecision: "pin" | "do_not_pin" | "wait";
  pinReason: string;
  boostDecision: "boost" | "do_not_boost" | "wait";
  boostReason: string;
  changeRecommendations: string[];
  repurposeIdeas: string[];
}

interface GeneratedAudienceInsight {
  key: string;
  type: MediaAudienceSignalType;
  topic: string;
  summary: string;
  engagementIds: string[];
  recommendedContentAngle: string;
  recommendedPlatforms: string[];
  highIntent: boolean;
}

@Injectable()
export class MediaLearningService {
  constructor(
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaMetricSnapshot.name)
    private readonly metricModel: Model<MediaMetricSnapshotDocument>,
    @InjectModel(MediaEngagementItem.name)
    private readonly engagementModel: Model<MediaEngagementItemDocument>,
    @InjectModel(MediaPerformanceInsight.name)
    private readonly performanceInsightModel: Model<MediaPerformanceInsightDocument>,
    @InjectModel(MediaAudienceInsight.name)
    private readonly audienceInsightModel: Model<MediaAudienceInsightDocument>,
    private readonly aiService: AiService,
    private readonly growthService: MediaGrowthService,
  ) {}

  async overview(days = 90) {
    const safeDays = Math.min(Math.max(Math.trunc(days || 90), 7), 365);
    const [lifecycle, performance, audience] = await Promise.all([
      this.growthService.lifecycleOverview(150),
      this.performanceInsightModel
        .find({ isActive: true })
        .sort({ generatedAt: -1, confidence: -1 })
        .limit(40)
        .lean(),
      this.audienceInsightModel
        .find({ isActive: true })
        .sort({ confidence: -1, occurrences: -1, generatedAt: -1 })
        .limit(40)
        .lean(),
    ]);
    const pillarSignals = this.summarizePillarSignals(performance);
    return {
      generatedAt: new Date().toISOString(),
      rangeDays: safeDays,
      lifecycle,
      performance,
      audience,
      pillarSignals,
      policy: {
        lifecyclePeriods: [
          MetricSnapshotPeriod.FORTY_EIGHT_HOURS,
          MetricSnapshotPeriod.NINETY_SIX_HOURS,
        ],
        compareAgainstOwnPlatformFormatBaseline: true,
        learnMechanismNotExactWording: true,
        audienceQuestionsBecomePlanningEvidence: true,
        engagementSendingStillRequiresApproval: true,
        publicFigureLearningUsesReachAuthorityAffinityEngagement: true,
      },
    };
  }

  async rebuildAll(days = 90) {
    const lifecycle = await this.growthService.syncLifecycle(150);
    const [performance, audience] = await Promise.all([
      this.rebuildPerformance(days),
      this.rebuildAudience(Math.min(days, 90)),
    ]);
    return { lifecycle, performance, audience };
  }

  async rebuildPerformance(days = 90) {
    const safeDays = Math.min(Math.max(Math.trunc(days || 90), 7), 365);
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const publications = await this.publicationModel
      .find({ isActive: true, publishedAt: { $gte: since } })
      .sort({ publishedAt: -1 })
      .limit(80)
      .lean();
    if (!publications.length) return { analyzed: 0, insights: [] };

    const publicationIds = publications.map((item) => item._id);
    const snapshots = await this.metricModel
      .find({ mediaPublicationId: { $in: publicationIds } })
      .sort({ capturedAt: -1 })
      .lean();
    const selected = new Map<string, (typeof snapshots)[number]>();
    const periodRank: Record<string, number> = {
      [MetricSnapshotPeriod.THIRTY_DAYS]: 8,
      [MetricSnapshotPeriod.SEVEN_DAYS]: 7,
      [MetricSnapshotPeriod.NINETY_SIX_HOURS]: 6,
      [MetricSnapshotPeriod.SEVENTY_TWO_HOURS]: 5,
      [MetricSnapshotPeriod.FORTY_EIGHT_HOURS]: 4,
      [MetricSnapshotPeriod.TWENTY_FOUR_HOURS]: 3,
      [MetricSnapshotPeriod.ONE_HOUR]: 2,
      [MetricSnapshotPeriod.LATEST]: 1,
    };
    for (const snapshot of snapshots) {
      const key = snapshot.mediaPublicationId?.toString();
      if (!key) continue;
      const current = selected.get(key);
      if (
        !current ||
        (periodRank[snapshot.period] ?? 0) > (periodRank[current.period] ?? 0)
      ) {
        selected.set(key, snapshot);
      }
    }
    const measured = publications.filter((item) =>
      selected.has(item._id.toString()),
    );
    if (!measured.length) return { analyzed: 0, insights: [] };

    const contentIds = measured.map((item) => item.contentItemId);
    const content = await this.contentModel
      .find({ _id: { $in: contentIds } })
      .lean();
    const contentMap = new Map(
      content.map((item) => [item._id.toString(), item]),
    );

    const peerScores = new Map<string, number[]>();
    for (const publication of measured) {
      const snapshot = selected.get(publication._id.toString())!;
      const key = `${publication.platform}|${publication.format}|${snapshot.period}`;
      const scores = peerScores.get(key) ?? [];
      scores.push(snapshot.performanceScore || 0);
      peerScores.set(key, scores);
    }
    const percentileFor = (score: number, scores: number[]) => {
      if (!scores.length) return 50;
      const belowOrEqual = scores.filter((item) => item <= score).length;
      return Math.max(
        1,
        Math.min(99, Math.round((belowOrEqual / scores.length) * 100)),
      );
    };

    const input = measured.slice(0, 40).map((publication) => {
      const snapshot = selected.get(publication._id.toString())!;
      const contentItem = contentMap.get(publication.contentItemId.toString());
      const key = `${publication.platform}|${publication.format}|${snapshot.period}`;
      return {
        publicationId: publication._id.toString(),
        platform: publication.platform,
        format: publication.format,
        title: publication.title,
        hook: publication.hook,
        caption: publication.caption,
        script: publication.script,
        cta: publication.cta,
        publishedAt: publication.publishedAt,
        period: snapshot.period,
        percentile: percentileFor(
          snapshot.performanceScore || 0,
          peerScores.get(key) ?? [],
        ),
        metrics: {
          performanceScore: snapshot.performanceScore,
          impressions: snapshot.impressions,
          reach: snapshot.reach,
          views: snapshot.views,
          engagementRate: snapshot.engagementRate,
          shareSaveRate: snapshot.shareSaveRate,
          followerConversionRate: snapshot.followerConversionRate,
          profileVisits: snapshot.profileVisits,
          followersGained: snapshot.followersGained,
          averageWatchPercentage: snapshot.averageWatchPercentage,
          likes: snapshot.likes,
          comments: snapshot.comments,
          shares: snapshot.shares,
          saves: snapshot.saves,
          sends: snapshot.sends,
          clicks: snapshot.clicks,
        },
        identityPillar: resolveMediaPublicIdentityPillar([
          ...(contentItem?.contentPillars ?? []),
          contentItem?.title,
          contentItem?.thesis,
        ]),
        context: {
          title: contentItem?.title,
          thesis: contentItem?.thesis,
          pillars: contentItem?.contentPillars ?? [],
          audiences: contentItem?.audiences ?? [],
          origin: contentItem?.origin,
        },
      };
    });

    let generated: GeneratedPerformanceInsight[];
    let aiModel: string | undefined;
    let aiResponseId: string | undefined;
    try {
      const response = await this.aiService.generateStructuredResponse<{
        insights: GeneratedPerformanceInsight[];
      }>({
        name: "hsakaa_media_performance_intelligence_v33",
        instructions: [
          "You are HSAKAA performance analyst for Aakash. Explain what the evidence suggests, not what sounds clever.",
          "Compare a post against Aakash's own platform + format + lifecycle-period baseline, using the supplied percentile.",
          "Separate discovery/hook, consumption/retention, resonance/share-save, conversation/comments, profile/follower conversion and CTA effects when metrics support those conclusions.",
          "Do not infer unavailable metrics. Do not claim causation from correlation. Say evidence is weak when sample size or signals are weak.",
          "Learn mechanisms, not exact hooks, phrases, stories or structures. Anti-repetition remains authoritative.",
          "Act as a social media manager too. Decide whether each published post should be pinned/featured, left alone, changed in future variants, repurposed, or considered for paid boosting.",
          "A boost recommendation must amplify proven organic resonance, never rescue weak content. If the sample is small, lifecycle is too early, or comparable history is weak, return boostDecision=wait.",
          "Pin/feature only content that is both relatively strong and representative of the public identity Aakash wants new visitors to understand. A high score alone is not enough.",
          "changeRecommendations should be concrete packaging or creative changes such as hook, first frame, thumbnail, caption, CTA, pacing or format. Do not rewrite the full post.",
          "Every requested publicationId must appear exactly once.",
        ].join("\n"),
        input: JSON.stringify({ publications: input }),
        schema: {
          type: "object",
          properties: {
            insights: {
              type: "array",
              minItems: input.length,
              maxItems: input.length,
              items: {
                type: "object",
                properties: {
                  publicationId: { type: "string" },
                  summary: { type: "string" },
                  whyItWorked: { type: "string" },
                  whatLimitedIt: { type: "string" },
                  doMore: { type: "array", items: { type: "string" } },
                  doLess: { type: "array", items: { type: "string" } },
                  nextExperiment: { type: "string" },
                  mechanisms: { type: "array", items: { type: "string" } },
                  pinDecision: {
                    type: "string",
                    enum: ["pin", "do_not_pin", "wait"],
                  },
                  pinReason: { type: "string" },
                  boostDecision: {
                    type: "string",
                    enum: ["boost", "do_not_boost", "wait"],
                  },
                  boostReason: { type: "string" },
                  changeRecommendations: {
                    type: "array",
                    items: { type: "string" },
                  },
                  repurposeIdeas: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: [
                  "publicationId",
                  "summary",
                  "whyItWorked",
                  "whatLimitedIt",
                  "doMore",
                  "doLess",
                  "nextExperiment",
                  "mechanisms",
                  "pinDecision",
                  "pinReason",
                  "boostDecision",
                  "boostReason",
                  "changeRecommendations",
                  "repurposeIdeas",
                ],
                additionalProperties: false,
              },
            },
          },
          required: ["insights"],
          additionalProperties: false,
        },
        maxOutputTokens: 8000,
        reasoningEffort: "medium",
        verbosity: "medium",
      });
      generated = response.data.insights;
      aiModel = response.model;
      aiResponseId = response.responseId;
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not analyze Media performance. ${error instanceof Error ? error.message : "Unknown analysis error."}`,
      );
    }

    const generatedMap = new Map(
      generated.map((item) => [item.publicationId, item]),
    );
    const saved: MediaPerformanceInsight[] = [];
    for (const item of input) {
      const analysis = generatedMap.get(item.publicationId);
      if (!analysis) continue;
      const publication = measured.find(
        (row) => row._id.toString() === item.publicationId,
      )!;
      const snapshot = selected.get(item.publicationId)!;
      saved.push(
        await this.performanceInsightModel
          .findOneAndUpdate(
            { publicationId: publication._id },
            {
              $set: {
                publicationId: publication._id,
                contentItemId: publication.contentItemId,
                platform: publication.platform,
                format: publication.format,
                period: snapshot.period,
                percentile: item.percentile,
                confidence: Math.min(
                  95,
                  45 +
                    Math.max(
                      0,
                      peerScores.get(
                        `${publication.platform}|${publication.format}|${snapshot.period}`,
                      )?.length ?? 0,
                    ) *
                      8,
                ),
                identityPillar: item.identityPillar,
                publicFigureSignals: this.calculatePublicFigureSignals(
                  snapshot,
                  item.percentile,
                ),
                summary: analysis.summary,
                whyItWorked: analysis.whyItWorked,
                whatLimitedIt: analysis.whatLimitedIt,
                doMore: analysis.doMore,
                doLess: analysis.doLess,
                nextExperiment: analysis.nextExperiment,
                mechanisms: analysis.mechanisms,
                evidence: {
                  metrics: item.metrics,
                  contentPillars: item.context.pillars,
                  publicFigureLearningDimensions: [
                    "reach",
                    "authority",
                    "affinity",
                    "engagement",
                  ],
                },
                management: this.buildManagementRecommendation({
                  analysis,
                  publication,
                  snapshot,
                  percentile: item.percentile,
                  baselineSamples:
                    peerScores.get(
                      `${publication.platform}|${publication.format}|${snapshot.period}`,
                    )?.length ?? 0,
                }),
                aiModel,
                aiResponseId,
                generatedAt: new Date(),
                isActive: true,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          )
          .lean(),
      );
    }
    return { analyzed: saved.length, insights: saved };
  }

  async rebuildAudience(days = 60) {
    const safeDays = Math.min(Math.max(Math.trunc(days || 60), 7), 180);
    const since = new Date(Date.now() - safeDays * 86_400_000);
    const items = await this.engagementModel
      .find({
        isActive: true,
        receivedAt: { $gte: since },
        intent: { $ne: MediaEngagementIntent.SPAM },
      })
      .sort({ receivedAt: -1 })
      .limit(300)
      .lean();
    await this.audienceInsightModel.updateMany(
      { isActive: true },
      { $set: { isActive: false } },
    );
    if (!items.length) return { analyzed: 0, insights: [] };

    const compact = items.map((item) => ({
      id: item._id.toString(),
      platform: item.platform,
      intent: item.intent,
      sentiment: item.sentiment,
      text: item.text.slice(0, 1200),
    }));
    const response = await this.aiService.generateStructuredResponse<{
      insights: GeneratedAudienceInsight[];
    }>({
      name: "hsakaa_media_audience_intelligence_v33",
      instructions: [
        "Cluster Aakash social engagement into recurring audience signals. Prefer repeated questions/problems/objections and high-intent lead/collaboration signals over generic praise.",
        "Do not identify private people in summaries. Use only supplied engagement IDs. Do not invent recurrence.",
        "A recurring content opportunity should preserve the underlying audience need without copying an old post or audience wording verbatim.",
        "Return at most 20 useful clusters. Single high-intent lead/collaboration signals may be retained even with one occurrence; ordinary content themes should normally require repetition.",
      ].join("\n"),
      input: JSON.stringify({ engagement: compact }),
      schema: {
        type: "object",
        properties: {
          insights: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                type: {
                  type: "string",
                  enum: Object.values(MediaAudienceSignalType),
                },
                topic: { type: "string" },
                summary: { type: "string" },
                engagementIds: { type: "array", items: { type: "string" } },
                recommendedContentAngle: { type: "string" },
                recommendedPlatforms: {
                  type: "array",
                  items: { type: "string" },
                },
                highIntent: { type: "boolean" },
              },
              required: [
                "key",
                "type",
                "topic",
                "summary",
                "engagementIds",
                "recommendedContentAngle",
                "recommendedPlatforms",
                "highIntent",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["insights"],
        additionalProperties: false,
      },
      maxOutputTokens: 6000,
      reasoningEffort: "medium",
      verbosity: "medium",
    });

    const itemMap = new Map(items.map((item) => [item._id.toString(), item]));
    const docs = response.data.insights
      .map((insight) => {
        const validIds = [...new Set(insight.engagementIds)].filter((id) =>
          itemMap.has(id),
        );
        if (!validIds.length) return null;
        const matched = validIds.map((id) => itemMap.get(id)!);
        const platforms = [...new Set(matched.map((item) => item.platform))];
        return {
          key: insight.key.trim().slice(0, 180),
          type: insight.type,
          topic: insight.topic.trim(),
          summary: insight.summary.trim(),
          platforms,
          occurrences: validIds.length,
          confidence: Math.min(95, 40 + validIds.length * 12),
          examples: matched.slice(0, 4).map((item) => item.text.slice(0, 500)),
          engagementIds: validIds.map((id) => new Types.ObjectId(id)),
          recommendedContentAngle: insight.recommendedContentAngle.trim(),
          recommendedPlatforms: insight.recommendedPlatforms,
          highIntent: insight.highIntent,
          generatedAt: new Date(),
          isActive: true,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (docs.length) await this.audienceInsightModel.insertMany(docs);
    return {
      analyzed: items.length,
      insights: await this.audienceInsightModel
        .find({ isActive: true })
        .sort({ confidence: -1, occurrences: -1 })
        .lean(),
    };
  }

  private buildManagementRecommendation(input: {
    analysis: GeneratedPerformanceInsight;
    publication: { publishedAt?: Date | null };
    snapshot: {
      capturedAt: Date;
      period: MetricSnapshotPeriod;
      performanceScore?: number;
      shareSaveRate?: number;
      followerConversionRate?: number;
      engagementRate?: number;
    };
    percentile: number;
    baselineSamples: number;
  }) {
    const { analysis, publication, snapshot, percentile, baselineSamples } =
      input;
    const ageHours = publication.publishedAt
      ? Math.max(
          0,
          (snapshot.capturedAt.getTime() -
            new Date(publication.publishedAt).getTime()) /
            3_600_000,
        )
      : 0;
    const maturePeriod = [
      MetricSnapshotPeriod.FORTY_EIGHT_HOURS,
      MetricSnapshotPeriod.NINETY_SIX_HOURS,
      MetricSnapshotPeriod.SEVEN_DAYS,
      MetricSnapshotPeriod.THIRTY_DAYS,
    ].includes(snapshot.period);
    const matureEnough = maturePeriod || ageHours >= 48;
    const performanceScore = snapshot.performanceScore ?? 0;
    const organicSignal =
      performanceScore >= 65 &&
      ((snapshot.shareSaveRate ?? 0) >= 0.5 ||
        (snapshot.followerConversionRate ?? 0) >= 0.1 ||
        (snapshot.engagementRate ?? 0) >= 3);

    let boostDecision = analysis.boostDecision;
    let boostReason = analysis.boostReason;
    if (!matureEnough || baselineSamples < 3) {
      boostDecision = "wait";
      boostReason =
        "Not enough mature or comparable organic data yet. Collect more post history before spending.";
    } else if (!organicSignal) {
      boostDecision = "do_not_boost";
      boostReason =
        "The current organic signal is not strong enough to justify paid amplification. Improve the content first.";
    } else if (analysis.boostDecision === "boost") {
      boostDecision = "boost";
    } else {
      boostDecision = analysis.boostDecision;
    }

    let pinDecision = analysis.pinDecision;
    let pinReason = analysis.pinReason;
    if (baselineSamples < 2 || !matureEnough) {
      pinDecision = "wait";
      pinReason =
        "Wait for a more mature result before changing pinned or featured content.";
    } else if (percentile < 70 && analysis.pinDecision === "pin") {
      pinDecision = "do_not_pin";
      pinReason =
        "This is not yet a strong enough relative performer to earn a pinned or featured slot.";
    }

    const confidence =
      baselineSamples >= 8 && matureEnough
        ? "high"
        : baselineSamples >= 3 && matureEnough
          ? "medium"
          : "low";

    return {
      dataConfidence: confidence,
      baselineSamples,
      percentile,
      performanceScore,
      pin: { decision: pinDecision, reason: pinReason },
      boost: {
        decision: boostDecision,
        reason: boostReason,
        suggestedTestBudgetInr:
          boostDecision === "boost"
            ? baselineSamples >= 8
              ? 1000
              : 500
            : undefined,
        automaticSpend: false,
      },
      changes: analysis.changeRecommendations.slice(0, 5),
      repurposeIdeas: analysis.repurposeIdeas.slice(0, 4),
      nextExperiment: analysis.nextExperiment,
    };
  }

  private calculatePublicFigureSignals(
    snapshot: MediaMetricSnapshot,
    percentile: number,
  ) {
    const denominator = Math.max(
      1,
      snapshot.reach || 0,
      snapshot.impressions || 0,
      snapshot.views || 0,
    );
    const percent = (value: number, ceilingPercent: number) =>
      Math.max(
        0,
        Math.min(100, ((value / denominator) * 100 * 100) / ceilingPercent),
      );
    const engagementRate = snapshot.engagementRate || 0;
    const conversationRate = percent(snapshot.comments || 0, 2);
    const resonanceRate = percent(
      (snapshot.shares || 0) + (snapshot.saves || 0) + (snapshot.sends || 0),
      3,
    );
    const conversionRate = percent(
      (snapshot.profileVisits || 0) + (snapshot.followersGained || 0),
      2,
    );
    return {
      reach: this.roundSignal(percentile),
      authority: this.roundSignal(
        percentile * 0.25 + resonanceRate * 0.4 + conversionRate * 0.35,
      ),
      affinity: this.roundSignal(
        conversationRate * 0.45 + resonanceRate * 0.35 + conversionRate * 0.2,
      ),
      engagement: this.roundSignal(
        Math.min(100, engagementRate * 20) * 0.7 +
          conversationRate * 0.15 +
          resonanceRate * 0.15,
      ),
    };
  }

  private summarizePillarSignals(
    performance: Array<
      Pick<
        MediaPerformanceInsight,
        "identityPillar" | "publicFigureSignals" | "confidence"
      >
    >,
  ) {
    return MEDIA_PUBLIC_IDENTITY_PILLARS.map((pillar) => {
      const rows = performance.filter((item) => item.identityPillar === pillar);
      const weightTotal = rows.reduce(
        (sum, item) => sum + Math.max(0.25, (item.confidence || 0) / 100),
        0,
      );
      const average = (
        key: "reach" | "authority" | "affinity" | "engagement",
      ) =>
        weightTotal
          ? this.roundSignal(
              rows.reduce(
                (sum, item) =>
                  sum +
                  (item.publicFigureSignals?.[key] || 0) *
                    Math.max(0.25, (item.confidence || 0) / 100),
                0,
              ) / weightTotal,
            )
          : 0;
      return {
        pillar,
        samples: rows.length,
        confidence: rows.length
          ? this.roundSignal(
              rows.reduce((sum, item) => sum + (item.confidence || 0), 0) /
                rows.length,
            )
          : 0,
        reach: average("reach"),
        authority: average("authority"),
        affinity: average("affinity"),
        engagement: average("engagement"),
      };
    });
  }

  private roundSignal(value: number) {
    return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
  }

  async directorContext() {
    const [performance, audience] = await Promise.all([
      this.performanceInsightModel
        .find({ isActive: true, confidence: { $gte: 55 } })
        .sort({ generatedAt: -1, confidence: -1 })
        .limit(20)
        .lean(),
      this.audienceInsightModel
        .find({ isActive: true, confidence: { $gte: 55 } })
        .sort({ highIntent: -1, confidence: -1, occurrences: -1 })
        .limit(20)
        .lean(),
    ]);
    return {
      pillarSignals: this.summarizePillarSignals(performance),
      performance: performance.map((item) => ({
        platform: item.platform,
        format: item.format,
        percentile: item.percentile,
        identityPillar: item.identityPillar,
        publicFigureSignals: item.publicFigureSignals,
        summary: item.summary,
        doMore: item.doMore,
        doLess: item.doLess,
        nextExperiment: item.nextExperiment,
        mechanisms: item.mechanisms,
      })),
      audience: audience.map((item) => ({
        type: item.type,
        topic: item.topic,
        summary: item.summary,
        platforms: item.platforms,
        occurrences: item.occurrences,
        confidence: item.confidence,
        recommendedContentAngle: item.recommendedContentAngle,
        recommendedPlatforms: item.recommendedPlatforms,
        highIntent: item.highIntent,
      })),
    };
  }
}
