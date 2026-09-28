import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FundDashboardQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/)
  month?: string;
}

export class FundDecisionDto {
  @IsIn(['approve', 'needs_more_information', 'not_approve'])
  action: 'approve' | 'needs_more_information' | 'not_approve';

  @IsString()
  @MinLength(10)
  @MaxLength(2500)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(30000)
  amount?: number;
}

export class FundAmountOverrideDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(30000)
  amount: number;
}

export class FundMarkPaidDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  paymentReference: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(30000)
  amount?: number;
}
