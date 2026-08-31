import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import {
  MediaContentMemoryDocument,
  MediaContentMemoryScope,
  MediaContentMemoryStatus,
  MediaRepetitionRisk,
} from './schemas/media-content-memory.schema';
import { MediaGenerationRunDocument } from './schemas/media-generation-run.schema';
import { MediaPublicationDocument } from './schemas/media-publication.schema';

describe('MediaContentIntelligenceService', () => {
  function createService(options?: {
    memories?: Array<Partial<MediaContentMemoryDocument>>;
    counts?: number[];
  }) {
    const memories = options?.memories ?? [];
    const counts = options?.counts ?? [2, 3, 2, 3, 4, 1];
    let countIndex = 0;

    const contentModel = {
      countDocuments: jest.fn().mockResolvedValue(counts[countIndex++]),
    } as unknown as Model<MediaContentItemDocument>;
    const publicationModel = {
      countDocuments: jest.fn().mockResolvedValue(counts[countIndex++]),
    } as unknown as Model<MediaPublicationDocument>;
    const memoryModel = {
      countDocuments: jest
        .fn()
        .mockImplementation(() => Promise.resolve(counts[countIndex++] ?? 0)),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(memories),
            }),
          }),
        }),
      }),
    } as unknown as Model<MediaContentMemoryDocument>;
    const generationRunModel = {} as Model<MediaGenerationRunDocument>;
    const aiService = {
      getEmbeddingModel: jest.fn().mockReturnValue('text-embedding-3-small'),
      generateStructuredResponse: jest
        .fn()
        .mockRejectedValue(new Error('offline')),
      generateEmbedding: jest.fn().mockRejectedValue(new Error('offline')),
    } as unknown as AiService;

    return new MediaContentIntelligenceService(
      contentModel,
      publicationModel,
      memoryModel,
      generationRunModel,
      aiService,
    );
  }

  it('reports indexing coverage and remembered rejected content', async () => {
    const service = createService({ counts: [4, 8, 3, 6, 5, 2] });

    await expect(service.overview()).resolves.toMatchObject({
      contentItems: 4,
      publications: 8,
      indexedContent: 3,
      indexedPublications: 6,
      contentCoveragePercent: 75,
      publicationCoveragePercent: 75,
      rejectedCandidatesRemembered: 5,
      highRiskMemories: 2,
      policy: {
        blockedSimilarity: 0.9,
        highSimilarity: 0.8,
        mediumSimilarity: 0.68,
      },
    });
  });

  it('blocks a semantically identical canonical candidate even when AI providers are unavailable', async () => {
    const service = createService({
      memories: [
        {
          _id: new Types.ObjectId(),
          scope: MediaContentMemoryScope.CONTENT,
          status: MediaContentMemoryStatus.ACTIVE,
          title: 'Builder lessons',
          topic: 'Builder lessons',
          angle: 'Ship before certainty',
          normalizedText: 'Builder lessons Ship before certainty',
          lexicalSignature: [
            'builder',
            'lessons',
            'ship',
            'before',
            'certainty',
          ],
          storyKeys: [],
          exampleKeys: [],
          structure: [],
        },
      ],
    });

    const result = await service.checkCandidate({
      title: 'Builder lessons',
      thesis: 'Ship before certainty',
    });

    expect(result.repetitionRisk).toBe(MediaRepetitionRisk.BLOCKED);
    expect(result.allowed).toBe(false);
    expect(result.noveltyScore).toBeLessThanOrEqual(10);
  });

  it('allows an explicitly intentional repurpose while preserving the repetition warning', async () => {
    const service = createService({
      memories: [
        {
          _id: new Types.ObjectId(),
          scope: MediaContentMemoryScope.PUBLICATION,
          status: MediaContentMemoryStatus.ACTIVE,
          title: 'Founder reset',
          topic: 'Founder reset',
          angle: 'Starting over can be strategic',
          hookArchetype: 'I started over',
          normalizedText:
            'Founder reset Starting over can be strategic I started over',
          lexicalSignature: [
            'founder',
            'reset',
            'starting',
            'over',
            'strategic',
            'started',
          ],
          storyKeys: [],
          exampleKeys: [],
          structure: [],
        },
      ],
    });

    const result = await service.checkCandidate({
      title: 'Founder reset',
      thesis: 'Starting over can be strategic',
      platform: 'instagram' as never,
      format: 'reel' as never,
      hook: 'I started over',
      intentionalRepurpose: true,
    });

    expect(result.repetitionRisk).toBe(MediaRepetitionRisk.BLOCKED);
    expect(result.intentionalRepurpose).toBe(true);
    expect(result.allowed).toBe(true);
  });
});
