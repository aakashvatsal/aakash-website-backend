import { Body, Controller, Headers, Ip, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';

import { RequestPersonOtpDto } from './dto/request-person-otp.dto';
import { VerifyPersonOtpDto } from './dto/verify-person-otp.dto';
import { MemoryVerificationService } from './memory-verification.service';

@Controller('memory-verification')
@Public()
export class MemoryVerificationController {
  constructor(
    private readonly verificationService: MemoryVerificationService,
  ) {}

  @Post('request-otp')
  requestOtp(
    @Body() dto: RequestPersonOtpDto,
    @Ip() ipAddress: string,
    @Req() request: Request,
  ) {
    return this.verificationService.requestOtp(
      // dto.ownerUserId,
      dto.identifier,
      ipAddress,
      request.headers['user-agent'],
    );
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyPersonOtpDto) {
    return this.verificationService.verifyOtp(
      dto.verificationSessionId,
      dto.otp,
    );
  }

  @Post('logout')
  logout(
    @Headers('x-memory-session')
    sessionToken: string,
  ) {
    return this.verificationService.revokeSession(sessionToken);
  }
}
