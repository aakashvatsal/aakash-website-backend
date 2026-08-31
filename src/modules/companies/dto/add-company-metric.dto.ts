import { IsDateString, IsDefined, IsOptional, IsString } from 'class-validator';

export class AddCompanyMetricDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsDefined()
  value: string | number | boolean;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}
