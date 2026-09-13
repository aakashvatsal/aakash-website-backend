import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { BrainDump } from '../modules/brain-dump/schemas/brain-dump.schema';
import {
  Conversation,
  ConversationChannel,
} from '../modules/chat/schemas/conversation.schema';
import { Message, MessageRole } from '../modules/chat/schemas/message.schema';
import { Company } from '../modules/companies/schemas/company.schema';
import { HealthEntry } from '../modules/health/schemas/health-entry.schema';
import { JournalEntry } from '../modules/journal/schemas/journal-entry.schema';
import { Hobby } from '../modules/hobbies/schemas/hobby.schema';
import {
  HobbyPracticeSession,
  HobbyPracticeStatus,
} from '../modules/hobbies/schemas/hobby-practice-session.schema';
import { LibraryHighlight } from '../modules/library/schemas/library-highlight.schema';
import { LibraryItem } from '../modules/library/schemas/library-item.schema';
import { MediaPost } from '../modules/media/schemas/media-post.schema';
import { MediaPublication } from '../modules/media/schemas/media-publication.schema';
import { PersonInteraction } from '../modules/memory/schemas/person-interaction.schema';
import {
  Memory,
  MemoryLifecycleStatus,
} from '../modules/memory/schemas/memory.schema';
import { Task } from '../modules/tasks/schemas/task.schema';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseDocument,
} from './schemas/hsakaa-decision-case.schema';
import {
  HsakaaDailyContext,
  HsakaaDailyContextDocument,
  HsakaaDailyContextItem,
  HsakaaDailyContextPrivacy,
  HsakaaDailyContextSource,
} from './schemas/hsakaa-daily-context.schema';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type LooseRecord = Record<string, unknown> & { _id?: unknown };

@Injectable()
export class HsakaaDailyContextService {
  constructor(
    @InjectModel(HsakaaDailyContext.name)
    private readonly dailyContextModel: Model<HsakaaDailyContextDocument>,
    @InjectModel(Task.name) private readonly taskModel: Model<Task>,
    @InjectModel(BrainDump.name)
    private readonly brainDumpModel: Model<BrainDump>,
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntry>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItem>,
    @InjectModel(LibraryHighlight.name)
    private readonly libraryHighlightModel: Model<LibraryHighlight>,
    @InjectModel(HealthEntry.name)
    private readonly healthModel: Model<HealthEntry>,
    @InjectModel(Hobby.name) private readonly hobbyModel: Model<Hobby>,
    @InjectModel(HobbyPracticeSession.name)
    private readonly hobbyPracticeSessionModel: Model<HobbyPracticeSession>,
    @InjectModel(MediaPost.name) private readonly mediaModel: Model<MediaPost>,
    @InjectModel(MediaPublication.name)
    private readonly mediaPublicationModel: Model<MediaPublication>,
    @InjectModel(PersonInteraction.name)
    private readonly personInteractionModel: Model<PersonInteraction>,
    @InjectModel(Company.name) private readonly companyModel: Model<Company>,
    @InjectModel(Memory.name) private readonly memoryModel: Model<Memory>,
    @InjectModel(HsakaaDecisionCase.name)
    private readonly decisionModel: Model<HsakaaDecisionCaseDocument>,
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private readonly messageModel: Model<Message>,
  ) {}

  async get(dateKey?: string) {
    const resolved = dateKey ?? this.getDateKey(new Date());
    const existing = await this.dailyContextModel
      .findOne({ dateKey: resolved })
      .lean();
    return existing ?? this.capture(resolved);
  }

