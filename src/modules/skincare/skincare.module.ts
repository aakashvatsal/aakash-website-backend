import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailySkincareLog,
  DailySkincareLogSchema,
} from './schemas/daily-skincare-log.schema';
import {
  SkincareProduct,
  SkincareProductSchema,
} from './schemas/skincare-product.schema';
import {
  SkinReport,
  SkinReportSchema,
} from './schemas/skin-report.schema';
import { SkincareController } from './skincare.controller';
import { SkincareService } from './skincare.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: SkincareProduct.name,
        schema: SkincareProductSchema,
      },
      {
        name: DailySkincareLog.name,
        schema: DailySkincareLogSchema,
      },
      {
        name: SkinReport.name,
        schema: SkinReportSchema,
      },
    ]),
  ],
  controllers: [SkincareController],
  providers: [SkincareService],
  exports: [SkincareService],
})
export class SkincareModule {}