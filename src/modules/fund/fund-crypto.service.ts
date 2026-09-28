import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';

@Injectable()
export class FundCryptoService {
  private readonly encryptionKey: Buffer;
  private readonly lookupSecret: string;

  constructor(private readonly configService: ConfigService) {
    const configuredSecret =
      this.configService.get<string>('FUND_ENCRYPTION_KEY') ||
      this.configService.get<string>('ADMIN_SESSION_SECRET');

    if (!configuredSecret) {
      throw new ServiceUnavailableException(
        'Fund encryption is not configured.',
      );
    }

    this.encryptionKey = createHash('sha256')
      .update(configuredSecret, 'utf8')
      .digest();

    this.lookupSecret =
      this.configService.get<string>('FUND_LOOKUP_SECRET') || configuredSecret;
  }

  encryptText(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decryptText(value?: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const [version, ivRaw, tagRaw, encryptedRaw, ...extra] = value.split('.');
    if (
      version !== 'v1' ||
      !ivRaw ||
      !tagRaw ||
      !encryptedRaw ||
      extra.length
    ) {
      throw new Error('Unsupported Fund encrypted payload.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  encryptJson(value: unknown): string {
    return this.encryptText(JSON.stringify(value));
  }

  decryptJson<T>(value?: string | null): T | undefined {
    const decrypted = this.decryptText(value);
    return decrypted ? (JSON.parse(decrypted) as T) : undefined;
  }

  encryptBuffer(value: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decryptBuffer(value: string): Buffer {
    const [version, ivRaw, tagRaw, encryptedRaw, ...extra] = value.split('.');
    if (
      version !== 'v1' ||
      !ivRaw ||
      !tagRaw ||
      !encryptedRaw ||
      extra.length
    ) {
      throw new Error('Unsupported Fund encrypted file payload.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64url')),
      decipher.final(),
    ]);
  }

  lookupHash(value: string, kind: 'phone' | 'email' | 'upi' | 'bank'): string {
    const normalized = this.normalizeLookup(value, kind);
    return createHmac('sha256', this.lookupSecret)
      .update(`${kind}:${normalized}`, 'utf8')
      .digest('hex');
  }

  sessionHash(sessionId: string): string {
    return createHmac('sha256', this.lookupSecret)
      .update(`session:${sessionId}`, 'utf8')
      .digest('hex');
  }

  sha256(value: Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private normalizeLookup(
    value: string,
    kind: 'phone' | 'email' | 'upi' | 'bank',
  ) {
    const trimmed = value.trim().toLowerCase();

    if (kind === 'phone') {
      const digits = trimmed.replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91'))
        return digits.slice(-10);
      if (digits.length === 11 && digits.startsWith('0'))
        return digits.slice(-10);
      return digits;
    }

    if (kind === 'bank') {
      return trimmed.replace(/\D/g, '');
    }

    return trimmed.replace(/\s+/g, '');
  }
}
