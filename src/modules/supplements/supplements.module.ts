import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  DailySupplementLog,
  DailySupplementLogSchema,
} from './schemas/daily-supplement-log.schema';
import {
  Supplement,
  SupplementSchema,
} from './schemas/supplement.schema';
import { SupplementsController } from './supplements.controller';
import { SupplementsService } from './supplements.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Supplement.name,
        schema: SupplementSchema,
      },
      {
        name: DailySupplementLog.name,
        schema: DailySupplementLogSchema,
      },
    ]),
  ],
  controllers: [SupplementsController],
  providers: [SupplementsService],
  exports: [
    SupplementsService,
    MongooseModule,
  ],
})
export class SupplementsModule {}