  async capture(dateKey?: string) {
    const resolved = dateKey ?? this.getDateKey(new Date());
    const { start, end } = this.getDayRange(resolved);
    const previous = await this.dailyContextModel
      .findOne({ dateKey: resolved })
      .lean();
    const privacyOverrides = previous?.privacyOverrides ?? {};
    const items = this.applyPrivacyOverrides(
      await this.collectItems(start, end),
      privacyOverrides,
    );
    items.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const changes = items.filter((item) => item.significantChange);
    const version = (previous?.version ?? 0) + 1;
    const privacyVersion = previous?.privacyVersion ?? 1;
    const privacyState = this.privacyState(items);

    return this.dailyContextModel
      .findOneAndUpdate(
        { dateKey: resolved },
        {
          $set: {
            dayStart: start,
            dayEnd: end,
            version,
            capturedAt: new Date(),
            items,
            changes,
            sourceCounts: this.countBy(items, (item) => item.source),
            privacyCounts: privacyState.privacyCounts,
            privacyOverrides,
            privacyVersion,
            privacyReviewStatus: privacyState.privacyReviewStatus,
            publicSourceFingerprint: privacyState.publicSourceFingerprint,
          },
          $setOnInsert: { dateKey: resolved },
        },
        { new: true, upsert: true },
      )
      .lean();
  }

  async updatePrivacy(
    dateKey: string,
    itemId: string,
    privacy: HsakaaDailyContextPrivacy,
    reason?: string,
  ) {
    const context = await this.ensureDocument(dateKey);
    const item = context.items.find((candidate) => candidate.id === itemId);
    if (!item) {
      throw new NotFoundException('Daily context item not found.');
    }

    const now = new Date().toISOString();
    const privacyOverrides = { ...(context.privacyOverrides ?? {}) };
    privacyOverrides[itemId] = {
      privacy,
      reason: reason?.trim() || 'Owner privacy review',
      reviewedAt: now,
    };
    return this.persistPrivacyState(context, privacyOverrides);
  }

  async clearPrivacyOverride(dateKey: string, itemId: string) {
    const context = await this.ensureDocument(dateKey);
    const privacyOverrides = { ...(context.privacyOverrides ?? {}) };
    if (!(itemId in privacyOverrides)) {
      return context.toObject();
    }
    delete privacyOverrides[itemId];
    return this.persistPrivacyState(context, privacyOverrides);
  }

