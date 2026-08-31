import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { HsakaaDecisionHorizon } from './analyze-hsakaa-decision.dto';
import { HsakaaDecisionOutcomeStatus } from './review-hsakaa-decision-outcome.dto';

export const HSAKAA_DECISION_LEARNING_CALIBRATIONS = [
  'well_calibrated',
  'overconfident',
  'underconfident',
  'not_enough_evidence',
] as const;

export class HsakaaDecisionLearningQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  search?: string;

  @IsOptional()
  @IsIn(Object.values(HsakaaDecisionHorizon))
  horizon?: HsakaaDecisionHorizon;

  @IsOptional()
  @IsIn([
    HsakaaDecisionOutcomeStatus.POSITIVE,
    HsakaaDecisionOutcomeStatus.MIXED,
    HsakaaDecisionOutcomeStatus.NEGATIVE,
  ])
  status?:
    | HsakaaDecisionOutcomeStatus.POSITIVE
    | HsakaaDecisionOutcomeStatus.MIXED
    | HsakaaDecisionOutcomeStatus.NEGATIVE;

  @IsOptional()
  @IsIn(HSAKAA_DECISION_LEARNING_CALIBRATIONS)
  calibration?: (typeof HSAKAA_DECISION_LEARNING_CALIBRATIONS)[number];

  @IsOptional()
  @IsIn(['true', 'false'])
  recommendationFollowed?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
