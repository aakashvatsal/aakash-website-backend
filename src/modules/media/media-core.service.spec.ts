import { Model } from 'mongoose';
import { MediaCoreService } from './media-core.service';
import { MediaAccountDocument } from './schemas/media-account.schema';
import { MediaAssetDocument } from './schemas/media-asset.schema';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import { MediaPostDocument, MediaPlatform } from './schemas/media-post.schema';
import { MediaPublicationDocument } from './schemas/media-publication.schema';

describe('MediaCoreService', () => {
  function createService(options?: {
    accounts?: Array<{ platform: MediaPlatform }>;
    legacy?: number;
    migrated?: number;
  }) {
    const accounts = options?.accounts ?? [];
    const accountModel = {
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue(accounts) }),
    } as unknown as Model<MediaAccountDocument>;
    const contentModel = {
      countDocuments: jest.fn().mockResolvedValue(options?.migrated ?? 3),
    } as unknown as Model<MediaContentItemDocument>;
    const publicationModel = {
      countDocuments: jest.fn().mockResolvedValue(5),
    } as unknown as Model<MediaPublicationDocument>;
    const assetModel = {
      countDocuments: jest.fn().mockResolvedValue(7),
    } as unknown as Model<MediaAssetDocument>;
    const legacyModel = {
      countDocuments: jest.fn().mockResolvedValue(options?.legacy ?? 4),
    } as unknown as Model<MediaPostDocument>;
    return new MediaCoreService(
      accountModel,
      contentModel,
      publicationModel,
      assetModel,
      legacyModel,
    );
  }

  it('reports a seven-day planning horizon and missing growth platforms', async () => {
    const service = createService({
      accounts: [
        { platform: MediaPlatform.LINKEDIN },
        { platform: MediaPlatform.INSTAGRAM },
      ],
    });
    const result = await service.overview();
    expect(result.planningHorizonDays).toBe(7);
    expect(result.missingGrowthPlatforms).toEqual([
      MediaPlatform.YOUTUBE,
      MediaPlatform.X,
      MediaPlatform.WHATSAPP,
    ]);
    expect(result.counts).toEqual({
      contentItems: 3,
      publications: 5,
      assets: 7,
    });
  });

  it('reports idempotent migration progress', async () => {
    const service = createService({ legacy: 10, migrated: 6 });
    await expect(service.migrationStatus()).resolves.toEqual({
      legacyPosts: 10,
      migratedPosts: 6,
      remaining: 4,
    });
  });
});
