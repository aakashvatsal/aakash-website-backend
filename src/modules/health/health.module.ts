import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { WhoopHealthService } from './integrations/whoop-health.service';
import {
  HealthEntry,
  HealthEntrySchema,
} from './schemas/health-entry.schema';
import { HealthDashboardService } from './health-dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: HealthEntry.name,
        schema: HealthEntrySchema,
      },
    ]),
  ],
  controllers: [HealthController],
  providers: [HealthService, HealthDashboardService, WhoopHealthService],
  exports: [
    HealthService,
    HealthDashboardService,
    WhoopHealthService,
    MongooseModule,
  ],
})
export class HealthModule {}