  private async ensureDocument(dateKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestException('dateKey must use YYYY-MM-DD.');
    }
    let context = await this.dailyContextModel.findOne({ dateKey });
    if (!context) {
      await this.capture(dateKey);
      context = await this.dailyContextModel.findOne({ dateKey });
    }
    if (!context) {
      throw new NotFoundException('Daily context could not be created.');
    }
    return context;
  }

  private async persistPrivacyState(
    context: HsakaaDailyContextDocument,
    privacyOverrides: Record<
      string,
      { privacy: HsakaaDailyContextPrivacy; reason: string; reviewedAt: string }
    >,
  ) {
    const items = this.applyPrivacyOverrides(
      context.items ?? [],
      privacyOverrides,
    );
    const changes = items.filter((item) => item.significantChange);
    const state = this.privacyState(items);
    context.items = items;
    context.changes = changes;
    context.privacyOverrides = privacyOverrides;
    context.privacyVersion = (context.privacyVersion ?? 1) + 1;
    context.privacyCounts = state.privacyCounts;
    context.privacyReviewStatus = state.privacyReviewStatus;
    context.publicSourceFingerprint = state.publicSourceFingerprint;
    return (await context.save()).toObject();
  }

  getPreviousDateKey(now = new Date()) {
    const currentStart = this.getDayRange(this.getDateKey(now)).start;
    return this.getDateKey(new Date(currentStart.getTime() - 60_000));
  }

  getDateKey(date: Date) {
    const shifted = new Date(date.getTime() + IST_OFFSET_MS);
    return shifted.toISOString().slice(0, 10);
  }

  private getDayRange(dateKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error('dateKey must use YYYY-MM-DD.');
    }
    const start = new Date(`${dateKey}T00:00:00.000+05:30`);
    return { start, end: new Date(start.getTime() + DAY_MS) };
  }

  private async collectItems(start: Date, end: Date) {
    const range = { $gte: start, $lt: end };
    const [
      tasks,
      brainDumps,
      journals,
      books,
      highlights,
      health,
      hobbies,
      hobbySessions,
      legacyMedia,
      publications,
      personInteractions,
      companies,
      memories,
      decisions,
      ownerConversations,
    ] = await Promise.all([
      this.taskModel
        .find({
          $or: [
            { createdAt: range },
            { updatedAt: range },
            { completedAt: range },
          ],
        })
        .lean(),
      this.brainDumpModel
        .find({ $or: [{ createdAt: range }, { updatedAt: range }] })
        .lean(),
      this.journalModel
        .find({
          $or: [{ date: range }, { createdAt: range }, { updatedAt: range }],
          'metadata.dailySynthesis': { $ne: true },
          'metadata.dailyPublicDerivative': { $ne: true },
        })
        .lean(),
      this.libraryItemModel
        .find({
          $or: [
            { createdAt: range },
            { updatedAt: range },
            { lastReadAt: range },
            { completedAt: range },
            { lastHighlightedAt: range },
          ],
        })
        .lean(),
      this.libraryHighlightModel
        .find({
          $or: [
            { highlightedAt: range },
            { createdAt: range },
            { updatedAt: range },
          ],
        })
        .lean(),
      this.healthModel
        .find({
          $or: [{ date: range }, { createdAt: range }, { updatedAt: range }],
        })
        .lean(),
      this.hobbyModel
        .find({
          isActive: true,
          $or: [{ createdAt: range }, { updatedAt: range }],
        })
        .lean(),
      this.hobbyPracticeSessionModel
        .find({
          $or: [
            { startedAt: range },
            { endedAt: range },
            { createdAt: range },
            { updatedAt: range },
          ],
        })
        .lean(),
      this.mediaModel
        .find({
          $or: [
            { date: range },
            { createdAt: range },
            { updatedAt: range },
            { 'publishing.publishedAt': range },
          ],
        })
        .lean(),
      this.mediaPublicationModel
        .find({
          isActive: { $ne: false },
          $or: [
            { createdAt: range },
            { updatedAt: range },
            { scheduledAt: range },
            { publishedAt: range },
            { manualPublishCompletedAt: range },
          ],
        })
        .lean(),
      this.personInteractionModel.find({ occurredAt: range }).lean(),
      this.companyModel
        .find({ $or: [{ createdAt: range }, { updatedAt: range }] })
        .lean(),
      this.memoryModel
        .find({
          lifecycleStatus: { $ne: MemoryLifecycleStatus.FORGOTTEN },
          $or: [
            { capturedAt: range },
            { happenedAt: range },
            { createdAt: range },
            { updatedAt: range },
          ],
        })
        .lean(),
      this.decisionModel
        .find({
          $or: [
            { createdAt: range },
            { updatedAt: range },
            { 'commitment.committedAt': range },
            { 'outcome.reviewedAt': range },
            { 'experiments.completedAt': range },
          ],
        })
        .lean(),
      this.conversationModel
        .find({ channel: ConversationChannel.OWNER })
        .select('_id')
        .lean(),
    ]);

    const migratedLegacyIds = new Set(
      publications
        .map((publication) =>
          this.id((publication as unknown as LooseRecord).legacyMediaPostId),
        )
        .filter((id) => id !== 'unknown'),
    );
    const unmatchedLegacyMedia = legacyMedia.filter(
      (record) =>
        !migratedLegacyIds.has(this.id((record as unknown as LooseRecord)._id)),
    );

    const conversationIds = ownerConversations.map((item) => item._id);
    const messages = conversationIds.length
      ? await this.messageModel
          .find({
            conversationId: { $in: conversationIds },
            role: MessageRole.USER,
            createdAt: range,
          })
          .lean()
      : [];

    return [
      ...tasks.map((record) => this.taskItem(record as unknown as LooseRecord)),
      ...brainDumps.map((record) =>
        this.simpleItem(
          record as unknown as LooseRecord,
          HsakaaDailyContextSource.BRAIN_DUMP,
          'thought',
          'title',
          'content',
          HsakaaDailyContextPrivacy.PRIVATE_ONLY,
        ),
      ),
      ...journals.map((record) =>
        this.journalItem(record as unknown as LooseRecord),
      ),
      ...books.map((record) =>
        this.libraryItem(record as unknown as LooseRecord),
      ),
      ...highlights.map((record) =>
        this.highlightItem(record as unknown as LooseRecord),
      ),
      ...health.map((record) =>
        this.healthItem(record as unknown as LooseRecord),
      ),
      ...hobbies.map((record) =>
        this.hobbyItem(record as unknown as LooseRecord),
      ),
      ...hobbySessions.map((record) =>
        this.hobbyPracticeItem(record as unknown as LooseRecord),
      ),
      ...publications.map((record) =>
        this.publicationItem(record as unknown as LooseRecord),
      ),
      ...unmatchedLegacyMedia.map((record) =>
        this.mediaItem(record as unknown as LooseRecord),
      ),
      ...personInteractions.map((record) =>
        this.personInteractionItem(record as unknown as LooseRecord),
      ),
      ...companies.map((record) =>
        this.companyItem(record as unknown as LooseRecord),
      ),
      ...memories.map((record) =>
        this.memoryItem(record as unknown as LooseRecord),
      ),
      ...decisions.map((record) =>
        this.decisionItem(record as unknown as LooseRecord),
      ),
      ...messages.map((record) =>
        this.simpleItem(
          record as unknown as LooseRecord,
          HsakaaDailyContextSource.HSAKAA,
          'conversation',
          undefined,
          'content',
          HsakaaDailyContextPrivacy.PRIVATE_ONLY,
        ),
      ),
    ].filter((item): item is HsakaaDailyContextItem => Boolean(item));
  }

  private taskItem(record: LooseRecord): HsakaaDailyContextItem {
    const status = this.text(record.status);
    const completed = status === 'completed';
    return this.makeItem(
      record,
      HsakaaDailyContextSource.TASK,
      completed ? 'task_completed' : 'task_activity',
      this.text(record.title) || 'Task',
      this.text(record.description) || status,
      HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      completed,
    );
  }

  private journalItem(record: LooseRecord) {
    const visibility = this.text(record.visibility);
    const published = record.isPublished === true;
    const privacy =
      visibility === 'public' && published
        ? HsakaaDailyContextPrivacy.PUBLIC_SAFE
        : HsakaaDailyContextPrivacy.PRIVATE_ONLY;
    return this.makeItem(
      record,
      HsakaaDailyContextSource.JOURNAL,
      'journal_activity',
      this.text(record.title) || 'Journal',
      this.text(record.highlight) || this.text(record.content),
      privacy,
      false,
    );
  }

  private libraryItem(record: LooseRecord) {
    return this.makeItem(
      record,
      HsakaaDailyContextSource.LIBRARY,
      'reading_activity',
      this.text(record.title) || 'Library activity',
      `Status ${this.text(record.status)} · progress ${this.text(record.progressPercentage)}%`,
      HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      this.dateInRecord(record, 'completedAt'),
      {
        title: this.text(record.title),
        author: this.text(record.author) || this.text(record.authors),
        progressPercentage: this.number(record.progressPercentage),
        currentPage: this.number(record.currentPage),
        totalPages: this.number(record.totalPages),
      },
    );
  }

  private highlightItem(record: LooseRecord) {
    return this.makeItem(
      record,
      HsakaaDailyContextSource.HIGHLIGHT,
      'book_highlight',
      'Book highlight',
      this.text(record.note) || this.text(record.text),
      record.isPublic === true
        ? HsakaaDailyContextPrivacy.PUBLIC_SAFE
        : HsakaaDailyContextPrivacy.NEEDS_REVIEW,
      false,
      { libraryItemId: this.id(record.libraryItemId) },
    );
  }

  private healthItem(record: LooseRecord) {
    const workouts = Array.isArray(record.workouts) ? record.workouts : [];
    const firstWorkout = this.object(workouts[0]);
    const sleep = this.object(record.sleep);
    const recovery = this.object(record.recovery);
    const parts = [
      this.text(firstWorkout?.title) || this.text(firstWorkout?.type),
      this.number(sleep?.durationHours) !== null
        ? `sleep ${this.number(sleep?.durationHours)}h`
        : '',
      this.number(recovery?.recoveryScore) !== null
        ? `recovery ${this.number(recovery?.recoveryScore)}`
        : '',
    ].filter(Boolean);
    return this.makeItem(
      record,
      HsakaaDailyContextSource.HEALTH,
      'health_activity',
      'Health',
      parts.join(' · ') || 'Health record updated',
      HsakaaDailyContextPrivacy.PRIVATE_ONLY,
      false,
      {
        sleepDurationHours: this.number(sleep?.durationHours),
        sleepPerformancePercentage: this.number(
          sleep?.sleepPerformancePercentage,
        ),
        sleepQuality: this.number(sleep?.sleepQuality),
        recoveryScore: this.number(recovery?.recoveryScore),
        steps: this.number(record.steps),
        energyScore: this.number(record.energyScore),
        stressScore: this.number(recovery?.stressScore),
        workoutCompleted: workouts.length > 0,
        workoutType: this.text(firstWorkout?.type),
        workoutTitle: this.text(firstWorkout?.title),
        workoutDurationMinutes: this.number(firstWorkout?.durationMinutes),
        workoutStrainScore:
          this.number(firstWorkout?.strainScore) ??
          this.number(record.strainScore),
      },
    );
  }

  private hobbyItem(record: LooseRecord) {
    const status = this.text(record.status);
    const significant = status === 'completed' || status === 'maintenance';
    return this.makeItem(
      record,
      HsakaaDailyContextSource.HOBBY,
      'hobby_progress',
      this.text(record.name) || 'Hobby',
      [
        status ? `Status ${status}` : '',
        this.text(record.currentStageKey)
          ? `stage ${this.text(record.currentStageKey)}`
          : '',
        this.text(record.nextAction)
          ? `next: ${this.text(record.nextAction)}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      significant,
      {
        hobbyId: this.id(record._id),
        status,
        currentStageKey: this.text(record.currentStageKey),
        nextAction: this.text(record.nextAction),
        weeklyTargetMinutes: this.number(record.weeklyTargetMinutes),
        targetSessionsPerWeek: this.number(record.targetSessionsPerWeek),
        mediaEligible: record.mediaEligible === true,
      },
    );
  }

  private hobbyPracticeItem(record: LooseRecord) {
    const duration = this.number(record.durationMinutes);
    const status = this.text(record.status);
    const completed = status === String(HobbyPracticeStatus.COMPLETED);
    return this.makeItem(
      record,
      HsakaaDailyContextSource.HOBBY,
      completed ? 'hobby_practice_completed' : 'hobby_practice',
      'Hobby practice',
      [
        completed ? 'Practice completed' : status || 'Practice activity',
        duration !== null && duration > 0 ? `${duration} min` : '',
        this.text(record.focus),
        this.text(record.reflection),
      ]
        .filter(Boolean)
        .join(' · '),
      HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      completed,
      {
        hobbyId: this.id(record.hobbyId),
        durationMinutes: duration,
        focus: this.text(record.focus),
        enjoyment: this.number(record.enjoyment),
        difficulty: this.number(record.difficulty),
        hasEvidence:
          Array.isArray(record.evidence) && record.evidence.length > 0,
      },
    );
  }

  private mediaItem(record: LooseRecord) {
    const content = this.object(record.content);
    const publishing = this.object(record.publishing);
    const publishedAt = publishing?.publishedAt;
    const isPublished =
      Boolean(publishedAt) || this.text(publishing?.status) === 'published';
    return this.makeItem(
      record,
      HsakaaDailyContextSource.MEDIA,
      isPublished ? 'media_published' : 'media_activity',
      this.text(content?.title) || 'Media activity',
      this.text(content?.hook) || this.text(content?.caption),
      isPublished
        ? HsakaaDailyContextPrivacy.PUBLIC_SAFE
        : HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      isPublished,
    );
  }

  private publicationItem(record: LooseRecord) {
    const published =
      Boolean(this.date(record.publishedAt)) ||
      this.text(record.status) === 'published' ||
      this.text(record.deliveryStatus) === 'published';
    const title =
      this.text(record.title) ||
      `${this.text(record.platform) || 'Media'} ${this.text(record.format) || 'publication'}`;
    const summary =
      this.text(record.hook) ||
      this.text(record.caption) ||
      this.text(record.description) ||
      this.text(record.script);
    return this.makeItem(
      record,
      HsakaaDailyContextSource.MEDIA,
      published ? 'media_published' : 'media_core_activity',
      title,
      summary,
      published
        ? HsakaaDailyContextPrivacy.PUBLIC_SAFE
        : HsakaaDailyContextPrivacy.INTERNAL_SAFE,
      published,
      {
        mediaPublicationId: this.id(record._id),
        contentItemId: this.id(record.contentItemId),
        platform: this.text(record.platform),
        format: this.text(record.format),
        status: this.text(record.status),
      },
    );
  }

  private personInteractionItem(record: LooseRecord) {
    return this.makeItem(
      record,
      HsakaaDailyContextSource.PEOPLE,
      'person_interaction',
      `People · ${this.text(record.type) || 'interaction'}`,
      this.text(record.summary),
      HsakaaDailyContextPrivacy.PRIVATE_ONLY,
      true,
      {
        primaryPersonId: this.id(record.primaryPersonId),
        participantIds: Array.isArray(record.participantIds)
          ? record.participantIds.map((value) => this.id(value))
          : [],
        channel: this.text(record.channel),
        direction: this.text(record.direction),
      },
    );
  }

  private companyItem(record: LooseRecord) {
    return this.makeItem(
      record,
      HsakaaDailyContextSource.COMPANY,
      'company_activity',
      this.text(record.name) || 'Company',
      this.text(record.currentFocus) || this.text(record.description),
      HsakaaDailyContextPrivacy.PRIVATE_ONLY,
      this.dateInRecord(record, 'updatedAt'),
      { companyId: this.id(record._id) },
    );
  }

  private memoryItem(record: LooseRecord) {
    const publicSafe =
      this.text(record.accessLevel) === 'public' &&
      this.text(record.sensitivity) === 'normal' &&
      this.text(record.scope) === 'general';
    return this.makeItem(
      record,
      HsakaaDailyContextSource.MEMORY,
      'memory_activity',
      `Memory · ${this.text(record.type) || 'context'}`,
      this.text(record.content),
      publicSafe
        ? HsakaaDailyContextPrivacy.PUBLIC_SAFE
        : HsakaaDailyContextPrivacy.PRIVATE_ONLY,
      this.text(record.lifecycleStatus) !== 'active',
      { memoryId: this.id(record._id) },
    );
  }

  private decisionItem(record: LooseRecord) {
    const commitment = this.object(record.commitment);
    const outcome = this.object(record.outcome);
    const changed = Boolean(commitment?.committedAt || outcome?.reviewedAt);
    return this.makeItem(
      record,
      HsakaaDailyContextSource.DECISION,
      changed ? 'decision_change' : 'decision_activity',
      this.text(record.question) || 'Decision',
      this.text(record.recommendation) || this.text(record.summary),
      HsakaaDailyContextPrivacy.PRIVATE_ONLY,
      changed,
    );
  }

  private simpleItem(
    record: LooseRecord,
    source: HsakaaDailyContextSource,
    kind: string,
    titleField: string | undefined,
    summaryField: string,
    privacy: HsakaaDailyContextPrivacy,
  ) {
    return this.makeItem(
      record,
      source,
      kind,
      (titleField ? this.text(record[titleField]) : '') ||
        this.labelForSource(source),
      this.text(record[summaryField]),
      privacy,
      false,
    );
  }

  private makeItem(
    record: LooseRecord,
    source: HsakaaDailyContextSource,
    kind: string,
    title: string,
    summary: string,
    privacy: HsakaaDailyContextPrivacy,
    significantChange: boolean,
    metadata: Record<string, unknown> = {},
  ): HsakaaDailyContextItem {
    const sourceId = this.id(record._id);
    return {
      id: `${source}:${sourceId}:${kind}`,
      source,
      kind,
      title: title.slice(0, 220),
      summary: summary.slice(0, 1200),
      occurredAt: this.occurredAt(record).toISOString(),
      sourceId,
      privacy,
      defaultPrivacy: privacy,
      significantChange,
      metadata,
    };
  }

  private applyPrivacyOverrides(
    items: HsakaaDailyContextItem[],
    privacyOverrides: Record<
      string,
      { privacy: HsakaaDailyContextPrivacy; reason: string; reviewedAt: string }
    >,
  ) {
    return items.map((item) => {
      const defaultPrivacy = item.defaultPrivacy ?? item.privacy;
      const privacyOverride = privacyOverrides[item.id];
      return {
        ...item,
        defaultPrivacy,
        privacy: privacyOverride?.privacy ?? defaultPrivacy,
        ...(privacyOverride ? { privacyOverride } : {}),
      };
    });
  }

  private privacyState(items: HsakaaDailyContextItem[]) {
    const privacyCounts = this.countBy(items, (item) => item.privacy);
    const privacyReviewStatus = items.some(
      (item) => item.privacy === HsakaaDailyContextPrivacy.NEEDS_REVIEW,
    )
      ? ('needs_review' as const)
      : ('clear' as const);
    const publicSourceFingerprint = this.publicSourceFingerprint(items);
    return { privacyCounts, privacyReviewStatus, publicSourceFingerprint };
  }

  private publicSourceFingerprint(items: HsakaaDailyContextItem[]) {
    const publicItems = items
      .filter((item) => item.privacy === HsakaaDailyContextPrivacy.PUBLIC_SAFE)
      .map((item) => ({
        id: item.id,
        sourceId: item.sourceId,
        title: item.title,
        summary: item.summary,
        occurredAt: item.occurredAt,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    return createHash('sha256')
      .update(JSON.stringify(publicItems))
      .digest('hex');
  }

  private occurredAt(record: LooseRecord) {
    for (const field of [
      'completedAt',
      'highlightedAt',
      'publishedAt',
      'happenedAt',
      'date',
      'updatedAt',
      'capturedAt',
      'createdAt',
    ]) {
      const value = this.date(record[field]);
      if (value) return value;
    }
    const publishing = this.object(record.publishing);
    const nested = this.date(publishing?.publishedAt);
    return nested ?? new Date();
  }

  private dateInRecord(record: LooseRecord, field: string) {
    return Boolean(this.date(record[field]));
  }

  private date(value: unknown) {
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }

  private object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown) {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string | number | boolean =>
          ['string', 'number', 'boolean'].includes(typeof item),
        )
        .map((item) => String(item))
        .join(', ');
    }
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }

  private number(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private id(value: unknown) {
    if (value instanceof Types.ObjectId) return value.toString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return 'unknown';
  }

  private labelForSource(source: HsakaaDailyContextSource) {
    return source.replaceAll('_', ' ');
  }

  private countBy(
    items: HsakaaDailyContextItem[],
    selector: (item: HsakaaDailyContextItem) => string,
  ) {
    return items.reduce<Record<string, number>>((result, item) => {
      const key = selector(item);
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
  }
}
