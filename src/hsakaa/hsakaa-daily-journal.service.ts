import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../modules/ai/ai.service';
import {
  JournalEntry,
  JournalEntryDocument,
  JournalMood,
  JournalSource,
  JournalVisibility,
} from '../modules/journal/schemas/journal-entry.schema';
import { HsakaaDailyContextService } from './hsakaa-daily-context.service';
import {
  HsakaaDailyContextPrivacy,
  HsakaaDailyContextSource,
  type HsakaaDailyContextItem,
} from './schemas/hsakaa-daily-context.schema';

interface DailyJournalGeneration {
  title: string;
  content: string;
  highlight: string;
  wins: string[];
  lessons: string[];
  decisions: string[];
  ideas: string[];
  gratitude: string[];
  challenges: string[];
  tags: string[];
}

interface DailyJournalDraftUpdate {
  title?: string;
  content?: string;
  highlight?: string;
}

type DailyContextSnapshot = {
  dateKey: string;
  version: number;
  privacyVersion?: number;
  privacyReviewStatus?: 'clear' | 'needs_review';
  publicSourceFingerprint?: string;
  items?: HsakaaDailyContextItem[];
  changes?: HsakaaDailyContextItem[];
};

type StructuredSnapshots = {
  mood: JournalMood;
  energyScore?: number;
  stressScore?: number;
  workout: {
    completed: boolean;
    type?: string;
    title?: string;
    durationMinutes?: number;
    strainScore?: number;
  };
  reading: {
    completed: boolean;
    libraryItemId?: Types.ObjectId;
    title?: string;
    author?: string;
    progressPercentage?: number;
  };
  sleep: {
    durationHours?: number;
    performancePercentage?: number;
    quality?: number;
    recoveryScore?: number;
  };
  steps: number;
  memoryIds: Types.ObjectId[];
  companyIds: Types.ObjectId[];
  libraryItemIds: Types.ObjectId[];
};

@Injectable()
export class HsakaaDailyJournalService {
  constructor(
    private readonly aiService: AiService,
    private readonly dailyContextService: HsakaaDailyContextService,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,
  ) {}

  async getForDate(dateKey?: string) {
    const resolved = dateKey ?? this.dailyContextService.getDateKey(new Date());
    const [context, journal, publicJournal] = await Promise.all([
      this.dailyContextService.get(resolved),
      this.findPrivateSynthesis(resolved),
      this.findPublicDerivative(resolved),
    ]);
    const synchronizedPublic = await this.synchronizePublicDraftState(
      context,
      publicJournal,
    );

    return { context, journal, publicJournal: synchronizedPublic };
  }

  async generate(dateKey?: string, regenerate = false) {
    const resolved = dateKey ?? this.dailyContextService.getDateKey(new Date());
    const context = (await this.dailyContextService.capture(
      resolved,
    )) as unknown as DailyContextSnapshot | null;
    if (!context) {
      throw new NotFoundException('Daily context could not be captured.');
    }

    const existing = await this.findPrivateSynthesis(resolved);
    const existingMetadata = this.metadata(existing?.metadata);

    if (existing && existingMetadata.approvalStatus === 'approved') {
      throw new BadRequestException(
        'The private daily journal has already been approved.',
      );
    }

    let journal = existing;
    let generated = false;

    if (!existing || regenerate) {
      const result = await this.generatePrivateJournal(context, resolved);
      journal = await this.upsertPrivateDraft({
        dateKey: resolved,
        generation: result.data,
        snapshots: this.buildStructuredSnapshots(context.items ?? []),
        dailyContextVersion: context.version,
        sourceItems: context.items ?? [],
        ai: {
          model: result.model,
          responseId: result.responseId,
          usage: result.usage,
        },
      });
      generated = true;
    }

    const publicResult = await this.generatePublicDerivative(
      context,
      resolved,
      regenerate,
    );

    return {
      context,
      journal,
      publicJournal: publicResult.journal,
      generated,
      publicGenerated: publicResult.generated,
    };
  }

  async approve(journalEntryId: string) {
    return this.approveDraft(journalEntryId, 'private');
  }

