import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { ReleaseHardeningService } from './release-hardening.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/release-hardening')
export class ReleaseHardeningController {
  constructor(private readonly releaseHardening: ReleaseHardeningService) {}

  @Get('policy')
  getPolicy() {
    return this.releaseHardening.getPolicy();
  }

  @Get('status')
  getStatus() {
    return this.releaseHardening.runChecks();
  }

  @Post('check')
  runChecks() {
    return this.releaseHardening.runChecks();
  }
}
