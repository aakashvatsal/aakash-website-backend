import { Model, Types } from 'mongoose';

import { MediaAssetLibraryService } from './media-asset-library.service';
import { MediaAssetStorageService } from './media-asset-storage.service';
import {
  MediaAssetDocument,
  MediaAssetStatus,
  MediaAssetType,
} from './schemas/media-asset.schema';
import { MediaSourceType } from './schemas/media-post.schema';

function createService() {
  const create = jest.fn();
  const findOne = jest.fn();
  const find = jest.fn();
  const assetModel = {
    create,
    findOne,
    find,
  } as unknown as Model<MediaAssetDocument>;
  const createUploadUrl = jest.fn().mockReturnValue({
    url: 'https://signed.example/upload',
    expiresSeconds: 900,
    requiredHeaders: {
      'Content-Type': 'image/jpeg',
      'x-amz-server-side-encryption': 'AES256',
    },
  });
  const storage = {
    getStatus: jest.fn().mockReturnValue({ configured: true }),
    buildObjectKey: jest
      .fn()
      .mockReturnValue('personal-os/media/owner/image/2026-09-03/test.jpg'),
    createUploadUrl,
    headObject: jest.fn(),
    resolveAssetUrl: jest.fn(
      (asset: { storageKey?: string; url?: string }) =>
        asset.url ??
        (asset.storageKey
          ? `https://signed.example/${asset.storageKey}`
          : undefined),
    ),
  } as unknown as MediaAssetStorageService;
  return {
    service: new MediaAssetLibraryService(assetModel, storage),
    create,
    findOne,
    find,
    storage,
    createUploadUrl,
  };
}

describe('MediaAssetLibraryService', () => {
  it('creates a reusable unassigned upload intent instead of storing file bytes in Mongo', async () => {
    const { service, create, createUploadUrl } = createService();
    const id = new Types.ObjectId();
    create.mockResolvedValue({
      _id: id,
      toObject: () => ({
        _id: id,
        type: MediaAssetType.IMAGE,
        storageKey: 'personal-os/media/owner/image/2026-09-03/test.jpg',
        libraryReusable: true,
        status: MediaAssetStatus.PLANNED,
      }),
    });

    const result = await service.createUploadIntent({
      filename: 'Founder Photo.JPG',
      mimeType: 'image/jpeg',
      sizeBytes: 1234,
      source: MediaSourceType.REAL,
      tags: ['Founder', ' Office '],
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId: undefined,
        contentItemId: undefined,
        storageProvider: 's3',
        libraryReusable: true,
        originalName: 'Founder Photo.JPG',
        mimeType: 'image/jpeg',
        sizeBytes: 1234,
        tags: ['founder', 'office'],
        status: MediaAssetStatus.PLANNED,
      }),
    );
    expect(createUploadUrl).toHaveBeenCalled();
    expect(result.upload.url).toBe('https://signed.example/upload');
  });

  it('verifies the S3 object before marking a library upload ready', async () => {
    const { service, findOne, storage } = createService();
    const save = jest.fn().mockResolvedValue(undefined);
    const assetId = new Types.ObjectId();
    const asset = {
      _id: assetId,
      storageKey: 'media/key.jpg',
      sizeBytes: 1234,
      status: MediaAssetStatus.PLANNED,
      libraryReusable: true,
      metadata: {},
      save,
      toObject: () => ({
        _id: assetId,
        storageKey: 'media/key.jpg',
        sizeBytes: 1234,
        status: MediaAssetStatus.PLANNED,
        libraryReusable: true,
        metadata: {},
      }),
    };
    findOne.mockResolvedValue(asset);
    jest.spyOn(storage, 'headObject').mockResolvedValue({
      exists: true,
      contentLength: 1234,
      contentType: 'image/jpeg',
      etag: 'etag-1',
    });

    const result = await service.completeUpload(asset._id.toString());
    expect(save).toHaveBeenCalled();
    expect(asset.status).toBe(MediaAssetStatus.READY);
    expect(asset.metadata).toMatchObject({ uploadState: 'verified' });
    expect(result).toHaveProperty('accessUrl');
  });

  it('ranks compatible ready library assets for a Production requirement', async () => {
    const { service, find } = createService();
    const candidates = [
      {
        _id: new Types.ObjectId(),
        type: MediaAssetType.IMAGE,
        source: MediaSourceType.REAL,
        role: 'founder office portrait',
        originalName: 'aakash-office.jpg',
        notes: 'Aakash speaking at desk',
        tags: ['founder', 'office', 'desk'],
        storageKey: 'media/a.jpg',
        uploadedAt: new Date(),
      },
      {
        _id: new Types.ObjectId(),
        type: MediaAssetType.IMAGE,
        source: MediaSourceType.STOCK,
        role: 'generic landscape',
        originalName: 'mountain.jpg',
        notes: '',
        tags: ['mountain'],
        storageKey: 'media/b.jpg',
      },
    ];
    find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(candidates),
        }),
      }),
    });

    const result = await service.suggestForRequirement({
      type: MediaAssetType.IMAGE,
      role: 'founder office image',
      source: MediaSourceType.REAL,
      notes: 'Aakash at his office desk',
      prompt: '',
    });
    expect(result).toHaveLength(2);
    expect(result[0]._id.toString()).toBe(candidates[0]._id.toString());
    expect(result[0].matchScore).toBeGreaterThan(result[1].matchScore);
  });
});
