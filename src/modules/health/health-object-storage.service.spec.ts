import { ConfigService } from '@nestjs/config';

import { HealthObjectStorageService } from './health-object-storage.service';

function config(values: Record<string, string>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('HealthObjectStorageService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fails closed when private S3 is not configured', () => {
    const service = new HealthObjectStorageService(config({}));

    expect(service.isConfigured()).toBe(false);
    expect(service.getStatus()).toEqual(
      expect.objectContaining({
        configured: false,
        privateObjects: true,
        serverFilesystemStorage: false,
        serverSideEncryption: 'AES256',
      }),
    );
  });

  it('builds owner-scoped Health object keys without preserving unsafe filenames', () => {
    const service = new HealthObjectStorageService(
      config({
        HEALTH_STORAGE_S3_BUCKET: 'health-private',
        HEALTH_STORAGE_S3_REGION: 'ap-south-1',
        HEALTH_STORAGE_S3_PREFIX: 'personal-os/health',
        AWS_ACCESS_KEY_ID: 'AKIATEST',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );

    const key = service.buildObjectKey('photos', '../../private scan.JPG');
    expect(key).toMatch(
      /^personal-os\/health\/owner\/photos\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.jpg$/,
    );
    expect(key).not.toContain('private scan');
    expect(key).not.toContain('..');
  });

  it('uploads with SigV4 headers and AES256 server-side encryption', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { etag: '"etag-123"' },
      }),
    );
    global.fetch = fetchMock as typeof fetch;
    const service = new HealthObjectStorageService(
      config({
        HEALTH_STORAGE_S3_BUCKET: 'health-private',
        HEALTH_STORAGE_S3_REGION: 'ap-south-1',
        AWS_ACCESS_KEY_ID: 'AKIATEST',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );

    const stored = await service.putObject({
      key: 'personal-os/health/owner/photos/2026-09-02/example.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from('private-health-image'),
    });

    expect(stored).toEqual(
      expect.objectContaining({
        provider: 's3',
        bucket: 'health-private',
        etag: 'etag-123',
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(init.method).toBe('PUT');
    expect(headers.Authorization).toContain(
      'AWS4-HMAC-SHA256 Credential=AKIATEST/',
    );
    expect(headers['x-amz-server-side-encryption']).toBe('AES256');
    expect(headers['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('round-trips reads and tolerates deleting an already-missing object', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(Buffer.from('health-bytes'), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    global.fetch = fetchMock as typeof fetch;
    const service = new HealthObjectStorageService(
      config({
        HEALTH_STORAGE_S3_BUCKET: 'health-private',
        HEALTH_STORAGE_S3_REGION: 'ap-south-1',
        AWS_ACCESS_KEY_ID: 'AKIATEST',
        AWS_SECRET_ACCESS_KEY: 'secret',
      }),
    );

    await expect(service.getObject('owner/report.pdf')).resolves.toEqual(
      Buffer.from('health-bytes'),
    );
    await expect(
      service.deleteObject('owner/missing.pdf'),
    ).resolves.toBeUndefined();
  });
});

const runRealS3 = process.env.HEALTH_STORAGE_S3_INTEGRATION === '1';
(runRealS3 ? describe : describe.skip)(
  'HealthObjectStorageService real S3',
  () => {
    it('uploads, reads and deletes one private probe object', async () => {
      const service = new HealthObjectStorageService(
        new ConfigService(process.env as Record<string, string>),
      );
      expect(service.isConfigured()).toBe(true);
      const key = service.buildObjectKey('reports', 'health-s3-probe.txt');
      const payload = Buffer.from(`health-s3-probe:${Date.now()}`);

      await service.putObject({ key, mimeType: 'text/plain', data: payload });
      try {
        await expect(service.getObject(key)).resolves.toEqual(payload);
      } finally {
        await service.deleteObject(key);
      }
    }, 30_000);
  },
);
