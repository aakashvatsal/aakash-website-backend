import 'reflect-metadata';

import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import { BrainDumpService } from '../modules/brain-dump/brain-dump.service';
import { CompaniesService } from '../modules/companies/companies.service';
import { HealthDashboardService } from '../modules/health/health-dashboard.service';
import { JournalService } from '../modules/journal/journal.service';
import { LibraryService } from '../modules/library/library.service';
import { MemoryService } from '../modules/memory/memory.service';
import { NowService } from '../modules/now/now.service';
import { TasksService } from '../modules/tasks/tasks.service';
import {
  AnalyzeHsakaaDecisionDto,
  HsakaaDecisionHorizon,
} from './dto/analyze-hsakaa-decision.dto';
import { HsakaaDecisionOutcomeStatus } from './dto/review-hsakaa-decision-outcome.dto';
import { HsakaaDecisionService } from './hsakaa-decision.service';
import { HsakaaPatternService } from './hsakaa-pattern.service';
import { HsakaaWeeklyReviewService } from './hsakaa-weekly-review.service';
import {
  HsakaaDecisionAnalysisContent,
  HsakaaDecisionCaseDocument,
  HsakaaDecisionOutcomeEvaluation,
} from './schemas/hsakaa-decision-case.schema';

const analysis: HsakaaDecisionAnalysisContent = {
  summary: 'Option 1 is the better reversible next move with current evidence.',
  decisionType: 'reversible',
  recommendation: {
    optionId: 'option_1',
    confidence: 0.72,
    rationale: 'It better matches the current focus and preserves flexibility.',
    whyNow: 'The current work already points in this direction.',
    caution: 'The evidence is still limited, so validate with a short test.',
  },
  criteria: [
    {
      name: 'Focus alignment',
      weight: 0.6,
      rationale: 'Current focus matters.',
    },
    {
      name: 'Reversibility',
      weight: 0.4,
      rationale: 'Avoid premature lock-in.',
    },
  ],
  optionAssessments: [
    {
      optionId: 'option_1',
      score: 78,
      summary: 'Strong fit with current priorities.',
      advantages: ['Aligned with current work'],
      disadvantages: ['May delay the second path'],
      risks: ['Could over-focus on one path'],
      opportunityCost: 'Less time for option 2.',
      evidence: [
        {
          source: 'now_current',
          label: 'Current focus',
          detail: 'Current focus supports this path.',
          occurredAt: null,
        },
      ],
    },
    {
      optionId: 'option_2',
      score: 58,
      summary: 'Potentially useful but less aligned right now.',
      advantages: ['Creates optionality'],
      disadvantages: ['Splits attention'],
      risks: ['Shallow execution'],
      opportunityCost: 'Less depth on option 1.',
      evidence: [],
    },
  ],
  keyTradeoffs: [
    {
      title: 'Depth vs breadth',
      description: 'Option 1 concentrates effort while option 2 spreads it.',
      favoredOptionId: 'option_1',
    },
  ],
  risks: [
    {
      title: 'Focus risk',
      severity: 'medium',
      likelihood: 'low',
      detail: 'A focused bet can still be wrong.',
      appliesToOptionIds: ['option_1'],
    },
  ],
  assumptions: ['Current focus should remain the primary constraint.'],
  unknowns: ['Actual payoff of option 2 is not yet measured.'],
  whatWouldChangeRecommendation: [
    'Strong evidence that option 2 has much higher upside.',
  ],
  suggestedExperiments: [
    {
      title: 'Two-week test',
      description:
        'Run option 1 as the primary focus for two weeks and review results.',
      duration: '2 weeks',
      supportsOptionIds: ['option_1'],
    },
  ],
  nextPrompt: 'What metric should I use to judge the two-week experiment?',
};

