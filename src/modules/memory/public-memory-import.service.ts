import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { Company } from '../companies/schemas/company.schema';
import { Hobby } from '../hobbies/schemas/hobby.schema';
import {
  JournalEntry,
  JournalVisibility,
} from '../journal/schemas/journal-entry.schema';
import { LibraryItem } from '../library/schemas/library-item.schema';
import { User } from '../users/schemas/user.schema';
import {
  GeneratePublicMemoryCandidatesDto,
  PublicMemoryImportSource,
} from './dto/generate-public-memory-candidates.dto';
import { MemoryInboxService } from './memory-inbox.service';
import {
  MemoryInboxItem,
  MemoryInboxStatus,
} from './schemas/memory-inbox-item.schema';
import {
  Memory,
  MemoryAccessLevel,
  MemoryCaptureOrigin,
  MemoryDurability,
  MemoryEntityType,
  MemoryLifecycleStatus,
  MemoryScope,
  MemorySensitivity,
  MemorySource,
  MemoryType,
  MemoryVerificationStatus,
} from './schemas/memory.schema';

const DEFAULT_SOURCES: PublicMemoryImportSource[] = [
  PublicMemoryImportSource.IDENTITY,
  PublicMemoryImportSource.COMPANIES,
  PublicMemoryImportSource.HOBBIES,
  PublicMemoryImportSource.LIBRARY,
  PublicMemoryImportSource.PUBLIC_JOURNAL,
];

const PUBLIC_MEMORY_TYPES = [
  MemoryType.FACT,
  MemoryType.PREFERENCE,
  MemoryType.GOAL,
  MemoryType.BELIEF,
  MemoryType.LESSON,
  MemoryType.EVENT,
  MemoryType.ROUTINE,
  MemoryType.PROJECT_CONTEXT,
  MemoryType.OPINION,
  MemoryType.UNRESOLVED_QUESTION,
] as const;

type SourceRecord = {
  key: string;
  source: PublicMemoryImportSource;
  entityId?: string;
  entityType: string;
  entityName: string;
  memorySource: MemorySource;
  entityReferenceType: MemoryEntityType;
  payload: Record<string, unknown>;
};

type GeneratedCandidate = {
  sourceKey: string;
  content: string;
  type: MemoryType;
  proposalReason: string;
  importance: number;
  confidence: number;
  categories: string[];
  tags: string[];
};

type GeneratedCandidateResponse = {
  candidates: GeneratedCandidate[];
};

@Injectable()
export class PublicMemoryImportService {
  constructor(
    private readonly aiService: AiService,
    private readonly memoryInboxService: MemoryInboxService,
    @InjectModel(Memory.name)
    private readonly memoryModel: Model<Memory>,
    @InjectModel(MemoryInboxItem.name)
    private readonly memoryInboxModel: Model<MemoryInboxItem>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(Hobby.name)
    private readonly hobbyModel: Model<Hobby>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItem>,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntry>,
  ) {}

