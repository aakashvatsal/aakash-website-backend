import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { AiService, AiStructuredResponse } from '../modules/ai/ai.service';
import {
  AddHsakaaDecisionEvidenceDto,
  CompleteHsakaaDecisionExperimentDto,
  CreateHsakaaDecisionExperimentDto,
  HsakaaDecisionAssumptionStatus,
  HsakaaDecisionEvidenceStance,
  HsakaaDecisionExperimentStatus,
  ReassessHsakaaDecisionDto,
  UpdateHsakaaDecisionAssumptionDto,
  UpdateHsakaaDecisionExperimentStatusDto,
} from './dto/manage-hsakaa-decision-experiment.dto';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseDocument,
  HsakaaDecisionAnalysisContent,
  HsakaaDecisionCommitment,
  HsakaaDecisionOption,
  HsakaaDecisionOutcome,
  HsakaaDecisionReassessment,
  HsakaaDecisionTrackedAssumption,
  HsakaaDecisionTrackedEvidence,
  HsakaaDecisionTrackedExperiment,
} from './schemas/hsakaa-decision-case.schema';
import { HsakaaDecisionHorizon } from './dto/analyze-hsakaa-decision.dto';

interface DecisionCaseLike {
  _id: Types.ObjectId | string;
  question: string;
  horizon: HsakaaDecisionHorizon;
  options: HsakaaDecisionOption[];
  analysis: HsakaaDecisionAnalysisContent;
  generatedAt: Date;
  commitment?: HsakaaDecisionCommitment | null;
  outcome?: HsakaaDecisionOutcome | null;
  assumptionRegister?: HsakaaDecisionTrackedAssumption[];
  experiments?: HsakaaDecisionTrackedExperiment[];
  evidenceLog?: HsakaaDecisionTrackedEvidence[];
  reassessments?: HsakaaDecisionReassessment[];
}

export interface HsakaaDecisionExperimentState {
  decisionId: string;
  question: string;
  horizon: HsakaaDecisionHorizon;
  originalRecommendation: {
    optionId: string | null;
    confidence: number;
    generatedAt: Date;
  };
  commitment: HsakaaDecisionCommitment | null;
  outcome: HsakaaDecisionOutcome | null;
  assumptions: HsakaaDecisionTrackedAssumption[];
  experiments: HsakaaDecisionTrackedExperiment[];
  evidenceLog: HsakaaDecisionTrackedEvidence[];
  reassessments: HsakaaDecisionReassessment[];
}

interface ReassessmentAiResult {
  currentRecommendationOptionId: string | null;
  confidence: number;
  rationale: string;
  recommendationChanged: boolean;
  evidenceSummary: string;
  whatChanged: string[];
  whatStillUnknown: string[];
  assumptionSuggestions: Array<{
    assumptionId: string;
    suggestedStatus: HsakaaDecisionAssumptionStatus;
    suggestedConfidence: number | null;
    rationale: string;
  }>;
  nextPrompt: string;
}

const REASSESSMENT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'currentRecommendationOptionId',
    'confidence',
    'rationale',
    'recommendationChanged',
    'evidenceSummary',
    'whatChanged',
    'whatStillUnknown',
    'assumptionSuggestions',
    'nextPrompt',
  ],
  properties: {
    currentRecommendationOptionId: {
      anyOf: [{ type: 'string', maxLength: 40 }, { type: 'null' }],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    rationale: { type: 'string', maxLength: 1000 },
    recommendationChanged: { type: 'boolean' },
    evidenceSummary: { type: 'string', maxLength: 1200 },
    whatChanged: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 500 },
    },
    whatStillUnknown: {
      type: 'array',
      maxItems: 8,
      items: { type: 'string', maxLength: 500 },
    },
    assumptionSuggestions: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'assumptionId',
          'suggestedStatus',
          'suggestedConfidence',
          'rationale',
        ],
        properties: {
          assumptionId: { type: 'string', maxLength: 80 },
          suggestedStatus: {
            type: 'string',
            enum: Object.values(HsakaaDecisionAssumptionStatus),
          },
          suggestedConfidence: {
            anyOf: [
              { type: 'number', minimum: 0, maximum: 1 },
              { type: 'null' },
            ],
          },
          rationale: { type: 'string', maxLength: 700 },
        },
      },
    },
    nextPrompt: { type: 'string', maxLength: 500 },
  },
};

