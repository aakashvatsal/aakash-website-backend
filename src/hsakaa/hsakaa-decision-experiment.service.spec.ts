import 'reflect-metadata';

import { Model, Types } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import { HsakaaDecisionHorizon } from './dto/analyze-hsakaa-decision.dto';
import {
  HsakaaDecisionAssumptionImportance,
  HsakaaDecisionAssumptionStatus,
  HsakaaDecisionEvidenceKind,
  HsakaaDecisionEvidenceStance,
  HsakaaDecisionExperimentResult,
  HsakaaDecisionExperimentStatus,
} from './dto/manage-hsakaa-decision-experiment.dto';
import { HsakaaDecisionOutcomeStatus } from './dto/review-hsakaa-decision-outcome.dto';
import { HsakaaDecisionExperimentService } from './hsakaa-decision-experiment.service';
import {
  HsakaaDecisionAnalysisContent,
  HsakaaDecisionCaseDocument,
} from './schemas/hsakaa-decision-case.schema';

const analysis: HsakaaDecisionAnalysisContent = {
  summary: 'Test the reversible route first.',
  decisionType: 'reversible',
  recommendation: {
    optionId: 'option_1',
    confidence: 0.7,
    rationale: 'It preserves optionality.',
    whyNow: 'Evidence can be gathered quickly.',
    caution: 'The main assumption is still untested.',
  },
  criteria: [],
  optionAssessments: [],
  keyTradeoffs: [],
  risks: [],
  assumptions: ['Customers will pay for the proposed offer.'],
  unknowns: ['Actual conversion rate.'],
  whatWouldChangeRecommendation: ['Weak willingness-to-pay evidence.'],
  suggestedExperiments: [],
  nextPrompt: 'What experiment should test willingness to pay?',
};

function baseDecision(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-08-28T00:00:00.000Z');
  return {
    _id: new Types.ObjectId(),
    question: 'Should I launch this offer?',
    horizon: HsakaaDecisionHorizon.MONTHS,
    options: [
      { id: 'option_1', label: 'Launch' },
      { id: 'option_2', label: 'Wait' },
    ],
    context: '',
    constraints: [],
    analysis,
    generatedAt: now,
    aiModel: 'gpt-test',
    sources: [],
    assumptionRegister: [
      {
        id: 'assumption_1',
        statement: analysis.assumptions[0],
        importance: HsakaaDecisionAssumptionImportance.HIGH,
        status: HsakaaDecisionAssumptionStatus.UNTESTED,
        confidence: null,
        createdAt: now,
        updatedAt: now,
        statusHistory: [],
      },
    ],
    experiments: [],
    evidenceLog: [],
    reassessments: [],
    commitment: {
      optionId: 'option_1',
      rationale: 'Try it.',
      committedAt: now,
      reviewAt: null,
      baselineRecommendationOptionId: 'option_1',
      baselineRecommendationConfidence: 0.7,
      baselineGeneratedAt: now,
    },
    outcome: null,
    ...overrides,
  };
}

type MockUpdate = {
  $push?: Record<string, unknown>;
  $set?: Record<string, unknown>;
};

