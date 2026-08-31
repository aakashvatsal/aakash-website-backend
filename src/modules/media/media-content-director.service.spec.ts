import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaContentDirectorService } from './media-content-director.service';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaCoreService } from './media-core.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import {
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';
import {
  MediaGoal,
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import { MediaPublicationDocument } from './schemas/media-publication.schema';

const zeroUsage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  cachedInputTokens: 0,
  reasoningTokens: 0,
};

function rawCandidate(title: string, platform: MediaPlatform) {
  return {
    title,
    thesis: `${title} thesis`,
    whyNow: 'Relevant now',
    canonicalBody: `${title} body with specific founder context`,
    story: `${title} story`,
    evidence: ['Personal operating experience'],
    contentPillars: ['building'],
    audiences: ['founders'],
    goals: [MediaGoal.AUTHORITY],
    rationale: 'Build authority with a specific point of view.',
    publications: [
      {
        platform,
        format:
          platform === MediaPlatform.INSTAGRAM
            ? MediaPostType.REEL
            : MediaPostType.TEXT,
        title,
        hook: `${title} hook`,
        caption: `${title} caption`,
        script: `${title} script`,
        description: `${title} description`,
        cta: 'What would you do?',
        hashtags: ['builder'],
        slides: [],
        rationale: 'Native platform execution',
      },
    ],
  };
}

