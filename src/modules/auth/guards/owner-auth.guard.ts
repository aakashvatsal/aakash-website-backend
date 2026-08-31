import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';

import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';

import { AuthService } from '../auth.service';

type AuthenticatedRequest = Request & {
  user?: unknown;
};

@Injectable()
export class OwnerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,

    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    await this.authService.verifyAccessToken(token);

    request.user = this.authService.getOwnerProfile();

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return undefined;
    }

    const [type, token] = authorization.trim().split(/\s+/);

    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    return token;
  }
}
