import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailyIntimateCareLog,
  DailyIntimateCareLogSchema,
} from './schemas/daily-intimate-care-log.schema';
import {
  IntimateCareProduct,
  IntimateCareProductSchema,
} from './schemas/intimate-care-product.schema';
import {
  IntimateCareReport,
  IntimateCareReportSchema,
} from './schemas/intimate-care-report.schema';
import { IntimateCareController } from './intimate-care.controller';
import { IntimateCareService } from './intimate-care.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: IntimateCareProduct.name,
        schema: IntimateCareProductSchema,
      },
      {
        name: DailyIntimateCareLog.name,
        schema: DailyIntimateCareLogSchema,
      },
      {
        name: IntimateCareReport.name,
        schema: IntimateCareReportSchema,
      },
    ]),
  ],
  controllers: [IntimateCareController],
  providers: [IntimateCareService],
  exports: [IntimateCareService],
})
export class IntimateCareModule {}