describe('MediaContentDirectorService', () => {
  function createService(options?: { blockedFirst?: boolean }) {
    let activeRun: Record<string, unknown> | undefined;
    const save = jest.fn().mockImplementation(function (this: unknown) {
      return this;
    });
    const generationRunModel = {
      create: jest
        .fn()
        .mockImplementation((payload: Record<string, unknown>) => {
          activeRun = {
            _id: new Types.ObjectId(),
            acceptedContentItemIds: [],
            rejectedMemoryIds: [],
            ...payload,
            save,
          };
          return activeRun;
        }),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(activeRun)),
      countDocuments: jest.fn().mockResolvedValue(0),
    } as unknown as Model<MediaGenerationRunDocument>;

    const contentModel = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as Model<MediaContentItemDocument>;
    const publicationModel = {
      find: jest
        .fn()
        .mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    } as unknown as Model<MediaPublicationDocument>;

    const aiService = {
      getModel: jest.fn().mockReturnValue('gpt-test'),
      generateStructuredResponse: jest.fn().mockImplementation(({ name }) => {
        if (name === 'hsakaa_media_director_candidates') {
          return Promise.resolve({
            data: {
              candidates: [
                rawCandidate('Distinct builder lesson', MediaPlatform.LINKEDIN),
                rawCandidate(
                  'A different operator story',
                  MediaPlatform.LINKEDIN,
                ),
              ],
            },
            model: 'gpt-test',
            responseId: 'generation-1',
            usage: zeroUsage,
          });
        }
        return Promise.resolve({
          data: {
            reviews: [
              {
                key: 'candidate_1',
                strategicFit: 90,
                platformFit: 85,
                specificity: 90,
                strengths: ['Specific'],
                risks: [],
                improvement: 'Tighten the opening.',
              },
              {
                key: 'candidate_2',
                strategicFit: 80,
                platformFit: 80,
                specificity: 80,
                strengths: ['Useful'],
                risks: [],
                improvement: 'Add one concrete example.',
              },
            ],
          },
          model: 'gpt-test',
          responseId: 'critic-1',
          usage: zeroUsage,
        });
      }),
    } as unknown as AiService;

    const createContent = jest.fn();
    const createPublication = jest.fn();
    const coreService = {
      listAccounts: jest.fn().mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          platform: MediaPlatform.LINKEDIN,
          displayName: 'Aakash LinkedIn',
          isPrimary: true,
          isActive: true,
          strategy: {
            goals: [MediaGoal.AUTHORITY],
            contentPillars: ['building'],
            audiences: ['founders'],
            planningHorizonDays: 7,
            desiredPublicationsPerWeek: 5,
          },
          capabilities: {},
        },
      ]),
      listContent: jest.fn().mockResolvedValue([]),
      createContent,
      createPublication,
    } as unknown as MediaCoreService;

    const analyzeContentItem = jest.fn().mockResolvedValue({});
    const analyzePublication = jest.fn().mockResolvedValue({});
    const recordRejectedCandidate = jest.fn();
    let checkIndex = 0;
    const intelligenceService = {
      listMemories: jest.fn().mockResolvedValue([]),
      overview: jest.fn().mockResolvedValue({
        contentCoveragePercent: 100,
        publicationCoveragePercent: 100,
      }),
      checkCandidate: jest.fn().mockImplementation(() => {
        checkIndex += 1;
        const blocked = options?.blockedFirst && checkIndex === 1;
        return Promise.resolve({
          noveltyScore: blocked ? 3 : 92,
          repetitionRisk: blocked ? 'blocked' : 'low',
          allowed: !blocked,
          similarMatches: blocked ? [{ score: 0.97 }] : [],
        });
      }),
      analyzeContentItem,
      analyzePublication,
      recordRejectedCandidate,
    } as unknown as MediaContentIntelligenceService;

    const growthService = {
      directorLearningContext: jest.fn().mockResolvedValue({
        generatedAt: new Date().toISOString(),
        platforms: [],
        learnings: [],
      }),
    } as unknown as MediaGrowthService;

    const service = new MediaContentDirectorService(
      generationRunModel,
      contentModel,
      publicationModel,
      aiService,
      coreService,
      intelligenceService,
      growthService,
    );

    return {
      service,
      coreService,
      intelligenceService,
      createContent,
      createPublication,
      analyzeContentItem,
      analyzePublication,
      recordRejectedCandidate,
      getRun: () => activeRun,
    };
  }

  it('generates, anti-repetition checks, critiques and ranks a draft batch without creating canonical content', async () => {
    const { service, createContent, getRun } = createService();

    const result = await service.generate({
      brief: 'Turn current builder lessons into distinct authority content.',
      platforms: [MediaPlatform.LINKEDIN],
      candidateCount: 2,
    });

    const run = getRun() as {
      status: MediaGenerationRunStatus;
      candidates: Array<{ key: string; finalScore: number; status: string }>;
      rankedCandidateKeys: string[];
    };
    expect(result).toBeDefined();
    expect(run.status).toBe(MediaGenerationRunStatus.GENERATED);
    expect(run.candidates).toHaveLength(2);
    expect(run.candidates[0]).toMatchObject({
      key: 'candidate_1',
      status: 'generated',
    });
    expect(run.candidates[0].finalScore).toBeGreaterThan(60);
    expect(run.rankedCandidateKeys).toEqual(['candidate_1', 'candidate_2']);
    expect(createContent).not.toHaveBeenCalled();
  });

  it('marks a candidate blocked when 6B says the canonical idea repeats history', async () => {
    const { service, getRun } = createService({ blockedFirst: true });
    await service.generate({
      brief: 'Generate distinct ideas.',
      platforms: [MediaPlatform.LINKEDIN],
      candidateCount: 2,
    });
    const run = getRun() as {
      candidates: Array<{ status: string; repetitionRisk: string }>;
    };
    expect(run.candidates[0]).toMatchObject({
      status: 'blocked',
      repetitionRisk: 'blocked',
    });
  });

  it('accepts a generated candidate into the same canonical content and publication schemas', async () => {
    const {
      service,
      createContent,
      createPublication,
      analyzeContentItem,
      analyzePublication,
      getRun,
    } = createService();
    await service.generate({
      brief: 'Generate content.',
      platforms: [MediaPlatform.LINKEDIN],
      candidateCount: 2,
    });

    const contentId = new Types.ObjectId();
    const publicationId = new Types.ObjectId();
    createContent.mockResolvedValue({
      _id: contentId,
      title: 'Distinct builder lesson',
    });
    createPublication.mockResolvedValue({
      _id: publicationId,
      platform: MediaPlatform.LINKEDIN,
    });

    const run = getRun() as { _id: Types.ObjectId };
    const result = await service.acceptCandidate(
      run._id.toString(),
      'candidate_1',
      {},
    );

    expect(createContent).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'hsakaa',
        generationRunId: run._id.toString(),
      }),
    );
    expect(createPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        contentItemId: contentId.toString(),
        platform: MediaPlatform.LINKEDIN,
        status: MediaPostStatus.DRAFT,
      }),
    );
    expect(analyzeContentItem).toHaveBeenCalled();
    expect(analyzePublication).toHaveBeenCalled();
    expect(result.publications).toHaveLength(1);
  });

  it('remembers a rejected candidate so it participates in future anti-repetition checks', async () => {
    const { service, recordRejectedCandidate, getRun } = createService();
    await service.generate({
      brief: 'Generate content.',
      platforms: [MediaPlatform.LINKEDIN],
      candidateCount: 2,
    });
    const memoryId = new Types.ObjectId();
    recordRejectedCandidate.mockResolvedValue({ _id: memoryId });

    const run = getRun() as { _id: Types.ObjectId };
    await service.rejectCandidate(run._id.toString(), 'candidate_2', {
      reason: 'Too generic',
    });

    expect(recordRejectedCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'A different operator story',
        generationRunId: run._id.toString(),
        rejectionReason: 'Too generic',
      }),
    );
  });
});