  async generate(dto: GeneratePublicMemoryCandidatesDto) {
    const sources = dto.sources?.length ? dto.sources : DEFAULT_SOURCES;
    const maxCandidates = Math.min(Math.max(dto.maxCandidates ?? 60, 1), 100);
    const sourceRecords = await this.collectSources(sources);

    if (!sourceRecords.length) {
      return {
        scannedSources: 0,
        generatedCandidates: 0,
        stagedCandidates: 0,
        duplicatesSkipped: 0,
        sourceBreakdown: this.buildBreakdown([], sources),
        items: [],
      };
    }

    const [existingPublicMemories, pendingPublicCandidates] = await Promise.all(
      [
        this.memoryModel
          .find({
            accessLevel: MemoryAccessLevel.PUBLIC,
            lifecycleStatus: MemoryLifecycleStatus.ACTIVE,
          })
          .select('content')
          .lean(),
        this.memoryInboxModel
          .find({
            accessLevel: MemoryAccessLevel.PUBLIC,
            status: MemoryInboxStatus.PENDING,
            isActive: true,
          })
          .select('content')
          .lean(),
      ],
    );

    const existingContent = new Set(
      [...existingPublicMemories, ...pendingPublicCandidates].map((memory) =>
        this.normalizeContent(memory.content),
      ),
    );

    const schema = this.buildCandidateSchema(
      sourceRecords.map((record) => record.key),
      maxCandidates,
    );

    const generation =
      await this.aiService.generateStructuredResponse<GeneratedCandidateResponse>(
        {
          name: 'public_memory_candidate_import',
          schema,
          instructions: [
            "You are generating candidate memories for Aakash's PUBLIC HSAKAA memory inbox.",
            'Every candidate must be directly grounded in exactly one supplied source record.',
            'Create concise atomic memories: one durable idea or fact per candidate.',
            'Do not invent details, infer private facts, combine unrelated records, or turn a plan into an accomplished result.',
            'Do not expose email addresses, phone numbers, authentication data, private identifiers, confidential company details, or anything not present in the safe source payload.',
            'Health and Media are intentionally excluded and must never be introduced.',
            'Library records are supplied only when already marked public. Journal records are supplied only when already public and published.',
            'Use sourceKey exactly as supplied. Prefer stable public facts, durable project context, explicit principles, learning interests, and clearly stated lessons.',
            'Do not create multiple paraphrases of the same memory.',
            `Return at most ${maxCandidates} candidates. It is acceptable to return fewer, including zero.`,
          ].join('\n'),
          input: JSON.stringify(
            {
              sources: sourceRecords.map((record) => ({
                sourceKey: record.key,
                sourceType: record.source,
                entityType: record.entityType,
                entityName: record.entityName,
                payload: record.payload,
              })),
            },
            null,
            2,
          ),
          verbosity: 'low',
          reasoningEffort: 'medium',
          maxOutputTokens: 8000,
        },
      );

    const sourceByKey = new Map(
      sourceRecords.map((record) => [record.key, record] as const),
    );
    const seenGenerated = new Set<string>();
    const items: unknown[] = [];
    let duplicatesSkipped = 0;

    for (const candidate of generation.data.candidates.slice(
      0,
      maxCandidates,
    )) {
      const source = sourceByKey.get(candidate.sourceKey);
      const content = candidate.content?.trim();
      if (!source || !content) continue;

      const normalized = this.normalizeContent(content);
      if (existingContent.has(normalized) || seenGenerated.has(normalized)) {
        duplicatesSkipped += 1;
        continue;
      }
      seenGenerated.add(normalized);

      const created = await this.memoryInboxService.capture({
        content,
        scope: MemoryScope.GENERAL,
        type: PUBLIC_MEMORY_TYPES.includes(
          candidate.type as (typeof PUBLIC_MEMORY_TYPES)[number],
        )
          ? candidate.type
          : MemoryType.FACT,
        source: source.memorySource,
        sourceReference: {
          entityId: source.entityId,
          entityType: source.entityType,
          externalId: source.key,
        },
        entities: [
          {
            type: source.entityReferenceType,
            name: source.entityName,
            entityId: source.entityId,
          },
        ],
        categories: [
          'public-memory-import',
          source.source,
          ...(candidate.categories ?? []),
        ],
        tags: candidate.tags ?? [],
        importance: this.clampScore(candidate.importance, 0.65),
        confidence: this.clampScore(candidate.confidence, 0.8),
        verificationStatus: MemoryVerificationStatus.INFERRED,
        accessLevel: MemoryAccessLevel.PUBLIC,
        sensitivity: MemorySensitivity.NORMAL,
        durability: MemoryDurability.DURABLE,
        captureOrigin: MemoryCaptureOrigin.SYSTEM,
        proposalReason:
          candidate.proposalReason?.trim() ||
          `Generated from reviewed ${source.source.replaceAll('_', ' ')} backend data.`,
      });

      items.push(created);
      existingContent.add(normalized);
    }

    return {
      scannedSources: sourceRecords.length,
      generatedCandidates: generation.data.candidates.length,
      stagedCandidates: items.length,
      duplicatesSkipped,
      sourceBreakdown: this.buildBreakdown(sourceRecords, sources),
      items,
    };
  }

