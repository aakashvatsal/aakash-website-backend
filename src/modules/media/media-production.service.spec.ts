import { ConflictException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaProductionService } from './media-production.service';
import {
  MediaAssetDocument,
  MediaAssetStatus,
  MediaAssetType,
} from './schemas/media-asset.schema';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import {
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
  MediaSourceType,
} from './schemas/media-post.schema';
import {
  MediaProductionStatus,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

const zeroUsage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  cachedInputTokens: 0,
  reasoningTokens: 0,
};

function expectStrictRequiredSchema(node: unknown, path = 'root'): void {
  if (!node || typeof node !== 'object') return;

  const schema = node as {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: unknown;
    items?: unknown;
  };

  if (schema.type === 'object' && schema.properties) {
    const propertyKeys = Object.keys(schema.properties).sort();
    const required = Array.isArray(schema.required)
      ? schema.required
          .filter((value): value is string => typeof value === 'string')
          .sort()
      : [];

    expect(required).toEqual(propertyKeys);

    for (const [key, value] of Object.entries(schema.properties)) {
      expectStrictRequiredSchema(value, `${path}.properties.${key}`);
    }
  }

  if (schema.items) {
    expectStrictRequiredSchema(schema.items, `${path}.items`);
  }
}

function generatedPack() {
  return {
    finalScript: 'Final script',
    teleprompterScript: 'Teleprompter script',
    talkingPoints: ['Point one'],
    shotList: [
      {
        order: 1,
        label: 'Founder to camera',
        framing: 'medium',
        action: 'Speak to camera',
        dialogue: 'Final script',
        durationSeconds: 30,
        location: 'desk',
        equipment: ['camera'],
        notes: '',
      },
    ],
    broll: [],
    carouselSlides: [],
    thumbnail: {
      headline: 'Build before certainty',
      concept: 'Founder portrait',
      composition: 'Centered',
      textOverlay: 'Build before certainty',
      imagePrompt: '',
      notes: '',
    },
    visualDirection: {
      aspectRatio: '9:16',
      framing: 'medium',
      lighting: 'soft key',
      background: 'desk',
      wardrobe: 'plain tee',
      props: [],
      notes: '',
    },
    cameraInstructions: {
      orientation: 'vertical',
      framing: 'medium',
      resolution: '4k',
      fps: '30',
      audio: 'lav mic',
      lighting: 'soft key',
      location: 'desk',
      notes: '',
    },
    editInstructions: {
      pacing: 'tight',
      cuts: 'remove pauses',
      captions: 'burned in',
      music: '',
      soundEffects: '',
      graphics: '',
      notes: '',
    },
    assetRequirements: [
      {
        key: 'hero-video',
        type: MediaAssetType.VIDEO,
        role: 'primary',
        description: 'Recorded talking-head clip',
        source: MediaSourceType.REAL,
        prompt: '',
        required: true,
        notes: '',
      },
    ],
    equipment: ['camera', 'lav mic'],
    publishChecklist: ['Review captions'],
    risks: [],
    notes: 'Keep it natural.',
  };
}

