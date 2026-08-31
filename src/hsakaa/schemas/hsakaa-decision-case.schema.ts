import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { HsakaaDecisionHorizon } from '../dto/analyze-hsakaa-decision.dto';
import { HsakaaDecisionOutcomeStatus } from '../dto/review-hsakaa-decision-outcome.dto';
import {
  HsakaaDecisionAssumptionImportance,
  HsakaaDecisionAssumptionStatus,
  HsakaaDecisionEvidenceKind,
  HsakaaDecisionEvidenceStance,
  HsakaaDecisionExperimentResult,
  HsakaaDecisionExperimentStatus,
} from '../dto/manage-hsakaa-decision-experiment.dto';

export type HsakaaDecisionCaseDocument = HydratedDocument<HsakaaDecisionCase>;

export interface HsakaaDecisionEvidence {
  source: string;
  label: string;
  detail: string;
  occurredAt?: string | null;
}

export interface HsakaaDecisionCriterion {
  name: string;
  weight: number;
  rationale: string;
}

export interface HsakaaDecisionOptionAssessment {
  optionId: string;
  score: number;
  summary: string;
  advantages: string[];
  disadvantages: string[];
  risks: string[];
  opportunityCost: string;
  evidence: HsakaaDecisionEvidence[];
}

export interface HsakaaDecisionTradeoff {
  title: string;
  description: string;
  favoredOptionId?: string | null;
}

export interface HsakaaDecisionRisk {
  title: string;
  severity: 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  detail: string;
  appliesToOptionIds: string[];
}

export interface HsakaaDecisionExperiment {
  title: string;
  description: string;
  duration: string;
  supportsOptionIds: string[];
}

export interface HsakaaDecisionAnalysisContent {
  summary: string;
  decisionType: 'reversible' | 'partially_reversible' | 'hard_to_reverse';
  recommendation: {
    optionId?: string | null;
    confidence: number;
    rationale: string;
    whyNow: string;
    caution: string;
  };
  criteria: HsakaaDecisionCriterion[];
  optionAssessments: HsakaaDecisionOptionAssessment[];
  keyTradeoffs: HsakaaDecisionTradeoff[];
  risks: HsakaaDecisionRisk[];
  assumptions: string[];
  unknowns: string[];
  whatWouldChangeRecommendation: string[];
  suggestedExperiments: HsakaaDecisionExperiment[];
  nextPrompt: string;
}

export interface HsakaaDecisionCommitment {
  optionId: string;
  rationale: string;
  committedAt: Date;
  reviewAt?: Date | null;
  baselineRecommendationOptionId?: string | null;
  baselineRecommendationConfidence: number;
  baselineGeneratedAt: Date;
}

export interface HsakaaDecisionOutcomeEvaluation {
  verdict:
    | 'recommendation_held'
    | 'recommendation_mixed'
    | 'recommendation_missed'
    | 'too_early'
    | 'abandoned';
  calibration:
    | 'well_calibrated'
    | 'overconfident'
    | 'underconfident'
    | 'not_enough_evidence';
  summary: string;
  whatWorked: string[];
  whatDidnt: string[];
  surprises: string[];
  lessons: string[];
  futureAdjustments: string[];
  evidence: HsakaaDecisionEvidence[];
  nextPrompt: string;
}

export interface HsakaaDecisionOutcome {
  status: HsakaaDecisionOutcomeStatus;
  summary: string;
  evidenceNotes: string[];
  recordedAt: Date;
  recommendationFollowed: boolean | null;
  evaluation: HsakaaDecisionOutcomeEvaluation;
  aiModel: string;
  aiResponseId?: string;
  usage?: Record<string, number> | null;
  sources: string[];
}

export interface HsakaaDecisionAssumptionStatusChange {
  status: HsakaaDecisionAssumptionStatus;
  confidence: number | null;
  note: string;
  changedAt: Date;
}

export interface HsakaaDecisionTrackedAssumption {
  id: string;
  statement: string;
  importance: HsakaaDecisionAssumptionImportance;
  status: HsakaaDecisionAssumptionStatus;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: HsakaaDecisionAssumptionStatusChange[];
}

