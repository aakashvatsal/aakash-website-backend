import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { MediaPreflightDecision } from './dto/media-review.dto';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaPresenceService } from './media-presence.service';
import { MediaProductionService } from './media-production.service';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import { MediaRepetitionRisk } from './schemas/media-content-memory.schema';
import { MediaPostStatus, MediaPostType } from './schemas/media-post.schema';
import {
  MediaPreflightCheck,
  MediaPreflightCheckCategory,
  MediaPreflightCheckStatus,
  MediaPublicationReview,
  MediaPublicationReviewDocument,
  MediaPublicationReviewStatus,
} from './schemas/media-publication-review.schema';
import {
  MediaProductionStatus,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

interface GeneratedPreflightReview {
  overallScore: number;
  authenticityScore: number;
  platformFitScore: number;
  clarityScore: number;
  evidenceScore: number;
  privacyScore: number;
  noveltyScore: number;
  productionScore: number;
  strengths: string[];
  changesRequired: string[];
  checks: Array<{
    category: MediaPreflightCheckCategory;
    status: MediaPreflightCheckStatus;
    title: string;
    message: string;
  }>;
}

const REVIEWABLE_STATUSES = [
  MediaPostStatus.DRAFT,
  MediaPostStatus.SCRIPT_READY,
  MediaPostStatus.ASSETS_PENDING,
  MediaPostStatus.READY,
];

@Injectable()
export class MediaPreflightService {
  constructor(
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaPublicationReview.name)
    private readonly reviewModel: Model<MediaPublicationReviewDocument>,
    private readonly aiService: AiService,
    private readonly productionService: MediaProductionService,
    private readonly intelligenceService: MediaContentIntelligenceService,
    private readonly presenceService: MediaPresenceService,
  ) {}

  async overview(limit = 100) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const publications = await this.publicationModel
      .find({
        isActive: true,
        status: { $in: REVIEWABLE_STATUSES },
        productionStatus: {
          $in: [MediaProductionStatus.READY, MediaProductionStatus.COMPLETE],
        },
      })
      .sort({ reviewDueAt: 1, scheduledAt: 1, updatedAt: -1 })
      .limit(safeLimit)
      .lean();
    const ids = publications.map((item) => item._id);
    const reviews = ids.length
      ? await this.reviewModel
          .find({ publicationId: { $in: ids }, isActive: true })
          .lean()
      : [];
    const reviewMap = new Map(
      reviews.map((item) => [item.publicationId.toString(), item]),
    );

    const items = await Promise.all(
      publications.map(async (publication) => {
        const review = reviewMap.get(publication._id.toString());
        const stale = review
          ? !(await this.isFingerprintCurrent(
              publication._id.toString(),
              review.sourceFingerprint,
            ))
          : false;
        return {
          publication,
          review: review
            ? {
                ...review,
                status: stale
                  ? MediaPublicationReviewStatus.STALE
                  : review.status,
              }
            : null,
          state: !review ? 'not_reviewed' : stale ? 'stale' : review.status,
        };
      }),
    );

    return {
      generatedAt: new Date().toISOString(),
      items,
      summary: {
        total: items.length,
        notReviewed: items.filter((item) => item.state === 'not_reviewed')
          .length,
        needsReview: items.filter((item) => item.state === 'needs_review')
          .length,
        changesRequired: items.filter(
          (item) => item.state === 'changes_required',
        ).length,
        approved: items.filter((item) => item.state === 'approved').length,
        stale: items.filter((item) => item.state === 'stale').length,
      },
      policy: {
        productionReadinessIsNecessaryButNotSufficient: true,
        ownerApprovalRequiredBeforeScheduleOrPublish: true,
        approvedReviewBecomesStaleWhenContentProductionOrAssetsChange: true,
        blockingPrivacyEvidenceNoveltyOrCompletenessChecksCannotBeOverriddenByScheduling: true,
        warningsMayBeApprovedByOwner: true,
      },
    };
  }

  async get(publicationId: string) {
    const publication = await this.requirePublication(publicationId);
    const review = await this.reviewModel.findOne({
      publicationId: publication._id,
      isActive: true,
    });
    if (!review) return { publication, review: null, stale: false };
    const stale = !(await this.isFingerprintCurrent(
      publicationId,
      review.sourceFingerprint,
    ));
    return {
      publication,
      review: stale
        ? { ...review.toObject(), status: MediaPublicationReviewStatus.STALE }
        : review,
      stale,
    };
  }

  async run(publicationId: string, force = false) {
    const publication = await this.requirePublication(publicationId);
    const pack = await this.productionService.getPack(publicationId);
    if (!pack.readiness.ready) {
      throw new BadRequestException(
        'Production and all required assets must be ready before preflight review.',
      );
    }
    const content = await this.contentModel.findOne({
      _id: publication.contentItemId,
      isActive: true,
    });
    if (!content)
      throw new NotFoundException('Canonical Media content not found.');

    const fingerprint = this.fingerprint(publication, content, pack.assets);
    const existing = await this.reviewModel.findOne({
      publicationId: publication._id,
      isActive: true,
    });
    if (!force && existing?.sourceFingerprint === fingerprint) return existing;

    const [strategy, voice, memory] = await Promise.all([
      this.presenceService.getStrategy(),
      this.presenceService.getVoiceProfile(),
      this.intelligenceService.analyzePublication(publicationId, true),
    ]);

    const deterministic = this.deterministicChecks(
      publication,
      pack.readiness,
      memory,
    );
    let generated: Awaited<ReturnType<typeof this.generateAiReview>>;
    try {
      generated = await this.generateAiReview({
        publication,
        content,
        strategy,
        voice,
        memory,
        production: publication.production,
      });
    } catch (error) {
      throw new ServiceUnavailableException(
        `HSAKAA could not complete Media preflight review: ${this.errorMessage(error)}`,
      );
    }

    const checks = this.mergeChecks(deterministic, generated.data.checks);
    const blocks = checks.filter(
      (item) => item.status === MediaPreflightCheckStatus.BLOCK,
    );
    const changesRequired = this.unique([
      ...generated.data.changesRequired,
      ...blocks.map((item) => item.message),
    ]);
    const status = blocks.length
      ? MediaPublicationReviewStatus.CHANGES_REQUIRED
      : MediaPublicationReviewStatus.NEEDS_REVIEW;

    return this.reviewModel.findOneAndUpdate(
      { publicationId: publication._id },
      {
        $set: {
          publicationId: publication._id,
          contentItemId: publication.contentItemId,
          platform: publication.platform,
          format: publication.format,
          status,
          overallScore: this.score(generated.data.overallScore),
          authenticityScore: this.score(generated.data.authenticityScore),
          platformFitScore: this.score(generated.data.platformFitScore),
          clarityScore: this.score(generated.data.clarityScore),
          evidenceScore: this.score(generated.data.evidenceScore),
          privacyScore: this.score(generated.data.privacyScore),
          noveltyScore: Math.min(
            this.score(generated.data.noveltyScore),
            typeof memory.noveltyScore === 'number' ? memory.noveltyScore : 100,
          ),
          productionScore: this.score(generated.data.productionScore),
          checks,
          strengths: this.unique(generated.data.strengths),
          changesRequired,
          sourceFingerprint: fingerprint,
          reviewedProductionVersion: publication.productionVersion ?? 0,
          presenceStrategyVersion: strategy?.version,
          voiceProfileVersion: voice?.version,
          aiModel: generated.model,
          aiResponseId: generated.responseId,
          generatedAt: new Date(),
          approvedAt: undefined,
          ownerNote: undefined,
          isActive: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async decide(
    publicationId: string,
    decision: MediaPreflightDecision,
    note?: string,
  ) {
    const publication = await this.requirePublication(publicationId);
    const review = await this.reviewModel.findOne({
      publicationId: publication._id,
      isActive: true,
    });
    if (!review) {
      throw new BadRequestException(
        'Run preflight review before making an owner decision.',
      );
    }
    const currentFingerprint = await this.currentFingerprint(publicationId);
    if (currentFingerprint !== review.sourceFingerprint) {
      review.status = MediaPublicationReviewStatus.STALE;
      review.approvedAt = undefined;
      await review.save();
      throw new BadRequestException(
        'Preflight review is stale because content, production, or assets changed. Run review again.',
      );
    }

    if (decision === MediaPreflightDecision.APPROVE) {
      const blockers = review.checks.filter(
        (item) => item.status === MediaPreflightCheckStatus.BLOCK,
      );
      if (blockers.length) {
        throw new BadRequestException(
          `Resolve blocking preflight checks before approval: ${blockers
            .map((item) => item.title)
            .join(', ')}`,
        );
      }
      review.status = MediaPublicationReviewStatus.APPROVED;
      review.approvedAt = new Date();
      review.ownerNote = note?.trim() || undefined;
      return review.save();
    }

    review.status = MediaPublicationReviewStatus.CHANGES_REQUIRED;
    review.approvedAt = undefined;
    review.ownerNote = note?.trim() || undefined;
    return review.save();
  }

  async assertApproved(publicationId: string) {
    const publication = await this.requirePublication(publicationId);
    const review = await this.reviewModel.findOne({
      publicationId: publication._id,
      isActive: true,
      status: MediaPublicationReviewStatus.APPROVED,
    });
    if (!review) {
      throw new BadRequestException(
        'Owner-approved Media preflight review is required before scheduling or publishing.',
      );
    }
    const currentFingerprint = await this.currentFingerprint(publicationId);
    if (currentFingerprint !== review.sourceFingerprint) {
      review.status = MediaPublicationReviewStatus.STALE;
      review.approvedAt = undefined;
      await review.save();
      throw new BadRequestException(
        'Media preflight approval became stale after content, production, or asset changes. Review again.',
      );
    }
    return review;
  }

  private async currentFingerprint(publicationId: string) {
    const publication = await this.requirePublication(publicationId);
    const [content, pack] = await Promise.all([
      this.contentModel.findOne({
        _id: publication.contentItemId,
        isActive: true,
      }),
      this.productionService.getPack(publicationId),
    ]);
    if (!content)
      throw new NotFoundException('Canonical Media content not found.');
    return this.fingerprint(publication, content, pack.assets);
  }

  private async isFingerprintCurrent(
    publicationId: string,
    fingerprint: string,
  ) {
    try {
      return (await this.currentFingerprint(publicationId)) === fingerprint;
    } catch {
      return false;
    }
  }

  private deterministicChecks(
    publication: MediaPublicationDocument,
    readiness: { ready: boolean; remainingAssets: number },
    memory: {
      repetitionRisk?: MediaRepetitionRisk;
      noveltyScore?: number;
      intentionalRepurpose?: boolean;
    },
  ): MediaPreflightCheck[] {
    const checks: MediaPreflightCheck[] = [];
    const copy = [
      publication.caption,
      publication.script,
      publication.description,
      publication.hook,
      publication.title,
      publication.production?.finalScript,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    checks.push({
      category: MediaPreflightCheckCategory.COMPLETENESS,
      status:
        copy.length >= 20
          ? MediaPreflightCheckStatus.PASS
          : MediaPreflightCheckStatus.BLOCK,
      title: 'Final copy exists',
      message:
        copy.length >= 20
          ? 'The publication contains usable final copy/script.'
          : 'Final platform copy or script is missing or too incomplete to publish.',
    });

    const video = [
      MediaPostType.REEL,
      MediaPostType.VIDEO,
      MediaPostType.SHORT,
    ].includes(publication.format);
    if (video) {
      const script = (
        publication.script ??
        publication.production?.finalScript ??
        ''
      ).trim();
      checks.push({
        category: MediaPreflightCheckCategory.COMPLETENESS,
        status:
          script.length >= 40
            ? MediaPreflightCheckStatus.PASS
            : MediaPreflightCheckStatus.BLOCK,
        title: 'Video script is ready',
        message:
          script.length >= 40
            ? 'A final spoken script is available.'
            : 'Video/Reel/Short requires a complete final spoken script.',
      });
    }

    if (publication.format === MediaPostType.CAROUSEL) {
      const slideCount = Math.max(
        publication.slides?.length ?? 0,
        publication.production?.carouselSlides?.length ?? 0,
      );
      checks.push({
        category: MediaPreflightCheckCategory.COMPLETENESS,
        status:
          slideCount >= 2
            ? MediaPreflightCheckStatus.PASS
            : MediaPreflightCheckStatus.BLOCK,
        title: 'Carousel has complete slides',
        message:
          slideCount >= 2
            ? `${slideCount} carousel slides are defined.`
            : 'Carousel requires at least two defined slides before approval.',
      });
    }

    checks.push({
      category: MediaPreflightCheckCategory.PRODUCTION,
      status: readiness.ready
        ? MediaPreflightCheckStatus.PASS
        : MediaPreflightCheckStatus.BLOCK,
      title: 'Production assets are ready',
      message: readiness.ready
        ? 'All required production assets are ready.'
        : `${readiness.remainingAssets} required production asset(s) remain unresolved.`,
    });

    const repetitionBlocked =
      !memory.intentionalRepurpose &&
      [MediaRepetitionRisk.HIGH, MediaRepetitionRisk.BLOCKED].includes(
        memory.repetitionRisk ?? MediaRepetitionRisk.LOW,
      );
    checks.push({
      category: MediaPreflightCheckCategory.NOVELTY,
      status: repetitionBlocked
        ? MediaPreflightCheckStatus.BLOCK
        : memory.repetitionRisk === MediaRepetitionRisk.MEDIUM
          ? MediaPreflightCheckStatus.WARN
          : MediaPreflightCheckStatus.PASS,
      title: 'Anti-repetition memory',
      message: repetitionBlocked
        ? 'This execution is too similar to prior Media memory. Rework the angle/hook/story or explicitly mark a justified repurpose.'
        : `Novelty ${Math.round(memory.noveltyScore ?? 100)}/100; repetition risk ${memory.repetitionRisk ?? 'low'}.`,
    });
    return checks;
  }

  private generateAiReview(input: {
    publication: MediaPublicationDocument;
    content: MediaContentItemDocument;
    strategy: Awaited<ReturnType<MediaPresenceService['getStrategy']>>;
    voice: Awaited<ReturnType<MediaPresenceService['getVoiceProfile']>>;
    memory: unknown;
    production: MediaPublication['production'];
  }) {
    return this.aiService.generateStructuredResponse<GeneratedPreflightReview>({
      name: 'hsakaa_media_preflight_v39',
      instructions: [
        'You are HSAKAA final Media editor for Aakash. Review one already-produced publication immediately before owner approval.',
        'Do not rewrite the post in this step and never approve it yourself. Surface strengths, specific changes, warnings and blockers for Aakash to decide.',
        'Protect the real Aakash voice. Block fake-guru language, manufactured vulnerability, invented experiences, inflated claims, or content that sounds unlike the supplied voice profile.',
        'Evaluate platform fit without forcing the same copy/structure across LinkedIn, Instagram, YouTube, X and WhatsApp.',
        'Treat unsupported factual/company/person/health claims as evidence or privacy blockers. Do not infer facts that are not supplied.',
        'Respect the Presence Strategy Never Become rules and claims requiring review.',
        'Anti-repetition information is supplied. Learn from winning mechanisms but do not reward repeated hooks, stories, examples, structures or phrasing.',
        'Production completeness is also checked deterministically. Your review should focus on editorial quality, authenticity, evidence, privacy, clarity and platform-native execution.',
        'Scores are 0-100. A blocker means the item must change before owner approval. A warning may still be approved by the owner.',
      ].join('\n'),
      input: JSON.stringify({
        content: {
          title: input.content.title,
          thesis: input.content.thesis,
          whyNow: input.content.whyNow,
          canonicalBody: input.content.canonicalBody,
          story: input.content.story,
          evidence: input.content.evidence,
          audiences: input.content.audiences,
          goals: input.content.goals,
        },
        publication: {
          platform: input.publication.platform,
          format: input.publication.format,
          title: input.publication.title,
          hook: input.publication.hook,
          caption: input.publication.caption,
          script: input.publication.script,
          description: input.publication.description,
          cta: input.publication.cta,
          hashtags: input.publication.hashtags,
          slides: input.publication.slides,
          intentionalRepurpose: input.publication.intentionalRepurpose,
        },
        production: input.production,
        presenceStrategy: input.strategy,
        voiceProfile: input.voice,
        antiRepetition: input.memory,
      }),
      verbosity: 'medium',
      reasoningEffort: 'medium',
      maxOutputTokens: 6500,
      schema: this.reviewSchema(),
    });
  }

  private reviewSchema() {
    const score = { type: 'number', minimum: 0, maximum: 100 } as const;
    const stringArray = { type: 'array', items: { type: 'string' } } as const;
    return {
      type: 'object',
      properties: {
        overallScore: score,
        authenticityScore: score,
        platformFitScore: score,
        clarityScore: score,
        evidenceScore: score,
        privacyScore: score,
        noveltyScore: score,
        productionScore: score,
        strengths: stringArray,
        changesRequired: stringArray,
        checks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: {
                type: 'string',
                enum: Object.values(MediaPreflightCheckCategory),
              },
              status: {
                type: 'string',
                enum: Object.values(MediaPreflightCheckStatus),
              },
              title: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['category', 'status', 'title', 'message'],
            additionalProperties: false,
          },
        },
      },
      required: [
        'overallScore',
        'authenticityScore',
        'platformFitScore',
        'clarityScore',
        'evidenceScore',
        'privacyScore',
        'noveltyScore',
        'productionScore',
        'strengths',
        'changesRequired',
        'checks',
      ],
      additionalProperties: false,
    } as const;
  }

  private mergeChecks(
    deterministic: MediaPreflightCheck[],
    generated: MediaPreflightCheck[],
  ) {
    return [...deterministic, ...generated].slice(0, 40);
  }

  private fingerprint(
    publication: MediaPublication,
    content: MediaContentItem,
    assets: Array<{
      _id?: unknown;
      status?: unknown;
      source?: unknown;
      url?: unknown;
      storageKey?: unknown;
      isActive?: unknown;
    }>,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          publication: {
            platform: publication.platform,
            format: publication.format,
            title: publication.title,
            hook: publication.hook,
            caption: publication.caption,
            script: publication.script,
            description: publication.description,
            cta: publication.cta,
            hashtags: publication.hashtags,
            slides: publication.slides,
            productionVersion: publication.productionVersion,
            production: publication.production,
            intentionalRepurpose: publication.intentionalRepurpose,
          },
          content: {
            title: content.title,
            thesis: content.thesis,
            whyNow: content.whyNow,
            canonicalBody: content.canonicalBody,
            story: content.story,
            evidence: content.evidence,
            audiences: content.audiences,
            goals: content.goals,
          },
          assets: assets
            .map((asset) => ({
              id:
                asset._id instanceof Types.ObjectId
                  ? asset._id.toHexString()
                  : '',
              status: asset.status,
              source: asset.source,
              url: asset.url,
              storageKey: asset.storageKey,
              isActive: asset.isActive,
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        }),
      )
      .digest('hex');
  }

  private async requirePublication(publicationId: string) {
    if (!Types.ObjectId.isValid(publicationId)) {
      throw new BadRequestException('Invalid Media publication identifier.');
    }
    const publication = await this.publicationModel.findOne({
      _id: new Types.ObjectId(publicationId),
      isActive: true,
    });
    if (!publication)
      throw new NotFoundException('Media publication not found.');
    return publication;
  }

  private score(value: number) {
    return Math.min(100, Math.max(0, Math.round(value)));
  }

  private unique(values: Array<string | undefined | null>) {
    return [
      ...new Set(
        values.map((item) => item?.trim()).filter(Boolean) as string[],
      ),
    ];
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown Media preflight error';
  }
}
