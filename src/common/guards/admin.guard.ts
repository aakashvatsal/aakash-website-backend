import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as crypto from 'crypto';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request = context
      .switchToHttp()
      .getRequest();

    const receivedSecret =
      request.headers['x-admin-secret'];

    if (
      !receivedSecret ||
      typeof receivedSecret !== 'string'
    ) {
      throw new UnauthorizedException(
        'Admin authentication required.',
      );
    }

    const expectedSecret =
      this.configService.get<string>(
        'ADMIN_API_SECRET',
      );

    if (!expectedSecret) {
      throw new Error(
        'ADMIN_API_SECRET is not configured.',
      );
    }

    const receivedBuffer =
      Buffer.from(receivedSecret);

    const expectedBuffer =
      Buffer.from(expectedSecret);

    if (
      receivedBuffer.length !==
      expectedBuffer.length
    ) {
      throw new UnauthorizedException(
        'Invalid admin credentials.',
      );
    }

    const valid =
      crypto.timingSafeEqual(
        receivedBuffer,
        expectedBuffer,
      );

    if (!valid) {
      throw new UnauthorizedException(
        'Invalid admin credentials.',
      );
    }

    return true;
  }
}