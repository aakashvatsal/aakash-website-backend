import { Module } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { AiModule } from '../ai/ai.module';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { UniversalSearchModule } from '../universal-search/universal-search.module';
import { ContextEngineController } from './context-engine.controller';
import { ContextEngineService } from './context-engine.service';

@Module({
  imports: [AiModule, HsakaaObservabilityModule, UniversalSearchModule],
  controllers: [ContextEngineController],
  providers: [HsakaaOwnerSessionGuard, ContextEngineService],
  exports: [ContextEngineService],
})
export class ContextEngineModule {}
