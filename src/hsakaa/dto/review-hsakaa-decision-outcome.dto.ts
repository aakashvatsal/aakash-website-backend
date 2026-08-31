import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum HsakaaDecisionOutcomeStatus {
  POSITIVE = 'positive',
  MIXED = 'mixed',
  NEGATIVE = 'negative',
  TOO_EARLY = 'too_early',
  ABANDONED = 'abandoned',
}

export class RecordHsakaaDecisionCommitmentDto {
  @IsString()
  @MaxLength(40)
  optionId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  rationale?: string;

  @IsOptional()
  @IsDateString()
  reviewAt?: string;
}

export class EvaluateHsakaaDecisionOutcomeDto {
  @IsEnum(HsakaaDecisionOutcomeStatus)
  status: HsakaaDecisionOutcomeStatus;

  @IsString()
  @MaxLength(3000)
  summary: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(420, { each: true })
  evidenceNotes?: string[];
}