describe('HsakaaDecisionExperimentService', () => {
  function createService(
    initial = baseDecision(),
    findItems?: Record<string, unknown>[],
  ) {
    const current: Record<string, unknown> = { ...initial };
    const updates: MockUpdate[] = [];

    const findById = jest.fn().mockImplementation(() => ({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockImplementation(() => Promise.resolve(current)),
      }),
    }));

    const findByIdAndUpdate = jest
      .fn()
      .mockImplementation((_id: unknown, update: MockUpdate) => {
        updates.push(update);
        if (update.$push) {
          for (const [key, value] of Object.entries(update.$push)) {
            const existing = current[key];
            const list: unknown[] = Array.isArray(existing)
              ? (existing as unknown[])
              : [];
            current[key] = [...list, value];
          }
        }
        if (update.$set) {
          for (const [key, value] of Object.entries(update.$set)) {
            current[key] = value;
          }
        }
        return {
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockImplementation(() => Promise.resolve(current)),
          }),
        };
      });

    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(findItems ?? [current]),
          }),
        }),
      }),
    });

    const model = {
      findById,
      findByIdAndUpdate,
      find,
    } as unknown as Model<HsakaaDecisionCaseDocument>;

    const generateStructuredResponse = jest.fn().mockResolvedValue({
      data: {
        currentRecommendationOptionId: 'option_2',
        confidence: 0.62,
        rationale: 'New willingness-to-pay evidence weakens the launch case.',
        recommendationChanged: true,
        evidenceSummary: 'The test missed its success threshold.',
        whatChanged: ['Willingness-to-pay evidence is weaker than expected.'],
        whatStillUnknown: ['Whether a lower price changes conversion.'],
        assumptionSuggestions: [
          {
            assumptionId: 'assumption_1',
            suggestedStatus: HsakaaDecisionAssumptionStatus.WEAKENED,
            suggestedConfidence: 0.3,
            rationale: 'Observed demand was below the experiment threshold.',
          },
        ],
        nextPrompt: 'Should I test a lower price before deciding?',
      },
      model: 'gpt-test',
      responseId: 'resp-reassess',
      usage: { totalTokens: 300 },
    });

    const service = new HsakaaDecisionExperimentService(model, {
      generateStructuredResponse,
    } as unknown as AiService);

    return {
      service,
      generateStructuredResponse,
      findByIdAndUpdate,
      updates,
    };
  }

  it('creates a linked experiment without modifying the frozen commitment', async () => {
    const original = baseDecision();
    const { service, updates } = createService(original);

    const result = await service.createExperiment(original._id.toHexString(), {
      title: '10 customer pricing calls',
      hypothesis: 'At least 6 of 10 prospects accept the target price.',
      successCriteria: '6 or more prospects accept the price.',
      failureCriteria: '3 or fewer prospects accept the price.',
      assumptionIds: ['assumption_1'],
      supportsOptionIds: ['option_1'],
      targetReviewAt: '2026-09-10T10:00:00+05:30',
    });

    expect(result.experiments).toHaveLength(1);
    expect(result.experiments[0].assumptionIds).toEqual(['assumption_1']);
    expect(result.commitment?.baselineRecommendationConfidence).toBe(0.7);
    expect(updates[0]).toHaveProperty('$push.experiments');
    expect(updates[0]).not.toHaveProperty('$set.commitment');
  });

  it('appends factual evidence without rewriting prior evidence or assumptions', async () => {
    const existingEvidence = {
      id: 'evidence-old',
      kind: HsakaaDecisionEvidenceKind.NOTE,
      stance: HsakaaDecisionEvidenceStance.NEUTRAL,
      detail: 'Initial note.',
      sourceReference: '',
      metricLabel: '',
      metricValue: '',
      occurredAt: null,
      experimentId: null,
      assumptionIds: [],
      recordedAt: new Date('2026-08-28T01:00:00.000Z'),
    };
    const decision = baseDecision({ evidenceLog: [existingEvidence] });
    const { service, updates } = createService(decision);

    const result = await service.addEvidence(decision._id.toHexString(), {
      kind: HsakaaDecisionEvidenceKind.METRIC,
      stance: HsakaaDecisionEvidenceStance.CONTRADICTS,
      detail: 'Only 2 of 10 prospects accepted the target price.',
      metricLabel: 'Accepted price',
      metricValue: '2/10',
      assumptionIds: ['assumption_1'],
    });

    expect(result.evidenceLog).toHaveLength(2);
    expect(result.evidenceLog[0].id).toBe('evidence-old');
    expect(updates[0]).toHaveProperty('$push.evidenceLog');
    expect(updates[0]).not.toHaveProperty('$set.evidenceLog');
    expect(result.assumptions[0].status).toBe(
      HsakaaDecisionAssumptionStatus.UNTESTED,
    );
  });

  it('keeps active experiments open when a decision outcome is too early', async () => {
    const experiment = {
      id: 'experiment-1',
      title: 'Pricing test',
      hypothesis: 'Demand supports launch.',
      description: '',
      successCriteria: '6/10 yes',
      failureCriteria: '3/10 or fewer yes',
      assumptionIds: ['assumption_1'],
      supportsOptionIds: ['option_1'],
      status: HsakaaDecisionExperimentStatus.ACTIVE,
      startAt: new Date('2026-08-27T00:00:00.000Z'),
      targetReviewAt: new Date('2026-09-10T00:00:00.000Z'),
      result: null,
      conclusion: '',
      createdAt: new Date('2026-08-27T00:00:00.000Z'),
      completedAt: null,
    };
    const decision = baseDecision({
      experiments: [experiment],
      outcome: {
        status: HsakaaDecisionOutcomeStatus.TOO_EARLY,
        summary: 'Need more time.',
      },
    });
    const { service, generateStructuredResponse } = createService(decision, [
      decision,
    ]);

    const queue = await service.getExperimentQueue(
      new Date('2026-08-28T00:00:00.000Z'),
    );

    expect(queue.active).toHaveLength(1);
    expect(queue.active[0].experiment).toEqual(
      expect.objectContaining({ id: 'experiment-1' }),
    );
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('completes an experiment as a historical record and refuses to complete it twice', async () => {
    const experiment = {
      id: 'experiment-1',
      title: 'Pricing test',
      hypothesis: 'Demand supports launch.',
      description: '',
      successCriteria: '6/10 yes',
      failureCriteria: '3/10 or fewer yes',
      assumptionIds: ['assumption_1'],
      supportsOptionIds: ['option_1'],
      status: HsakaaDecisionExperimentStatus.ACTIVE,
      startAt: new Date(),
      targetReviewAt: null,
      result: null,
      conclusion: '',
      createdAt: new Date(),
      completedAt: null,
    };
    const decision = baseDecision({ experiments: [experiment] });
    const { service } = createService(decision);

    const completed = await service.completeExperiment(
      decision._id.toHexString(),
      'experiment-1',
      {
        result: HsakaaDecisionExperimentResult.FAILED,
        conclusion: 'Demand missed the threshold.',
      },
    );

    expect(completed.experiments[0].status).toBe(
      HsakaaDecisionExperimentStatus.COMPLETED,
    );
    expect(completed.experiments[0].result).toBe(
      HsakaaDecisionExperimentResult.FAILED,
    );

    await expect(
      service.completeExperiment(decision._id.toHexString(), 'experiment-1', {
        result: HsakaaDecisionExperimentResult.SUPPORTED,
        conclusion: 'Try to rewrite history.',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('requires new evidence unless an explicit reassessment is requested', async () => {
    const decision = baseDecision();
    const { service, generateStructuredResponse } = createService(decision);

    await expect(
      service.reassess(decision._id.toHexString(), { force: false }),
    ).rejects.toMatchObject({ status: 400 });
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('stores a versioned reassessment without mutating the original analysis or commitment baseline', async () => {
    const evidence = {
      id: 'evidence-1',
      kind: HsakaaDecisionEvidenceKind.METRIC,
      stance: HsakaaDecisionEvidenceStance.CONTRADICTS,
      detail: 'Only 2 of 10 accepted.',
      sourceReference: '',
      metricLabel: 'Accepted price',
      metricValue: '2/10',
      occurredAt: null,
      experimentId: null,
      assumptionIds: ['assumption_1'],
      recordedAt: new Date('2026-08-28T02:00:00.000Z'),
    };
    const decision = baseDecision({ evidenceLog: [evidence] });
    const { service, updates, generateStructuredResponse } =
      createService(decision);

    const result = await service.reassess(decision._id.toHexString(), {
      reason: 'Pricing evidence is now available.',
    });

    expect(generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(result.reassessments).toHaveLength(1);
    expect(result.reassessments[0]).toEqual(
      expect.objectContaining({
        version: 1,
        priorRecommendation: { optionId: 'option_1', confidence: 0.7 },
        currentRecommendation: {
          optionId: 'option_2',
          confidence: 0.62,
          rationale: 'New willingness-to-pay evidence weakens the launch case.',
        },
        evidenceIdsConsidered: ['evidence-1'],
        newEvidenceIds: ['evidence-1'],
      }),
    );
    expect(updates[0]).toHaveProperty('$push.reassessments');
    expect(updates[0]).not.toHaveProperty('$set.analysis');
    expect(updates[0]).not.toHaveProperty('$set.commitment');
    expect(result.originalRecommendation).toEqual(
      expect.objectContaining({ optionId: 'option_1', confidence: 0.7 }),
    );
    expect(result.commitment?.baselineRecommendationConfidence).toBe(0.7);
  });

  it('returns invalidated assumptions in the deterministic global queue without AI', async () => {
    const invalidated = baseDecision({
      assumptionRegister: [
        {
          ...baseDecision().assumptionRegister[0],
          status: HsakaaDecisionAssumptionStatus.INVALIDATED,
        },
      ],
    });
    const { service, generateStructuredResponse } = createService(invalidated, [
      invalidated,
    ]);

    const queue = await service.getExperimentQueue();

    expect(queue.invalidatedAssumptions).toHaveLength(1);
    expect(queue.counts.invalidatedAssumptions).toBe(1);
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });
});
