import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { LoginDto } from './dto/login.dto';

export interface OwnerProfile {
  id: 'owner';
  email: string;
  name?: string;
}

interface OwnerJwtPayload {
  sub: string;
  type: 'owner_access';
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  private readonly ownerSubject = 'personal-os-owner';

  private readonly tokenType = 'owner_access' as const;

  private readonly issuer = 'aakash-personal-os';

  private readonly audience = 'aakash-personal-os-web';

  constructor(private readonly jwtService: JwtService) {}

  async login(dto: LoginDto) {
    const configuredEmail = this.getOwnerEmail();

    const passwordHash = this.getRequiredEnv('PERSONAL_OS_PASSWORD_HASH');

    const suppliedEmail = dto.email.trim().toLowerCase();

    const passwordMatches =
      suppliedEmail === configuredEmail &&
      (await bcrypt.compare(dto.password, passwordHash));

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const jwtSecret = this.getJwtSecret();

    const expiresIn = this.getJwtExpiry();

    const accessToken = await this.jwtService.signAsync(
      {
        sub: this.ownerSubject,
        type: this.tokenType,
      },
      {
        secret: jwtSecret,
        expiresIn,
        issuer: this.issuer,
        audience: this.audience,
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      owner: this.getOwnerProfile(),
    };
  }

  async verifyAccessToken(token: string): Promise<OwnerJwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<OwnerJwtPayload>(
        token,
        {
          secret: this.getJwtSecret(),
          issuer: this.issuer,
          audience: this.audience,
        },
      );

      if (
        payload.sub !== this.ownerSubject ||
        payload.type !== this.tokenType
      ) {
        throw new UnauthorizedException('Invalid access token.');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }

  getOwnerProfile(): OwnerProfile {
    const name = process.env.PERSONAL_OS_NAME?.trim();

    return {
      id: 'owner',
      email: this.getOwnerEmail(),
      ...(name
        ? {
            name,
          }
        : {}),
    };
  }

  private getOwnerEmail() {
    return this.getRequiredEnv('PERSONAL_OS_EMAIL').trim().toLowerCase();
  }

  private getJwtSecret() {
    return this.getRequiredEnv('JWT_SECRET');
  }

  private getJwtExpiry() {
    const configured = Number(process.env.JWT_EXPIRES_IN_SECONDS);

    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }

    return 60 * 60 * 24 * 7;
  }

  private getRequiredEnv(key: string) {
    const value = process.env[key]?.trim();

    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured.`);
    }

    return value;
  }
}