  async approvePublic(journalEntryId: string) {
    const document = await this.getDailyDraftDocument(journalEntryId, 'public');
    const metadata = this.metadata(document.metadata);
    const dateKey = this.string(metadata.dailyContextDateKey);
    if (!dateKey) {
      throw new BadRequestException(
        'Public daily draft is missing its context date.',
      );
    }
    const context = (await this.dailyContextService.get(
      dateKey,
    )) as unknown as DailyContextSnapshot | null;
    this.assertPublicDraftCurrent(context, metadata);
    return this.approveDraft(journalEntryId, 'public');
  }

  async approveAndPublishPair(dateKey?: string) {
    const resolved =
      dateKey ?? this.dailyContextService.getPreviousDateKey(new Date());
    const context = (await this.dailyContextService.get(
      resolved,
    )) as unknown as DailyContextSnapshot | null;
    if (!context) {
      throw new NotFoundException('Daily context could not be found.');
    }
    if (context.privacyReviewStatus === 'needs_review') {
      throw new BadRequestException(
        'Resolve every needs-review privacy item before publishing the public journal.',
      );
    }

    const [privateDocument, publicDocument] = await Promise.all([
      this.journalModel.findOne({
        sourceExternalId: `hsakaa-daily-journal:${resolved}`,
        isActive: true,
      }),
      this.journalModel.findOne({
        sourceExternalId: `hsakaa-public-daily-journal:${resolved}`,
        isActive: true,
      }),
    ]);

    if (!privateDocument) {
      throw new BadRequestException(
        'Prepare the private previous-day journal draft before publishing.',
      );
    }
    if (!publicDocument) {
      throw new BadRequestException(
        'No public-safe journal draft exists. Mark at least one source Public safe, then regenerate the public draft.',
      );
    }

    this.assertPublicDraftCurrent(
      context,
      this.metadata(publicDocument.metadata),
    );

    const publishedAt = new Date();
    const approvedAt = publishedAt.toISOString();
    privateDocument.metadata = {
      ...this.metadata(privateDocument.metadata),
      approvalStatus: 'approved',
      approvedAt,
      publishedAsPairAt: approvedAt,
    };
    privateDocument.visibility = JournalVisibility.PRIVATE;
    privateDocument.isPublished = true;
    privateDocument.publishedAt = publishedAt;

    publicDocument.metadata = {
      ...this.metadata(publicDocument.metadata),
      approvalStatus: 'approved',
      approvedAt,
      publishedAsPairAt: approvedAt,
    };
    publicDocument.visibility = JournalVisibility.PUBLIC;
    publicDocument.isPublished = true;
    publicDocument.publishedAt = publishedAt;

    const [journal, publicJournal] = await Promise.all([
      privateDocument.save(),
      publicDocument.save(),
    ]);

    return {
      context,
      journal: journal.toObject(),
      publicJournal: publicJournal.toObject(),
      published: true,
    };
  }

  async regeneratePublic(dateKey?: string) {
    const resolved = dateKey ?? this.dailyContextService.getDateKey(new Date());
    const context = (await this.dailyContextService.capture(
      resolved,
    )) as unknown as DailyContextSnapshot | null;
    if (!context) {
      throw new NotFoundException('Daily context could not be captured.');
    }
    const result = await this.generatePublicDerivative(context, resolved, true);
    return {
      context,
      journal: await this.findPrivateSynthesis(resolved),
      publicJournal: result.journal,
      publicGenerated: result.generated,
    };
  }

  async getIntelligence(period: 'week' | 'month', dateKey?: string) {
    const anchor = dateKey ?? this.dailyContextService.getDateKey(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
      throw new BadRequestException('dateKey must use YYYY-MM-DD.');
    }
    const end = new Date(`${anchor}T23:59:59.999+05:30`);
    const days = period === 'month' ? 30 : 7;
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);
    const entries = await this.journalModel
      .find({
        date: { $gte: start, $lte: end },
        isActive: true,
        'metadata.dailySynthesis': true,
      })
      .sort({ date: 1 })
      .lean();

