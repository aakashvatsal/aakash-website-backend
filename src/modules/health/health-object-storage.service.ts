import { createHash, createHmac, randomUUID } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type HealthStorageKind = 'photos' | 'reports';

type StoredObject = {
  provider: 's3';
  bucket: string;
  key: string;
  etag: string;
  uploadedAt: Date;
};

@Injectable()
export class HealthObjectStorageService {
  private readonly bucket: string;
  private readonly region: string;
  private readonly prefix: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken: string;

  constructor(private readonly config: ConfigService) {
    this.bucket =
      this.config.get<string>('HEALTH_STORAGE_S3_BUCKET')?.trim() ?? '';
    this.region =
      this.config.get<string>('HEALTH_STORAGE_S3_REGION')?.trim() ||
      this.config.get<string>('AWS_REGION')?.trim() ||
      'ap-south-1';
    this.prefix =
      this.config.get<string>('HEALTH_STORAGE_S3_PREFIX')?.trim() ||
      'personal-os/health';
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
      serverSideEncryption: 'AES256',
      serverFilesystemStorage: false,
    };
  }

  isConfigured() {
    return Boolean(
      this.bucket && this.region && this.accessKeyId && this.secretAccessKey,
    );
  }

  buildObjectKey(kind: HealthStorageKind, originalName: string) {
    const extension = this.extension(originalName);
    const date = new Date().toISOString().slice(0, 10);
    return [
      this.prefix.replace(/^\/+|\/+$/g, ''),
      'owner',
      kind,
      date,
      `${randomUUID()}${extension}`,
    ]
      .filter(Boolean)
      .join('/');
  }

  async putObject(input: {
    key: string;
    mimeType: string;
    data: Buffer;
  }): Promise<StoredObject> {
    this.assertConfigured();
    const response = await this.signedFetch({
      method: 'PUT',
      key: input.key,
      body: input.data,
      contentType: input.mimeType,
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Health S3 upload failed with status ${response.status}.`,
      );
    }
    return {
      provider: 's3',
      bucket: this.bucket,
      key: input.key,
      etag: response.headers.get('etag')?.replaceAll('"', '') ?? '',
      uploadedAt: new Date(),
    };
  }

  async getObject(key: string): Promise<Buffer> {
    this.assertConfigured();
    const response = await this.signedFetch({ method: 'GET', key });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Health S3 read failed with status ${response.status}.`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    this.assertConfigured();
    const response = await this.signedFetch({ method: 'DELETE', key });
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(
        `Health S3 delete failed with status ${response.status}.`,
      );
    }
  }

  private async signedFetch(input: {
    method: 'GET' | 'PUT' | 'DELETE';
    key: string;
    body?: Buffer;
    contentType?: string;
  }) {
    const now = new Date();
    const amzDate = this.amzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = `/${input.key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
    const host = `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const payloadHash = this.sha256(input.body ?? Buffer.alloc(0));

    const headers: Record<string, string> = {
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (input.contentType) headers['content-type'] = input.contentType;
    if (input.method === 'PUT') {
      headers['x-amz-server-side-encryption'] = 'AES256';
    }
    if (this.sessionToken) {
      headers['x-amz-security-token'] = this.sessionToken;
    }

    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((name) => `${name}:${headers[name].trim()}\n`)
      .join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [
      input.method,
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
    const signingKey = this.signatureKey(dateStamp);
    const signature = createHmac('sha256', signingKey)
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
    if (input.contentType) requestHeaders['Content-Type'] = input.contentType;
    if (input.method === 'PUT') {
      requestHeaders['x-amz-server-side-encryption'] = 'AES256';
    }
    if (this.sessionToken) {
      requestHeaders['x-amz-security-token'] = this.sessionToken;
    }

    return fetch(`https://${host}${canonicalUri}`, {
      method: input.method,
      headers: requestHeaders,
      body: input.body ? Uint8Array.from(input.body).buffer : undefined,
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
    const match = /\.[a-zA-Z0-9]{1,10}$/.exec(filename.trim());
    return match?.[0]?.toLowerCase() ?? '';
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Health S3 storage is not configured. Set HEALTH_STORAGE_S3_BUCKET, HEALTH_STORAGE_S3_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.',
      );
    }
  }
}
