import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import {
  MediaCandidateFingerprintDto,
  MediaIntelligenceBackfillDto,
  RecordRejectedMediaCandidateDto,
} from './dto/media-core.dto';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import {
  MediaContentMemory,
  MediaContentMemoryDocument,
  MediaContentMemoryScope,
  MediaContentMemoryStatus,
  MediaRepetitionRisk,
} from './schemas/media-content-memory.schema';
import {
  MediaGenerationRun,
  MediaGenerationRunDocument,
} from './schemas/media-generation-run.schema';
import { MediaPlatform, MediaPostType } from './schemas/media-post.schema';
import {
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

export interface MediaContentFingerprint {
  title: string;
  topic: string;
  thesis: string;
  angle: string;
  hookArchetype: string;
  openingPattern: string;
  storyKeys: string[];
  exampleKeys: string[];
  structure: string[];
  ctaArchetype: string;
  visualConcept: string;
  keyPhrases: string[];
  entities: string[];
  emotionalTone: string;
  normalizedText: string;
  lexicalSignature: string[];
}

export interface MediaContentSimilarityResult {
  memoryId: Types.ObjectId;
  contentItemId?: Types.ObjectId;
  publicationId?: Types.ObjectId;
  score: number;
  semanticScore?: number;
  lexicalScore: number;
  componentScore: number;
  reasons: string[];
}

export interface MediaCandidateAnalysis {
  fingerprint: MediaContentFingerprint;
  embedding?: number[];
  embeddingModel?: string;
  noveltyScore: number;
  repetitionRisk: MediaRepetitionRisk;
  similarMatches: MediaContentSimilarityResult[];
  allowed: boolean;
  intentionalRepurpose: boolean;
}

const STOP_WORDS = new Set([
  'a',
  'about',
  'after',
  'all',
  'also',
  'am',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'had',
  'has',
  'have',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'more',
  'my',
  'of',
  'on',
  'or',
  'our',
  'so',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'why',
  'will',
  'with',
  'you',
  'your',
]);

@Injectable()
export class MediaContentIntelligenceService {
  constructor(
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaContentMemory.name)
    private readonly memoryModel: Model<MediaContentMemoryDocument>,
    @InjectModel(MediaGenerationRun.name)
    private readonly generationRunModel: Model<MediaGenerationRunDocument>,
    private readonly aiService: AiService,
  ) {}

  async overview() {
    const [
      contentItems,
      publications,
      indexedContent,
      indexedPublications,
      rejected,
      highRisk,
    ] = await Promise.all([
      this.contentModel.countDocuments({ isActive: true }),
      this.publicationModel.countDocuments({ isActive: true }),
      this.memoryModel.countDocuments({
        isActive: true,
        scope: MediaContentMemoryScope.CONTENT,
      }),
      this.memoryModel.countDocuments({
        isActive: true,
        scope: MediaContentMemoryScope.PUBLICATION,
      }),
      this.memoryModel.countDocuments({
        isActive: true,
        status: MediaContentMemoryStatus.REJECTED,
      }),
      this.memoryModel.countDocuments({
        isActive: true,
        repetitionRisk: {
          $in: [MediaRepetitionRisk.HIGH, MediaRepetitionRisk.BLOCKED],
        },
      }),
    ]);

    return {
      contentItems,
      publications,
      indexedContent,
      indexedPublications,
      contentCoveragePercent: this.percent(indexedContent, contentItems),
      publicationCoveragePercent: this.percent(
        indexedPublications,
        publications,
      ),
      rejectedCandidatesRemembered: rejected,
      highRiskMemories: highRisk,
      embeddingModel: this.aiService.getEmbeddingModel(),
      policy: {
        blockedSimilarity: 0.9,
        highSimilarity: 0.8,
        mediumSimilarity: 0.68,
        intentionalRepurposeCanOverride: true,
      },
    };
  }

  listMemories(options?: {
    scope?: MediaContentMemoryScope;
    risk?: MediaRepetitionRisk;
    limit?: number;
  }) {
    const filter: Record<string, unknown> = { isActive: true };
    if (options?.scope) filter.scope = options.scope;
    if (options?.risk) filter.repetitionRisk = options.risk;
    return this.memoryModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(options?.limit ?? 50, 1), 200))
      .lean();
  }

  planningFingerprintContext(limit = 120) {
    const safeLimit = Math.min(Math.max(Math.trunc(limit || 120), 20), 240);
    return this.memoryModel
      .find({
        isActive: true,
        status: MediaContentMemoryStatus.ACTIVE,
        scope: {
          $in: [
            MediaContentMemoryScope.CONTENT,
            MediaContentMemoryScope.PUBLICATION,
          ],
        },
      })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select(
        'scope contentItemId publicationId platform format title topic thesis angle hookArchetype openingPattern storyKeys exampleKeys structure ctaArchetype visualConcept keyPhrases lexicalSignature createdAt',
      )
      .lean();
  }

  async analyzeContentItem(contentItemId: string, refresh = false) {
    const content = await this.contentModel.findOne({
      _id: this.objectId(contentItemId),
      isActive: true,
    });
    if (!content) throw new NotFoundException('Media content item not found.');

    const existing = await this.memoryModel.findOne({
      contentItemId: content._id,
      scope: MediaContentMemoryScope.CONTENT,
      isActive: true,
    });
    if (existing && !refresh) return existing;

    const candidate: MediaCandidateFingerprintDto = {
      title: content.title,
      thesis: content.thesis,
      whyNow: content.whyNow,
      canonicalBody: content.canonicalBody,
      story: content.story,
      evidence: content.evidence ?? [],
      contentPillars: content.contentPillars ?? [],
      audiences: content.audiences ?? [],
    };
    const analysis = await this.analyzeCandidate(candidate, {
      scope: MediaContentMemoryScope.CONTENT,
      excludeMemoryId: existing?._id,
    });

    return this.memoryModel.findOneAndUpdate(
      {
        contentItemId: content._id,
        scope: MediaContentMemoryScope.CONTENT,
      },
      {
        $set: this.analysisToMemory(analysis, {
          scope: MediaContentMemoryScope.CONTENT,
          contentItemId: content._id,
          title: content.title,
          status: MediaContentMemoryStatus.ACTIVE,
          metadata: {
            origin: content.origin,
            generationRunId: content.generationRunId
              ? String(content.generationRunId)
              : undefined,
          },
        }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async analyzePublication(publicationId: string, refresh = false) {
    const publication = await this.publicationModel.findOne({
      _id: this.objectId(publicationId),
      isActive: true,
    });
    if (!publication)
      throw new NotFoundException('Media publication not found.');

    const content = await this.contentModel.findById(publication.contentItemId);
    const existing = await this.memoryModel.findOne({
      publicationId: publication._id,
      scope: MediaContentMemoryScope.PUBLICATION,
      isActive: true,
    });
    if (existing && !refresh) return existing;

    const candidate: MediaCandidateFingerprintDto = {
      title: publication.title ?? content?.title ?? 'Untitled publication',
      thesis: content?.thesis,
      canonicalBody: content?.canonicalBody,
      story: content?.story,
      platform: publication.platform,
      format: publication.format,
      hook: publication.hook,
      caption: publication.caption,
      script: publication.script,
      description: publication.description,
      cta: publication.cta,
      slides: publication.slides ?? [],
      intentionalRepurpose: publication.intentionalRepurpose,
      sourceContentItemId: String(publication.contentItemId),
    };
    const analysis = await this.analyzeCandidate(candidate, {
      scope: MediaContentMemoryScope.PUBLICATION,
      excludeMemoryId: existing?._id,
    });

    return this.memoryModel.findOneAndUpdate(
      {
        publicationId: publication._id,
        scope: MediaContentMemoryScope.PUBLICATION,
      },
      {
        $set: this.analysisToMemory(analysis, {
          scope: MediaContentMemoryScope.PUBLICATION,
          contentItemId: publication.contentItemId,
          publicationId: publication._id,
          platform: publication.platform,
          format: publication.format,
          title: candidate.title,
          status: MediaContentMemoryStatus.ACTIVE,
          metadata: {
            generationRunId: publication.generationRunId
              ? String(publication.generationRunId)
              : undefined,
          },
        }),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async checkCandidate(dto: MediaCandidateFingerprintDto) {
    return this.analyzeCandidate(dto, {
      scope:
        dto.platform || dto.format
          ? MediaContentMemoryScope.PUBLICATION
          : MediaContentMemoryScope.CONTENT,
    });
  }

  async recordRejectedCandidate(dto: RecordRejectedMediaCandidateDto) {
    const analysis = await this.analyzeCandidate(dto, {
      scope: MediaContentMemoryScope.REJECTED_CANDIDATE,
    });
    const memory = await this.memoryModel.create(
      this.analysisToMemory(analysis, {
        scope: MediaContentMemoryScope.REJECTED_CANDIDATE,
        generationRunId: dto.generationRunId
          ? this.objectId(dto.generationRunId)
          : undefined,
        platform: dto.platform,
        format: dto.format,
        title: dto.title,
        status: MediaContentMemoryStatus.REJECTED,
        metadata: {
          ...(dto.metadata ?? {}),
          rejectionReason: dto.rejectionReason,
        },
      }),
    );

    if (dto.generationRunId) {
      await this.generationRunModel.updateOne(
        { _id: this.objectId(dto.generationRunId), isActive: true },
        { $addToSet: { rejectedMemoryIds: memory._id } },
      );
    }

    return memory;
  }

  async backfill(dto: MediaIntelligenceBackfillDto) {
    const limit = Math.min(Math.max(dto.limit ?? 100, 1), 500);
    const refresh = dto.refresh ?? false;
    const includePublications = dto.includePublications ?? true;

    const contentFilter: Record<string, unknown> = { isActive: true };
    if (!refresh) {
      const indexed = await this.memoryModel.distinct('contentItemId', {
        isActive: true,
        scope: MediaContentMemoryScope.CONTENT,
        contentItemId: { $exists: true },
      });
      if (indexed.length) contentFilter._id = { $nin: indexed };
    }

    const contents = await this.contentModel
      .find(contentFilter)
      .sort({ createdAt: 1 })
      .limit(limit)
      .select('_id')
      .lean();

    let indexedContent = 0;
    const failures: Array<{ id: string; kind: string; error: string }> = [];
    for (const content of contents) {
      try {
        await this.analyzeContentItem(String(content._id), refresh);
        indexedContent += 1;
      } catch (error) {
        failures.push({
          id: String(content._id),
          kind: 'content',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    let indexedPublications = 0;
    if (includePublications) {
      const publicationFilter: Record<string, unknown> = { isActive: true };
      if (!refresh) {
        const indexed = await this.memoryModel.distinct('publicationId', {
          isActive: true,
          scope: MediaContentMemoryScope.PUBLICATION,
          publicationId: { $exists: true },
        });
        if (indexed.length) publicationFilter._id = { $nin: indexed };
      }
      const publications = await this.publicationModel
        .find(publicationFilter)
        .sort({ createdAt: 1 })
        .limit(limit)
        .select('_id')
        .lean();
      for (const publication of publications) {
        try {
          await this.analyzePublication(String(publication._id), refresh);
          indexedPublications += 1;
        } catch (error) {
          failures.push({
            id: String(publication._id),
            kind: 'publication',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return {
      indexedContent,
      indexedPublications,
      failures,
      overview: await this.overview(),
    };
  }

  private async analyzeCandidate(
    dto: MediaCandidateFingerprintDto,
    options: {
      scope: MediaContentMemoryScope;
      excludeMemoryId?: Types.ObjectId;
    },
  ): Promise<MediaCandidateAnalysis> {
    const fingerprint = await this.buildFingerprint(dto);
    let embedding: number[] | undefined;
    let embeddingModel: string | undefined;

    try {
      const result = await this.aiService.generateEmbedding(
        fingerprint.normalizedText,
      );
      embedding = result.embedding;
      embeddingModel = result.model;
    } catch {
      // A content write/check should degrade to lexical matching if embeddings
      // are temporarily unavailable. Backfill can enrich it later.
    }

    const matches = await this.findSimilar(
      fingerprint,
      embedding,
      options.scope,
      options.excludeMemoryId,
    );
    const maxSimilarity = matches[0]?.score ?? 0;
    const repetitionRisk = this.riskFor(maxSimilarity);
    const intentionalRepurpose = dto.intentionalRepurpose ?? false;

    return {
      fingerprint,
      embedding,
      embeddingModel,
      noveltyScore: Math.max(0, Math.round((1 - maxSimilarity) * 100)),
      repetitionRisk,
      similarMatches: matches.slice(0, 5),
      allowed:
        repetitionRisk !== MediaRepetitionRisk.BLOCKED || intentionalRepurpose,
      intentionalRepurpose,
    };
  }

  private async buildFingerprint(
    dto: MediaCandidateFingerprintDto,
  ): Promise<MediaContentFingerprint> {
    const normalizedText = this.buildNormalizedText(dto);
    const fallback = this.fallbackFingerprint(dto, normalizedText);

    try {
      const response = await this.aiService.generateStructuredResponse<{
        topic: string;
        angle: string;
        hookArchetype: string;
        openingPattern: string;
        storyKeys: string[];
        exampleKeys: string[];
        structure: string[];
        ctaArchetype: string;
        visualConcept: string;
        keyPhrases: string[];
        entities: string[];
        emotionalTone: string;
      }>({
        name: 'media_content_fingerprint',
        instructions:
          'Extract a compact anti-repetition fingerprint from the supplied content. Preserve meaning, do not invent facts, and describe patterns abstractly enough to detect a repeated angle, hook, story, example, structure or CTA even when wording changes. Return empty strings/arrays when evidence is absent.',
        input: normalizedText,
        verbosity: 'low',
        schema: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            angle: { type: 'string' },
            hookArchetype: { type: 'string' },
            openingPattern: { type: 'string' },
            storyKeys: { type: 'array', items: { type: 'string' } },
            exampleKeys: { type: 'array', items: { type: 'string' } },
            structure: { type: 'array', items: { type: 'string' } },
            ctaArchetype: { type: 'string' },
            visualConcept: { type: 'string' },
            keyPhrases: { type: 'array', items: { type: 'string' } },
            entities: { type: 'array', items: { type: 'string' } },
            emotionalTone: { type: 'string' },
          },
          required: [
            'topic',
            'angle',
            'hookArchetype',
            'openingPattern',
            'storyKeys',
            'exampleKeys',
            'structure',
            'ctaArchetype',
            'visualConcept',
            'keyPhrases',
            'entities',
            'emotionalTone',
          ],
          additionalProperties: false,
        },
      });

      return {
        ...fallback,
        topic: response.data.topic || fallback.topic,
        angle: response.data.angle || fallback.angle,
        hookArchetype: response.data.hookArchetype || fallback.hookArchetype,
        openingPattern: response.data.openingPattern || fallback.openingPattern,
        storyKeys: this.cleanStrings(response.data.storyKeys),
        exampleKeys: this.cleanStrings(response.data.exampleKeys),
        structure: this.cleanStrings(response.data.structure),
        ctaArchetype: response.data.ctaArchetype || fallback.ctaArchetype,
        visualConcept: response.data.visualConcept || fallback.visualConcept,
        keyPhrases: this.cleanStrings(response.data.keyPhrases),
        entities: this.cleanStrings(response.data.entities),
        emotionalTone: response.data.emotionalTone || fallback.emotionalTone,
      };
    } catch {
      return fallback;
    }
  }

  private fallbackFingerprint(
    dto: MediaCandidateFingerprintDto,
    normalizedText: string,
  ): MediaContentFingerprint {
    return {
      title: dto.title.trim(),
      topic: dto.title.trim(),
      thesis: dto.thesis?.trim() ?? '',
      angle: dto.thesis?.trim() ?? dto.whyNow?.trim() ?? '',
      hookArchetype: dto.hook?.trim() ?? '',
      openingPattern: dto.hook?.trim() ?? '',
      storyKeys: this.cleanStrings(dto.story ? [dto.story] : []),
      exampleKeys: this.cleanStrings(dto.evidence ?? []),
      structure: this.cleanStrings(dto.slides ?? []),
      ctaArchetype: dto.cta?.trim() ?? '',
      visualConcept: '',
      keyPhrases: this.lexicalSignature(normalizedText).slice(0, 12),
      entities: [],
      emotionalTone: '',
      normalizedText,
      lexicalSignature: this.lexicalSignature(normalizedText),
    };
  }

  private async findSimilar(
    fingerprint: MediaContentFingerprint,
    embedding: number[] | undefined,
    scope: MediaContentMemoryScope,
    excludeMemoryId?: Types.ObjectId,
  ): Promise<MediaContentSimilarityResult[]> {
    const comparableScopes =
      scope === MediaContentMemoryScope.PUBLICATION
        ? [
            MediaContentMemoryScope.PUBLICATION,
            MediaContentMemoryScope.REJECTED_CANDIDATE,
          ]
        : [
            MediaContentMemoryScope.CONTENT,
            MediaContentMemoryScope.REJECTED_CANDIDATE,
          ];
    const filter: Record<string, unknown> = {
      isActive: true,
      status: {
        $in: [
          MediaContentMemoryStatus.ACTIVE,
          MediaContentMemoryStatus.REJECTED,
        ],
      },
      scope: { $in: comparableScopes },
    };
    if (excludeMemoryId) filter._id = { $ne: excludeMemoryId };

    const memories = await this.memoryModel
      .find(filter)
      .select('+embedding')
      .sort({ createdAt: -1 })
      .limit(2000)
      .exec();

    return memories
      .map((memory) => {
        const lexicalScore = this.jaccard(
          fingerprint.lexicalSignature,
          memory.lexicalSignature ?? [],
        );
        const component = this.componentSimilarity(fingerprint, memory);
        const semantic =
          embedding?.length && memory.embedding?.length
            ? this.cosine(embedding, memory.embedding)
            : undefined;
        const blendedScore =
          semantic === undefined
            ? lexicalScore * 0.62 + component.score * 0.38
            : semantic * 0.55 + lexicalScore * 0.25 + component.score * 0.2;
        const score = this.clamp(
          component.score >= 0.9 && component.reasons.length >= 2
            ? Math.max(blendedScore, 0.92)
            : blendedScore,
        );
        return {
          memoryId: memory._id,
          contentItemId: memory.contentItemId,
          publicationId: memory.publicationId,
          score: this.round(score),
          semanticScore:
            semantic === undefined ? undefined : this.round(semantic),
          lexicalScore: this.round(lexicalScore),
          componentScore: this.round(component.score),
          reasons: component.reasons,
        };
      })
      .filter((match) => match.score >= 0.45)
      .sort((left, right) => right.score - left.score);
  }

  private componentSimilarity(
    fingerprint: MediaContentFingerprint,
    memory: MediaContentMemoryDocument,
  ) {
    const checks: Array<{ label: string; score: number }> = [
      {
        label: 'topic',
        score: this.textTokenSimilarity(fingerprint.topic, memory.topic ?? ''),
      },
      {
        label: 'angle',
        score: this.textTokenSimilarity(fingerprint.angle, memory.angle ?? ''),
      },
      {
        label: 'hook pattern',
        score: this.textTokenSimilarity(
          fingerprint.hookArchetype,
          memory.hookArchetype ?? '',
        ),
      },
      {
        label: 'story/example',
        score: Math.max(
          this.jaccard(fingerprint.storyKeys, memory.storyKeys ?? []),
          this.jaccard(fingerprint.exampleKeys, memory.exampleKeys ?? []),
        ),
      },
      {
        label: 'structure',
        score: this.jaccard(fingerprint.structure, memory.structure ?? []),
      },
      {
        label: 'CTA',
        score: this.textTokenSimilarity(
          fingerprint.ctaArchetype,
          memory.ctaArchetype ?? '',
        ),
      },
    ];
    const meaningful = checks.filter((item) => item.score > 0);
    const score = meaningful.length
      ? meaningful.reduce((sum, item) => sum + item.score, 0) /
        meaningful.length
      : 0;
    return {
      score,
      reasons: checks
        .filter((item) => item.score >= 0.7)
        .map((item) => `Similar ${item.label}`),
    };
  }

  private analysisToMemory(
    analysis: MediaCandidateAnalysis,
    base: {
      scope: MediaContentMemoryScope;
      contentItemId?: Types.ObjectId;
      publicationId?: Types.ObjectId;
      generationRunId?: Types.ObjectId;
      platform?: MediaPlatform;
      format?: MediaPostType;
      title?: string;
      status: MediaContentMemoryStatus;
      metadata?: Record<string, unknown>;
    },
  ) {
    return {
      ...base,
      title: base.title ?? analysis.fingerprint.title,
      topic: analysis.fingerprint.topic,
      thesis: analysis.fingerprint.thesis,
      angle: analysis.fingerprint.angle,
      hookArchetype: analysis.fingerprint.hookArchetype,
      openingPattern: analysis.fingerprint.openingPattern,
      storyKeys: analysis.fingerprint.storyKeys,
      exampleKeys: analysis.fingerprint.exampleKeys,
      structure: analysis.fingerprint.structure,
      ctaArchetype: analysis.fingerprint.ctaArchetype,
      visualConcept: analysis.fingerprint.visualConcept,
      keyPhrases: analysis.fingerprint.keyPhrases,
      entities: analysis.fingerprint.entities,
      emotionalTone: analysis.fingerprint.emotionalTone,
      normalizedText: analysis.fingerprint.normalizedText,
      lexicalSignature: analysis.fingerprint.lexicalSignature,
      embedding: analysis.embedding,
      embeddingModel: analysis.embeddingModel,
      embeddingGeneratedAt: analysis.embedding ? new Date() : undefined,
      noveltyScore: analysis.noveltyScore,
      repetitionRisk: analysis.repetitionRisk,
      similarMatches: analysis.similarMatches,
      intentionalRepurpose: analysis.intentionalRepurpose,
      isActive: true,
    };
  }

  private buildNormalizedText(dto: MediaCandidateFingerprintDto) {
    return [
      `Title: ${dto.title}`,
      dto.thesis ? `Thesis: ${dto.thesis}` : '',
      dto.whyNow ? `Why now: ${dto.whyNow}` : '',
      dto.canonicalBody ? `Body: ${dto.canonicalBody}` : '',
      dto.story ? `Story: ${dto.story}` : '',
      dto.evidence?.length ? `Evidence: ${dto.evidence.join(' | ')}` : '',
      dto.contentPillars?.length
        ? `Pillars: ${dto.contentPillars.join(', ')}`
        : '',
      dto.audiences?.length ? `Audience: ${dto.audiences.join(', ')}` : '',
      dto.platform ? `Platform: ${dto.platform}` : '',
      dto.format ? `Format: ${dto.format}` : '',
      dto.hook ? `Hook: ${dto.hook}` : '',
      dto.caption ? `Caption: ${dto.caption}` : '',
      dto.script ? `Script: ${dto.script}` : '',
      dto.description ? `Description: ${dto.description}` : '',
      dto.cta ? `CTA: ${dto.cta}` : '',
      dto.slides?.length ? `Slides: ${dto.slides.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private lexicalSignature(input: string) {
    const unique = new Set(
      input
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
    );
    return [...unique].slice(0, 80);
  }

  private textTokenSimilarity(left: string, right: string) {
    if (!left.trim() || !right.trim()) return 0;
    return this.jaccard(
      this.lexicalSignature(left),
      this.lexicalSignature(right),
    );
  }

  private jaccard(left: string[], right: string[]) {
    const leftSet = new Set(
      left.map((item) => item.toLowerCase().trim()).filter(Boolean),
    );
    const rightSet = new Set(
      right.map((item) => item.toLowerCase().trim()).filter(Boolean),
    );
    if (!leftSet.size || !rightSet.size) return 0;
    let intersection = 0;
    for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
    const union = new Set([...leftSet, ...rightSet]).size;
    return union ? intersection / union : 0;
  }

  private cosine(left: number[], right: number[]) {
    if (left.length !== right.length || !left.length) return 0;
    let dot = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
      const leftValue = left[index] ?? 0;
      const rightValue = right[index] ?? 0;
      dot += leftValue * rightValue;
      leftMagnitude += leftValue * leftValue;
      rightMagnitude += rightValue * rightValue;
    }
    if (!leftMagnitude || !rightMagnitude) return 0;
    return this.clamp(
      dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)),
    );
  }

  private riskFor(similarity: number) {
    if (similarity >= 0.9) return MediaRepetitionRisk.BLOCKED;
    if (similarity >= 0.8) return MediaRepetitionRisk.HIGH;
    if (similarity >= 0.68) return MediaRepetitionRisk.MEDIUM;
    return MediaRepetitionRisk.LOW;
  }

  private cleanStrings(values: string[]) {
    return [
      ...new Set(values.map((value) => value.trim()).filter(Boolean)),
    ].slice(0, 30);
  }

  private percent(part: number, total: number) {
    if (!total) return 100;
    return Math.round((part / total) * 100);
  }

  private round(value: number) {
    return Math.round(value * 1000) / 1000;
  }

  private clamp(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value))
      throw new NotFoundException('Invalid Media identifier.');
    return new Types.ObjectId(value);
  }
}
