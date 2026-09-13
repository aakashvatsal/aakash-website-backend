import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiGenerationUsage, AiService } from '../ai/ai.service';
import {
  AcceptMediaDirectorCandidateDto,
  GenerateMediaContentBatchDto,
  RejectMediaDirectorCandidateDto,
} from './dto/media-core.dto';
import { MediaContentIntelligenceService } from './media-content-intelligence.service';
import { MediaCoreService } from './media-core.service';
import { MediaGrowthService } from './media-growth.service';
import { MediaPresenceService } from './media-presence.service';
import {
  MediaContentItem,
  MediaContentItemDocument,
  MediaContentItemStatus,
  MediaContentOrigin,
} from './schemas/media-content-item.schema';
import {
  MediaGenerationPurpose,
  MediaGenerationRun,
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';
import {
  MediaGoal,
  MediaPlatform,
  MediaPostStatus,
  MediaPostType,
} from './schemas/media-post.schema';
import {
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

export type MediaDirectorCandidateStatus =
  'generated' | 'blocked' | 'accepted' | 'rejected';

export interface MediaDirectorPublicationDraft {
  platform: MediaPlatform;
  format: MediaPostType;
  title?: string;
  hook?: string;
  caption?: string;
  script?: string;
  description?: string;
  cta?: string;
  hashtags: string[];
  slides: string[];
  rationale?: string;
  noveltyScore: number;
  repetitionRisk: string;
  allowed: boolean;
  closestSimilarity: number;
}

export interface MediaDirectorCandidate {
  key: string;
  title: string;
  thesis: string;
  whyNow: string;
  canonicalBody: string;
  story: string;
  evidence: string[];
  contentPillars: string[];
  audiences: string[];
  goals: MediaGoal[];
  rationale: string;
  publications: MediaDirectorPublicationDraft[];
  noveltyScore: number;
  repetitionRisk: string;
  closestSimilarity: number;
  internalSimilarity: number;
  status: MediaDirectorCandidateStatus;
  critic: {
    strategicFit: number;
    platformFit: number;
    specificity: number;
    strengths: string[];
    risks: string[];
    improvement: string;
  };
  finalScore: number;
  acceptedContentItemId?: string;
  rejectedMemoryId?: string;
}

interface GeneratedCandidate {
  title: string;
  thesis: string;
  whyNow: string;
  canonicalBody: string;
  story: string;
  evidence: string[];
  contentPillars: string[];
  audiences: string[];
  goals: MediaGoal[];
  rationale: string;
  publications: Array<{
    platform: MediaPlatform;
    format: MediaPostType;
    title: string;
    hook: string;
    caption: string;
    script: string;
    description: string;
    cta: string;
    hashtags: string[];
    slides: string[];
    rationale: string;
  }>;
}

interface CriticReview {
  key: string;
  strategicFit: number;
  platformFit: number;
  specificity: number;
  strengths: string[];
  risks: string[];
  improvement: string;
}

const GROWTH_PLATFORMS: MediaPlatform[] = [
  MediaPlatform.LINKEDIN,
  MediaPlatform.INSTAGRAM,
  MediaPlatform.YOUTUBE,
  MediaPlatform.X,
  MediaPlatform.WHATSAPP,
];

const FORMAT_BY_PLATFORM: Record<MediaPlatform, MediaPostType[]> = {
  [MediaPlatform.LINKEDIN]: [
    MediaPostType.TEXT,
    MediaPostType.IMAGE,
    MediaPostType.CAROUSEL,
    MediaPostType.VIDEO,
    MediaPostType.ARTICLE,
    MediaPostType.POLL,
  ],
  [MediaPlatform.INSTAGRAM]: [
    MediaPostType.IMAGE,
    MediaPostType.CAROUSEL,
    MediaPostType.REEL,
    MediaPostType.VIDEO,
    MediaPostType.STORY,
  ],
  [MediaPlatform.YOUTUBE]: [MediaPostType.VIDEO, MediaPostType.SHORT],
  [MediaPlatform.X]: [
    MediaPostType.TEXT,
    MediaPostType.IMAGE,
    MediaPostType.VIDEO,
    MediaPostType.POLL,
    MediaPostType.THREAD,
  ],
  [MediaPlatform.WHATSAPP]: [
    MediaPostType.WHATSAPP_MESSAGE,
    MediaPostType.WHATSAPP_STATUS,
    MediaPostType.WHATSAPP_TEMPLATE,
    MediaPostType.IMAGE,
    MediaPostType.VIDEO,
  ],
  [MediaPlatform.FACEBOOK]: [
    MediaPostType.TEXT,
    MediaPostType.IMAGE,
    MediaPostType.CAROUSEL,
    MediaPostType.VIDEO,
  ],
  [MediaPlatform.THREADS]: [MediaPostType.TEXT, MediaPostType.IMAGE],
};

@Injectable()
export class MediaContentDirectorService {
  constructor(
    @InjectModel(MediaGenerationRun.name)
    private readonly generationRunModel: Model<MediaGenerationRunDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    private readonly aiService: AiService,
    private readonly coreService: MediaCoreService,
    private readonly intelligenceService: MediaContentIntelligenceService,
    private readonly growthService: MediaGrowthService,
    private readonly presenceService: MediaPresenceService,
  ) {}

  async overview() {
    const [runs, pendingRuns, acceptedRuns, rejectedRuns, accounts] =
      await Promise.all([
        this.generationRunModel.countDocuments({ isActive: true }),
        this.generationRunModel.countDocuments({
          isActive: true,
          status: {
            $in: [
              MediaGenerationRunStatus.GENERATED,
              MediaGenerationRunStatus.PARTIALLY_ACCEPTED,
            ],
          },
        }),
        this.generationRunModel.countDocuments({
          isActive: true,
          status: MediaGenerationRunStatus.ACCEPTED,
        }),
        this.generationRunModel.countDocuments({
          isActive: true,
          status: MediaGenerationRunStatus.REJECTED,
        }),
        this.coreService.listAccounts(),
      ]);

    return {
      runs,
      pendingRuns,
      acceptedRuns,
      rejectedRuns,
      aiModel: this.aiService.getModel(),
      configuredGrowthPlatforms: accounts
        .filter((account) => GROWTH_PLATFORMS.includes(account.platform))
        .map((account) => account.platform),
      requiredGrowthPlatforms: GROWTH_PLATFORMS,
      policy: {
        candidateCountDefault: 4,
        candidateCountRange: [2, 8],
        requiresAntiRepetitionCheck: true,
        blockedCandidatesCannotBeAccepted: true,
        acceptanceWritesCanonicalSchemas: true,
        rejectionEntersContentMemory: true,
      },
    };
  }

  listRuns(limit = 20) {
    const safe = Math.min(Math.max(limit, 1), 100);
    return this.generationRunModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(safe)
      .lean();
  }

  async getRun(runId: string) {
    const run = await this.generationRunModel.findOne({
      _id: this.objectId(runId),
      isActive: true,
    });
    if (!run) throw new NotFoundException('Media generation run not found.');
    return run;
  }

  async getCandidate(runId: string, candidateKey: string) {
    const run = await this.getRun(runId);
    const candidates = this.candidatesFrom(run.candidates);
    const candidate = candidates.find((item) => item.key === candidateKey);
    if (!candidate)
      throw new NotFoundException('Media director candidate not found.');
    return { run, candidate };
  }

  async generate(dto: GenerateMediaContentBatchDto) {
    const brief = dto.brief.trim();
    if (!brief) throw new BadRequestException('Content brief is required.');

    const purpose = dto.purpose ?? MediaGenerationPurpose.IDEATION;
    const candidateCount = Math.min(Math.max(dto.candidateCount ?? 4, 2), 8);
    const accounts = await this.coreService.listAccounts();
    const platforms = this.resolvePlatforms(dto.platforms, accounts);
    if (!platforms.length) {
      throw new BadRequestException(
        'Configure at least one Media growth account or explicitly choose a platform.',
      );
    }

    const [
      recentContent,
      recentMemories,
      memoryOverview,
      growthLearnings,
      presenceContext,
    ] = await Promise.all([
      this.coreService.listContent(),
      this.intelligenceService.listMemories({ limit: 40 }),
      this.intelligenceService.overview(),
      this.growthService.directorLearningContext(platforms),
      this.presenceService.directorContext(),
    ]);

    const strategySnapshot = {
      ...this.buildStrategySnapshot(accounts, platforms, dto),
      growthLearnings,
      presenceStrategy: presenceContext.presenceStrategy,
      voiceProfile: presenceContext.voiceProfile,
      mediaWorldContext: presenceContext.worldContext,
    };
    const contextSummary = this.buildContextSummary(
      dto,
      recentContent.slice(0, 20),
      recentMemories.slice(0, 30),
    );

    const run = await this.generationRunModel.create({
      purpose,
      status: MediaGenerationRunStatus.GENERATING,
      aiModel: this.aiService.getModel(),
      promptVersion: 'media-director-6f-v1',
      brief,
      requestedPlatforms: platforms,
      strategySnapshot,
      contextSummary: dto.contextSummary?.trim() || contextSummary,
      candidateCount,
      candidates: [],
      rankedCandidateKeys: [],
      metadata: {
        sourceContentItemId: dto.sourceContentItemId,
        intentionalRepurpose: dto.intentionalRepurpose ?? false,
        memoryCoverage: {
          content: memoryOverview.contentCoveragePercent,
          publications: memoryOverview.publicationCoveragePercent,
        },
      },
    });

    try {
      const generated = await this.generateCandidatesWithAi({
        ...dto,
        brief,
        candidateCount,
        platforms,
        contextSummary,
        strategySnapshot,
      });

      const checked = await this.checkGeneratedCandidates(
        generated.data.candidates.slice(0, candidateCount),
        platforms,
        dto.intentionalRepurpose ?? false,
      );
      this.applyInternalSimilarity(checked);

      const critic = await this.critiqueCandidates(
        checked,
        strategySnapshot,
        brief,
      );
      const finalCandidates = this.applyCritic(checked, critic.data.reviews);
      const rankedCandidateKeys = finalCandidates
        .slice()
        .sort((first, second) => second.finalScore - first.finalScore)
        .map((candidate) => candidate.key);

      run.status = MediaGenerationRunStatus.GENERATED;
      run.aiModel = generated.model;
      run.responseId = generated.responseId;
      run.candidates = finalCandidates;
      run.rankedCandidateKeys = rankedCandidateKeys;
      run.metadata = {
        ...(run.metadata ?? {}),
        generationUsage: generated.usage,
        criticModel: critic.model,
        criticResponseId: critic.responseId,
        criticUsage: critic.usage,
      };
      await run.save();

      return run;
    } catch (error) {
      run.status = MediaGenerationRunStatus.FAILED;
      run.metadata = {
        ...(run.metadata ?? {}),
        error:
          error instanceof Error ? error.message : 'Unknown generation error',
      };
      await run.save();

      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'HSAKAA could not generate Media candidates. Please try again.',
      );
    }
  }

  async acceptCandidate(
    runId: string,
    candidateKey: string,
    dto: AcceptMediaDirectorCandidateDto = {},
  ) {
    const { run, candidate } = await this.getCandidate(runId, candidateKey);

    if (candidate.acceptedContentItemId) {
      const content = await this.contentModel.findById(
        this.objectId(candidate.acceptedContentItemId),
      );
      const publications = content
        ? await this.publicationModel
            .find({ contentItemId: content._id, isActive: true })
            .lean()
        : [];
      return { contentItem: content, publications, run, alreadyAccepted: true };
    }

    if (candidate.status === 'rejected') {
      throw new ConflictException(
        'Rejected Media candidates cannot be accepted.',
      );
    }
    if (candidate.status === 'blocked') {
      throw new ConflictException(
        'This candidate is blocked by the anti-repetition policy. Generate a genuinely different angle instead.',
      );
    }

    const selectedPlatforms = dto.platforms?.length
      ? dto.platforms
      : candidate.publications.map((publication) => publication.platform);
    const selected = candidate.publications.filter((publication) =>
      selectedPlatforms.includes(publication.platform),
    );
    if (!selected.length) {
      throw new BadRequestException(
        'Select at least one generated platform execution.',
      );
    }

    const content = await this.coreService.createContent({
      title: candidate.title,
      thesis: candidate.thesis,
      whyNow: candidate.whyNow,
      canonicalBody: candidate.canonicalBody,
      story: candidate.story,
      evidence: candidate.evidence,
      contentPillars: candidate.contentPillars,
      audiences: candidate.audiences,
      goals: candidate.goals,
      status: MediaContentItemStatus.DEVELOPING,
      origin: MediaContentOrigin.HSAKAA,
      generationRunId: run._id.toString(),
      metadata: {
        mediaDirectorCandidateKey: candidate.key,
        finalScore: candidate.finalScore,
        critic: candidate.critic,
        sourceBrief: run.brief,
      },
    });

    const accounts = await this.coreService.listAccounts();
    const publications: MediaPublicationDocument[] = [];
    for (const draft of selected) {
      const account = accounts.find(
        (item) => item.platform === draft.platform && item.isPrimary,
      );
      const publication = await this.coreService.createPublication({
        contentItemId: content._id.toString(),
        accountId: account?._id ? String(account._id) : undefined,
        platform: draft.platform,
        format: draft.format,
        status: MediaPostStatus.DRAFT,
        title: draft.title,
        hook: draft.hook,
        caption: draft.caption,
        script: draft.script,
        description: draft.description,
        cta: draft.cta,
        hashtags: draft.hashtags,
        slides: draft.slides,
        generationRunId: run._id.toString(),
        metadata: {
          mediaDirectorCandidateKey: candidate.key,
          rationale: draft.rationale,
          noveltyScore: draft.noveltyScore,
          repetitionRisk: draft.repetitionRisk,
        },
      });
      publications.push(publication);
    }

    await this.intelligenceService.analyzeContentItem(
      content._id.toString(),
      true,
    );
    for (const publication of publications) {
      await this.intelligenceService.analyzePublication(
        publication._id.toString(),
        true,
      );
    }

    const candidates = this.candidatesFrom(run.candidates).map((item) =>
      item.key === candidate.key
        ? {
            ...item,
            status: 'accepted' as const,
            acceptedContentItemId: content._id.toString(),
          }
        : item,
    );
    run.candidates = candidates as unknown as Array<Record<string, unknown>>;
    run.acceptedContentItemIds = [
      ...new Map(
        [...run.acceptedContentItemIds, content._id].map((id) => [
          id.toString(),
          id,
        ]),
      ).values(),
    ];
    run.status = this.runStatus(candidates);
    await run.save();

    return { contentItem: content, publications, run, alreadyAccepted: false };
  }

  async rejectCandidate(
    runId: string,
    candidateKey: string,
    dto: RejectMediaDirectorCandidateDto = {},
  ) {
    const { run, candidate } = await this.getCandidate(runId, candidateKey);
    if (candidate.acceptedContentItemId || candidate.status === 'accepted') {
      throw new ConflictException(
        'Accepted Media candidates cannot be rejected.',
      );
    }
    if (candidate.rejectedMemoryId) {
      return { run, candidate, alreadyRejected: true };
    }

    const memory = await this.intelligenceService.recordRejectedCandidate({
      title: candidate.title,
      thesis: candidate.thesis,
      whyNow: candidate.whyNow,
      canonicalBody: candidate.canonicalBody,
      story: candidate.story,
      evidence: candidate.evidence,
      contentPillars: candidate.contentPillars,
      audiences: candidate.audiences,
      generationRunId: run._id.toString(),
      rejectionReason:
        dto.reason?.trim() || 'Rejected in HSAKAA Content Director',
      metadata: {
        mediaDirectorCandidateKey: candidate.key,
        publications: candidate.publications.map((publication) => ({
          platform: publication.platform,
          format: publication.format,
          hook: publication.hook,
        })),
      },
    });

    const candidates = this.candidatesFrom(run.candidates).map((item) =>
      item.key === candidate.key
        ? {
            ...item,
            status: 'rejected' as const,
            rejectedMemoryId: memory._id.toString(),
          }
        : item,
    );
    run.candidates = candidates as unknown as Array<Record<string, unknown>>;
    run.rejectedMemoryIds = [
      ...new Map(
        [...run.rejectedMemoryIds, memory._id].map((id) => [id.toString(), id]),
      ).values(),
    ];
    run.status = this.runStatus(candidates);
    await run.save();

    return {
      run,
      candidate: candidates.find((item) => item.key === candidateKey),
      alreadyRejected: false,
    };
  }

  private async generateCandidatesWithAi(input: {
    brief: string;
    purpose?: MediaGenerationPurpose;
    platforms: MediaPlatform[];
    candidateCount: number;
    goals?: MediaGoal[];
    contentPillars?: string[];
    audiences?: string[];
    whyNow?: string;
    constraints?: string[];
    sourceContentItemId?: string;
    intentionalRepurpose?: boolean;
    contextSummary: string;
    strategySnapshot: Record<string, unknown>;
  }) {
    return this.aiService.generateStructuredResponse<{
      candidates: GeneratedCandidate[];
    }>({
      name: 'hsakaa_media_director_candidates',
      instructions: [
        'You are HSAKAA Content Director for Aakash. Generate distinct, specific content candidates designed to grow his real accounts.',
        'Do not use generic motivational filler, invented achievements, invented metrics, invented quotes, or unsupported claims.',
        'Each candidate must have a materially different thesis/angle/story structure, not merely different wording.',
        `Create ${input.candidateCount} candidates. For each candidate create one tailored execution for every requested platform: ${input.platforms.join(', ')}.`,
        'LinkedIn should favor founder authority, useful stories and clear thinking; Instagram should favor personality, visual storytelling and discovery; YouTube should favor depth/searchability or strong Shorts; X should favor concise ideas, sharp observations and conversations; WhatsApp should favor close-audience distribution and direct usefulness.',
        'Platform variants must feel native to that platform rather than copy-paste adaptations.',
        'A canonical content candidate is still a draft. Do not imply it is approved, scheduled or published.',
        'Keep this ideation response compact. The Production Studio can expand accepted ideas later: canonicalBody <= 220 words, story <= 160 words, each caption/description <= 120 words, each script <= 220 words, hashtags <= 8, and slides <= 8 concise strings.',
        'The strategy snapshot may include growthLearnings derived from measured historical performance. Treat high-confidence learnings as evidence, not rigid rules. Preserve novelty by rotating topics, examples, hooks and structures instead of mechanically repeating a winning pattern.',
        'If a Media Presence Strategy is present, treat its north star, platform roles, narrative balance, reputation goals and Never Become guardrails as the durable strategy layer above this batch.',
        'If an Aakash Voice Profile is present, follow its communication mechanisms and authenticity checks without mechanically copying signature phrases.',
        'mediaWorldContext PUBLIC_SAFE items may ground factual content. INTERNAL_SAFE items may shape angle/priority but must not be exposed as facts. NEEDS_REVIEW items must not be used as public facts until owner approval.',
        'Private-only details are intentionally excluded from Media generation. Never infer or reconstruct them.',
      ].join('\n'),
      input: JSON.stringify({
        brief: input.brief,
        purpose: input.purpose,
        requestedPlatforms: input.platforms,
        requestedGoals: input.goals ?? [],
        requestedPillars: input.contentPillars ?? [],
        requestedAudiences: input.audiences ?? [],
        whyNow: input.whyNow,
        constraints: input.constraints ?? [],
        intentionalRepurpose: input.intentionalRepurpose ?? false,
        sourceContentItemId: input.sourceContentItemId,
        strategySnapshot: input.strategySnapshot,
        contextSummary: input.contextSummary,
      }),
      // This response can contain candidateCount × requestedPlatforms native
      // executions. The shared 2.4k default is intentionally too small for that
      // payload and can truncate otherwise-valid JSON. Keep reasoning low and
      // reserve the full structured-output budget for the draft content itself.
      verbosity: 'medium',
      reasoningEffort: 'low',
      maxOutputTokens: 12000,
      schema: {
        type: 'object',
        properties: {
          candidates: {
            type: 'array',
            minItems: 2,
            maxItems: 8,
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                thesis: { type: 'string' },
                whyNow: { type: 'string' },
                canonicalBody: { type: 'string' },
                story: { type: 'string' },
                evidence: { type: 'array', items: { type: 'string' } },
                contentPillars: { type: 'array', items: { type: 'string' } },
                audiences: { type: 'array', items: { type: 'string' } },
                goals: {
                  type: 'array',
                  items: { type: 'string', enum: Object.values(MediaGoal) },
                },
                rationale: { type: 'string' },
                publications: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      platform: {
                        type: 'string',
                        enum: Object.values(MediaPlatform),
                      },
                      format: {
                        type: 'string',
                        enum: Object.values(MediaPostType),
                      },
                      title: { type: 'string' },
                      hook: { type: 'string' },
                      caption: { type: 'string' },
                      script: { type: 'string' },
                      description: { type: 'string' },
                      cta: { type: 'string' },
                      hashtags: { type: 'array', items: { type: 'string' } },
                      slides: { type: 'array', items: { type: 'string' } },
                      rationale: { type: 'string' },
                    },
                    required: [
                      'platform',
                      'format',
                      'title',
                      'hook',
                      'caption',
                      'script',
                      'description',
                      'cta',
                      'hashtags',
                      'slides',
                      'rationale',
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                'title',
                'thesis',
                'whyNow',
                'canonicalBody',
                'story',
                'evidence',
                'contentPillars',
                'audiences',
                'goals',
                'rationale',
                'publications',
              ],
              additionalProperties: false,
            },
          },
        },
        required: ['candidates'],
        additionalProperties: false,
      },
    });
  }

  private async checkGeneratedCandidates(
    generated: GeneratedCandidate[],
    platforms: MediaPlatform[],
    intentionalRepurpose: boolean,
  ) {
    const checked: MediaDirectorCandidate[] = [];

    for (const [index, raw] of generated.entries()) {
      const key = `candidate_${index + 1}`;
      const canonical = this.normalizeCandidate(raw, platforms);
      const canonicalAnalysis = await this.intelligenceService.checkCandidate({
        title: canonical.title,
        thesis: canonical.thesis,
        whyNow: canonical.whyNow,
        canonicalBody: canonical.canonicalBody,
        story: canonical.story,
        evidence: canonical.evidence,
        contentPillars: canonical.contentPillars,
        audiences: canonical.audiences,
        intentionalRepurpose,
      });

      const publications: MediaDirectorPublicationDraft[] = [];
      for (const draft of canonical.publications) {
        const analysis = await this.intelligenceService.checkCandidate({
          title: draft.title || canonical.title,
          thesis: canonical.thesis,
          canonicalBody: canonical.canonicalBody,
          story: canonical.story,
          platform: draft.platform,
          format: draft.format,
          hook: draft.hook,
          caption: draft.caption,
          script: draft.script,
          description: draft.description,
          cta: draft.cta,
          slides: draft.slides,
          intentionalRepurpose,
        });
        publications.push({
          ...draft,
          noveltyScore: analysis.noveltyScore,
          repetitionRisk: analysis.repetitionRisk,
          allowed: analysis.allowed,
          closestSimilarity: analysis.similarMatches[0]?.score ?? 0,
        });
      }

      const blocked =
        !canonicalAnalysis.allowed ||
        publications.some((item) => !item.allowed);
      checked.push({
        key,
        ...canonical,
        publications,
        noveltyScore: canonicalAnalysis.noveltyScore,
        repetitionRisk: canonicalAnalysis.repetitionRisk,
        closestSimilarity: canonicalAnalysis.similarMatches[0]?.score ?? 0,
        internalSimilarity: 0,
        status: blocked ? 'blocked' : 'generated',
        critic: {
          strategicFit: 50,
          platformFit: 50,
          specificity: 50,
          strengths: [],
          risks: blocked ? ['Blocked by anti-repetition memory.'] : [],
          improvement: '',
        },
        finalScore: blocked ? 0 : canonicalAnalysis.noveltyScore,
      });
    }

    return checked;
  }

  private async critiqueCandidates(
    candidates: MediaDirectorCandidate[],
    strategySnapshot: Record<string, unknown>,
    brief: string,
  ) {
    try {
      return await this.aiService.generateStructuredResponse<{
        reviews: CriticReview[];
      }>({
        name: 'hsakaa_media_director_critic',
        instructions:
          'Act as a demanding content strategy editor. Score each candidate independently for strategic fit, native platform fit and specificity. Penalize generic founder advice, vague claims, interchangeable hooks and weak reasons to care. The anti-repetition decision supplied by the system is authoritative; do not override blocked candidates. Give practical improvements, not rewritten candidates.',
        input: JSON.stringify({
          brief,
          strategySnapshot,
          candidates: candidates.map((candidate) => ({
            key: candidate.key,
            title: candidate.title,
            thesis: candidate.thesis,
            rationale: candidate.rationale,
            noveltyScore: candidate.noveltyScore,
            repetitionRisk: candidate.repetitionRisk,
            internalSimilarity: candidate.internalSimilarity,
            publications: candidate.publications.map((publication) => ({
              platform: publication.platform,
              format: publication.format,
              hook: publication.hook,
              noveltyScore: publication.noveltyScore,
            })),
          })),
        }),
        verbosity: 'medium',
        schema: {
          type: 'object',
          properties: {
            reviews: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  strategicFit: { type: 'integer', minimum: 0, maximum: 100 },
                  platformFit: { type: 'integer', minimum: 0, maximum: 100 },
                  specificity: { type: 'integer', minimum: 0, maximum: 100 },
                  strengths: { type: 'array', items: { type: 'string' } },
                  risks: { type: 'array', items: { type: 'string' } },
                  improvement: { type: 'string' },
                },
                required: [
                  'key',
                  'strategicFit',
                  'platformFit',
                  'specificity',
                  'strengths',
                  'risks',
                  'improvement',
                ],
                additionalProperties: false,
              },
            },
          },
          required: ['reviews'],
          additionalProperties: false,
        },
      });
    } catch {
      return {
        data: {
          reviews: candidates.map((candidate) => ({
            key: candidate.key,
            strategicFit: 70,
            platformFit: 70,
            specificity: 70,
            strengths: [],
            risks: [],
            improvement: '',
          })),
        },
        model: this.aiService.getModel(),
        responseId: 'critic-fallback',
        usage: this.emptyUsage(),
      };
    }
  }

  private applyCritic(
    candidates: MediaDirectorCandidate[],
    reviews: CriticReview[],
  ) {
    return candidates.map((candidate) => {
      const review = reviews.find((item) => item.key === candidate.key) ?? {
        key: candidate.key,
        strategicFit: 60,
        platformFit: 60,
        specificity: 60,
        strengths: [],
        risks: [],
        improvement: '',
      };
      const internalPenalty = Math.round(candidate.internalSimilarity * 25);
      const finalScore =
        candidate.status === 'blocked'
          ? 0
          : Math.max(
              0,
              Math.round(
                candidate.noveltyScore * 0.35 +
                  review.strategicFit * 0.3 +
                  review.platformFit * 0.2 +
                  review.specificity * 0.15 -
                  internalPenalty,
              ),
            );
      return {
        ...candidate,
        critic: review,
        finalScore,
      };
    });
  }

  private applyInternalSimilarity(candidates: MediaDirectorCandidate[]) {
    for (let index = 0; index < candidates.length; index += 1) {
      let highest = 0;
      for (
        let otherIndex = 0;
        otherIndex < candidates.length;
        otherIndex += 1
      ) {
        if (index === otherIndex) continue;
        highest = Math.max(
          highest,
          this.lexicalSimilarity(
            this.candidateText(candidates[index]),
            this.candidateText(candidates[otherIndex]),
          ),
        );
      }
      candidates[index].internalSimilarity = highest;
      if (highest >= 0.9 && candidates[index].status === 'generated') {
        candidates[index].status = 'blocked';
        candidates[index].critic.risks.push(
          'Too similar to another candidate in the same generation batch.',
        );
      }
    }
  }

  private normalizeCandidate(
    raw: GeneratedCandidate,
    platforms: MediaPlatform[],
  ): Omit<
    MediaDirectorCandidate,
    | 'key'
    | 'noveltyScore'
    | 'repetitionRisk'
    | 'closestSimilarity'
    | 'internalSimilarity'
    | 'status'
    | 'critic'
    | 'finalScore'
  > {
    const publications = platforms.map((platform) => {
      const found = raw.publications?.find(
        (publication) => publication.platform === platform,
      );
      const allowedFormats = FORMAT_BY_PLATFORM[platform];
      const format =
        found && allowedFormats.includes(found.format)
          ? found.format
          : allowedFormats[0];
      return {
        platform,
        format,
        title: found?.title?.trim() || raw.title,
        hook: found?.hook?.trim() || raw.title,
        caption: found?.caption?.trim() || raw.canonicalBody,
        script: found?.script?.trim() || '',
        description: found?.description?.trim() || raw.thesis,
        cta: found?.cta?.trim() || '',
        hashtags: this.cleanStrings(found?.hashtags),
        slides: this.cleanStrings(found?.slides),
        rationale: found?.rationale?.trim() || '',
      };
    });

    return {
      title: raw.title?.trim() || 'Untitled HSAKAA content candidate',
      thesis: raw.thesis?.trim() || '',
      whyNow: raw.whyNow?.trim() || '',
      canonicalBody: raw.canonicalBody?.trim() || '',
      story: raw.story?.trim() || '',
      evidence: this.cleanStrings(raw.evidence),
      contentPillars: this.cleanStrings(raw.contentPillars),
      audiences: this.cleanStrings(raw.audiences),
      goals: (raw.goals ?? []).filter((goal) =>
        Object.values(MediaGoal).includes(goal),
      ),
      rationale: raw.rationale?.trim() || '',
      publications: publications as Omit<
        MediaDirectorPublicationDraft,
        'noveltyScore' | 'repetitionRisk' | 'allowed' | 'closestSimilarity'
      >[] as MediaDirectorPublicationDraft[],
    };
  }

  private buildStrategySnapshot(
    accounts: Awaited<ReturnType<MediaCoreService['listAccounts']>>,
    platforms: MediaPlatform[],
    dto: GenerateMediaContentBatchDto,
  ) {
    return {
      requested: {
        goals: dto.goals ?? [],
        contentPillars: dto.contentPillars ?? [],
        audiences: dto.audiences ?? [],
        whyNow: dto.whyNow,
        constraints: dto.constraints ?? [],
      },
      accounts: accounts
        .filter((account) => platforms.includes(account.platform))
        .map((account) => ({
          platform: account.platform,
          displayName: account.displayName,
          strategy: account.strategy,
          capabilities: account.capabilities,
        })),
    };
  }

  private buildContextSummary(
    dto: GenerateMediaContentBatchDto,
    recentContent: unknown[],
    recentMemories: unknown[],
  ) {
    const content = recentContent.map((item) => {
      const record = this.toRecord(item);
      return {
        title: record.title,
        thesis: record.thesis,
        pillars: record.contentPillars,
        origin: record.origin,
      };
    });
    const memory = recentMemories.map((item) => {
      const record = this.toRecord(item);
      return {
        title: record.title,
        topic: record.topic,
        angle: record.angle,
        risk: record.repetitionRisk,
        status: record.status,
      };
    });
    return JSON.stringify({
      userContext: dto.contextSummary ?? '',
      recentCanonicalContent: content,
      recentContentMemory: memory,
    });
  }

  private resolvePlatforms(
    requested: MediaPlatform[] | undefined,
    accounts: Awaited<ReturnType<MediaCoreService['listAccounts']>>,
  ) {
    if (requested?.length) return [...new Set(requested)];
    const configured = accounts
      .filter((account) => account.isActive !== false)
      .map((account) => account.platform)
      .filter((platform) => GROWTH_PLATFORMS.includes(platform));
    return [...new Set(configured)];
  }

  private runStatus(candidates: MediaDirectorCandidate[]) {
    const accepted = candidates.filter(
      (candidate) => candidate.status === 'accepted',
    ).length;
    const rejected = candidates.filter(
      (candidate) => candidate.status === 'rejected',
    ).length;
    const actionable = candidates.filter(
      (candidate) => candidate.status !== 'blocked',
    ).length;
    if (actionable > 0 && accepted === actionable)
      return MediaGenerationRunStatus.ACCEPTED;
    if (actionable > 0 && rejected === actionable)
      return MediaGenerationRunStatus.REJECTED;
    if (accepted > 0 || rejected > 0)
      return MediaGenerationRunStatus.PARTIALLY_ACCEPTED;
    return MediaGenerationRunStatus.GENERATED;
  }

  private candidatesFrom(value: Array<Record<string, unknown>> | undefined) {
    return (Array.isArray(value)
      ? value
      : []) as unknown as MediaDirectorCandidate[];
  }

  private candidateText(candidate: MediaDirectorCandidate) {
    return [
      candidate.title,
      candidate.thesis,
      candidate.canonicalBody,
      candidate.story,
    ].join(' ');
  }

  private lexicalSimilarity(first: string, second: string) {
    const firstTokens = new Set(this.tokens(first));
    const secondTokens = new Set(this.tokens(second));
    if (!firstTokens.size || !secondTokens.size) return 0;
    const intersection = [...firstTokens].filter((token) =>
      secondTokens.has(token),
    ).length;
    const union = new Set([...firstTokens, ...secondTokens]).size;
    return union ? intersection / union : 0;
  }

  private tokens(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2);
  }

  private cleanStrings(values: string[] | undefined) {
    return [
      ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    ];
  }

  private objectId(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('Invalid MongoDB identifier.');
    return new Types.ObjectId(id);
  }

  private toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private emptyUsage(): AiGenerationUsage {
    return {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      reasoningTokens: 0,
    };
  }
}
