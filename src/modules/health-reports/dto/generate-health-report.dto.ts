import {
  IsDateString,
  IsEnum,
  IsString,
} from 'class-validator';

import { HealthReportType } from '../schemas/health-report.schema';

export class GenerateHealthReportDto {
  @IsString()
  userId: string;

  @IsEnum(HealthReportType)
  reportType: HealthReportType;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}