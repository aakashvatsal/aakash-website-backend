import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { HealthModule } from './modules/health/health.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { JournalModule } from './modules/journal/journal.module';
import { MemoryModule } from './modules/memory/memory.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { LibraryModule } from './modules/library/library.module';
import { MediaModule } from './modules/media/media.module';
import { DietModule } from './modules/diet/diet.module';
import { SupplementsModule } from './modules/supplements/supplements.module';
import { HealthReportsModule } from './modules/health-reports/health-reports.module';
import { SkincareModule } from './modules/skincare/skincare.module';
import { HaircareModule } from './modules/haircare/haircare.module';
import { IntimateCareModule } from './modules/intimate-care/intimate-care.module';
import { MeditationModule } from './modules/meditation/meditation.module';
import { ProductsModule } from './modules/products/products.module';
import { NowModule } from './modules/now/now.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { HsakaaModule } from './hsakaa/hsakaa.module';

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
    AdminDashboardModule,
    HsakaaModule,
  ],
})
export class AppModule {}