@Injectable()
export class HsakaaDecisionExperimentService {
  constructor(
    @InjectModel(HsakaaDecisionCase.name)
    private readonly decisionModel: Model<HsakaaDecisionCaseDocument>,
    private readonly aiService: AiService,
  ) {}

  async getDecisionState(decisionId: string) {
    const decision = await this.getDocument(decisionId);
    return this.toState(decision);
  }

  async getAssumptions(decisionId: string) {
    const decision = await this.getDocument(decisionId);
    const evidence = decision.evidenceLog ?? [];
    const assumptions = (decision.assumptionRegister ?? []).map(
      (assumption) => {
        const linked = evidence.filter((item) =>
          item.assumptionIds?.includes(assumption.id),
        );
        return {
          ...assumption,
          evidenceFor: linked.filter(
            (item) => item.stance === HsakaaDecisionEvidenceStance.SUPPORTS,
          ),
          evidenceAgainst: linked.filter(
            (item) => item.stance === HsakaaDecisionEvidenceStance.CONTRADICTS,
          ),
          neutralEvidence: linked.filter(
            (item) => item.stance === HsakaaDecisionEvidenceStance.NEUTRAL,
          ),
        };
      },
    );

    return {
      decisionId: this.idToString(decision._id) ?? String(decision._id),
      question: decision.question,
      count: assumptions.length,
      assumptions,
    };
  }

  async getExperimentQueue(referenceDate = new Date()) {
    const decisions = await this.decisionModel
      .find({
        $or: [
          { experiments: { $exists: true, $ne: [] } },
          {
            'assumptionRegister.status':
              HsakaaDecisionAssumptionStatus.INVALIDATED,
          },
        ],
      })
      .sort({ generatedAt: -1 })
      .limit(200)
      .lean()
      .exec();

    const dueForReview: Array<Record<string, unknown>> = [];
    const active: Array<Record<string, unknown>> = [];
    const awaitingResult: Array<Record<string, unknown>> = [];
    const completed: Array<Record<string, unknown>> = [];
    const invalidatedAssumptions: Array<Record<string, unknown>> = [];

    for (const decision of decisions) {
      const decisionId = this.idToString(decision._id);
      for (const experiment of decision.experiments ?? []) {
        const item = {
          decisionId,
          question: decision.question,
          horizon: decision.horizon,
          experiment,
        };
        const target = experiment.targetReviewAt
          ? new Date(experiment.targetReviewAt)
          : null;
        const isDue =
          target &&
          !Number.isNaN(target.getTime()) &&
          target.getTime() <= referenceDate.getTime() &&
          [
            HsakaaDecisionExperimentStatus.PLANNED,
            HsakaaDecisionExperimentStatus.ACTIVE,
            HsakaaDecisionExperimentStatus.AWAITING_RESULT,
          ].includes(experiment.status);

        if (isDue) {
          dueForReview.push(item);
        } else if (
          experiment.status === HsakaaDecisionExperimentStatus.PLANNED ||
          experiment.status === HsakaaDecisionExperimentStatus.ACTIVE
        ) {
          active.push(item);
        } else if (
          experiment.status === HsakaaDecisionExperimentStatus.AWAITING_RESULT
        ) {
          awaitingResult.push(item);
        } else if (
          experiment.status === HsakaaDecisionExperimentStatus.COMPLETED
        ) {
          completed.push(item);
        }
      }

      for (const assumption of decision.assumptionRegister ?? []) {
        if (assumption.status === HsakaaDecisionAssumptionStatus.INVALIDATED) {
          invalidatedAssumptions.push({
            decisionId,
            question: decision.question,
            horizon: decision.horizon,
            assumption,
          });
        }
      }
    }

    const byTarget = (
      left: Record<string, unknown>,
      right: Record<string, unknown>,
    ) => {
      const leftExperiment = left.experiment as HsakaaDecisionTrackedExperiment;
      const rightExperiment =
        right.experiment as HsakaaDecisionTrackedExperiment;
      return (
        new Date(leftExperiment.targetReviewAt ?? 0).getTime() -
        new Date(rightExperiment.targetReviewAt ?? 0).getTime()
      );
    };
    dueForReview.sort(byTarget);
    completed.sort((left, right) => {
      const leftExperiment = left.experiment as HsakaaDecisionTrackedExperiment;
      const rightExperiment =
        right.experiment as HsakaaDecisionTrackedExperiment;
      return (
        new Date(rightExperiment.completedAt ?? 0).getTime() -
        new Date(leftExperiment.completedAt ?? 0).getTime()
      );
    });

    return {
      generatedAt: referenceDate,
      counts: {
        active: active.length,
        awaitingResult: awaitingResult.length,
        dueForReview: dueForReview.length,
        completed: completed.length,
        invalidatedAssumptions: invalidatedAssumptions.length,
      },
      active,
      awaitingResult,
      dueForReview,
      completed: completed.slice(0, 30),
      invalidatedAssumptions,
    };
  }

