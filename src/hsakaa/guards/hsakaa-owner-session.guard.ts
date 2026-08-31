import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const OWNER_SESSION_HEADER = 'x-owner-session';

@Injectable()
export class HsakaaOwnerSessionGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>('ADMIN_SESSION_SECRET');

    if (!secret) {
      throw new ServiceUnavailableException(
        'Private HSAKAA owner session validation is not configured.',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const rawHeader = request.headers[OWNER_SESSION_HEADER];
    const token = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!token || !this.verifyToken(token, secret)) {
      throw new UnauthorizedException('Owner authentication required.');
    }

    return true;
  }

  private verifyToken(token: string, secret: string): boolean {
    const [expiresAtRaw, signature, ...extra] = token.split('.');

    if (!expiresAtRaw || !signature || extra.length) {
      return false;
    }

    const expiresAt = Number(expiresAtRaw);
    const now = Math.floor(Date.now() / 1000);

    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      return false;
    }

    const expectedSignature = createHmac('sha256', secret)
      .update(expiresAtRaw)
      .digest('hex');

    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
