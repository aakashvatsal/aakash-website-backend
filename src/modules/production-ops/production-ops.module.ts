import { Module } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { ReleaseHardeningModule } from '../release-hardening/release-hardening.module';
import { ProductionOpsController } from './production-ops.controller';
import { ProductionOpsService } from './production-ops.service';

@Module({
  imports: [
    HsakaaObservabilityModule,
    HsakaaRuntimeModule,
    ReleaseHardeningModule,
  ],
  controllers: [ProductionOpsController],
  providers: [HsakaaOwnerSessionGuard, ProductionOpsService],
})
export class ProductionOpsModule {}
