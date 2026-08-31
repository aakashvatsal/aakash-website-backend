import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import {
  GenerateMediaProductionPackDto,
  UpdateMediaProductionAssetDto,
} from './dto/media-core.dto';
import {
  MediaAsset,
  MediaAssetDocument,
  MediaAssetStatus,
  MediaAssetType,
} from './schemas/media-asset.schema';
import {
  MediaContentItem,
  MediaContentItemDocument,
} from './schemas/media-content-item.schema';
import {
  MediaGenerationPurpose,
  MediaGenerationRun,
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';
import { MediaPostStatus, MediaSourceType } from './schemas/media-post.schema';
import {
  MediaProductionAssetRequirement,
  MediaProductionBroll,
  MediaProductionCameraInstructions,
  MediaProductionCarouselSlide,
  MediaProductionEditInstructions,
  MediaProductionOrigin,
  MediaProductionShot,
  MediaProductionStatus,
  MediaProductionThumbnail,
  MediaProductionVisualDirection,
  MediaPublication,
  MediaPublicationDocument,
} from './schemas/media-publication.schema';

interface GeneratedProductionPack {
  finalScript: string;
  teleprompterScript: string;
  talkingPoints: string[];
  shotList: MediaProductionShot[];
  broll: MediaProductionBroll[];
  carouselSlides: MediaProductionCarouselSlide[];
  thumbnail: MediaProductionThumbnail;
  visualDirection: MediaProductionVisualDirection;
  cameraInstructions: MediaProductionCameraInstructions;
  editInstructions: MediaProductionEditInstructions;
  assetRequirements: MediaProductionAssetRequirement[];
  equipment: string[];
  publishChecklist: string[];
  risks: string[];
  notes: string;
}

@Injectable()
export class MediaProductionService {
  constructor(
    @InjectModel(MediaPublication.name)
    private readonly publicationModel: Model<MediaPublicationDocument>,
    @InjectModel(MediaContentItem.name)
    private readonly contentModel: Model<MediaContentItemDocument>,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    @InjectModel(MediaGenerationRun.name)
    private readonly generationRunModel: Model<MediaGenerationRunDocument>,
    private readonly aiService: AiService,
  ) {}

  async overview() {
    const statuses = Object.values(MediaProductionStatus);
    const [total, grouped] = await Promise.all([
      this.publicationModel.countDocuments({ isActive: true }),
      Promise.all(
        statuses.map(async (status) => ({
          status,
          count: await this.publicationModel.countDocuments({
            isActive: true,
            productionStatus: status,
          }),
        })),
      ),
    ]);
    const counts = Object.fromEntries(
      grouped.map((item) => [item.status, item.count]),
    ) as Record<MediaProductionStatus, number>;

    return {
      totalPublications: total,
      counts,
      readyForCalendar:
        (counts[MediaProductionStatus.READY] ?? 0) +
        (counts[MediaProductionStatus.COMPLETE] ?? 0),
      policy: {
        writesCanonicalPublicationSchema: true,
        generatedPlansNeverPublish: true,
        publishingOwnedByPhase6E: true,
        assetReadinessControlsPublicationReadiness: true,
      },
    };
  }

  async listStudio() {
    const publications = await this.publicationModel
      .find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    const contentIds = [
      ...new Set(publications.map((item) => item.contentItemId.toString())),
    ].map((id) => this.objectId(id));
    const content = await this.contentModel
      .find({ _id: { $in: contentIds }, isActive: true })
      .lean();
    const contentMap = new Map(
      content.map((item) => [item._id.toString(), item]),
    );
    const assets = await this.assetModel
      .find({
        publicationId: { $in: publications.map((item) => item._id) },
        isActive: true,
      })
      .lean();
    const assetsByPublication = new Map<string, typeof assets>();
    for (const asset of assets) {
      const key = asset.publicationId?.toString();
      if (!key) continue;
      assetsByPublication.set(key, [
        ...(assetsByPublication.get(key) ?? []),
        asset,
      ]);
    }

    return publications.map((publication) => ({
      publication,
      contentItem: contentMap.get(publication.contentItemId.toString()),
      assets: assetsByPublication.get(publication._id.toString()) ?? [],
      readiness: this.readiness(
        publication,
        assetsByPublication.get(publication._id.toString()) ?? [],
      ),
    }));
  }

  async getPack(publicationId: string) {
    const publication = await this.publicationModel.findOne({
      _id: this.objectId(publicationId),
      isActive: true,
    });
    if (!publication)
      throw new NotFoundException('Media publication not found.');

    const [contentItem, assets] = await Promise.all([
      this.contentModel.findOne({
        _id: publication.contentItemId,
        isActive: true,
      }),
      this.assetModel
        .find({ publicationId: publication._id, isActive: true })
        .sort({ createdAt: 1 }),
    ]);
    if (!contentItem) {
      throw new NotFoundException('Canonical Media content not found.');
    }

    return {
      publication,
      contentItem,
      assets,
      readiness: this.readiness(publication, assets),
    };
  }

  async generate(
    publicationId: string,
    dto: GenerateMediaProductionPackDto = {},
  ) {
    const current = await this.getPack(publicationId);
    const publication = current.publication;
    const contentItem = current.contentItem;

    if (
      [
        MediaPostStatus.SCHEDULED,
        MediaPostStatus.POSTED,
        MediaPostStatus.CANCELLED,
      ].includes(publication.status)
    ) {
      throw new ConflictException(
        'Scheduled, posted or cancelled publications cannot be regenerated in Production Studio.',
      );
    }

    if (publication.production && !dto.force) {
      return { ...current, alreadyGenerated: true };
    }

    publication.productionStatus = MediaProductionStatus.PLANNING;
    await publication.save();

    const run = await this.generationRunModel.create({
      purpose: MediaGenerationPurpose.PRODUCTION,
      status: MediaGenerationRunStatus.GENERATING,
      aiModel: this.aiService.getModel(),
      promptVersion: 'media-production-6d-v1',
      brief: `Prepare production for ${publication.platform}/${publication.format}: ${contentItem.title}`,
      requestedPlatforms: [publication.platform],
      acceptedContentItemIds: [contentItem._id],
      candidateCount: 0,
      metadata: {
        publicationId: publication._id.toString(),
        productionVersion: (publication.productionVersion ?? 0) + 1,
        instructions: dto.instructions?.trim(),
      },
    });

    try {
      const generated = await this.generateWithAi({
        publication,
        contentItem,
        instructions: dto.instructions?.trim(),
      });
      const plan = this.normalizePlan(generated.data);

      publication.production = {
        ...plan,
        origin: MediaProductionOrigin.HSAKAA,
        generatedAt: new Date(),
        aiModel: generated.model,
        responseId: generated.responseId,
        promptVersion: 'media-production-6d-v1',
      };
      publication.productionVersion = (publication.productionVersion ?? 0) + 1;
      publication.productionRunId = run._id;
      publication.productionStatus = plan.assetRequirements.some(
        (item) => item.required,
      )
        ? MediaProductionStatus.ASSETS_PENDING
        : MediaProductionStatus.PLAN_READY;
      publication.status = plan.assetRequirements.some((item) => item.required)
        ? MediaPostStatus.ASSETS_PENDING
        : MediaPostStatus.SCRIPT_READY;
      await publication.save();

      await this.syncAssets(publication, plan.assetRequirements);
      const refreshed = await this.refreshReadiness(publication._id.toString());

      run.status = MediaGenerationRunStatus.ACCEPTED;
      run.aiModel = generated.model;
      run.responseId = generated.responseId;
      run.metadata = {
        ...(run.metadata ?? {}),
        usage: generated.usage,
        productionStatus: refreshed.publication.productionStatus,
      };
      await run.save();

      return { ...refreshed, alreadyGenerated: false };
    } catch (error) {
      publication.productionStatus = MediaProductionStatus.BLOCKED;
      await publication.save();
      run.status = MediaGenerationRunStatus.FAILED;
      run.metadata = {
        ...(run.metadata ?? {}),
        error:
          error instanceof Error ? error.message : 'Unknown production error',
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
        'HSAKAA could not prepare this production pack. Please try again.',
      );
    }
  }

  async updateAsset(assetId: string, dto: UpdateMediaProductionAssetDto) {
    const asset = await this.assetModel.findOne({
      _id: this.objectId(assetId),
      isActive: true,
    });
    if (!asset) throw new NotFoundException('Media asset not found.');

    if (dto.status !== undefined) asset.status = dto.status;
    if (dto.source !== undefined) asset.source = dto.source;
    if (dto.url !== undefined) asset.url = dto.url.trim() || undefined;
    if (dto.storageKey !== undefined) {
      asset.storageKey = dto.storageKey.trim() || undefined;
    }
    if (dto.notes !== undefined) asset.notes = dto.notes.trim() || undefined;
    await asset.save();

    if (!asset.publicationId) return { asset };
    const pack = await this.refreshReadiness(asset.publicationId.toString());
    return { asset, ...pack };
  }

  async markComplete(publicationId: string) {
    const pack = await this.refreshReadiness(publicationId);
    if (!pack.readiness.ready) {
      throw new ConflictException(
        'Complete the required production assets before marking this publication complete.',
      );
    }
    pack.publication.productionStatus = MediaProductionStatus.COMPLETE;
    if (
      ![MediaPostStatus.SCHEDULED, MediaPostStatus.POSTED].includes(
        pack.publication.status,
      )
    ) {
      pack.publication.status = MediaPostStatus.READY;
    }
    await pack.publication.save();
    return this.getPack(publicationId);
  }

  async refreshReadiness(publicationId: string) {
    const pack = await this.getPack(publicationId);
    const { publication, assets } = pack;
    if (!publication.production) return pack;

    const readiness = this.readiness(publication, assets);
    if (publication.productionStatus !== MediaProductionStatus.COMPLETE) {
      if (readiness.ready) {
        publication.productionStatus = MediaProductionStatus.READY;
        if (
          ![MediaPostStatus.SCHEDULED, MediaPostStatus.POSTED].includes(
            publication.status,
          )
        ) {
          publication.status = MediaPostStatus.READY;
        }
      } else {
        publication.productionStatus = MediaProductionStatus.ASSETS_PENDING;
        if (
          ![MediaPostStatus.SCHEDULED, MediaPostStatus.POSTED].includes(
            publication.status,
          )
        ) {
          publication.status = MediaPostStatus.ASSETS_PENDING;
        }
      }
      await publication.save();
    }
    return this.getPack(publicationId);
  }

  private async syncAssets(
    publication: MediaPublicationDocument,
    requirements: MediaProductionAssetRequirement[],
  ) {
    const keys = requirements.map((item) => item.key);
    await this.assetModel.updateMany(
      {
        publicationId: publication._id,
        generatedFromProduction: true,
        productionRequirementKey: { $nin: keys },
        status: { $ne: MediaAssetStatus.READY },
      },
      { $set: { status: MediaAssetStatus.ARCHIVED, isActive: false } },
    );

    for (const requirement of requirements) {
      const existing = await this.assetModel.findOne({
        publicationId: publication._id,
        productionRequirementKey: requirement.key,
      });
      if (existing) {
        existing.type = requirement.type;
        existing.role = requirement.role;
        existing.required = requirement.required;
        existing.generatedFromProduction = true;
        existing.source = requirement.source;
        existing.prompt = requirement.prompt;
        existing.notes = requirement.notes ?? requirement.description;
        existing.isActive = true;
        if (existing.status === MediaAssetStatus.ARCHIVED) {
          existing.status = MediaAssetStatus.PLANNED;
        }
        await existing.save();
        continue;
      }
      await this.assetModel.create({
        contentItemId: publication.contentItemId,
        publicationId: publication._id,
        type: requirement.type,
        role: requirement.role,
        productionRequirementKey: requirement.key,
        required: requirement.required,
        generatedFromProduction: true,
        source: requirement.source,
        prompt: requirement.prompt,
        notes: requirement.notes ?? requirement.description,
        status: MediaAssetStatus.PLANNED,
        metadata: { productionDescription: requirement.description },
      });
    }
  }

  private readiness(
    publication: Pick<MediaPublication, 'production' | 'productionStatus'>,
    assets: Array<
      Pick<
        MediaAsset,
        'required' | 'status' | 'isActive' | 'generatedFromProduction'
      >
    >,
  ) {
    const requiredAssets = assets.filter(
      (asset) =>
        asset.isActive && asset.generatedFromProduction && asset.required,
    );
    const readyAssets = requiredAssets.filter(
      (asset) => asset.status === MediaAssetStatus.READY,
    );
    const hasPlan = Boolean(publication.production);
    return {
      hasPlan,
      requiredAssets: requiredAssets.length,
      readyAssets: readyAssets.length,
      remainingAssets: Math.max(requiredAssets.length - readyAssets.length, 0),
      ready: hasPlan && readyAssets.length === requiredAssets.length,
      complete: publication.productionStatus === MediaProductionStatus.COMPLETE,
    };
  }

  private generateWithAi(input: {
    publication: MediaPublicationDocument;
    contentItem: MediaContentItemDocument;
    instructions?: string;
  }) {
    return this.aiService.generateStructuredResponse<GeneratedProductionPack>({
      name: 'hsakaa_media_production_pack',
      instructions: [
        'You are HSAKAA Production Director for Aakash. Turn one approved canonical Media publication into a practical production pack that can actually be recorded, designed, edited and reviewed.',
        'Never schedule or publish content. Production ends at a publication being ready for the calendar.',
        'Preserve the approved thesis and platform intent. Improve execution clarity without inventing facts, achievements, metrics, quotes or personal experiences.',
        'Make instructions specific enough that Aakash can record/design the piece without asking what shot, framing, B-roll, thumbnail or asset is needed.',
        'Only require assets that materially help the chosen format. Text-only formats can have an empty assetRequirements array.',
        'For video/reel/short formats provide a polished final script, teleprompter-friendly version, shot list, B-roll, camera/audio/lighting guidance and edit direction.',
        'For carousel formats provide slide-by-slide copy and visual direction. For image formats provide composition and image/design direction. For YouTube long-form include a strong thumbnail concept.',
        'Asset requirement keys must be stable lowercase snake_case identifiers and unique within this publication.',
        'Prefer real/owned production where appropriate; use AI-generated or designed assets only when they materially improve the concept.',
        'Keep the production pack concise and non-repetitive. Do not restate the same guidance across multiple fields; use each field only for its specific production purpose.',
      ].join('\n'),
      input: JSON.stringify({
        content: {
          title: input.contentItem.title,
          thesis: input.contentItem.thesis,
          whyNow: input.contentItem.whyNow,
          canonicalBody: input.contentItem.canonicalBody,
          story: input.contentItem.story,
          evidence: input.contentItem.evidence,
          audiences: input.contentItem.audiences,
          goals: input.contentItem.goals,
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
        },
        additionalInstructions: input.instructions,
      }),
      verbosity: 'medium',
      reasoningEffort: 'low',
      maxOutputTokens: 12000,
      schema: this.productionSchema(),
    });
  }

  private productionSchema() {
    const stringArray = { type: 'array', items: { type: 'string' } } as const;
    return {
      type: 'object',
      properties: {
        finalScript: { type: 'string' },
        teleprompterScript: { type: 'string' },
        talkingPoints: stringArray,
        shotList: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'integer', minimum: 1 },
              label: { type: 'string' },
              framing: { type: 'string' },
              action: { type: 'string' },
              dialogue: { type: 'string' },
              durationSeconds: { type: 'number', minimum: 0 },
              location: { type: 'string' },
              equipment: stringArray,
              notes: { type: 'string' },
            },
            required: [
              'order',
              'label',
              'framing',
              'action',
              'dialogue',
              'durationSeconds',
              'location',
              'equipment',
              'notes',
            ],
            additionalProperties: false,
          },
        },
        broll: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order: { type: 'integer', minimum: 1 },
              description: { type: 'string' },
              purpose: { type: 'string' },
              durationSeconds: { type: 'number', minimum: 0 },
              source: { type: 'string', enum: Object.values(MediaSourceType) },
              notes: { type: 'string' },
            },
            required: [
              'order',
              'description',
              'purpose',
              'durationSeconds',
              'source',
              'notes',
            ],
            additionalProperties: false,
          },
        },
        carouselSlides: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              slideNumber: { type: 'integer', minimum: 1 },
              headline: { type: 'string' },
              body: { type: 'string' },
              visualDirection: { type: 'string' },
            },
            required: ['slideNumber', 'headline', 'body', 'visualDirection'],
            additionalProperties: false,
          },
        },
        thumbnail: this.objectSchema([
          'headline',
          'concept',
          'composition',
          'textOverlay',
          'imagePrompt',
          'notes',
        ]),
        visualDirection: this.objectSchema(
          [
            'aspectRatio',
            'framing',
            'lighting',
            'background',
            'wardrobe',
            'notes',
          ],
          { props: stringArray },
        ),
        cameraInstructions: this.objectSchema([
          'orientation',
          'framing',
          'resolution',
          'fps',
          'audio',
          'lighting',
          'location',
          'notes',
        ]),
        editInstructions: this.objectSchema([
          'pacing',
          'cuts',
          'captions',
          'music',
          'soundEffects',
          'graphics',
          'notes',
        ]),
        assetRequirements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              type: { type: 'string', enum: Object.values(MediaAssetType) },
              role: { type: 'string' },
              description: { type: 'string' },
              source: { type: 'string', enum: Object.values(MediaSourceType) },
              prompt: { type: 'string' },
              required: { type: 'boolean' },
              notes: { type: 'string' },
            },
            required: [
              'key',
              'type',
              'role',
              'description',
              'source',
              'prompt',
              'required',
              'notes',
            ],
            additionalProperties: false,
          },
        },
        equipment: stringArray,
        publishChecklist: stringArray,
        risks: stringArray,
        notes: { type: 'string' },
      },
      required: [
        'finalScript',
        'teleprompterScript',
        'talkingPoints',
        'shotList',
        'broll',
        'carouselSlides',
        'thumbnail',
        'visualDirection',
        'cameraInstructions',
        'editInstructions',
        'assetRequirements',
        'equipment',
        'publishChecklist',
        'risks',
        'notes',
      ],
      additionalProperties: false,
    };
  }

  private objectSchema(
    stringFields: string[],
    arrayFields: Record<
      string,
      { type: 'array'; items: { type: 'string' } }
    > = {},
  ) {
    const properties: Record<string, unknown> = {};
    for (const field of stringFields) properties[field] = { type: 'string' };
    Object.assign(properties, arrayFields);
    return {
      type: 'object',
      properties,
      required: [...stringFields, ...Object.keys(arrayFields)],
      additionalProperties: false,
    };
  }

  private normalizePlan(
    input: GeneratedProductionPack,
  ): GeneratedProductionPack {
    return {
      finalScript: input.finalScript?.trim() ?? '',
      teleprompterScript: input.teleprompterScript?.trim() ?? '',
      talkingPoints: this.strings(input.talkingPoints),
      shotList: Array.isArray(input.shotList) ? input.shotList : [],
      broll: Array.isArray(input.broll) ? input.broll : [],
      carouselSlides: Array.isArray(input.carouselSlides)
        ? input.carouselSlides
        : [],
      thumbnail: input.thumbnail ?? {},
      visualDirection: input.visualDirection ?? { props: [] },
      cameraInstructions: input.cameraInstructions ?? {},
      editInstructions: input.editInstructions ?? {},
      assetRequirements: this.normalizeRequirements(input.assetRequirements),
      equipment: this.strings(input.equipment),
      publishChecklist: this.strings(input.publishChecklist),
      risks: this.strings(input.risks),
      notes: input.notes?.trim() ?? '',
    };
  }

  private normalizeRequirements(input: MediaProductionAssetRequirement[]) {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    return input
      .map((item, index) => ({
        ...item,
        key: this.requirementKey(item.key, index),
        role: item.role?.trim(),
        description:
          item.description?.trim() || `Production asset ${index + 1}`,
        source: Object.values(MediaSourceType).includes(item.source)
          ? item.source
          : MediaSourceType.NONE,
        prompt: item.prompt?.trim(),
        notes: item.notes?.trim(),
        required: item.required !== false,
      }))
      .filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      });
  }

  private requirementKey(value: string | undefined, index: number) {
    const key = (value ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
    return key || `asset_${index + 1}`;
  }

  private strings(input: unknown) {
    return Array.isArray(input)
      ? input
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
  }

  private objectId(value: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Invalid Media identifier.');
    }
    return new Types.ObjectId(value);
  }
}
