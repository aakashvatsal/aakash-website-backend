import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { HsakaaModule } from '../../hsakaa/hsakaa.module';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { HealthModule } from '../health/health.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import { ProactiveModule } from '../proactive/proactive.module';
import { RemindersModule } from '../reminders/reminders.module';
import { UniversalSearchModule } from '../universal-search/universal-search.module';
import { PersonalOsAutomationGateService } from './personal-os-automation-gate.service';
import { PersonalOsMorningService } from './personal-os-morning.service';
import { PersonalOsRuntimeController } from './personal-os-runtime.controller';
import { PersonalOsRuntimeService } from './personal-os-runtime.service';
import {
  PersonalOsMorningRun,
  PersonalOsMorningRunSchema,
} from './schemas/personal-os-morning-run.schema';
import {
  PersonalOsRuntimeRun,
  PersonalOsRuntimeRunSchema,
} from './schemas/personal-os-runtime-run.schema';

@Module({
  imports: [
    HsakaaModule,
    HealthModule,
    IntegrationsModule,
    RemindersModule,
    KnowledgeGraphModule,
    UniversalSearchModule,
    ContextEngineModule,
    ProactiveModule,
    HsakaaRuntimeModule,
    MongooseModule.forFeature([
      { name: PersonalOsRuntimeRun.name, schema: PersonalOsRuntimeRunSchema },
      { name: PersonalOsMorningRun.name, schema: PersonalOsMorningRunSchema },
    ]),
  ],
  controllers: [PersonalOsRuntimeController],
  providers: [
    HsakaaOwnerSessionGuard,
    PersonalOsAutomationGateService,
    PersonalOsRuntimeService,
    PersonalOsMorningService,
  ],
  exports: [
    PersonalOsAutomationGateService,
    PersonalOsRuntimeService,
    PersonalOsMorningService,
  ],
})
export class PersonalOsRuntimeModule {}
