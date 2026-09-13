import { createHash, createHmac, randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MediaAssetType } from './schemas/media-asset.schema';

interface MediaStoredObjectHead {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
}

@Injectable()
export class MediaAssetStorageService {
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken: string;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      this.config.get<string>('MEDIA_STORAGE_S3_BUCKET')?.trim() ||
      this.config.get<string>('HEALTH_STORAGE_S3_BUCKET')?.trim() ||
      '';
    this.region =
      this.config.get<string>('MEDIA_STORAGE_S3_REGION')?.trim() ||
      this.config.get<string>('HEALTH_STORAGE_S3_REGION')?.trim() ||
      this.config.get<string>('AWS_REGION')?.trim() ||
      'ap-south-1';
    this.prefix =
      this.config.get<string>('MEDIA_STORAGE_S3_PREFIX')?.trim() ||
      'personal-os/media';
    this.accessKeyId =
      this.config.get<string>('AWS_ACCESS_KEY_ID')?.trim() ?? '';
    this.secretAccessKey =
      this.config.get<string>('AWS_SECRET_ACCESS_KEY')?.trim() ?? '';
    this.sessionToken =
      this.config.get<string>('AWS_SESSION_TOKEN')?.trim() ?? '';
  }

  getStatus() {
    return {
      provider: 's3' as const,
      configured: this.isConfigured(),
      bucket: this.bucket || null,
      region: this.region,
      prefix: this.prefix,
      privateObjects: true,
      browserDirectUploads: true,
      serverFilesystemStorage: false,
      serverSideEncryption: 'AES256',
      requiredCorsMethods: ['PUT', 'GET', 'HEAD'],
    };
  }

  isConfigured() {
    return Boolean(
      this.bucket && this.region && this.accessKeyId && this.secretAccessKey,
    );
  }

  buildObjectKey(type: MediaAssetType, originalName: string) {
    const extension = this.extension(originalName);
    const date = new Date().toISOString().slice(0, 10);
    return [
      this.prefix.replace(/^\/+|\/+$/g, ''),
      'owner',
      type,
      date,
      `${randomUUID()}${extension}`,
    ]
      .filter(Boolean)
      .join('/');
  }

  createUploadUrl(input: {
    key: string;
    mimeType: string;
    expiresSeconds?: number;
  }) {
    this.assertConfigured();
    const expiresSeconds = this.clampExpiry(
      input.expiresSeconds ?? 900,
      60,
      3600,
    );
    const requiredHeaders = {
      'Content-Type': input.mimeType,
      'x-amz-server-side-encryption': 'AES256',
    };
    return {
      url: this.presign({
        method: 'PUT',
        key: input.key,
        expiresSeconds,
        signedHeaders: requiredHeaders,
      }),
      expiresSeconds,
      requiredHeaders,
    };
  }

  createReadUrl(key: string, expiresSeconds = 21600) {
    this.assertConfigured();
    return this.presign({
      method: 'GET',
      key,
      expiresSeconds: this.clampExpiry(expiresSeconds, 60, 86400),
    });
  }

  resolveAssetUrl(
    asset: { url?: string; storageKey?: string },
    expiresSeconds = 21600,
  ) {
    const direct = asset.url?.trim();
    if (direct) return direct;
    const key = asset.storageKey?.trim();
    return key ? this.createReadUrl(key, expiresSeconds) : undefined;
  }

  async headObject(key: string): Promise<MediaStoredObjectHead> {
    this.assertConfigured();
    const response = await this.signedFetch('HEAD', key);
    if (response.status === 404) return { exists: false };
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Media S3 verification failed with status ${response.status}.`,
      );
    }
    const rawLength = response.headers.get('content-length');
    const contentLength = rawLength ? Number(rawLength) : undefined;
    return {
      exists: true,
      contentLength:
        contentLength !== undefined && Number.isFinite(contentLength)
          ? contentLength
          : undefined,
      contentType: response.headers.get('content-type') ?? undefined,
      etag: response.headers.get('etag')?.replaceAll('"', '') ?? undefined,
    };
  }

  async deleteObject(key: string): Promise<void> {
    this.assertConfigured();
    const response = await this.signedFetch('DELETE', key);
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `Media S3 delete failed with status ${response.status}.`,
      );
    }
  }

  private presign(input: {
    method: 'GET' | 'PUT';
    key: string;
    expiresSeconds: number;
    signedHeaders?: Record<string, string>;
  }) {
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const canonicalUri = this.canonicalUri(input.key);

    const headers: Record<string, string> = {
      host,
      ...Object.fromEntries(
        Object.entries(input.signedHeaders ?? {}).map(([name, value]) => [
          name.toLowerCase(),
          value.trim(),
        ]),
      ),
    };
    const signedHeaderNames = Object.keys(headers).sort();
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]}\n`)
      .join('');

    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(input.expiresSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };
    if (this.sessionToken) {
      query['X-Amz-Security-Token'] = this.sessionToken;
    }
    const canonicalQuery = Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${this.encode(name)}=${this.encode(value)}`)
      .join('&');

    const canonicalRequest = [
      input.method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(Buffer.from(canonicalRequest)),
    ].join('\n');
    const signature = createHmac('sha256', this.signatureKey(dateStamp))
      .update(stringToSign)
      .digest('hex');
    return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private async signedFetch(method: 'HEAD' | 'DELETE', key: string) {
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = this.canonicalUri(key);
    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const payloadHash = this.sha256(Buffer.alloc(0));
    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (this.sessionToken) {
      headers['x-amz-security-token'] = this.sessionToken;
    }
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name]}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256(Buffer.from(canonicalRequest)),
    ].join('\n');
    const signature = createHmac('sha256', this.signatureKey(dateStamp))
      .update(stringToSign)
      .digest('hex');
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');
    const requestHeaders: Record<string, string> = {
      Authorization: authorization,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (this.sessionToken) {
      requestHeaders['x-amz-security-token'] = this.sessionToken;
    }
    return fetch(`https://${host}${canonicalUri}`, {
      method,
      headers: requestHeaders,
    });
  }

  private signatureKey(dateStamp: string) {
    const dateKey = createHmac('sha256', `AWS4${this.secretAccessKey}`)
      .update(dateStamp)
      .digest();
    const regionKey = createHmac('sha256', dateKey)
      .update(this.region)
      .digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    return createHmac('sha256', serviceKey).update('aws4_request').digest();
  }

  private canonicalUri(key: string) {
    return `/${key
      .split('/')
      .map((segment) => this.encode(segment))
      .join('/')}`;
  }

  private encode(value: string) {
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  private sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex');
  }

  private amzDate(date: Date) {
    return date
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, '')
      .replace('Z', 'Z');
  }

  private extension(filename: string) {
    const match = /\.[a-zA-Z0-9]{1,12}$/.exec(filename.trim());
    return match?.[0]?.toLowerCase() ?? '';
  }

  private clampExpiry(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.floor(value)));
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Media S3 storage is not configured. Set MEDIA_STORAGE_S3_BUCKET (or HEALTH_STORAGE_S3_BUCKET), MEDIA_STORAGE_S3_REGION (or HEALTH_STORAGE_S3_REGION/AWS_REGION), AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
      );
    }
  }
}
