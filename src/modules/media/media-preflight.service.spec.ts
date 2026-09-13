import { BadRequestException } from '@nestjs/common';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaPreflightDecision } from './dto/media-review.dto';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaPreflightService } from './media-preflight.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaProductionService } from './media-production.service';
import { MediaContentItemDocument } from './schemas/media-content-item.schema';
import { MediaRepetitionRisk } from './schemas/media-content-memory.schema';
import {
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import {
  MediaPreflightCheckStatus,
  MediaPublicationReviewDocument,
  MediaPublicationReviewStatus,
} from './schemas/media-publication-review.schema';
import {
  MediaDeliveryStatus,
  MediaProductionStatus,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

function publication(overrides: Partial<MediaPublicationDocument> = {}) {
  const doc = {
    _id: new Types.ObjectId(),
    contentItemId: new Types.ObjectId(),
    platform: MediaPlatform.LINKEDIN,
    format: MediaPostType.TEXT,
    status: MediaPostStatus.READY,
    productionStatus: MediaProductionStatus.READY,
    productionVersion: 2,
    deliveryStatus: MediaDeliveryStatus.NOT_SCHEDULED,
    autoPublish: false,
    publishAttempts: 0,
    title: 'A product decision that changed how I build',
    hook: 'The feature we removed taught me more than the feature we shipped.',
    caption:
      'A specific founder lesson about choosing what not to build and why the constraint mattered.',
    hashtags: [],
    slides: [],
    production: {
      talkingPoints: [],
      shotList: [],
      broll: [],
      carouselSlides: [],
      assetRequirements: [],
      equipment: [],
      publishChecklist: [],
      risks: [],
    },
    intentionalRepurpose: false,
    metadata: {},
    isActive: true,
    save: jest.fn(),
    ...overrides,
  } as unknown as MediaPublicationDocument;
  (doc.save as jest.Mock).mockImplementation(() => Promise.resolve(doc));
  return doc;
}

function content(id: Types.ObjectId) {
  return {
    _id: id,
    title: 'A product decision that changed how I build',
    thesis: 'Removing work can be a product decision.',
    canonicalBody: 'A grounded founder lesson.',
    evidence: ['Internal product decision, approved for public discussion.'],
    audiences: ['builders'],
    goals: ['authority'],
    isActive: true,
  } as unknown as MediaContentItemDocument;
}

describe('MediaPreflightService', () => {
  function createService(
    options: {
      publication?: MediaPublicationDocument;
      existingReview?: MediaPublicationReviewDocument | null;
      repetitionRisk?: MediaRepetitionRisk;
    } = {},
  ) {
    const item = options.publication ?? publication();
    const canonical = content(item.contentItemId);
    const stored: { review?: MediaPublicationReviewDocument } = {
      review: options.existingReview ?? undefined,
    };
    const publicationModel = {
      findOne: jest.fn().mockResolvedValue(item),
      find: jest.fn(),
    } as unknown as Model<MediaPublicationDocument>;
    const contentModel = {
      findOne: jest.fn().mockResolvedValue(canonical),
    } as unknown as Model<MediaContentItemDocument>;
    const reviewModel = {
      findOne: jest
        .fn()
        .mockImplementation(() => Promise.resolve(stored.review ?? null)),
      findOneAndUpdate: jest.fn().mockImplementation((_filter, update) => {
        const next = {
          _id: stored.review?._id ?? new Types.ObjectId(),
          ...(update as { $set: Record<string, unknown> }).$set,
          save: jest.fn(),
          toObject() {
            return {};
          },
        } as unknown as MediaPublicationReviewDocument;
        (next.save as jest.Mock).mockImplementation(() =>
          Promise.resolve(next),
        );
        stored.review = next;
        return Promise.resolve(next);
      }),
    } as unknown as Model<MediaPublicationReviewDocument>;
    const aiService = {
      generateStructuredResponse: jest.fn().mockResolvedValue({
        model: 'test-model',
        responseId: 'resp_preflight',
        data: {
          overallScore: 86,
          authenticityScore: 92,
          platformFitScore: 88,
          clarityScore: 85,
          evidenceScore: 82,
          privacyScore: 95,
          noveltyScore: 84,
          productionScore: 90,
          strengths: ['Specific builder lesson', 'Sounds grounded'],
          changesRequired: [],
          checks: [
            {
              category: 'authenticity',
              status: 'pass',
              title: 'Sounds like Aakash',
              message: 'Direct and reflective without creator-guru language.',
            },
          ],
        },
      }),
    } as unknown as AiService;
    const productionService = {
      getPack: jest.fn().mockResolvedValue({
        publication: item,
        contentItem: canonical,
        assets: [],
        readiness: {
          hasPlan: true,
          requiredAssets: 0,
          readyAssets: 0,
          remainingAssets: 0,
          ready: true,
          complete: false,
        },
      }),
    } as unknown as MediaProductionService;
    const intelligenceService = {
      analyzePublication: jest.fn().mockResolvedValue({
        noveltyScore: 88,
        repetitionRisk: options.repetitionRisk ?? MediaRepetitionRisk.LOW,
        intentionalRepurpose: false,
      }),
    } as unknown as MediaContentIntelligenceService;
    const presenceService = {
      getStrategy: jest.fn().mockResolvedValue({ version: 4, neverBecome: [] }),
      getVoiceProfile: jest
        .fn()
        .mockResolvedValue({ version: 3, summary: 'Direct builder voice.' }),
    } as unknown as MediaPresenceService;

    return {
      service: new MediaPreflightService(
        publicationModel,
        contentModel,
        reviewModel,
        aiService,
        productionService,
        intelligenceService,
        presenceService,
      ),
      item,
      stored,
    };
  }

  it('creates an owner-reviewable preflight without auto-approving the publication', async () => {
    const { service } = createService();
    const result = await service.run(new Types.ObjectId().toString(), true);

    expect(result.status).toBe(MediaPublicationReviewStatus.NEEDS_REVIEW);
    expect(result.approvedAt).toBeUndefined();
    expect(result.overallScore).toBe(86);
    expect(
      result.checks.some(
        (check) => check.status === MediaPreflightCheckStatus.BLOCK,
      ),
    ).toBe(false);
  });

  it('blocks high-repetition execution before owner approval', async () => {
    const { service } = createService({
      repetitionRisk: MediaRepetitionRisk.HIGH,
    });
    const result = await service.run(new Types.ObjectId().toString(), true);

    expect(result.status).toBe(MediaPublicationReviewStatus.CHANGES_REQUIRED);
    expect(
      result.checks.some(
        (check) => check.status === MediaPreflightCheckStatus.BLOCK,
      ),
    ).toBe(true);
  });

  it('requires a fresh review and rejects approval when a blocking check exists', async () => {
    const blocking = {
      _id: new Types.ObjectId(),
      publicationId: new Types.ObjectId(),
      contentItemId: new Types.ObjectId(),
      platform: MediaPlatform.LINKEDIN,
      format: MediaPostType.TEXT,
      status: MediaPublicationReviewStatus.CHANGES_REQUIRED,
      sourceFingerprint: 'will-be-replaced',
      checks: [
        {
          category: 'privacy',
          status: MediaPreflightCheckStatus.BLOCK,
          title: 'Private claim',
          message: 'Remove it.',
        },
      ],
      save: jest.fn(),
    } as unknown as MediaPublicationReviewDocument;
    const { service, stored } = createService({ existingReview: blocking });
    const fresh = await service.run(new Types.ObjectId().toString(), true);
    stored.review = {
      ...fresh.toObject(),
      checks: blocking.checks,
      status: MediaPublicationReviewStatus.CHANGES_REQUIRED,
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as MediaPublicationReviewDocument;

    await expect(
      service.decide(
        new Types.ObjectId().toString(),
        MediaPreflightDecision.APPROVE,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps scheduling approval separate and requires explicit owner preflight approval', async () => {
    const { service, stored } = createService();
    const review = await service.run(new Types.ObjectId().toString(), true);
    stored.review = review;

    const approved = await service.decide(
      new Types.ObjectId().toString(),
      MediaPreflightDecision.APPROVE,
      'Looks right.',
    );

    expect(approved.status).toBe(MediaPublicationReviewStatus.APPROVED);
    expect(approved.approvedAt).toBeInstanceOf(Date);
    await expect(
      service.assertApproved(new Types.ObjectId().toString()),
    ).resolves.toBeTruthy();
  });
});