    const strings = (key: keyof JournalEntry) =>
      this.unique(
        entries.flatMap((entry) => {
          const value = entry[key];
          return Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [];
        }),
      );
    const moodCounts = entries.reduce<Record<string, number>>((acc, entry) => {
      const mood = entry.mood ?? JournalMood.NEUTRAL;
      acc[mood] = (acc[mood] ?? 0) + 1;
      return acc;
    }, {});
    const tagCounts = entries
      .flatMap((entry) => entry.tags ?? [])
      .reduce<Record<string, number>>((acc, tag) => {
        acc[tag] = (acc[tag] ?? 0) + 1;
        return acc;
      }, {});

    return {
      period,
      dateRange: {
        from: this.dailyContextService.getDateKey(start),
        to: anchor,
      },
      daysExpected: days,
      daysCaptured: entries.length,
      coveragePercentage: Math.round((entries.length / days) * 100),
      wins: strings('wins').slice(0, 30),
      lessons: strings('lessons').slice(0, 30),
      decisions: strings('decisions').slice(0, 30),
      ideas: strings('ideas').slice(0, 30),
      challenges: strings('challenges').slice(0, 30),
      gratitude: strings('gratitude').slice(0, 30),
      moodCounts,
      topTags: Object.entries(tagCounts)
        .sort(([, left], [, right]) => right - left)
        .slice(0, 12)
        .map(([tag, count]) => ({ tag, count })),
      journals: entries.map((entry) => ({
        id: String(entry._id),
        dateKey: entry.dateKey,
        title: entry.title,
        highlight: entry.highlight,
        approvalStatus: this.metadata(entry.metadata).approvalStatus ?? null,
      })),
    };
  }

  async updateDraft(journalEntryId: string, input: DailyJournalDraftUpdate) {
    const document = await this.getDailyDraftDocument(journalEntryId);
    const metadata = this.metadata(document.metadata);

    if (metadata.approvalStatus === 'approved') {
      throw new BadRequestException(
        'Approved daily journals are edited through the normal journal editor.',
      );
    }

    if (input.title !== undefined) document.title = input.title.trim();
    if (input.content !== undefined) document.content = input.content;
    if (input.highlight !== undefined) document.highlight = input.highlight;
    document.metadata = {
      ...metadata,
      editedBeforeApprovalAt: new Date().toISOString(),
    };

    return (await document.save()).toObject();
  }

  async ensureScheduledPreviousDay(now = new Date()) {
    const dateKey = this.dailyContextService.getPreviousDateKey(now);
    const existing = await this.findPrivateSynthesis(dateKey);
    const existingPublic = await this.findPublicDerivative(dateKey);

    if (existing && existingPublic) {
      return {
        context: await this.dailyContextService.get(dateKey),
        journal: existing,
        publicJournal: existingPublic,
        generated: false,
        publicGenerated: false,
      };
    }

    return this.generate(dateKey, false);
  }

  private async generatePrivateJournal(
    context: DailyContextSnapshot,
    dateKey: string,
  ) {
    return this.aiService.generateStructuredResponse<DailyJournalGeneration>({
      name: 'hsakaa_private_daily_journal_v2',
      schema: this.journalSchema(),
      instructions: [
        "Write Aakash's private daily journal from the supplied factual daily-context snapshot.",
        'This is his owner-only personal record, not public content and not a social-media post.',
        'Write in natural first person, as a thoughtful narrative of the day rather than an activity dump.',
        'Do not invent events, emotions, motives, conversations, accomplishments, metrics, or conclusions that are not supported by the snapshot.',
        'Use the structured arrays to extract concise wins, lessons, decisions, ideas, gratitude, and challenges only when the evidence supports them; otherwise return an empty array.',
        'Do not copy private details merely for completeness. Include them only when they materially explain the day.',
        'Health and reading metrics are stored separately from factual source records, so do not invent or calculate metrics in the prose.',
        'Owner-supplied context items are explicit corrections or additions from Aakash, such as offline reading, work that was not captured automatically, meetings, decisions, or personal moments. Treat them as first-class factual evidence.',
        'The content should stand on its own as a real daily journal: what mattered, what moved, what was learned, what remained unresolved, and what is being carried forward.',
        'Use plain markdown paragraphs with occasional short headings when useful. Avoid generic motivational filler.',
      ].join(' '),
      input: this.buildInput(
        context.items ?? [],
        context.changes ?? [],
        dateKey,
        'private',
      ),
      verbosity: 'medium',
    });
  }

  private async generatePublicDerivative(
    context: DailyContextSnapshot,
    dateKey: string,
    regenerate: boolean,
  ) {
    if (context.privacyReviewStatus === 'needs_review') {
      const existing = await this.findPublicDerivative(dateKey);
      const synchronized = await this.synchronizePublicDraftState(
        context,
        existing,
      );
      return { journal: synchronized, generated: false };
    }

    const publicItems = (context.items ?? []).filter(
      (item) => item.privacy === HsakaaDailyContextPrivacy.PUBLIC_SAFE,
    );
    const publicChanges = (context.changes ?? []).filter(
      (item) => item.privacy === HsakaaDailyContextPrivacy.PUBLIC_SAFE,
    );
    const existing = await this.findPublicDerivative(dateKey);

    if (!publicItems.length) {
      return { journal: existing ?? null, generated: false };
    }

    if (
      existing &&
      this.metadata(existing.metadata).approvalStatus === 'approved'
    ) {
      return { journal: existing, generated: false };
    }

    if (existing && !regenerate) {
      return { journal: existing, generated: false };
    }

    const result =
      await this.aiService.generateStructuredResponse<DailyJournalGeneration>({
        name: 'hsakaa_public_daily_journal_v2',
        schema: this.journalSchema(),
        instructions: [
          "Write a public-safe Open Notebook journal draft in Aakash's first-person voice using only the supplied PUBLIC_SAFE events.",
          'You are not sanitizing a private journal. You are creating a separate public derivative from an already privacy-filtered source set.',
          'Never imply access to omitted private context. Never add names, health details, relationships, confidential company information, internal metrics, private conversations, or personal circumstances unless they are explicitly present in the supplied public-safe events.',
          'Preserve useful insights, lessons, building progress, reading insights, or already-public work without exposing private causes behind them.',
          'Do not invent facts or add plausible background.',
          'Use the structured arrays only when supported. Return empty arrays when there is no evidence.',
          'Write a polished but personal public reflection, not marketing copy and not a social caption.',
        ].join(' '),
        input: this.buildInput(publicItems, publicChanges, dateKey, 'public'),
        verbosity: 'medium',
      });

    const journal = await this.upsertPublicDraft({
      dateKey,
      generation: result.data,
      dailyContextVersion: context.version,
      privacyVersion: context.privacyVersion,
      publicSourceFingerprint: context.publicSourceFingerprint,
      sourceItems: publicItems,
      ai: {
        model: result.model,
        responseId: result.responseId,
        usage: result.usage,
      },
    });

    return { journal, generated: true };
  }

  private async approveDraft(
    journalEntryId: string,
    kind: 'private' | 'public',
  ) {
    const document = await this.getDailyDraftDocument(journalEntryId, kind);
    const metadata = this.metadata(document.metadata);

    if (metadata.approvalStatus === 'approved') {
      return document.toObject();
    }

    document.metadata = {
      ...metadata,
      approvalStatus: 'approved',
      approvedAt: new Date().toISOString(),
    };
    document.visibility =
      kind === 'private' ? JournalVisibility.PRIVATE : JournalVisibility.PUBLIC;
    document.isPublished = false;
    document.publishedAt = undefined;

    return (await document.save()).toObject();
  }

  private findPrivateSynthesis(dateKey: string) {
    return this.journalModel
      .findOne({
        sourceExternalId: `hsakaa-daily-journal:${dateKey}`,
        isActive: true,
      })
      .lean();
  }

  private findPublicDerivative(dateKey: string) {
    return this.journalModel
      .findOne({
        sourceExternalId: `hsakaa-public-daily-journal:${dateKey}`,
        isActive: true,
      })
      .lean();
  }

  private async upsertPrivateDraft(input: {
    dateKey: string;
    generation: DailyJournalGeneration;
    snapshots: StructuredSnapshots;
    dailyContextVersion: number;
    sourceItems: HsakaaDailyContextItem[];
    ai: Record<string, unknown>;
  }) {
    const sourceExternalId = `hsakaa-daily-journal:${input.dateKey}`;
    const existing = await this.journalModel.findOne({ sourceExternalId });
    const previousMetadata = this.metadata(existing?.metadata);
    const metadata = {
      ...previousMetadata,
      dailySynthesis: true,
      dailyJournalKind: 'private',
      dailyContextDateKey: input.dateKey,
      dailyContextVersion: input.dailyContextVersion,
      dailyContextItemIds: input.sourceItems.map((item) => item.id),
      approvalStatus: 'pending_approval',
      generatedAt: new Date().toISOString(),
      approvedAt: null,
      ...input.ai,
    };
    const values = {
      title: input.generation.title.trim(),
      content: input.generation.content,
      highlight: input.generation.highlight,
      tags: this.unique([
        'hsakaa',
        'daily-synthesis',
        ...input.generation.tags,
      ]),
      wins: input.generation.wins,
      lessons: input.generation.lessons,
      decisions: input.generation.decisions,
      ideas: input.generation.ideas,
      gratitude: input.generation.gratitude,
      challenges: input.generation.challenges,
      mood: input.snapshots.mood,
      energyScore: input.snapshots.energyScore,
      stressScore: input.snapshots.stressScore,
      workout: input.snapshots.workout,
      reading: input.snapshots.reading,
      sleep: input.snapshots.sleep,
      steps: input.snapshots.steps,
      memoryIds: input.snapshots.memoryIds,
      companyIds: input.snapshots.companyIds,
      libraryItemIds: input.snapshots.libraryItemIds,
    };

    if (existing) {
      Object.assign(existing, values);
      existing.visibility = JournalVisibility.PRIVATE;
      existing.isPublished = false;
      existing.publishedAt = undefined;
      existing.source = JournalSource.HSAKAA;
      existing.metadata = metadata;
      return (await existing.save()).toObject();
    }

    const date = new Date(`${input.dateKey}T12:00:00+05:30`);
    const document = new this.journalModel({
      date,
      dateKey: input.dateKey,
      slug: `hsakaa-daily-journal-${input.dateKey}`,
      ...values,
      source: JournalSource.HSAKAA,
      sourceExternalId,
      visibility: JournalVisibility.PRIVATE,
      isPublished: false,
      isArchived: false,
      isActive: true,
      metadata,
    });

    return (await document.save()).toObject();
  }

  private async upsertPublicDraft(input: {
    dateKey: string;
    generation: DailyJournalGeneration;
    dailyContextVersion: number;
    privacyVersion?: number;
    publicSourceFingerprint?: string;
    sourceItems: HsakaaDailyContextItem[];
    ai: Record<string, unknown>;
  }) {
    const sourceExternalId = `hsakaa-public-daily-journal:${input.dateKey}`;
    const existing = await this.journalModel.findOne({ sourceExternalId });
    const previousMetadata = this.metadata(existing?.metadata);
    const metadata = {
      ...previousMetadata,
      dailyPublicDerivative: true,
      dailyJournalKind: 'public',
      dailyContextDateKey: input.dateKey,
      dailyContextVersion: input.dailyContextVersion,
      dailyContextItemIds: input.sourceItems.map((item) => item.id),
      privacyVersion: input.privacyVersion ?? 1,
      publicSourceFingerprint: input.publicSourceFingerprint ?? '',
      publicDraftStale: false,
      staleReason: null,
      approvalStatus: 'pending_approval',
      generatedAt: new Date().toISOString(),
      approvedAt: null,
      ...input.ai,
    };
    const values = {
      title: input.generation.title.trim(),
      content: input.generation.content,
      highlight: input.generation.highlight,
      tags: this.unique([
        'hsakaa',
        'open-notebook',
        'public-safe-draft',
        ...input.generation.tags,
      ]),
      wins: input.generation.wins,
      lessons: input.generation.lessons,
      decisions: input.generation.decisions,
      ideas: input.generation.ideas,
      gratitude: input.generation.gratitude,
      challenges: input.generation.challenges,
    };

    if (existing) {
      Object.assign(existing, values);
      existing.visibility = JournalVisibility.PUBLIC;
      existing.isPublished = false;
      existing.publishedAt = undefined;
      existing.source = JournalSource.HSAKAA;
      existing.metadata = metadata;
      return (await existing.save()).toObject();
    }

    const date = new Date(`${input.dateKey}T12:05:00+05:30`);
    const document = new this.journalModel({
      date,
      dateKey: input.dateKey,
      slug: `hsakaa-public-daily-journal-${input.dateKey}`,
      ...values,
      source: JournalSource.HSAKAA,
      sourceExternalId,
      visibility: JournalVisibility.PUBLIC,
      isPublished: false,
      isArchived: false,
      isActive: true,
      metadata,
    });

    return (await document.save()).toObject();
  }

  private async synchronizePublicDraftState(
    context: DailyContextSnapshot | null,
    publicJournal: unknown,
  ) {
    if (!context || !publicJournal || typeof publicJournal !== 'object') {
      return publicJournal;
    }
    const record = publicJournal as Record<string, unknown>;
    const metadata = this.metadata(record.metadata);
    const expectedFingerprint = context.publicSourceFingerprint ?? '';
    const draftFingerprint = this.string(metadata.publicSourceFingerprint);
    const stale =
      context.privacyReviewStatus === 'needs_review' ||
      !draftFingerprint ||
      draftFingerprint !== expectedFingerprint;
    if (!stale) return publicJournal;

    const id = record._id;
    if (!id) return publicJournal;
    const document = await this.journalModel.findById(id);
    if (!document) return publicJournal;
    const current = this.metadata(document.metadata);
    document.metadata = {
      ...current,
      publicDraftStale: true,
      staleReason:
        context.privacyReviewStatus === 'needs_review'
          ? 'privacy_review_required'
          : 'public_source_changed',
      approvalStatus: 'pending_approval',
      approvedAt: null,
      staleDetectedAt: new Date().toISOString(),
    };
    document.isPublished = false;
    document.publishedAt = undefined;
    return (await document.save()).toObject();
  }

  private assertPublicDraftCurrent(
    context: DailyContextSnapshot | null,
    metadata: Record<string, unknown>,
  ) {
    if (!context) {
      throw new BadRequestException('Daily context could not be loaded.');
    }
    if (context.privacyReviewStatus === 'needs_review') {
      throw new BadRequestException(
        'Resolve every needs-review privacy item before approving the public journal.',
      );
    }
    if (metadata.publicDraftStale === true) {
      throw new BadRequestException(
        'The public journal is stale. Regenerate it after the latest privacy review.',
      );
    }
    if (
      this.string(metadata.publicSourceFingerprint) !==
      (context.publicSourceFingerprint ?? '')
    ) {
      throw new BadRequestException(
        'The public-safe source set changed. Regenerate the public journal before approval.',
      );
    }
  }

  private async getDailyDraftDocument(
    journalEntryId: string,
    expectedKind?: 'private' | 'public',
  ) {
    if (!Types.ObjectId.isValid(journalEntryId)) {
      throw new BadRequestException('Invalid journal entry ID.');
    }

    const document = await this.journalModel.findOne({
      _id: new Types.ObjectId(journalEntryId),
      isActive: true,
    });

    if (!document) {
      throw new NotFoundException('Journal entry not found.');
    }

    const metadata = this.metadata(document.metadata);
    const isPrivate = metadata.dailySynthesis === true;
    const isPublic = metadata.dailyPublicDerivative === true;
    if (!isPrivate && !isPublic) {
      throw new BadRequestException(
        'Journal entry is not a HSAKAA daily draft.',
      );
    }
    if (expectedKind === 'private' && !isPrivate) {
      throw new BadRequestException(
        'Journal entry is not a private daily draft.',
      );
    }
    if (expectedKind === 'public' && !isPublic) {
      throw new BadRequestException(
        'Journal entry is not a public daily draft.',
      );
    }

    return document;
  }

  private journalSchema(): Record<string, unknown> {
    const stringArray = { type: 'array', items: { type: 'string' } };
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        highlight: { type: 'string' },
        wins: stringArray,
        lessons: stringArray,
        decisions: stringArray,
        ideas: stringArray,
        gratitude: stringArray,
        challenges: stringArray,
        tags: stringArray,
      },
      required: [
        'title',
        'content',
        'highlight',
        'wins',
        'lessons',
        'decisions',
        'ideas',
        'gratitude',
        'challenges',
        'tags',
      ],
    };
  }

  private buildStructuredSnapshots(
    items: HsakaaDailyContextItem[],
  ): StructuredSnapshots {
    const healthItems = items.filter(
      (item) => item.source === HsakaaDailyContextSource.HEALTH,
    );
    const health = healthItems.at(-1)?.metadata ?? {};
    const libraryItems = items.filter(
      (item) => item.source === HsakaaDailyContextSource.LIBRARY,
    );
    const readingItem = libraryItems.at(-1);
    const reading = readingItem?.metadata ?? {};
    const libraryItemId = this.objectId(readingItem?.sourceId);

    return {
      mood: JournalMood.NEUTRAL,
      energyScore: this.number(health.energyScore),
      stressScore: this.number(health.stressScore),
      workout: {
        completed: health.workoutCompleted === true,
        type: this.string(health.workoutType),
        title: this.string(health.workoutTitle),
        durationMinutes: this.number(health.workoutDurationMinutes),
        strainScore: this.number(health.workoutStrainScore),
      },
      reading: {
        completed: libraryItems.length > 0,
        libraryItemId: libraryItemId ?? undefined,
        title: this.string(reading.title) || readingItem?.title,
        author: this.string(reading.author),
        progressPercentage: this.number(reading.progressPercentage),
      },
      sleep: {
        durationHours: this.number(health.sleepDurationHours),
        performancePercentage: this.number(health.sleepPerformancePercentage),
        quality: this.number(health.sleepQuality),
        recoveryScore: this.number(health.recoveryScore),
      },
      steps: this.number(health.steps) ?? 0,
      memoryIds: this.objectIds(
        items
          .filter((item) => item.source === HsakaaDailyContextSource.MEMORY)
          .map((item) => item.metadata.memoryId ?? item.sourceId),
      ),
      companyIds: this.objectIds(
        items
          .filter((item) => item.source === HsakaaDailyContextSource.COMPANY)
          .map((item) => item.metadata.companyId ?? item.sourceId),
      ),
      libraryItemIds: this.objectIds(
        items
          .filter(
            (item) =>
              item.source === HsakaaDailyContextSource.LIBRARY ||
              item.source === HsakaaDailyContextSource.HIGHLIGHT,
          )
          .map((item) => item.metadata.libraryItemId ?? item.sourceId),
      ),
    };
  }

  private buildInput(
    items: HsakaaDailyContextItem[],
    changes: HsakaaDailyContextItem[],
    dateKey: string,
    audience: 'private' | 'public',
  ) {
    const safeItems = items.slice(0, 120).map((item) => ({
      source: item.source,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      occurredAt: item.occurredAt,
      privacy: item.privacy,
      significantChange: item.significantChange,
    }));
    const safeChanges = changes.slice(0, 40).map((item) => ({
      source: item.source,
      kind: item.kind,
      title: item.title,
      summary: item.summary,
      occurredAt: item.occurredAt,
    }));

    return JSON.stringify({
      dateKey,
      timezone: 'Asia/Kolkata',
      audience,
      instruction:
        audience === 'private'
          ? 'Write only from this snapshot. If evidence is sparse, say the day was lightly captured rather than inventing detail.'
          : 'Every event below is explicitly public-safe. Use only these events. Do not infer or mention any omitted private context.',
      significantChanges: safeChanges,
      timeline: safeItems,
    });
  }

  private metadata(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  }

  private number(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private string(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private objectId(value: unknown) {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value))
      return null;
    return new Types.ObjectId(value);
  }

  private objectIds(values: unknown[]) {
    const ids = values
      .map((value) => this.objectId(value))
      .filter((value): value is Types.ObjectId => Boolean(value));
    return [...new Map(ids.map((value) => [value.toString(), value])).values()];
  }

  private unique(values: string[]) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }
}
