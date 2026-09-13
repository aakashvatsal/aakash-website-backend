import { ConfigService } from '@nestjs/config';

import { MediaAssetStorageService } from './media-asset-storage.service';
import { MediaAssetType } from './schemas/media-asset.schema';

function createService(values: Record<string, string> = {}) {
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
  return new MediaAssetStorageService(config);
}

describe('MediaAssetStorageService', () => {
  it('uses private S3 with browser-direct encrypted uploads', () => {
    const service = createService({
      MEDIA_STORAGE_S3_BUCKET: 'media-private',
      MEDIA_STORAGE_S3_REGION: 'ap-south-1',
      MEDIA_STORAGE_S3_PREFIX: 'personal-os/media',
      AWS_ACCESS_KEY_ID: 'AKIATEST',
      AWS_SECRET_ACCESS_KEY: 'secret-test',
    });

    expect(service.getStatus()).toMatchObject({
      configured: true,
      bucket: 'media-private',
      region: 'ap-south-1',
      privateObjects: true,
      browserDirectUploads: true,
      serverFilesystemStorage: false,
      serverSideEncryption: 'AES256',
    });
    const key = service.buildObjectKey(
      MediaAssetType.IMAGE,
      'Founder Photo.JPG',
    );
    expect(key).toMatch(
      /^personal-os\/media\/owner\/image\/\d{4}-\d{2}-\d{2}\/.+\.jpg$/,
    );

    const upload = service.createUploadUrl({
      key,
      mimeType: 'image/jpeg',
    });
    expect(upload.url).toContain(
      'https://media-private.s3.ap-south-1.amazonaws.com/',
    );
    expect(upload.url).toContain('X-Amz-Signature=');
    expect(upload.requiredHeaders).toEqual({
      'Content-Type': 'image/jpeg',
      'x-amz-server-side-encryption': 'AES256',
    });
    expect(service.createReadUrl(key)).toContain('X-Amz-Expires=21600');
  });

  it('can reuse the already-configured Health bucket while keeping a Media prefix', () => {
    const service = createService({
      HEALTH_STORAGE_S3_BUCKET: 'personal-private',
      HEALTH_STORAGE_S3_REGION: 'ap-south-1',
      AWS_ACCESS_KEY_ID: 'AKIATEST',
      AWS_SECRET_ACCESS_KEY: 'secret-test',
    });
    expect(service.getStatus()).toMatchObject({
      configured: true,
      bucket: 'personal-private',
      prefix: 'personal-os/media',
    });
  });
});
