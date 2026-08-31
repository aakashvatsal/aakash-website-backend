import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaAiUsageService } from './hsakaa-ai-usage.service';
import {
  HsakaaAiUsage,
  HsakaaAiUsageSchema,
} from './schemas/hsakaa-ai-usage.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HsakaaAiUsage.name, schema: HsakaaAiUsageSchema },
    ]),
  ],
  providers: [HsakaaAiUsageService],
  exports: [HsakaaAiUsageService, MongooseModule],
})
export class HsakaaObservabilityModule {}
