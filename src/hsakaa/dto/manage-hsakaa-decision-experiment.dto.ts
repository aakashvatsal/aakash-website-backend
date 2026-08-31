import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum HsakaaDecisionAssumptionStatus {
  UNTESTED = 'untested',
  TESTING = 'testing',
  SUPPORTED = 'supported',
  WEAKENED = 'weakened',
  INVALIDATED = 'invalidated',
}

export enum HsakaaDecisionAssumptionImportance {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum HsakaaDecisionExperimentStatus {
  PLANNED = 'planned',
  ACTIVE = 'active',
  AWAITING_RESULT = 'awaiting_result',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum HsakaaDecisionExperimentResult {
  SUPPORTED = 'supported',
  MIXED = 'mixed',
  FAILED = 'failed',
  INCONCLUSIVE = 'inconclusive',
}

export enum HsakaaDecisionEvidenceKind {
  OBSERVATION = 'observation',
  METRIC = 'metric',
  NOTE = 'note',
  SOURCE = 'source',
}

export enum HsakaaDecisionEvidenceStance {
  SUPPORTS = 'supports',
  CONTRADICTS = 'contradicts',
  NEUTRAL = 'neutral',
}

export class CreateHsakaaDecisionExperimentDto {
  @IsString()
  @MaxLength(180)
  title: string;

  @IsString()
  @MaxLength(600)
  hypothesis: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @MaxLength(600)
  successCriteria: string;

  @IsString()
  @MaxLength(600)
  failureCriteria: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  assumptionIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  supportsOptionIds?: string[];

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  targetReviewAt?: string;
}

export class UpdateHsakaaDecisionAssumptionDto {
  @IsEnum(HsakaaDecisionAssumptionStatus)
  status: HsakaaDecisionAssumptionStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  note?: string;
}

export class AddHsakaaDecisionEvidenceDto {
  @IsEnum(HsakaaDecisionEvidenceKind)
  kind: HsakaaDecisionEvidenceKind;

  @IsEnum(HsakaaDecisionEvidenceStance)
  stance: HsakaaDecisionEvidenceStance;

  @IsString()
  @MaxLength(1800)
  detail: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  metricLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  metricValue?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  experimentId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  assumptionIds?: string[];
}

export class CompleteHsakaaDecisionExperimentDto {
  @IsEnum(HsakaaDecisionExperimentResult)
  result: HsakaaDecisionExperimentResult;

  @IsString()
  @MaxLength(1800)
  conclusion: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class UpdateHsakaaDecisionExperimentStatusDto {
  @IsEnum(HsakaaDecisionExperimentStatus)
  status: HsakaaDecisionExperimentStatus;
}

export class ReassessHsakaaDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  reason?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