  async createExperiment(
    decisionId: string,
    dto: CreateHsakaaDecisionExperimentDto,
  ) {
    const decision = await this.getDocument(decisionId);
    const assumptionIds = this.uniqueStrings(dto.assumptionIds ?? []);
    const supportsOptionIds = this.uniqueStrings(dto.supportsOptionIds ?? []);
    this.assertAssumptionIds(decision.assumptionRegister ?? [], assumptionIds);
    this.assertOptionIds(decision.options, supportsOptionIds);

    const experiment: HsakaaDecisionTrackedExperiment = {
      id: randomUUID(),
      title: dto.title.trim(),
      hypothesis: dto.hypothesis.trim(),
      description: dto.description?.trim() ?? '',
      successCriteria: dto.successCriteria.trim(),
      failureCriteria: dto.failureCriteria.trim(),
      assumptionIds,
      supportsOptionIds,
      status: HsakaaDecisionExperimentStatus.PLANNED,
      startAt: dto.startAt ? this.validDate(dto.startAt, 'start date') : null,
      targetReviewAt: dto.targetReviewAt
        ? this.validDate(dto.targetReviewAt, 'target review date')
        : null,
      result: null,
      conclusion: '',
      createdAt: new Date(),
      completedAt: null,
    };

    const saved = await this.decisionModel
      .findByIdAndUpdate(
        decision._id,
        { $push: { experiments: experiment } },
        { new: true },
      )
      .lean()
      .exec();

    if (!saved) {
      throw new ServiceUnavailableException(
        'Could not create this experiment.',
      );
    }
    return this.toState(saved);
  }

  async updateExperimentStatus(
    decisionId: string,
    experimentId: string,
    dto: UpdateHsakaaDecisionExperimentStatusDto,
  ) {
    const decision = await this.getDocument(decisionId);
    const experiments = [...(decision.experiments ?? [])];
    const index = experiments.findIndex((item) => item.id === experimentId);
    if (index < 0)
      throw new NotFoundException('Decision experiment not found.');
    const current = experiments[index];
    if (current.status === HsakaaDecisionExperimentStatus.COMPLETED) {
      throw new BadRequestException(
        'Completed experiments are historical records and cannot be reopened.',
      );
    }
    if (dto.status === HsakaaDecisionExperimentStatus.COMPLETED) {
      throw new BadRequestException(
        'Complete the experiment with a result and conclusion instead.',
      );
    }
    experiments[index] = {
      ...current,
      status: dto.status,
      startAt:
        dto.status === HsakaaDecisionExperimentStatus.ACTIVE && !current.startAt
          ? new Date()
          : current.startAt,
    };
    return this.saveExperiments(decision._id, experiments);
  }

