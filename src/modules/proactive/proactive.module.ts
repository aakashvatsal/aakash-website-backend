import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { AiModule } from '../ai/ai.module';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { ProactiveController } from './proactive.controller';
import { ProactiveService } from './proactive.service';
import {
  ProactiveReview,
  ProactiveReviewSchema,
} from './schemas/proactive-review.schema';
import {
  ProactiveSignal,
  ProactiveSignalSchema,
} from './schemas/proactive-signal.schema';

@Module({
  imports: [
    AiModule,
    HsakaaObservabilityModule,
    HsakaaRuntimeModule,
    ContextEngineModule,
    MongooseModule.forFeature([
      { name: ProactiveSignal.name, schema: ProactiveSignalSchema },
      { name: ProactiveReview.name, schema: ProactiveReviewSchema },
    ]),
  ],
  controllers: [ProactiveController],
  providers: [HsakaaOwnerSessionGuard, ProactiveService],
  exports: [ProactiveService],
})
export class ProactiveModule {}
