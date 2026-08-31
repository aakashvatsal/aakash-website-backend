import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { ProductionOpsService } from './production-ops.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/operations')
export class ProductionOpsController {
  constructor(private readonly operations: ProductionOpsService) {}

  @Get('policy')
  getPolicy() {
    return this.operations.getPolicy();
  }

  @Get('dashboard')
  getDashboard(@Query('days') days?: string) {
    return this.operations.getDashboard(this.parseDays(days, 30));
  }

  @Post('smoke')
  runSmoke(@Query('days') days?: string) {
    return this.operations.runRcSmoke(this.parseDays(days, 7));
  }

  private parseDays(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
