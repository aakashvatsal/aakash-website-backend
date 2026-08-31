import { Body, Controller, Get, Post } from '@nestjs/common';

import { CurrentOwner } from '../../common/decorators/current-owner.decorator';

import { Public } from '../../common/decorators/public.decorator';

import { AuthService } from './auth.service';

import type { OwnerProfile } from './auth.service';

import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto);
  }

  @Get('me')
  me(
    @CurrentOwner()
    owner: OwnerProfile,
  ) {
    return owner;
  }
}
