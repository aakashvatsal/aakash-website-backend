import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { Request } from 'express';

import { HsakaaOwnerSessionGuard } from './hsakaa-owner-session.guard';

describe('HsakaaOwnerSessionGuard', () => {
  const secret = 'test-owner-session-secret';

  function contextWithToken(token?: string): ExecutionContext {
    const request = {
      headers: token ? { 'x-owner-session': token } : {},
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function validToken(offsetSeconds = 60): string {
    const expiresAt = String(Math.floor(Date.now() / 1000) + offsetSeconds);
    const signature = createHmac('sha256', secret)
      .update(expiresAt)
      .digest('hex');
    return `${expiresAt}.${signature}`;
  }

  it('accepts a valid signed owner session', () => {
    const configService = {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
    const guard = new HsakaaOwnerSessionGuard(configService);

    expect(guard.canActivate(contextWithToken(validToken()))).toBe(true);
  });

  it('rejects an invalid or expired owner session', () => {
    const configService = {
      get: jest.fn().mockReturnValue(secret),
    } as unknown as ConfigService;
    const guard = new HsakaaOwnerSessionGuard(configService);

    expect(() => guard.canActivate(contextWithToken('invalid.token'))).toThrow(
      UnauthorizedException,
    );
    expect(() => guard.canActivate(contextWithToken(validToken(-60)))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed when the shared session secret is not configured', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const guard = new HsakaaOwnerSessionGuard(configService);

    expect(() => guard.canActivate(contextWithToken(validToken()))).toThrow(
      ServiceUnavailableException,
    );
  });
});