  async addEvidence(decisionId: string, dto: AddHsakaaDecisionEvidenceDto) {
    const decision = await this.getDocument(decisionId);
    const assumptionIds = this.uniqueStrings(dto.assumptionIds ?? []);
    this.assertAssumptionIds(decision.assumptionRegister ?? [], assumptionIds);
    if (
      dto.experimentId &&
      !(decision.experiments ?? []).some((item) => item.id === dto.experimentId)
    ) {
      throw new NotFoundException('Decision experiment not found.');
    }

    const evidence: HsakaaDecisionTrackedEvidence = {
      id: randomUUID(),
      kind: dto.kind,
      stance: dto.stance,
      detail: dto.detail.trim(),
      sourceReference: dto.sourceReference?.trim() ?? '',
      metricLabel: dto.metricLabel?.trim() ?? '',
      metricValue: dto.metricValue?.trim() ?? '',
      occurredAt: dto.occurredAt
        ? this.validDate(dto.occurredAt, 'evidence date')
        : null,
      experimentId: dto.experimentId ?? null,
      assumptionIds,
      recordedAt: new Date(),
    };

    const saved = await this.decisionModel
      .findByIdAndUpdate(
        decision._id,
        { $push: { evidenceLog: evidence } },
        { new: true },
      )
      .lean()
      .exec();
    if (!saved)
      throw new ServiceUnavailableException('Could not save this evidence.');
    return this.toState(saved);
  }

  async updateAssumption(
    decisionId: string,
    assumptionId: string,
    dto: UpdateHsakaaDecisionAssumptionDto,
  ) {
    const decision = await this.getDocument(decisionId);
    const assumptions = [...(decision.assumptionRegister ?? [])];
    const index = assumptions.findIndex((item) => item.id === assumptionId);
    if (index < 0)
      throw new NotFoundException('Decision assumption not found.');

    const current = assumptions[index];
    const changedAt = new Date();
    const confidence =
      dto.confidence === undefined ? current.confidence : dto.confidence;
    assumptions[index] = {
      ...current,
      status: dto.status,
      confidence: confidence ?? null,
      updatedAt: changedAt,
      statusHistory: [
        ...(current.statusHistory ?? []),
        {
          status: dto.status,
          confidence: confidence ?? null,
          note: dto.note?.trim() ?? '',
          changedAt,
        },
      ],
    };

    const saved = await this.decisionModel
      .findByIdAndUpdate(
        decision._id,
        { $set: { assumptionRegister: assumptions } },
        { new: true },
      )
      .lean()
      .exec();
    if (!saved)
      throw new ServiceUnavailableException(
        'Could not update this assumption.',
      );
    return this.toState(saved);
  }

  async completeExperiment(
    decisionId: string,
    experimentId: string,
    dto: CompleteHsakaaDecisionExperimentDto,
  ) {
    const decision = await this.getDocument(decisionId);
    const experiments = [...(decision.experiments ?? [])];
    const index = experiments.findIndex((item) => item.id === experimentId);
    if (index < 0)
      throw new NotFoundException('Decision experiment not found.');
    const current = experiments[index];
    if (current.status === HsakaaDecisionExperimentStatus.COMPLETED) {
      throw new BadRequestException(
        'This experiment is already completed and its historical result is locked.',
      );
    }
    experiments[index] = {
      ...current,
      status: HsakaaDecisionExperimentStatus.COMPLETED,
      result: dto.result,
      conclusion: dto.conclusion.trim(),
      completedAt: dto.completedAt
        ? this.validDate(dto.completedAt, 'completion date')
        : new Date(),
    };
    return this.saveExperiments(decision._id, experiments);
  }