const outcomeEvaluation: HsakaaDecisionOutcomeEvaluation = {
  verdict: 'recommendation_held',
  calibration: 'well_calibrated',
  summary: 'The original recommendation held up after the test period.',
  whatWorked: ['Focused execution produced the expected result.'],
  whatDidnt: [],
  surprises: ['The result arrived faster than expected.'],
  lessons: ['Short reversible tests are useful for uncertain choices.'],
  futureAdjustments: ['Keep using bounded tests when uncertainty is material.'],
  evidence: [
    {
      source: 'user_input',
      label: 'Outcome',
      detail: 'The chosen path produced the expected result.',
      occurredAt: null,
    },
  ],
  nextPrompt: 'Which part of this decision process should I reuse next time?',
};

const dto: AnalyzeHsakaaDecisionDto = {
  question: 'Should I focus on option one or option two?',
  horizon: HsakaaDecisionHorizon.MONTHS,
  options: [
    { label: 'Option one', description: 'Go deeper on the current path.' },
    { label: 'Option two', description: 'Split time into a second path.' },
  ],
  constraints: ['Keep execution focused'],
};

describe('HsakaaDecisionService', () => {
  function createService(overrides?: {
    aiAnalysis?: HsakaaDecisionAnalysisContent;
    aiOutcome?: HsakaaDecisionOutcomeEvaluation;
    existing?: Record<string, unknown> | null;
    findItems?: Record<string, unknown>[];
  }) {
    const generatedId = new Types.ObjectId();
    const generatedAt = new Date('2026-08-27T12:00:00.000Z');

    const saved = {
      _id: generatedId,
      question: dto.question,
      options: [
        {
          id: 'option_1',
          label: 'Option one',
          description: 'Go deeper on the current path.',
        },
        {
          id: 'option_2',
          label: 'Option two',
          description: 'Split time into a second path.',
        },
      ],
      context: '',
      constraints: ['Keep execution focused'],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis: overrides?.aiAnalysis ?? analysis,
      aiModel: 'gpt-test',
      aiResponseId: 'resp-decision',
      usage: { totalTokens: 500 },
      sources: ['now_current', 'task_summary'],
      generatedAt,
    };

    const create = jest
      .fn()
      .mockImplementation((payload: Record<string, unknown>) => {
        const savedPayload = { ...saved, ...payload };
        return Promise.resolve({
          ...savedPayload,
          toObject: () => savedPayload,
        });
      });

    const existing = overrides?.existing ?? null;
    const findByIdExec = jest.fn().mockResolvedValue(existing);
    const findById = jest.fn().mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: findByIdExec }),
    });

    const findByIdAndUpdate = jest
      .fn()
      .mockImplementation(
        (_id: unknown, update: { $set?: Record<string, unknown> }) => {
          const updated = {
            ...saved,
            ...(existing ?? {}),
          } as Record<string, unknown>;

          for (const [key, value] of Object.entries(update.$set ?? {})) {
            if (key === 'commitment.reviewAt') {
              updated.commitment = {
                ...(existing?.commitment ?? {}),
                reviewAt: value,
              };
            } else {
              updated[key] = value;
            }
          }

          return {
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(updated),
            }),
          };
        },
      );

    const recentExec = jest
      .fn()
      .mockResolvedValue(overrides?.findItems ?? (existing ? [existing] : []));
    const find = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({ exec: recentExec }),
        }),
      }),
    });

    const findOneExec = jest.fn().mockResolvedValue(existing);
    const findOne = jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: findOneExec }),
      }),
    });

    const model = {
      create,
      findById,
      findByIdAndUpdate,
      find,
      findOne,
    } as unknown as Model<HsakaaDecisionCaseDocument>;

    const structuredRequests: Array<{ name?: string; input?: string }> = [];
    const generateStructuredResponse = jest
      .fn()
      .mockImplementation((request: { name?: string; input?: string }) => {
        structuredRequests.push(request);
        return Promise.resolve({
          data:
            request.name === 'hsakaa_decision_outcome_review'
              ? (overrides?.aiOutcome ?? outcomeEvaluation)
              : (overrides?.aiAnalysis ?? analysis),
          model: 'gpt-test',
          responseId:
            request.name === 'hsakaa_decision_outcome_review'
              ? 'resp-outcome'
              : 'resp-decision',
          usage: { totalTokens: 500 },
        });
      });

    const aiService = { generateStructuredResponse } as unknown as AiService;
    const nowService = {
      getCurrent: jest.fn().mockResolvedValue({ focus: 'Option one' }),
    } as unknown as NowService;
    const tasksService = {
      getSummary: jest.fn().mockResolvedValue({ open: 2 }),
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as TasksService;
    const memoryService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as MemoryService;
    const journalService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as JournalService;
    const brainDumpService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as BrainDumpService;
    const companiesService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as CompaniesService;
    const libraryService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as LibraryService;
    const healthDashboardService = {
      getDashboard: jest.fn().mockResolvedValue({ today: null }),
    } as unknown as HealthDashboardService;
    const patternService = {
      getLatestCached: jest.fn().mockResolvedValue(null),
    } as unknown as HsakaaPatternService;
    const weeklyReviewService = {
      getLatestCached: jest.fn().mockResolvedValue(null),
    } as unknown as HsakaaWeeklyReviewService;
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    return {
      service: new HsakaaDecisionService(
        model,
        aiService,
        nowService,
        tasksService,
        memoryService,
        journalService,
        brainDumpService,
        companiesService,
        libraryService,
        healthDashboardService,
        patternService,
        weeklyReviewService,
        configService,
      ),
      create,
      findByIdAndUpdate,
      generateStructuredResponse,
      structuredRequests,
    };
  }

  it('analyzes every option and persists the advisory decision case', async () => {
    const { service, create, generateStructuredResponse } = createService();

    const result = await service.analyze(dto);

    expect(generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.analysis.recommendation.optionId).toBe('option_1');
    expect(result.options).toHaveLength(2);
  });

  it('rejects an AI result that references an unknown option', async () => {
    const invalid: HsakaaDecisionAnalysisContent = {
      ...analysis,
      recommendation: { ...analysis.recommendation, optionId: 'option_99' },
    };
    const { service, create } = createService({ aiAnalysis: invalid });

    await expect(service.analyze(dto)).rejects.toMatchObject({ status: 503 });
    expect(create).not.toHaveBeenCalled();
  });

  it('reanalyzes the same stored case rather than creating a duplicate', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, create, findByIdAndUpdate } = createService({ existing });

    await service.reanalyze(id.toHexString());

    expect(create).not.toHaveBeenCalled();
    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('reads recent stored analyses without invoking AI', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, generateStructuredResponse } = createService({ existing });

    const recent = await service.listRecent(5);

    expect(recent.data).toHaveLength(1);
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('records the selected option and freezes the original recommendation baseline', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date('2026-08-27T10:00:00.000Z'),
    };
    const { service, findByIdAndUpdate } = createService({ existing });

    const result = await service.recordCommitment(id.toHexString(), {
      optionId: 'option_2',
      rationale: 'I want to test the alternative.',
    });

    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.commitment).toMatchObject({
      optionId: 'option_2',
      baselineRecommendationOptionId: 'option_1',
      baselineRecommendationConfidence: 0.72,
    });
  });

  it('rejects a recorded choice that was not one of the analyzed options', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, findByIdAndUpdate } = createService({ existing });

    await expect(
      service.recordCommitment(id.toHexString(), { optionId: 'option_99' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('does not overwrite an already-recorded commitment', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: 'Already chosen.',
        committedAt: new Date('2026-08-27T10:00:00.000Z'),
        reviewAt: new Date('2026-09-15T00:00:00.000Z'),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date('2026-08-27T09:00:00.000Z'),
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date('2026-08-27T09:00:00.000Z'),
    };
    const { service, findByIdAndUpdate } = createService({ existing });

    await expect(
      service.recordCommitment(id.toHexString(), {
        optionId: 'option_2',
        rationale: 'Try to replace it.',
      }),
    ).rejects.toMatchObject({ status: 400 });

    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('reschedules a too-early review without touching the frozen calibration baseline', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: 'Test the focused route.',
        committedAt: new Date('2026-08-01T06:00:00.000Z'),
        reviewAt: new Date('2026-08-20T00:00:00.000Z'),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date('2026-08-01T05:00:00.000Z'),
      },
      outcome: {
        status: HsakaaDecisionOutcomeStatus.TOO_EARLY,
        summary: 'Not enough time has passed yet.',
        evidenceNotes: [],
        recordedAt: new Date('2026-08-20T05:00:00.000Z'),
        recommendationFollowed: true,
        evaluation: {
          ...outcomeEvaluation,
          verdict: 'too_early' as const,
          calibration: 'not_enough_evidence' as const,
        },
        aiModel: 'gpt-test',
        usage: null,
        sources: [],
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date('2026-08-01T05:00:00.000Z'),
    };
    const { service, findByIdAndUpdate } = createService({ existing });

    const result = await service.rescheduleReview(id.toHexString(), {
      reviewAt: '2026-10-15T00:00:00+05:30',
    });

    expect(findByIdAndUpdate).toHaveBeenCalledWith(
      id,
      {
        $set: {
          'commitment.reviewAt': new Date('2026-10-14T18:30:00.000Z'),
        },
      },
      { new: true },
    );
    expect(result.commitment?.baselineRecommendationOptionId).toBe('option_1');
    expect(result.commitment?.baselineRecommendationConfidence).toBe(0.72);
    expect(result.commitment?.reviewAt).toEqual(
      new Date('2026-10-14T18:30:00.000Z'),
    );
  });

  it('locks reanalysis after a real choice is recorded so calibration cannot rewrite history', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: '',
        committedAt: new Date(),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date(),
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, generateStructuredResponse } = createService({ existing });

    await expect(service.reanalyze(id.toHexString())).rejects.toMatchObject({
      status: 400,
    });
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('evaluates and persists a decision outcome against the frozen baseline', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: 'Test the focused route.',
        committedAt: new Date(),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date(),
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, findByIdAndUpdate, generateStructuredResponse } =
      createService({ existing });

    const result = await service.evaluateOutcome(id.toHexString(), {
      status: HsakaaDecisionOutcomeStatus.POSITIVE,
      summary: 'The focused route produced the result I wanted.',
      evidenceNotes: ['Execution stayed concentrated.'],
    });

    expect(generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'hsakaa_decision_outcome_review' }),
    );
    expect(findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(result.outcome?.recommendationFollowed).toBe(true);
    expect(result.outcome?.evaluation.calibration).toBe('well_calibrated');
  });

  it('computes stored calibration without invoking AI', async () => {
    const id = new Types.ObjectId();
    const existing = {
      _id: id,
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: '',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: '',
        committedAt: new Date(),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date(),
      },
      outcome: {
        status: HsakaaDecisionOutcomeStatus.POSITIVE,
        summary: 'It worked.',
        evidenceNotes: [],
        recordedAt: new Date(),
        recommendationFollowed: true,
        evaluation: outcomeEvaluation,
        aiModel: 'gpt-test',
        usage: null,
        sources: [],
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date(),
    };
    const { service, generateStructuredResponse } = createService({ existing });

    const calibration = await service.getCalibrationSummary();

    expect(calibration.committedCount).toBe(1);
    expect(calibration.reviewedCount).toBe(1);
    expect(calibration.recommendationFollowedRate).toBe(1);
    expect(calibration.calibrationCounts.well_calibrated).toBe(1);
    expect(calibration.sampleQuality).toBe('insufficient');
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('builds the deterministic decision review queue without invoking AI', async () => {
    const referenceDate = new Date('2026-08-28T06:00:00.000Z');
    const buildItem = (
      reviewAt: Date | null,
      outcomeStatus?: HsakaaDecisionOutcomeStatus,
    ) => {
      const id = new Types.ObjectId();
      return {
        _id: id,
        question: `${dto.question} ${id.toHexString().slice(-4)}`,
        options: [
          { id: 'option_1', label: 'Option one' },
          { id: 'option_2', label: 'Option two' },
        ],
        context: '',
        constraints: [],
        horizon: HsakaaDecisionHorizon.MONTHS,
        analysis,
        commitment: {
          optionId: 'option_1',
          rationale: '',
          committedAt: new Date('2026-08-01T06:00:00.000Z'),
          reviewAt,
          baselineRecommendationOptionId: 'option_1',
          baselineRecommendationConfidence: 0.72,
          baselineGeneratedAt: new Date('2026-08-01T05:00:00.000Z'),
        },
        outcome: outcomeStatus
          ? {
              status: outcomeStatus,
              summary:
                outcomeStatus === HsakaaDecisionOutcomeStatus.TOO_EARLY
                  ? 'Need more evidence.'
                  : 'Finished.',
              evidenceNotes: [],
              recordedAt: new Date('2026-08-27T05:00:00.000Z'),
              recommendationFollowed: true,
              evaluation: outcomeEvaluation,
              aiModel: 'gpt-test',
              usage: null,
              sources: [],
            }
          : null,
        aiModel: 'gpt-old',
        usage: null,
        sources: [],
        generatedAt: new Date('2026-08-01T05:00:00.000Z'),
      };
    };

    const overdue = buildItem(new Date('2026-08-27T10:00:00.000Z'));
    const dueToday = buildItem(new Date('2026-08-28T03:00:00.000Z'));
    const upcoming = buildItem(new Date('2026-08-29T03:00:00.000Z'));
    const unscheduled = buildItem(null, HsakaaDecisionOutcomeStatus.TOO_EARLY);
    const finished = buildItem(
      new Date('2026-08-28T03:00:00.000Z'),
      HsakaaDecisionOutcomeStatus.POSITIVE,
    );
    const { service, generateStructuredResponse } = createService({
      findItems: [overdue, dueToday, upcoming, unscheduled, finished],
    });

    const queue = await service.getDecisionReviewQueue(referenceDate);

    expect(queue.counts).toEqual({
      overdue: 1,
      dueToday: 1,
      upcoming: 1,
      unscheduled: 1,
      total: 4,
    });
    expect(queue.overdue[0].id).toBe(overdue._id.toHexString());
    expect(queue.dueToday[0].id).toBe(dueToday._id.toHexString());
    expect(queue.upcoming[0].id).toBe(upcoming._id.toHexString());
    expect(queue.unscheduled[0]).toMatchObject({
      id: unscheduled._id.toHexString(),
      adaptiveFollowUp: true,
    });
    expect(queue.unscheduled[0].suggestedReviewAt.getTime()).toBeGreaterThan(
      referenceDate.getTime(),
    );
    expect(queue.unscheduled[0].evidencePrompts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Strong evidence that option 2'),
        expect.stringContaining('Actual payoff of option 2'),
      ]),
    );
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });

  it('feeds deterministic similar decision learnings into a new analysis without an extra AI call', async () => {
    const buildReviewed = (
      calibration: HsakaaDecisionOutcomeEvaluation['calibration'],
      status: HsakaaDecisionOutcomeStatus = HsakaaDecisionOutcomeStatus.POSITIVE,
    ) => ({
      _id: new Types.ObjectId(),
      question: dto.question,
      options: [
        { id: 'option_1', label: 'Option one' },
        { id: 'option_2', label: 'Option two' },
      ],
      context: 'Keep execution focused.',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: '',
        committedAt: new Date('2026-07-01T05:00:00.000Z'),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.82,
        baselineGeneratedAt: new Date('2026-07-01T04:00:00.000Z'),
      },
      outcome: {
        status,
        summary: 'The focused route produced useful evidence.',
        evidenceNotes: [],
        recordedAt: new Date('2026-08-01T05:00:00.000Z'),
        recommendationFollowed: true,
        evaluation: { ...outcomeEvaluation, calibration },
        aiModel: 'gpt-test',
        usage: null,
        sources: [],
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date('2026-07-01T04:00:00.000Z'),
    });

    const { service, create, generateStructuredResponse, structuredRequests } =
      createService({
        findItems: [
          buildReviewed('overconfident'),
          buildReviewed('overconfident'),
          buildReviewed('well_calibrated'),
        ],
      });

    const result = await service.analyze(dto);

    expect(generateStructuredResponse).toHaveBeenCalledTimes(1);
    expect(structuredRequests[0]?.input).toContain('decision_learning');
    expect(structuredRequests[0]?.input).toContain('overconfident');
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.learningContext?.similarReviewedCount).toBe(3);
    expect(result.learningContext?.sampleQuality).toBe('emerging');
    const calibrationWarning = result.learningContext?.warnings.find(
      (warning) => warning.kind === 'calibration',
    );
    expect(calibrationWarning?.message).toContain('overconfident');
  });

  it('returns reusable decision lessons deterministically and excludes too-early and abandoned outcomes', async () => {
    const buildReviewed = (
      status: HsakaaDecisionOutcomeStatus,
      recommendationFollowed: boolean | null,
    ) => ({
      _id: new Types.ObjectId(),
      question: 'Should I expand the academy acquisition campaign in Mumbai?',
      options: [
        { id: 'option_1', label: 'Expand now' },
        { id: 'option_2', label: 'Keep the pilot small' },
      ],
      context: 'A reversible growth decision for the academy pipeline.',
      constraints: [],
      horizon: HsakaaDecisionHorizon.MONTHS,
      analysis,
      commitment: {
        optionId: 'option_1',
        rationale: '',
        committedAt: new Date('2026-07-01T05:00:00.000Z'),
        baselineRecommendationOptionId: 'option_1',
        baselineRecommendationConfidence: 0.72,
        baselineGeneratedAt: new Date('2026-07-01T04:00:00.000Z'),
      },
      outcome: {
        status,
        summary: 'The campaign produced a measurable result.',
        evidenceNotes: [],
        recordedAt: new Date('2026-08-10T05:00:00.000Z'),
        recommendationFollowed,
        evaluation: {
          ...outcomeEvaluation,
          verdict:
            status === HsakaaDecisionOutcomeStatus.TOO_EARLY
              ? ('too_early' as const)
              : status === HsakaaDecisionOutcomeStatus.ABANDONED
                ? ('abandoned' as const)
                : outcomeEvaluation.verdict,
        },
        aiModel: 'gpt-test',
        usage: null,
        sources: [],
      },
      aiModel: 'gpt-old',
      usage: null,
      sources: [],
      generatedAt: new Date('2026-07-01T04:00:00.000Z'),
    });

    const positive = buildReviewed(HsakaaDecisionOutcomeStatus.POSITIVE, true);
    const negative = buildReviewed(HsakaaDecisionOutcomeStatus.NEGATIVE, false);
    const tooEarly = buildReviewed(HsakaaDecisionOutcomeStatus.TOO_EARLY, true);
    const abandoned = buildReviewed(
      HsakaaDecisionOutcomeStatus.ABANDONED,
      null,
    );
    const { service, generateStructuredResponse } = createService({
      findItems: [positive, negative, tooEarly, abandoned],
    });

    const response = await service.getDecisionLearnings({
      search: 'Mumbai academy acquisition campaign',
      recommendationFollowed: 'false',
      limit: 20,
    });

    expect(response.counts.eligible).toBe(2);
    expect(response.counts.matched).toBe(1);
    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      id: negative._id.toHexString(),
      status: HsakaaDecisionOutcomeStatus.NEGATIVE,
      recommendationFollowed: false,
    });
    expect(
      response.data.some((item) => item.id === tooEarly._id.toHexString()),
    ).toBe(false);
    expect(
      response.data.some((item) => item.id === abandoned._id.toHexString()),
    ).toBe(false);
    expect(generateStructuredResponse).not.toHaveBeenCalled();
  });
});