  private async collectSources(
    requestedSources: PublicMemoryImportSource[],
  ): Promise<SourceRecord[]> {
    const requested = new Set(requestedSources);
    const result: SourceRecord[] = [];

    if (requested.has(PublicMemoryImportSource.IDENTITY)) {
      const user = await this.userModel
        .findOne({ isActive: true, isArchived: false })
        .select('name')
        .lean();

      if (user?.name?.trim()) {
        result.push({
          key: `identity:${user._id.toString()}`,
          source: PublicMemoryImportSource.IDENTITY,
          entityId: user._id.toString(),
          entityType: 'profile',
          entityName: user.name.trim(),
          memorySource: MemorySource.MANUAL,
          entityReferenceType: MemoryEntityType.PERSON,
          payload: { name: user.name.trim() },
        });
      }
    }

    if (requested.has(PublicMemoryImportSource.COMPANIES)) {
      const companies = await this.companyModel
        .find({ isActive: true, isArchived: false })
        .sort({ isFeatured: -1, name: 1 })
        .limit(20)
        .lean();

      for (const company of companies) {
        result.push({
          key: `company:${company._id.toString()}`,
          source: PublicMemoryImportSource.COMPANIES,
          entityId: company._id.toString(),
          entityType: 'company',
          entityName: company.name,
          memorySource: MemorySource.COMPANY,
          entityReferenceType: MemoryEntityType.COMPANY,
          payload: this.compactObject({
            name: company.name,
            tagline: company.tagline,
            description: company.description,
            status: company.status,
            stage: company.stage,
            roles: company.roles,
            industries: company.industries,
            products: company.products,
            markets: company.markets,
            headquarters: company.headquarters,
            website: company.website,
            founders: (company.founders ?? []).map((founder) => ({
              name: founder.name,
              designation: founder.designation,
              isPrimary: founder.isPrimary,
            })),
            principles: company.principles,
            currentFocus: company.currentFocus,
            businessModel: company.businessModel,
            targetCustomer: company.targetCustomer,
            foundedAt: company.foundedAt,
          }),
        });
      }
    }

    if (requested.has(PublicMemoryImportSource.HOBBIES)) {
      const hobbies = await this.hobbyModel
        .find({ isActive: true, isArchived: false })
        .sort({ status: 1, intensity: 1, name: 1 })
        .limit(30)
        .lean();

      for (const hobby of hobbies) {
        result.push({
          key: `hobby:${hobby._id.toString()}`,
          source: PublicMemoryImportSource.HOBBIES,
          entityId: hobby._id.toString(),
          entityType: 'hobby',
          entityName: hobby.name,
          memorySource: MemorySource.MANUAL,
          entityReferenceType: MemoryEntityType.OTHER,
          payload: this.compactObject({
            name: hobby.name,
            status: hobby.status,
            category: hobby.category,
            intensity: hobby.intensity,
            goal: hobby.goal,
            why: hobby.why,
            currentSkillLevel: hobby.currentSkillLevel,
            currentStageKey: hobby.currentStageKey,
            startedAt: hobby.startedAt,
          }),
        });
      }
    }

    if (requested.has(PublicMemoryImportSource.LIBRARY)) {
      const libraryItems = await this.libraryItemModel
        .find({
          isActive: true,
          isArchived: false,
          isPublic: true,
        })
        .sort({ completedAt: -1, lastReadAt: -1, title: 1 })
        .limit(50)
        .lean();

      for (const item of libraryItems) {
        result.push({
          key: `library:${item._id.toString()}`,
          source: PublicMemoryImportSource.LIBRARY,
          entityId: item._id.toString(),
          entityType: 'library_item',
          entityName: item.title,
          memorySource: MemorySource.LIBRARY,
          entityReferenceType: MemoryEntityType.BOOK,
          payload: this.compactObject({
            title: item.title,
            subtitle: item.subtitle,
            type: item.type,
            status: item.status,
            author: item.author,
            authors: item.authors,
            category: item.category,
            tags: item.tags,
            progressPercentage: item.progressPercentage,
            rating: item.rating,
            summary: item.summary,
            keyTakeaways: item.keyTakeaways,
            startedAt: item.startedAt,
            completedAt: item.completedAt,
            lastReadAt: item.lastReadAt,
          }),
        });
      }
    }

    if (requested.has(PublicMemoryImportSource.PUBLIC_JOURNAL)) {
      const journalEntries = await this.journalModel
        .find({
          visibility: JournalVisibility.PUBLIC,
          isPublished: true,
          isActive: true,
          isArchived: false,
        })
        .sort({ publishedAt: -1, date: -1 })
        .limit(25)
        .lean();

      for (const entry of journalEntries) {
        result.push({
          key: `journal:${entry._id.toString()}`,
          source: PublicMemoryImportSource.PUBLIC_JOURNAL,
          entityId: entry._id.toString(),
          entityType: 'public_journal',
          entityName: entry.title,
          memorySource: MemorySource.JOURNAL,
          entityReferenceType: MemoryEntityType.OTHER,
          payload: this.compactObject({
            date: entry.date,
            type: entry.type,
            title: entry.title,
            content: this.clip(entry.content, 3500),
            highlight: entry.highlight,
            tags: entry.tags,
            lessons: entry.lessons,
            decisions: entry.decisions,
            ideas: entry.ideas,
            gratitude: entry.gratitude,
            wins: entry.wins,
            publishedAt: entry.publishedAt,
          }),
        });
      }
    }

    return result;
  }

  private buildCandidateSchema(sourceKeys: string[], maxCandidates: number) {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        candidates: {
          type: 'array',
          maxItems: maxCandidates,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sourceKey: { type: 'string', enum: sourceKeys },
              content: { type: 'string', minLength: 1, maxLength: 600 },
              type: { type: 'string', enum: [...PUBLIC_MEMORY_TYPES] },
              proposalReason: { type: 'string', minLength: 1, maxLength: 500 },
              importance: { type: 'number', minimum: 0, maximum: 1 },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
              categories: {
                type: 'array',
                items: { type: 'string', maxLength: 80 },
                maxItems: 8,
              },
              tags: {
                type: 'array',
                items: { type: 'string', maxLength: 80 },
                maxItems: 10,
              },
            },
            required: [
              'sourceKey',
              'content',
              'type',
              'proposalReason',
              'importance',
              'confidence',
              'categories',
              'tags',
            ],
          },
        },
      },
      required: ['candidates'],
    };
  }

  private buildBreakdown(
    records: SourceRecord[],
    requestedSources: PublicMemoryImportSource[],
  ) {
    return requestedSources.reduce<Record<string, number>>((counts, source) => {
      counts[source] = records.filter(
        (record) => record.source === source,
      ).length;
      return counts;
    }, {});
  }

  private compactObject(value: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => {
        if (item === undefined || item === null || item === '') return false;
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      }),
    );
  }

  private normalizeContent(value: string) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private clampScore(value: unknown, fallback: number) {
    const number =
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(Math.max(number, 0), 1);
  }

  private clip(value: string | undefined, maxLength: number) {
    if (!value) return undefined;
    const clean = value.trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
  }
}