export interface HsakaaDecisionTrackedExperiment {
  id: string;
  title: string;
  hypothesis: string;
  description: string;
  successCriteria: string;
  failureCriteria: string;
  assumptionIds: string[];
  supportsOptionIds: string[];
  status: HsakaaDecisionExperimentStatus;
  startAt: Date | null;
  targetReviewAt: Date | null;
  result: HsakaaDecisionExperimentResult | null;
  conclusion: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface HsakaaDecisionTrackedEvidence {
  id: string;
  kind: HsakaaDecisionEvidenceKind;
  stance: HsakaaDecisionEvidenceStance;
  detail: string;
  sourceReference: string;
  metricLabel: string;
  metricValue: string;
  occurredAt: Date | null;
  experimentId: string | null;
  assumptionIds: string[];
  recordedAt: Date;
}

export interface HsakaaDecisionReassessmentSuggestion {
  assumptionId: string;
  suggestedStatus: HsakaaDecisionAssumptionStatus;
  suggestedConfidence: number | null;
  rationale: string;
}

export interface HsakaaDecisionReassessment {
  version: number;
  reason: string;
  requestedAt: Date;
  evidenceIdsConsidered: string[];
  newEvidenceIds: string[];
  priorRecommendation: {
    optionId: string | null;
    confidence: number;
  };
  currentRecommendation: {
    optionId: string | null;
    confidence: number;
    rationale: string;
  };
  recommendationChanged: boolean;
  whatChanged: string[];
  whatStillUnknown: string[];
  assumptionSuggestions: HsakaaDecisionReassessmentSuggestion[];
  evidenceSummary: string;
  nextPrompt: string;
  aiModel: string;
  aiResponseId?: string;
  usage?: Record<string, number> | null;
}

export interface HsakaaDecisionOption {
  id: string;
  label: string;
  description?: string;
}

export interface HsakaaDecisionLearningReference {
  id?: string;
  question: string;
  horizon: HsakaaDecisionHorizon;
  decisionType: HsakaaDecisionAnalysisContent['decisionType'];
  selectedOptionLabel: string;
  recommendationOptionLabel: string | null;
  recommendationFollowed: boolean | null;
  status:
    | HsakaaDecisionOutcomeStatus.POSITIVE
    | HsakaaDecisionOutcomeStatus.MIXED
    | HsakaaDecisionOutcomeStatus.NEGATIVE;
  verdict: HsakaaDecisionOutcomeEvaluation['verdict'];
  calibration: HsakaaDecisionOutcomeEvaluation['calibration'];
  baselineConfidence: number;
  summary: string;
  lessons: string[];
  surprises: string[];
  futureAdjustments: string[];
  recordedAt: Date;
  similarityScore: number;
}

export interface HsakaaDecisionLearningWarning {
  kind: 'sample_size' | 'calibration' | 'outcome_pattern';
  message: string;
  sampleSize: number;
}

export interface HsakaaDecisionLearningContext {
  generatedAt: Date;
  eligibleReviewedCount: number;
  similarReviewedCount: number;
  sampleQuality: 'insufficient' | 'emerging' | 'useful';
  warnings: HsakaaDecisionLearningWarning[];
  similarDecisions: HsakaaDecisionLearningReference[];
}

@Schema({
  timestamps: true,
  collection: 'hsakaa_decision_cases',
})
export class HsakaaDecisionCase {
  @Prop({ required: true, trim: true })
  question: string;

  @Prop({ type: [SchemaTypes.Mixed], required: true })
  options: HsakaaDecisionOption[];

  @Prop({ trim: true, default: '' })
  context?: string;

  @Prop({ type: [String], default: [] })
  constraints: string[];

  @Prop({
    type: String,
    required: true,
    enum: Object.values(HsakaaDecisionHorizon),
    default: HsakaaDecisionHorizon.MONTHS,
  })
  horizon: HsakaaDecisionHorizon;

  @Prop({ type: SchemaTypes.Mixed, required: true })
  analysis: HsakaaDecisionAnalysisContent;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  learningContext?: HsakaaDecisionLearningContext | null;

  @Prop({ required: true, trim: true })
  aiModel: string;

  @Prop({ trim: true })
  aiResponseId?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  usage?: Record<string, number> | null;

  @Prop({ type: [String], default: [] })
  sources: string[];

  @Prop({ required: true })
  generatedAt: Date;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  commitment?: HsakaaDecisionCommitment | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  outcome?: HsakaaDecisionOutcome | null;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  assumptionRegister: HsakaaDecisionTrackedAssumption[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  experiments: HsakaaDecisionTrackedExperiment[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  evidenceLog: HsakaaDecisionTrackedEvidence[];

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  reassessments: HsakaaDecisionReassessment[];
}

export const HsakaaDecisionCaseSchema =
  SchemaFactory.createForClass(HsakaaDecisionCase);

HsakaaDecisionCaseSchema.index({ generatedAt: -1 });
HsakaaDecisionCaseSchema.index({
  'commitment.reviewAt': 1,
  'commitment.committedAt': -1,
});
HsakaaDecisionCaseSchema.index({ question: 'text' });
HsakaaDecisionCaseSchema.index({
  'experiments.status': 1,
  'experiments.targetReviewAt': 1,
});
HsakaaDecisionCaseSchema.index({ 'assumptionRegister.status': 1 });
