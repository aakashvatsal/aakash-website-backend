import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { HobbyReviewPeriod } from '../schemas/hobby-review.schema';

export class HobbyReviewQueryDto {
  @IsOptional()
  @IsEnum(HobbyReviewPeriod)
  period?: HobbyReviewPeriod;
}

export class GenerateHobbyReviewDto {
  @IsOptional()
  @IsEnum(HobbyReviewPeriod)
  period?: HobbyReviewPeriod;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  force?: boolean;
}
