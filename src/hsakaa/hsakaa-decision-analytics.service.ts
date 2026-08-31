import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { HsakaaDecisionHorizon } from './dto/analyze-hsakaa-decision.dto';
import {
  HsakaaDecisionAssumptionStatus,
  HsakaaDecisionExperimentResult,
  HsakaaDecisionExperimentStatus,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { HsakaaDecisionOutcomeStatus } from './dto/review-hsakaa-decision-outcome.dto';
import {
  HsakaaDecisionAnalysisContent,
  HsakaaDecisionCase,
  HsakaaDecisionCaseDocument,
  HsakaaDecisionCommitment,
  HsakaaDecisionOutcome,
  HsakaaDecisionTrackedAssumption,
  HsakaaDecisionTrackedExperiment,
} from './schemas/hsakaa-decision-case.schema';

type DecisionType = HsakaaDecisionAnalysisContent['decisionType'];
type CalibrationLabel = HsakaaDecisionOutcome['evaluation']['calibration'];
type OutcomeStatus = HsakaaDecisionOutcomeStatus;
type Verdict = HsakaaDecisionOutcome['evaluation']['verdict'];

interface DecisionLike {
  _id?: unknown;
  question: string;
  horizon: HsakaaDecisionHorizon;
  analysis: HsakaaDecisionAnalysisContent;
  generatedAt: Date;
  commitment?: HsakaaDecisionCommitment | null;
  outcome?: HsakaaDecisionOutcome | null;
  assumptionRegister?: HsakaaDecisionTrackedAssumption[];
  experiments?: HsakaaDecisionTrackedExperiment[];
}

interface PerformanceSample {
  count: number;
  positive: number;
  mixed: number;
  negative: number;
  held: number;
  recommendationMixed: number;
  missed: number;
  confidenceTotal: number;
}

interface FailedAssumptionSignal {
  statement: string;
  question: string;
  horizon: HsakaaDecisionHorizon;
  decisionType: DecisionType;
  status: 'weakened' | 'invalidated' | 'failed_experiment';
}

export interface SegmentPerformance {
  label: string;
  count: number;
  sampleQuality: 'insufficient' | 'emerging' | 'useful';
  positiveRate: number | null;
  negativeRate: number | null;
  weightedOutcomeScore: number | null;
  recommendationSuccessRate: number | null;
  averageConfidence: number | null;
  calibrationGap: number | null;
}

const FINAL_OUTCOMES = new Set<HsakaaDecisionOutcomeStatus>([
  HsakaaDecisionOutcomeStatus.POSITIVE,
  HsakaaDecisionOutcomeStatus.MIXED,
  HsakaaDecisionOutcomeStatus.NEGATIVE,
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'if',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'should',
  'that',
  'the',
  'their',
  'this',
  'to',
  'we',
  'will',
  'with',
]);

@Injectable()
export class HsakaaDecisionAnalyticsService {
  constructor(
    @InjectModel(HsakaaDecisionCase.name)
    private readonly decisionModel: Model<HsakaaDecisionCaseDocument>,
  ) {}

  async getAnalytics(referenceDate = new Date()) {
    const decisions = (await this.decisionModel
      .find({})
      .sort({ generatedAt: -1 })
      .limit(1000)
      .lean()
      .exec()) as DecisionLike[];

    return this.calculate(decisions, referenceDate);
  }

  calculate(decisions: DecisionLike[], referenceDate = new Date()) {
    const committed = decisions.filter((item) => Boolean(item.commitment));
    const allReviewed = committed.filter((item) => Boolean(item.outcome));
    const finalReviewed = allReviewed.filter(
      (item) => item.outcome && FINAL_OUTCOMES.has(item.outcome.status),
    );
    const pendingReview = committed.filter(
      (item) =>
        !item.outcome ||
        item.outcome.status === HsakaaDecisionOutcomeStatus.TOO_EARLY,
    );

    const recommendationFollowed = finalReviewed.filter(
      (item) => item.outcome?.recommendationFollowed === true,
    ).length;
    const recommendationNotFollowed = finalReviewed.filter(
      (item) => item.outcome?.recommendationFollowed === false,
    ).length;
    const recommendationComparableCount =
      recommendationFollowed + recommendationNotFollowed;

    const outcomeCounts = this.countBy<OutcomeStatus>(
      allReviewed
        .map((item) => item.outcome?.status)
        .filter(Boolean) as OutcomeStatus[],
      Object.values(HsakaaDecisionOutcomeStatus),
    );
    const verdictCounts = this.countBy<Verdict>(
      finalReviewed
        .map((item) => item.outcome?.evaluation.verdict)
        .filter(Boolean) as Verdict[],
      [
        'recommendation_held',
        'recommendation_mixed',
        'recommendation_missed',
        'too_early',
        'abandoned',
      ],
    );
    const calibrationCounts = this.countBy<CalibrationLabel>(
      finalReviewed
        .map((item) => item.outcome?.evaluation.calibration)
        .filter(Boolean) as CalibrationLabel[],
      [
        'well_calibrated',
        'overconfident',
        'underconfident',
        'not_enough_evidence',
      ],
    );

    const strictRecommendationSuccessRate = finalReviewed.length
      ? verdictCounts.recommendation_held / finalReviewed.length
      : null;
    const weightedRecommendationSuccessRate = finalReviewed.length
      ? (verdictCounts.recommendation_held +
          verdictCounts.recommendation_mixed * 0.5) /
        finalReviewed.length
      : null;

    const confidenceValues = finalReviewed
      .map((item) => item.commitment?.baselineRecommendationConfidence)
      .filter((value): value is number => typeof value === 'number');
    const averageBaselineConfidence = this.average(confidenceValues);

    const confidenceBands = [
      this.confidenceBand('low', 0, 0.5, finalReviewed),
      this.confidenceBand('medium', 0.5, 0.7, finalReviewed),
      this.confidenceBand('high', 0.7, 0.85, finalReviewed),
      this.confidenceBand('very_high', 0.85, 1.000001, finalReviewed),
    ];

    const followedMatrix = {
      followed: this.outcomeMatrix(
        finalReviewed.filter(
          (item) => item.outcome?.recommendationFollowed === true,
        ),
      ),
      notFollowed: this.outcomeMatrix(
        finalReviewed.filter(
          (item) => item.outcome?.recommendationFollowed === false,
        ),
      ),
    };

    const userOutperformed = finalReviewed
      .filter(
        (item) =>
          item.outcome?.recommendationFollowed === false &&
          item.outcome.evaluation.verdict === 'recommendation_missed',
      )
      .map((item) => this.comparisonExample(item))
      .slice(0, 8);
    const hsakaaOutperformed = finalReviewed
      .filter(
        (item) =>
          item.outcome?.recommendationFollowed === false &&
          item.outcome.evaluation.verdict === 'recommendation_held',
      )
      .map((item) => this.comparisonExample(item))
      .slice(0, 8);

    const byHorizon = Object.values(HsakaaDecisionHorizon).map((horizon) =>
      this.segmentPerformance(
        horizon,
        finalReviewed.filter((item) => item.horizon === horizon),
      ),
    );
    const decisionTypes: DecisionType[] = [
      'reversible',
      'partially_reversible',
      'hard_to_reverse',
    ];
    const byReversibility = decisionTypes.map((decisionType) =>
      this.segmentPerformance(
        decisionType,
        finalReviewed.filter(
          (item) => item.analysis.decisionType === decisionType,
        ),
      ),
    );

    const failedAssumptionSignals = this.failedAssumptionSignals(decisions);
    const recurringFailedAssumptions = this.clusterFailedAssumptions(
      failedAssumptionSignals,
    ).slice(0, 10);

    const completedExperiments = decisions.flatMap((item) =>
      (item.experiments ?? []).filter(
        (experiment) =>
          experiment.status === HsakaaDecisionExperimentStatus.COMPLETED &&
          experiment.result,
      ),
    );
    const experimentResultCounts = this.countBy<HsakaaDecisionExperimentResult>(
      completedExperiments
        .map((experiment) => experiment.result)
        .filter(Boolean) as HsakaaDecisionExperimentResult[],
      Object.values(HsakaaDecisionExperimentResult),
    );
    const conclusiveExperiments =
      completedExperiments.length - experimentResultCounts.inconclusive;
    const experimentWinRate = conclusiveExperiments
      ? experimentResultCounts.supported / conclusiveExperiments
      : null;

    const decisionToCommitHours = committed
      .map((item) =>
        item.commitment
          ? this.durationHours(item.generatedAt, item.commitment.committedAt)
          : null,
      )
      .filter((value): value is number => value !== null && value >= 0);
    const commitToReviewDays = finalReviewed
      .map((item) =>
        item.commitment && item.outcome
          ? this.durationHours(
              item.commitment.committedAt,
              item.outcome.recordedAt,
            ) / 24
          : null,
      )
      .filter((value): value is number => value !== null && value >= 0);

    const calibrationTrend = this.calibrationTrend(finalReviewed);
    const lowerConfidenceSignals = this.lowerConfidenceSignals(
      finalReviewed,
      byHorizon,
      byReversibility,
    );

    return {
      generatedAt: referenceDate,
      deterministic: true,
      definitions: {
        finalReviewStatuses: ['positive', 'mixed', 'negative'],
        recommendationScore:
          'recommendation_held = 1, recommendation_mixed = 0.5, recommendation_missed = 0',
        confidenceWarningThreshold: 0.15,
        note: 'Analytics describe historical stored outcomes only. They do not mutate or mechanically change future Decision Lab confidence.',
      },
      sampleQuality: this.sampleQuality(finalReviewed.length),
      overview: {
        analyzedCount: decisions.length,
        committedCount: committed.length,
        reviewedCount: allReviewed.length,
        finalReviewedCount: finalReviewed.length,
        pendingReviewCount: pendingReview.length,
        recommendationFollowedCount: recommendationFollowed,
        recommendationNotFollowedCount: recommendationNotFollowed,
        recommendationFollowedRate: recommendationComparableCount
          ? recommendationFollowed / recommendationComparableCount
          : null,
        averageBaselineConfidence,
        strictRecommendationSuccessRate,
        weightedRecommendationSuccessRate,
      },
      outcomeCounts,
      verdictCounts,
      calibrationCounts,
      confidenceBands,
      choicesVsHsakaa: {
        ...followedMatrix,
        userOutperformedCount: userOutperformed.length,
        hsakaaOutperformedCount: hsakaaOutperformed.length,
        userOutperformed,
        hsakaaOutperformed,
      },
      performance: {
        byHorizon,
        byReversibility,
      },
      experiments: {
        completedCount: completedExperiments.length,
        conclusiveCount: conclusiveExperiments,
        resultCounts: experimentResultCounts,
        winRate: experimentWinRate,
      },
      timing: {
        averageDecisionToCommitHours: this.average(decisionToCommitHours),
        averageCommitmentToReviewDays: this.average(commitToReviewDays),
        samples: {
          decisionToCommit: decisionToCommitHours.length,
          commitmentToReview: commitToReviewDays.length,
        },
      },
      recurringFailedAssumptions,
      calibrationTrend,
      lowerConfidenceSignals,
    };
  }

  private confidenceBand(
    label: 'low' | 'medium' | 'high' | 'very_high',
    min: number,
    max: number,
    reviewed: DecisionLike[],
  ) {
    const items = reviewed.filter((item) => {
      const confidence = item.commitment?.baselineRecommendationConfidence;
      return (
        typeof confidence === 'number' && confidence >= min && confidence < max
      );
    });
    const confidences = items
      .map((item) => item.commitment?.baselineRecommendationConfidence)
      .filter((value): value is number => typeof value === 'number');
    const observedScores = items.map((item) => this.recommendationScore(item));
    const averageConfidence = this.average(confidences);
    const observedSuccessRate = this.average(observedScores);
    const calibrationGap =
      averageConfidence !== null && observedSuccessRate !== null
        ? observedSuccessRate - averageConfidence
        : null;

    return {
      label,
      min,
      max: Math.min(max, 1),
      count: items.length,
      averageConfidence,
      observedSuccessRate,
      calibrationGap,
      calibration:
        calibrationGap === null || items.length < 2
          ? 'insufficient'
          : calibrationGap < -0.15
            ? 'overconfident'
            : calibrationGap > 0.15
              ? 'underconfident'
              : 'well_calibrated',
    };
  }

  private segmentPerformance(
    label: string,
    items: DecisionLike[],
  ): SegmentPerformance {
    const sample = items.reduce<PerformanceSample>(
      (accumulator, item) => {
        const outcome = item.outcome;
        if (!outcome || !item.commitment) return accumulator;
        accumulator.count += 1;
        if (outcome.status === HsakaaDecisionOutcomeStatus.POSITIVE)
          accumulator.positive += 1;
        if (outcome.status === HsakaaDecisionOutcomeStatus.MIXED)
          accumulator.mixed += 1;
        if (outcome.status === HsakaaDecisionOutcomeStatus.NEGATIVE)
          accumulator.negative += 1;
        if (outcome.evaluation.verdict === 'recommendation_held')
          accumulator.held += 1;
        if (outcome.evaluation.verdict === 'recommendation_mixed')
          accumulator.recommendationMixed += 1;
        if (outcome.evaluation.verdict === 'recommendation_missed')
          accumulator.missed += 1;
        accumulator.confidenceTotal +=
          item.commitment.baselineRecommendationConfidence;
        return accumulator;
      },
      {
        count: 0,
        positive: 0,
        mixed: 0,
        negative: 0,
        held: 0,
        recommendationMixed: 0,
        missed: 0,
        confidenceTotal: 0,
      },
    );
    const weightedRecommendationSuccessRate = sample.count
      ? (sample.held + sample.recommendationMixed * 0.5) / sample.count
      : null;
    const averageConfidence = sample.count
      ? sample.confidenceTotal / sample.count
      : null;

    return {
      label,
      count: sample.count,
      sampleQuality: this.sampleQuality(sample.count),
      positiveRate: sample.count ? sample.positive / sample.count : null,
      negativeRate: sample.count ? sample.negative / sample.count : null,
      weightedOutcomeScore: sample.count
        ? (sample.positive + sample.mixed * 0.5) / sample.count
        : null,
      recommendationSuccessRate: weightedRecommendationSuccessRate,
      averageConfidence,
      calibrationGap:
        weightedRecommendationSuccessRate !== null && averageConfidence !== null
          ? weightedRecommendationSuccessRate - averageConfidence
          : null,
    };
  }

  private outcomeMatrix(items: DecisionLike[]) {
    return {
      count: items.length,
      positive: items.filter(
        (item) => item.outcome?.status === HsakaaDecisionOutcomeStatus.POSITIVE,
      ).length,
      mixed: items.filter(
        (item) => item.outcome?.status === HsakaaDecisionOutcomeStatus.MIXED,
      ).length,
      negative: items.filter(
        (item) => item.outcome?.status === HsakaaDecisionOutcomeStatus.NEGATIVE,
      ).length,
    };
  }

  private comparisonExample(item: DecisionLike) {
    const commitment = item.commitment;
    const outcome = item.outcome;
    const selectedOption = item.analysis.optionAssessments.find(
      (assessment) => assessment.optionId === commitment?.optionId,
    )?.optionId;
    const recommendationOptionId =
      commitment?.baselineRecommendationOptionId ?? null;

    return {
      id: this.idToString(item._id),
      question: item.question,
      selectedOptionId: selectedOption ?? commitment?.optionId ?? null,
      recommendationOptionId,
      baselineConfidence: commitment?.baselineRecommendationConfidence ?? null,
      status: outcome?.status ?? null,
      verdict: outcome?.evaluation.verdict ?? null,
      summary: outcome?.evaluation.summary ?? outcome?.summary ?? '',
      recordedAt: outcome?.recordedAt ?? null,
    };
  }

  private failedAssumptionSignals(decisions: DecisionLike[]) {
    const signals: FailedAssumptionSignal[] = [];

    for (const decision of decisions) {
      const assumptions = decision.assumptionRegister ?? [];
      const byId = new Map(
        assumptions.map((assumption) => [assumption.id, assumption]),
      );
      for (const assumption of assumptions) {
        if (
          assumption.status === HsakaaDecisionAssumptionStatus.WEAKENED ||
          assumption.status === HsakaaDecisionAssumptionStatus.INVALIDATED
        ) {
          signals.push({
            statement: assumption.statement,
            question: decision.question,
            horizon: decision.horizon,
            decisionType: decision.analysis.decisionType,
            status: assumption.status,
          });
        }
      }
      for (const experiment of decision.experiments ?? []) {
        if (
          experiment.status !== HsakaaDecisionExperimentStatus.COMPLETED ||
          experiment.result !== HsakaaDecisionExperimentResult.FAILED
        ) {
          continue;
        }
        for (const assumptionId of experiment.assumptionIds ?? []) {
          const assumption = byId.get(assumptionId);
          if (!assumption) continue;
          const alreadyCaptured = signals.some(
            (signal) =>
              signal.question === decision.question &&
              signal.statement === assumption.statement,
          );
          if (!alreadyCaptured) {
            signals.push({
              statement: assumption.statement,
              question: decision.question,
              horizon: decision.horizon,
              decisionType: decision.analysis.decisionType,
              status: 'failed_experiment',
            });
          }
        }
      }
    }

    return signals;
  }

  private clusterFailedAssumptions(signals: FailedAssumptionSignal[]) {
    const clusters: Array<{
      representative: string;
      tokens: Set<string>;
      signals: FailedAssumptionSignal[];
    }> = [];

    for (const signal of signals) {
      const tokens = this.tokens(signal.statement);
      let bestIndex = -1;
      let bestScore = 0;
      for (let index = 0; index < clusters.length; index += 1) {
        const score = this.jaccard(tokens, clusters[index].tokens);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      if (bestIndex >= 0 && bestScore >= 0.55) {
        clusters[bestIndex].signals.push(signal);
        clusters[bestIndex].tokens = new Set([
          ...clusters[bestIndex].tokens,
          ...tokens,
        ]);
      } else {
        clusters.push({
          representative: signal.statement,
          tokens,
          signals: [signal],
        });
      }
    }

    return clusters
      .map((cluster) => ({
        statement: cluster.representative,
        occurrences: cluster.signals.length,
        recurring: cluster.signals.length >= 2,
        invalidatedCount: cluster.signals.filter(
          (signal) => signal.status === 'invalidated',
        ).length,
        weakenedCount: cluster.signals.filter(
          (signal) => signal.status === 'weakened',
        ).length,
        failedExperimentCount: cluster.signals.filter(
          (signal) => signal.status === 'failed_experiment',
        ).length,
        examples: cluster.signals.slice(0, 4).map((signal) => ({
          question: signal.question,
          horizon: signal.horizon,
          decisionType: signal.decisionType,
          status: signal.status,
        })),
      }))
      .sort((left, right) => {
        if (left.recurring !== right.recurring) return left.recurring ? -1 : 1;
        return right.occurrences - left.occurrences;
      });
  }

  private calibrationTrend(items: DecisionLike[]) {
    const buckets = new Map<
      string,
      {
        count: number;
        confidence: number;
        score: number;
        overconfident: number;
        underconfident: number;
      }
    >();

    for (const item of items) {
      if (!item.outcome || !item.commitment) continue;
      const date = new Date(item.outcome.recordedAt);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(key) ?? {
        count: 0,
        confidence: 0,
        score: 0,
        overconfident: 0,
        underconfident: 0,
      };
      bucket.count += 1;
      bucket.confidence += item.commitment.baselineRecommendationConfidence;
      bucket.score += this.recommendationScore(item);
      if (item.outcome.evaluation.calibration === 'overconfident')
        bucket.overconfident += 1;
      if (item.outcome.evaluation.calibration === 'underconfident')
        bucket.underconfident += 1;
      buckets.set(key, bucket);
    }

    return Array.from(buckets.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-12)
      .map(([month, bucket]) => ({
        month,
        reviewedCount: bucket.count,
        averageConfidence: bucket.confidence / bucket.count,
        recommendationSuccessRate: bucket.score / bucket.count,
        calibrationGap:
          bucket.score / bucket.count - bucket.confidence / bucket.count,
        overconfidentCount: bucket.overconfident,
        underconfidentCount: bucket.underconfident,
      }));
  }

  private lowerConfidenceSignals(
    finalReviewed: DecisionLike[],
    byHorizon: SegmentPerformance[],
    byReversibility: SegmentPerformance[],
  ) {
    const segments = [
      ...byHorizon.map((item) => ({ dimension: 'horizon', ...item })),
      ...byReversibility.map((item) => ({
        dimension: 'reversibility',
        ...item,
      })),
    ];

    const signals = segments
      .filter((segment) => {
        const count = Number(segment.count ?? 0);
        const gap = segment.calibrationGap;
        return count >= 2 && typeof gap === 'number' && gap < -0.15;
      })
      .map((segment) => ({
        dimension: segment.dimension,
        label: segment.label,
        reviewedCount: segment.count,
        averageConfidence: segment.averageConfidence,
        observedRecommendationSuccessRate: segment.recommendationSuccessRate,
        gap: segment.calibrationGap,
        sampleQuality: segment.sampleQuality,
        guidance:
          'Historical recommendation performance is materially below baseline confidence in this segment. Treat this as a caution signal, not an automatic confidence adjustment.',
      }));

    const highConfidence = finalReviewed.filter(
      (item) => (item.commitment?.baselineRecommendationConfidence ?? 0) >= 0.8,
    );
    if (highConfidence.length >= 2) {
      const observed = this.average(
        highConfidence.map((item) => this.recommendationScore(item)),
      );
      const confidence = this.average(
        highConfidence
          .map((item) => item.commitment?.baselineRecommendationConfidence)
          .filter((value): value is number => typeof value === 'number'),
      );
      if (
        observed !== null &&
        confidence !== null &&
        observed - confidence < -0.15
      ) {
        signals.push({
          dimension: 'confidence_band',
          label: '80%+ baseline confidence',
          reviewedCount: highConfidence.length,
          averageConfidence: confidence,
          observedRecommendationSuccessRate: observed,
          gap: observed - confidence,
          sampleQuality: this.sampleQuality(highConfidence.length),
          guidance:
            'Very-high-confidence recommendations have historically landed below their stated confidence. Use confidence cautiously until the sample improves.',
        });
      }
    }

    return signals.sort((left, right) => Number(left.gap) - Number(right.gap));
  }

  private recommendationScore(item: DecisionLike) {
    const verdict = item.outcome?.evaluation.verdict;
    if (verdict === 'recommendation_held') return 1;
    if (verdict === 'recommendation_mixed') return 0.5;
    return 0;
  }

  private durationHours(start: Date, end: Date) {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return -1;
    return (endTime - startTime) / 3_600_000;
  }

  private average(values: number[]) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  private sampleQuality(count: number) {
    return count >= 10 ? 'useful' : count >= 4 ? 'emerging' : 'insufficient';
  }

  private countBy<T extends string>(values: T[], keys: readonly T[]) {
    const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<
      T,
      number
    >;
    for (const value of values) {
      if (value in counts) counts[value] += 1;
    }
    return counts;
  }

  private tokens(value: string) {
    return new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length > 2 && !STOP_WORDS.has(item)),
    );
  }

  private jaccard(left: Set<string>, right: Set<string>) {
    if (!left.size || !right.size) return 0;
    let intersection = 0;
    for (const token of left) {
      if (right.has(token)) intersection += 1;
    }
    const union = new Set([...left, ...right]).size;
    return union ? intersection / union : 0;
  }

  private idToString(value: unknown) {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toHexString' in value &&
      typeof (value as { toHexString?: unknown }).toHexString === 'function'
    ) {
      return (value as { toHexString: () => string }).toHexString();
    }
    return undefined;
  }
}