  async reassess(decisionId: string, dto: ReassessHsakaaDecisionDto) {
    const decision = await this.getDocument(decisionId);
    const evidence = decision.evidenceLog ?? [];
    const reassessments = decision.reassessments ?? [];
    const last = reassessments.at(-1);
    const lastEvidenceIds = new Set(last?.evidenceIdsConsidered ?? []);
    const newEvidenceIds = evidence
      .map((item) => item.id)
      .filter((id) => !lastEvidenceIds.has(id));

    if (!newEvidenceIds.length && !dto.force) {
      throw new BadRequestException(
        'Add new evidence before reassessing, or explicitly request a reassessment without new evidence.',
      );
    }

    const priorRecommendation = last
      ? {
          optionId: last.currentRecommendation.optionId,
          confidence: last.currentRecommendation.confidence,
        }
      : {
          optionId: decision.analysis.recommendation.optionId ?? null,
          confidence: decision.analysis.recommendation.confidence,
        };

    let aiResult: AiStructuredResponse<ReassessmentAiResult>;
    try {
      aiResult = await this.aiService.generateStructuredResponse({
        name: 'hsakaa_decision_reassessment',
        schema: REASSESSMENT_SCHEMA,
        instructions: this.buildReassessmentInstructions(
          decision,
          priorRecommendation,
        ),
        input: JSON.stringify(
          {
            originalAnalysis: decision.analysis,
            frozenCommitment: decision.commitment ?? null,
            assumptions: decision.assumptionRegister ?? [],
            experiments: decision.experiments ?? [],
            evidence,
            previousReassessments: reassessments,
            requestedReason: dto.reason?.trim() ?? '',
          },
          null,
          2,
        ),
        verbosity: 'medium',
      });
    } catch {
      throw new ServiceUnavailableException(
        'HSAKAA could not reassess this decision. Please try again.',
      );
    }

    this.validateReassessment(decision, aiResult.data);
    const reassessment: HsakaaDecisionReassessment = {
      version: reassessments.length + 1,
      reason: dto.reason?.trim() ?? '',
      requestedAt: new Date(),
      evidenceIdsConsidered: evidence.map((item) => item.id),
      newEvidenceIds,
      priorRecommendation,
      currentRecommendation: {
        optionId: aiResult.data.currentRecommendationOptionId,
        confidence: aiResult.data.confidence,
        rationale: aiResult.data.rationale,
      },
      recommendationChanged: aiResult.data.recommendationChanged,
      whatChanged: aiResult.data.whatChanged,
      whatStillUnknown: aiResult.data.whatStillUnknown,
      assumptionSuggestions: aiResult.data.assumptionSuggestions,
      evidenceSummary: aiResult.data.evidenceSummary,
      nextPrompt: aiResult.data.nextPrompt,
      aiModel: aiResult.model,
      aiResponseId: aiResult.responseId,
      usage: aiResult.usage ? { ...aiResult.usage } : null,
    };

    const saved = await this.decisionModel
      .findByIdAndUpdate(
        decision._id,
        { $push: { reassessments: reassessment } },
        { new: true },
      )
      .lean()
      .exec();
    if (!saved)
      throw new ServiceUnavailableException(
        'Could not save this reassessment.',
      );
    return this.toState(saved);
  }

  private buildReassessmentInstructions(
    decision: DecisionCaseLike,
    priorRecommendation: { optionId: string | null; confidence: number },
  ) {
    const validOptionIds = decision.options
      .map((item: { id: string }) => item.id)
      .join(', ');
    const validAssumptionIds = (decision.assumptionRegister ?? [])
      .map((item: { id: string }) => item.id)
      .join(', ');
    return `You are reassessing an existing HSAKAA Decision Lab case using newly tracked evidence.

The ORIGINAL analysis is immutable historical evidence. Never rewrite it, the original generatedAt, or the frozen commitment baseline.
Prior live recommendation: ${priorRecommendation.optionId ?? 'no clear winner'} at ${Math.round(priorRecommendation.confidence * 100)}% confidence.
Valid option IDs: ${validOptionIds}
Valid assumption IDs: ${validAssumptionIds || 'none'}

Rules:
- Evaluate the evidence independently and state whether the recommendation still holds.
- currentRecommendationOptionId must be one of the valid option IDs or null.
- Confidence describes this reassessment only. Do not alter historical confidence.
- assumptionSuggestions are suggestions only. They do not mutate the Assumption Register.
- Only reference assumption IDs that exist.
- Evidence entries are factual user records. Do not invent metrics, observations, dates or sources.
- A recommendation may stay the same while confidence changes.
- If evidence is weak or conflicting, keep confidence appropriately low and say what remains unknown.
- Preserve an audit trail: explain exactly what changed since the prior recommendation.`;
  }

