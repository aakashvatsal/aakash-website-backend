import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  DecideProactiveActionDto,
  GenerateProactiveReviewDto,
  ProactiveReviewQueryDto,
  ProactiveScanDto,
  ProactiveSignalQueryDto,
  UpdateProactiveSignalStatusDto,
} from './dto/proactive.dto';
import { ProactiveService } from './proactive.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/proactive')
export class ProactiveController {
  constructor(private readonly proactiveService: ProactiveService) {}

  @Get('policy')
  getPolicy() {
    return this.proactiveService.getPolicy();
  }

  @Get('dashboard')
  getDashboard() {
    return this.proactiveService.getDashboard();
  }

  @Post('scan')
  scan(@Body() dto: ProactiveScanDto) {
    return this.proactiveService.runScan(dto);
  }

  @Get('signals')
  getSignals(@Query() query: ProactiveSignalQueryDto) {
    return this.proactiveService.getSignals(query);
  }

  @Patch('signals/:id/status')
  updateSignalStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProactiveSignalStatusDto,
  ) {
    return this.proactiveService.updateSignalStatus(id, dto);
  }

  @Post('signals/:id/action-decision')
  decideAction(@Param('id') id: string, @Body() dto: DecideProactiveActionDto) {
    return this.proactiveService.decideAction(id, dto);
  }

  @Post('reviews/generate')
  generateReview(@Body() dto: GenerateProactiveReviewDto) {
    return this.proactiveService.generateReview(dto);
  }

  @Get('reviews')
  getReviews(@Query() query: ProactiveReviewQueryDto) {
    return this.proactiveService.getReviews(query);
  }

  @Patch('reviews/:id/reviewed')
  markReviewRead(@Param('id') id: string) {
    return this.proactiveService.markReviewReviewed(id);
  }
}
