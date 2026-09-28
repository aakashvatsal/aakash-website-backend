import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

import { Public } from '../../common/decorators/public.decorator';

import {
  FUND_MAX_EVIDENCE_FILE_BYTES,
  FUND_MAX_EVIDENCE_FILES_PER_UPLOAD,
} from './fund.constants';
import { FundPublicCaseQueryDto } from './dto/fund-chat.dto';
import { FundEvidenceUploadDto } from './dto/fund-evidence.dto';
import { FundService, UploadedFundFile } from './fund.service';

@Public()
@Controller('fund')
export class FundController {
  constructor(private readonly fundService: FundService) {}

  @Get('status')
  getStatus() {
    return this.fundService.getAvailability();
  }

  @Get('cases/:caseId')
  getCase(
    @Param('caseId') caseId: string,
    @Query() query: FundPublicCaseQueryDto,
  ) {
    return this.fundService.getPublicCase(caseId, query);
  }

  @Post('evidence')
  @UseInterceptors(
    FilesInterceptor('files', FUND_MAX_EVIDENCE_FILES_PER_UPLOAD, {
      limits: { fileSize: FUND_MAX_EVIDENCE_FILE_BYTES },
    }),
  )
  uploadEvidence(
    @Body() dto: FundEvidenceUploadDto,
    @UploadedFiles() files: UploadedFundFile[],
  ) {
    return this.fundService.uploadEvidence(dto, files || []);
  }
}
