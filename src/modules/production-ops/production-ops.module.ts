import { Module } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { ReleaseHardeningModule } from '../release-hardening/release-hardening.module';
import {
  BASE_PRODUCTION_OPS_SERVICE,
  IntegratedProductionOpsService,
} from './integrated-production-ops.service';
import { PersonalOsClosedLoopService } from './personal-os-closed-loop.service';
import { PersonalOsSystemHealthService } from './personal-os-system-health.service';
import { ProductionOpsController } from './production-ops.controller';
import { ProductionOpsService } from './production-ops.service';

@Module({
  imports: [
    HsakaaObservabilityModule,
    HsakaaRuntimeModule,
    ReleaseHardeningModule,
  ],
  controllers: [ProductionOpsController],
  providers: [
    HsakaaOwnerSessionGuard,
    {
      provide: BASE_PRODUCTION_OPS_SERVICE,
      useClass: ProductionOpsService,
    },
    PersonalOsSystemHealthService,
    PersonalOsClosedLoopService,
    IntegratedProductionOpsService,
    {
      provide: ProductionOpsService,
      useExisting: IntegratedProductionOpsService,
    },
  ],
})
export class ProductionOpsModule {}
