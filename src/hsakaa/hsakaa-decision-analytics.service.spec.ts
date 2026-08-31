import 'reflect-metadata';

import { Model, Types } from 'mongoose';

import { HsakaaDecisionHorizon } from './dto/analyze-hsakaa-decision.dto';
import {
  HsakaaDecisionAssumptionImportance,
  HsakaaDecisionAssumptionStatus,
  HsakaaDecisionExperimentResult,
  HsakaaDecisionExperimentStatus,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { HsakaaDecisionOutcomeStatus } from './dto/review-hsakaa-decision-outcome.dto';
import { HsakaaDecisionAnalyticsService } from './hsakaa-decision-analytics.service';
import {
  HsakaaDecisionAnalysisContent,
  HsakaaDecisionCaseDocument,
} from './schemas/hsakaa-decision-case.schema';

const analysis = (
  decisionType: HsakaaDecisionAnalysisContent['decisionType'] = 'reversible',
): HsakaaDecisionAnalysisContent => ({
  summary: 'Test summary',
  decisionType,
  recommendation: {
    optionId: 'option_1',
    confidence: 0.8,
    rationale: 'Rationale',
    whyNow: 'Now',
    caution: 'Caution',
  },
  criteria: [],
  optionAssessments: [
    {
      optionId: 'option_1',
      score: 80,
      summary: 'Option one',
      advantages: [],
      disadvantages: [],
      risks: [],
      opportunityCost: '',
      evidence: [],
    },
    {
      optionId: 'option_2',
      score: 60,
      summary: 'Option two',
      advantages: [],
      disadvantages: [],
      risks: [],
      opportunityCost: '',
      evidence: [],
    },
  ],
  keyTradeoffs: [],
  risks: [],
  assumptions: ['Customers will pay the target price.'],
  unknowns: [],
  whatWouldChangeRecommendation: [],
  suggestedExperiments: [],
  nextPrompt: 'Next?',
});

function reviewedDecision(options: {
  question: string;
  confidence: number;
  status: HsakaaDecisionOutcomeStatus;
  verdict:
    | 'recommendation_held'
    | 'recommendation_mixed'
    | 'recommendation_missed'
    | 'too_early'
    | 'abandoned';
  calibration?:
    | 'well_calibrated'
    | 'overconfident'
    | 'underconfident'
    | 'not_enough_evidence';
  followed?: boolean | null;
  horizon?: HsakaaDecisionHorizon;
  decisionType?: HsakaaDecisionAnalysisContent['decisionType'];
  generatedAt?: string;
  committedAt?: string;
  recordedAt?: string;
  assumptions?: Array<Record<string, unknown>>;
  experiments?: Array<Record<string, unknown>>;
}) {
  const generatedAt = new Date(
    options.generatedAt ?? '2026-08-01T00:00:00.000Z',
  );
  const committedAt = new Date(
    options.committedAt ?? '2026-08-02T00:00:00.000Z',
  );
  const recordedAt = new Date(options.recordedAt ?? '2026-08-12T00:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    question: options.question,
    horizon: options.horizon ?? HsakaaDecisionHorizon.MONTHS,
    analysis: analysis(options.decisionType),
    generatedAt,
    commitment: {
      optionId: options.followed === false ? 'option_2' : 'option_1',
      rationale: 'Chosen',
      committedAt,
      reviewAt: recordedAt,
      baselineRecommendationOptionId: 'option_1',
      baselineRecommendationConfidence: options.confidence,
      baselineGeneratedAt: generatedAt,
    },
    outcome: {
      status: options.status,
      summary: 'Outcome summary',
      evidenceNotes: [],
      recordedAt,
      recommendationFollowed: options.followed ?? true,
      evaluation: {
        verdict: options.verdict,
        calibration: options.calibration ?? 'well_calibrated',
        summary: 'Evaluation',
        whatWorked: [],
        whatDidnt: [],
        surprises: [],
        lessons: [],
        futureAdjustments: [],
        evidence: [],
        nextPrompt: 'Next',
      },
      aiModel: 'gpt-test',
      usage: null,
      sources: [],
    },
    assumptionRegister: options.assumptions ?? [],
    experiments: options.experiments ?? [],
  };
}

describe('HsakaaDecisionAnalyticsService', () => {
  function serviceWith(items: Record<string, unknown>[]) {
    const exec = jest.fn().mockResolvedValue(items);
    const model = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({ exec }),
          }),
        }),
      }),
    } as unknown as Model<HsakaaDecisionCaseDocument>;

    return { service: new HsakaaDecisionAnalyticsService(model), exec };
  }

  it('keeps too-early and abandoned reviews out of final calibration metrics', async () => {
    const items = [
      reviewedDecision({
        question: 'Held',
        confidence: 0.7,
        status: HsakaaDecisionOutcomeStatus.POSITIVE,
        verdict: 'recommendation_held',
      }),
      reviewedDecision({
        question: 'Too early',
        confidence: 0.9,
        status: HsakaaDecisionOutcomeStatus.TOO_EARLY,
        verdict: 'too_early',
      }),
      reviewedDecision({
        question: 'Abandoned',
        confidence: 0.9,
        status: HsakaaDecisionOutcomeStatus.ABANDONED,
        verdict: 'abandoned',
      }),
    ];
    const { service } = serviceWith(items);

    const result = await service.getAnalytics(
      new Date('2026-08-28T00:00:00.000Z'),
    );

    expect(result.overview.reviewedCount).toBe(3);
    expect(result.overview.finalReviewedCount).toBe(1);
    expect(result.overview.strictRecommendationSuccessRate).toBe(1);
    expect(result.outcomeCounts.too_early).toBe(1);
    expect(result.outcomeCounts.abandoned).toBe(1);
  });

  it('surfaces overconfidence by confidence band and segment without changing stored baselines', async () => {
    const items = [
      reviewedDecision({
        question: 'High confidence miss one',
        confidence: 0.9,
        status: HsakaaDecisionOutcomeStatus.NEGATIVE,
        verdict: 'recommendation_missed',
        calibration: 'overconfident',
        horizon: HsakaaDecisionHorizon.YEARS,
        decisionType: 'hard_to_reverse',
      }),
      reviewedDecision({
        question: 'High confidence miss two',
        confidence: 0.85,
        status: HsakaaDecisionOutcomeStatus.NEGATIVE,
        verdict: 'recommendation_missed',
        calibration: 'overconfident',
        horizon: HsakaaDecisionHorizon.YEARS,
        decisionType: 'hard_to_reverse',
      }),
    ];
    const { service } = serviceWith(items);

    const result = await service.getAnalytics();
    const veryHigh = result.confidenceBands.find(
      (band) => band.label === 'very_high',
    );

    expect(veryHigh?.count).toBe(2);
    expect(veryHigh?.calibration).toBe('overconfident');
    expect(result.lowerConfidenceSignals.length).toBeGreaterThan(0);
    expect(items[0].commitment.baselineRecommendationConfidence).toBe(0.9);
  });

  it('tracks where the user beat HSAKAA and where HSAKAA would have done better', async () => {
    const items = [
      reviewedDecision({
        question: 'User was right',
        confidence: 0.7,
        status: HsakaaDecisionOutcomeStatus.POSITIVE,
        verdict: 'recommendation_missed',
        followed: false,
      }),
      reviewedDecision({
        question: 'HSAKAA was right',
        confidence: 0.7,
        status: HsakaaDecisionOutcomeStatus.NEGATIVE,
        verdict: 'recommendation_held',
        followed: false,
      }),
    ];
    const { service } = serviceWith(items);

    const result = await service.getAnalytics();

    expect(result.choicesVsHsakaa.userOutperformedCount).toBe(1);
    expect(result.choicesVsHsakaa.hsakaaOutperformedCount).toBe(1);
    expect(result.choicesVsHsakaa.notFollowed.count).toBe(2);
  });

  it('aggregates failed assumptions, experiment results and decision timing deterministically', async () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const assumption = {
      id: 'assumption_1',
      statement: 'Customers will pay the target price.',
      importance: HsakaaDecisionAssumptionImportance.HIGH,
      status: HsakaaDecisionAssumptionStatus.INVALIDATED,
      confidence: 0.2,
      createdAt: now,
      updatedAt: now,
      statusHistory: [],
    };
    const experiment = {
      id: 'experiment_1',
      title: 'Pricing test',
      hypothesis: 'Customers will pay.',
      description: '',
      successCriteria: '6/10 yes',
      failureCriteria: '3/10 or fewer yes',
      assumptionIds: ['assumption_1'],
      supportsOptionIds: ['option_1'],
      status: HsakaaDecisionExperimentStatus.COMPLETED,
      startAt: now,
      targetReviewAt: now,
      result: HsakaaDecisionExperimentResult.FAILED,
      conclusion: 'Demand was weak.',
      createdAt: now,
      completedAt: now,
    };
    const items = [
      reviewedDecision({
        question: 'Pricing one',
        confidence: 0.6,
        status: HsakaaDecisionOutcomeStatus.MIXED,
        verdict: 'recommendation_mixed',
        assumptions: [assumption],
        experiments: [experiment],
        generatedAt: '2026-08-01T00:00:00.000Z',
        committedAt: '2026-08-02T00:00:00.000Z',
        recordedAt: '2026-08-12T00:00:00.000Z',
      }),
      reviewedDecision({
        question: 'Pricing two',
        confidence: 0.6,
        status: HsakaaDecisionOutcomeStatus.NEGATIVE,
        verdict: 'recommendation_missed',
        assumptions: [
          {
            ...assumption,
            id: 'assumption_2',
            statement: 'Customers will pay our target pricing.',
            status: HsakaaDecisionAssumptionStatus.WEAKENED,
          },
        ],
      }),
    ];
    const { service } = serviceWith(items);

    const result = await service.getAnalytics();

    expect(result.experiments.completedCount).toBe(1);
    expect(result.experiments.resultCounts.failed).toBe(1);
    expect(result.recurringFailedAssumptions[0]?.occurrences).toBe(2);
    expect(result.recurringFailedAssumptions[0]?.recurring).toBe(true);
    expect(result.timing.averageDecisionToCommitHours).toBeGreaterThan(0);
    expect(result.timing.averageCommitmentToReviewDays).toBeGreaterThan(0);
  });
});