describe('MediaProductionService', () => {
  function createService() {
    const publicationModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
      findOne: jest.fn(),
    } as unknown as Model<MediaPublicationDocument>;
    const contentModel = {
      findOne: jest.fn(),
    } as unknown as Model<MediaContentItemDocument>;
    const createAsset = jest.fn().mockResolvedValue({});
    const assetModel = {
      findOne: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      create: createAsset,
    } as unknown as Model<MediaAssetDocument>;
    const generationRunModel = {
      create: jest.fn(),
    } as unknown as Model<MediaGenerationRunDocument>;
    const generateStructuredResponse = jest.fn().mockResolvedValue({
      data: generatedPack(),
      model: 'gpt-test',
      responseId: 'response-1',
      usage: zeroUsage,
    });
    const aiService = {
      getModel: jest.fn().mockReturnValue('gpt-test'),
      generateStructuredResponse,
    } as unknown as AiService;

    return {
      service: new MediaProductionService(
        publicationModel,
        contentModel,
        assetModel,
        generationRunModel,
        aiService,
      ),
      publicationModel,
      assetModel,
      createAsset,
      generationRunModel,
      aiService,
      generateStructuredResponse,
    };
  }

  it('reports production readiness without treating Production Studio as a publisher', async () => {
    const { service, publicationModel } = createService();
    const counts: Record<string, number> = {
      [MediaProductionStatus.READY]: 3,
      [MediaProductionStatus.COMPLETE]: 2,
    };
    (publicationModel.countDocuments as jest.Mock)
      .mockResolvedValueOnce(12)
      .mockImplementation((query: { productionStatus?: string }) =>
        Promise.resolve(counts[query.productionStatus ?? ''] ?? 0),
      );

    await expect(service.overview()).resolves.toMatchObject({
      totalPublications: 12,
      readyForCalendar: 5,
      policy: {
        writesCanonicalPublicationSchema: true,
        generatedPlansNeverPublish: true,
        publishingOwnedByPhase6E: true,
        assetReadinessControlsPublicationReadiness: true,
      },
    });
  });

  it('generates a pack in the same publication and materializes required assets without scheduling or publishing', async () => {
    const {
      service,
      assetModel,
      createAsset,
      generationRunModel,
      generateStructuredResponse,
    } = createService();
    const publicationId = new Types.ObjectId();
    const contentId = new Types.ObjectId();
    const savePublication = jest.fn().mockImplementation(function (
      this: unknown,
    ) {
      return Promise.resolve(this);
    });
    const publication = {
      _id: publicationId,
      contentItemId: contentId,
      platform: MediaPlatform.INSTAGRAM,
      format: MediaPostType.REEL,
      title: 'Builder lesson',
      hook: 'I stopped waiting for certainty',
      caption: '',
      script: 'Approved draft',
      description: '',
      cta: '',
      hashtags: [],
      slides: [],
      status: MediaPostStatus.DRAFT,
      productionStatus: MediaProductionStatus.NOT_STARTED,
      productionVersion: 0,
      production: undefined,
      save: savePublication,
    } as unknown as MediaPublicationDocument;
    const contentItem = {
      _id: contentId,
      title: 'Builder lesson',
      thesis: 'Progress comes from reducing the right uncertainty.',
      canonicalBody: 'Approved canonical idea',
    } as MediaContentItemDocument;
    const saveRun = jest.fn().mockImplementation(function (this: unknown) {
      return Promise.resolve(this);
    });
    const run = {
      _id: new Types.ObjectId(),
      status: MediaGenerationRunStatus.GENERATING,
      metadata: {},
      save: saveRun,
    } as unknown as MediaGenerationRunDocument;
    (generationRunModel.create as jest.Mock).mockResolvedValue(run);
    (assetModel.findOne as jest.Mock).mockResolvedValue(null);

    jest.spyOn(service, 'getPack').mockResolvedValue({
      publication,
      contentItem,
      assets: [],
      readiness: {
        hasPlan: false,
        requiredAssets: 0,
        readyAssets: 0,
        remainingAssets: 0,
        ready: false,
        complete: false,
      },
    } as never);
    jest.spyOn(service, 'refreshReadiness').mockResolvedValue({
      publication,
      contentItem,
      assets: [],
      readiness: {
        hasPlan: true,
        requiredAssets: 1,
        readyAssets: 0,
        remainingAssets: 1,
        ready: false,
        complete: false,
      },
    } as never);

    const result = await service.generate(publicationId.toString());

    expect(result.alreadyGenerated).toBe(false);
    expect(publication.production).toBeDefined();
    expect(publication.productionVersion).toBe(1);
    expect(publication.productionStatus).toBe(
      MediaProductionStatus.ASSETS_PENDING,
    );
    expect(publication.status).toBe(MediaPostStatus.ASSETS_PENDING);
    expect(publication.status).not.toBe(MediaPostStatus.SCHEDULED);
    expect(publication.status).not.toBe(MediaPostStatus.POSTED);
    expect(createAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationId,
        contentItemId: contentId,
        type: MediaAssetType.VIDEO,
        productionRequirementKey: 'hero_video',
        required: true,
        generatedFromProduction: true,
        status: MediaAssetStatus.PLANNED,
      }),
    );
    expect(run.status).toBe(MediaGenerationRunStatus.ACCEPTED);
    expect(generateStructuredResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        verbosity: 'medium',
        reasoningEffort: 'low',
        maxOutputTokens: 12000,
      }),
    );
  });

  it('updates production asset state and refreshes publication readiness', async () => {
    const { service, assetModel } = createService();
    const publicationId = new Types.ObjectId();
    const asset = {
      _id: new Types.ObjectId(),
      publicationId,
      status: MediaAssetStatus.PLANNED,
      source: MediaSourceType.REAL,
      save: jest.fn().mockResolvedValue(undefined),
    };
    (assetModel.findOne as jest.Mock).mockResolvedValue(asset);
    const refreshed = {
      publication: { _id: publicationId },
      contentItem: { _id: new Types.ObjectId() },
      assets: [asset],
      readiness: {
        hasPlan: true,
        requiredAssets: 1,
        readyAssets: 1,
        remainingAssets: 0,
        ready: true,
        complete: false,
      },
    };
    const refreshReadiness = jest
      .spyOn(service, 'refreshReadiness')
      .mockResolvedValue(refreshed as never);

    const result = await service.updateAsset(asset._id.toString(), {
      status: MediaAssetStatus.READY,
      notes: 'Recorded and reviewed',
    });

    expect(asset.status).toBe(MediaAssetStatus.READY);
    expect((asset as { notes?: string }).notes).toBe('Recorded and reviewed');
    expect(refreshReadiness).toHaveBeenCalledWith(publicationId.toString());
    expect(result).toMatchObject({
      readiness: { ready: true },
    });
  });

  it('uses an OpenAI strict JSON schema where every object property is required', () => {
    const { service } = createService();
    const schema = (
      service as unknown as { productionSchema(): unknown }
    ).productionSchema();

    expectStrictRequiredSchema(schema);
  });

  it('refuses to mark production complete until all required assets are ready', async () => {
    const { service } = createService();
    const publicationId = new Types.ObjectId().toString();
    jest.spyOn(service, 'refreshReadiness').mockResolvedValue({
      publication: {},
      contentItem: {},
      assets: [],
      readiness: {
        hasPlan: true,
        requiredAssets: 2,
        readyAssets: 1,
        remainingAssets: 1,
        ready: false,
        complete: false,
      },
    } as never);

    await expect(service.markComplete(publicationId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