  private validateReassessment(
    decision: DecisionCaseLike,
    result: ReassessmentAiResult,
  ) {
    if (
      result.currentRecommendationOptionId &&
      !decision.options.some(
        (item: { id: string }) =>
          item.id === result.currentRecommendationOptionId,
      )
    ) {
      throw new ServiceUnavailableException(
        'HSAKAA returned an invalid reassessment option.',
      );
    }
    const assumptionIds = new Set(
      (decision.assumptionRegister ?? []).map(
        (item: { id: string }) => item.id,
      ),
    );
    for (const suggestion of result.assumptionSuggestions) {
      if (!assumptionIds.has(suggestion.assumptionId)) {
        throw new ServiceUnavailableException(
          'HSAKAA returned an invalid reassessment assumption.',
        );
      }
    }
  }

  private async saveExperiments(
    decisionId: Types.ObjectId | string,
    experiments: HsakaaDecisionTrackedExperiment[],
  ) {
    const saved = await this.decisionModel
      .findByIdAndUpdate(decisionId, { $set: { experiments } }, { new: true })
      .lean()
      .exec();
    if (!saved)
      throw new ServiceUnavailableException(
        'Could not update this experiment.',
      );
    return this.toState(saved);
  }

  private assertAssumptionIds(
    assumptions: HsakaaDecisionTrackedAssumption[],
    ids: string[],
  ) {
    const valid = new Set(assumptions.map((item) => item.id));
    for (const id of ids) {
      if (!valid.has(id))
        throw new BadRequestException(`Unknown assumption ID: ${id}`);
    }
  }

  private assertOptionIds(options: Array<{ id: string }>, ids: string[]) {
    const valid = new Set(options.map((item) => item.id));
    for (const id of ids) {
      if (!valid.has(id))
        throw new BadRequestException(`Unknown option ID: ${id}`);
    }
  }

  private validDate(value: string, label: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Choose a valid ${label}.`);
    }
    return date;
  }

  private uniqueStrings(items: string[]) {
    return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  }

  private async getDocument(decisionId: string) {
    if (!Types.ObjectId.isValid(decisionId)) {
      throw new NotFoundException('Decision analysis not found.');
    }
    const decision = await this.decisionModel
      .findById(decisionId)
      .lean()
      .exec();
    if (!decision) throw new NotFoundException('Decision analysis not found.');
    return decision as unknown as DecisionCaseLike;
  }

  private toState(decision: DecisionCaseLike): HsakaaDecisionExperimentState {
    return {
      decisionId: this.idToString(decision._id) ?? String(decision._id),
      question: decision.question,
      horizon: decision.horizon,
      originalRecommendation: {
        optionId: decision.analysis.recommendation.optionId ?? null,
        confidence: decision.analysis.recommendation.confidence,
        generatedAt: decision.generatedAt,
      },
      commitment: decision.commitment ?? null,
      outcome: decision.outcome ?? null,
      assumptions: decision.assumptionRegister ?? [],
      experiments: decision.experiments ?? [],
      evidenceLog: decision.evidenceLog ?? [],
      reassessments: decision.reassessments ?? [],
    };
  }

  private idToString(value?: Types.ObjectId | string) {
    if (!value) return undefined;
    return typeof value === 'string' ? value : value.toHexString();
  }
}
