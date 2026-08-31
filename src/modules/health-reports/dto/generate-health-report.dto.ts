import { IsDateString, IsEnum } from 'class-validator';

import { HealthReportType } from '../schemas/health-report.schema';

export class GenerateHealthReportDto {
  @IsEnum(HealthReportType)
  reportType: HealthReportType;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}
