import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailyHaircareLog,
  DailyHaircareLogSchema,
} from './schemas/daily-haircare-log.schema';
import {
  HaircareProduct,
  HaircareProductSchema,
} from './schemas/haircare-product.schema';
import { HairReport, HairReportSchema } from './schemas/hair-report.schema';
import { HaircareController } from './haircare.controller';
import { HaircareService } from './haircare.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: HaircareProduct.name,
        schema: HaircareProductSchema,
      },
      {
        name: DailyHaircareLog.name,
        schema: DailyHaircareLogSchema,
      },
      {
        name: HairReport.name,
        schema: HairReportSchema,
      },
    ]),
  ],
  controllers: [HaircareController],
  providers: [HaircareService],
  exports: [HaircareService],
})
export class HaircareModule {}
