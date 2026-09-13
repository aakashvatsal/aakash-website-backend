import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';

import { HsakaaModule } from './hsakaa/hsakaa.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { BrainDumpModule } from './modules/brain-dump/brain-dump.module';
import { ChatModule } from './modules/chat/chat.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContextEngineModule } from './modules/context-engine/context-engine.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DietModule } from './modules/diet/diet.module';
import { HaircareModule } from './modules/haircare/haircare.module';
import { HealthReportsModule } from './modules/health-reports/health-reports.module';
import { HealthModule } from './modules/health/health.module';
import { HobbiesModule } from './modules/hobbies/hobbies.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { IntimateCareModule } from './modules/intimate-care/intimate-care.module';
import { JournalModule } from './modules/journal/journal.module';
import { KnowledgeGraphModule } from './modules/knowledge-graph/knowledge-graph.module';
import { LibraryModule } from './modules/library/library.module';
import { MediaModule } from './modules/media/media.module';
import { MeditationModule } from './modules/meditation/meditation.module';
import { MemoryModule } from './modules/memory/memory.module';
import { NowModule } from './modules/now/now.module';
import { PersonalOsRuntimeModule } from './modules/personal-os-runtime/personal-os-runtime.module';
import { ProductsModule } from './modules/products/products.module';
import { ProactiveModule } from './modules/proactive/proactive.module';
import { ProductionOpsModule } from './modules/production-ops/production-ops.module';
import { ReleaseHardeningModule } from './modules/release-hardening/release-hardening.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { SkincareModule } from './modules/skincare/skincare.module';
import { SupplementsModule } from './modules/supplements/supplements.module';
import { SystemModule } from './modules/system/system.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UniversalSearchModule } from './modules/universal-search/universal-search.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    AiModule,
    ChatModule,
    MemoryModule,
    CompaniesModule,
    JournalModule,
    HealthModule,
    HobbiesModule,
    TasksModule,
    IntegrationsModule,
    LibraryModule,
    MediaModule,
    DietModule,
    SupplementsModule,
    HealthReportsModule,
    SkincareModule,
    HaircareModule,
    IntimateCareModule,
    MeditationModule,
    ProductsModule,
    NowModule,
    DashboardModule,
    RemindersModule,
    BrainDumpModule,
    HsakaaModule,
    SystemModule,
    KnowledgeGraphModule,
    UniversalSearchModule,
    ContextEngineModule,
    ProactiveModule,
    ReleaseHardeningModule,
    ProductionOpsModule,
    PersonalOsRuntimeModule,
  ],
  providers: [],
})
export class AppModule {}
