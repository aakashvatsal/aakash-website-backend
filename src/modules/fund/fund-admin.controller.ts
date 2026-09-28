import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  FundAmountOverrideDto,
  FundDashboardQueryDto,
  FundDecisionDto,
  FundMarkPaidDto,
} from './dto/fund-admin.dto';
import { FundService } from './fund.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/fund')
export class FundAdminController {
  constructor(private readonly fundService: FundService) {}

  @Get('dashboard')
  dashboard(@Query() query: FundDashboardQueryDto) {
    return this.fundService.getDashboard(query.month);
  }

  @Get('cases/:caseId')
  getCase(@Param('caseId') caseId: string) {
    return this.fundService.getAdminCase(caseId);
  }

  @Patch('cases/:caseId/decision')
  decide(@Param('caseId') caseId: string, @Body() dto: FundDecisionDto) {
    return this.fundService.decide(caseId, dto);
  }

  @Patch('cases/:caseId/amount')
  overrideAmount(
    @Param('caseId') caseId: string,
    @Body() dto: FundAmountOverrideDto,
  ) {
    return this.fundService.overrideAmount(caseId, dto);
  }

  @Patch('cases/:caseId/paid')
  markPaid(@Param('caseId') caseId: string, @Body() dto: FundMarkPaidDto) {
    return this.fundService.markPaid(caseId, dto);
  }

  @Post('cases/:caseId/delivery/resend')
  resendDecision(@Param('caseId') caseId: string) {
    return this.fundService.resendDecision(caseId);
  }

  @Get('cases/:caseId/evidence/:evidenceId')
  async evidence(
    @Param('caseId') caseId: string,
    @Param('evidenceId') evidenceId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.fundService.getEvidenceFile(caseId, evidenceId);
    const safeFilename = file.filename.replace(/["\r\n]/g, '_');
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFilename}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(file.buffer);
  }
}
