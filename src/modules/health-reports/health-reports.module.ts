import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DietEntry,
  DietEntrySchema,
} from '../diet/schemas/diet-entry.schema';
import {
  HealthEntry,
  HealthEntrySchema,
} from '../health/schemas/health-entry.schema';
import {
  DailySupplementLog,
  DailySupplementLogSchema,
} from '../supplements/schemas/daily-supplement-log.schema';
import { HealthReportsController } from './health-reports.controller';
import { HealthReportsService } from './health-reports.service';
import {
  HealthReport,
  HealthReportSchema,
} from './schemas/health-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: HealthReport.name,
        schema: HealthReportSchema,
      },
      {
        name: HealthEntry.name,
        schema: HealthEntrySchema,
      },
      {
        name: DietEntry.name,
        schema: DietEntrySchema,
      },
      {
        name: DailySupplementLog.name,
        schema: DailySupplementLogSchema,
      },
    ]),
  ],
  controllers: [HealthReportsController],
  providers: [HealthReportsService],
  exports: [HealthReportsService],
})
export class HealthReportsModule {}