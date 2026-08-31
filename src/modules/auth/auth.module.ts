import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';

import { AuthService } from './auth.service';

import { OwnerAuthGuard } from './guards/owner-auth.guard';

/**
 * Authentication is intentionally NOT global yet.
 *
 * The current Personal OS is a single-person application and the frontend
 * does not have a login/session flow wired into every server-side request.
 * Registering OwnerAuthGuard globally would therefore make every
 * existing endpoint return 401.
 *
 * Keep the auth service/guard available so specific routes can opt into it
 * later, or so we can make it global after the frontend auth flow exists.
 */
@Module({
  imports: [JwtModule.register({})],

  controllers: [AuthController],

  providers: [AuthService, OwnerAuthGuard],

  exports: [AuthService, OwnerAuthGuard],
})
export class AuthModule {}
