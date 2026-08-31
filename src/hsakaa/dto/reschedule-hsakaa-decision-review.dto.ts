import { IsDateString } from 'class-validator';

export class RescheduleHsakaaDecisionReviewDto {
  @IsDateString()
  reviewAt: string;
}
