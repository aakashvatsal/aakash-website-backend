import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { LibraryItem } from '../library/schemas/library-item.schema';
import {
  NowActivityType,
  NowAvailability,
  NowSource,
  NowVisibility,
} from '../now/schemas/now-status.schema';
import { NowService } from '../now/now.service';
import {
  TaskPriority,
  TaskSource,
  TaskStatus,
  Task,
} from '../tasks/schemas/task.schema';
import { CreateHobbyDto } from './dto/create-hobby.dto';
import { HobbyQueryDto, HobbySessionQueryDto } from './dto/hobby-query.dto';
import {
  CompletePlannedHobbySessionDto,
  FinishHobbySessionDto,
  LogHobbySessionDto,
  StartHobbySessionDto,
} from './dto/hobby-session.dto';
import { UpdateHobbyDto } from './dto/update-hobby.dto';
import {
  Hobby,
  HobbyCategory,
  HobbyDocument,
  HobbyIntensity,
  HobbyPracticeTimeWindow,
  HobbySource,
  HobbyStageStatus,
  HobbyStatus,
} from './schemas/hobby.schema';
import {
  HobbyReview,
  HobbyReviewDocument,
} from './schemas/hobby-review.schema';
import {
  HobbyPracticeSession,
  HobbyPracticeSessionDocument,
  HobbyPracticeSource,
  HobbyPracticeStatus,
} from './schemas/hobby-practice-session.schema';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_HOBBIES = 5;
const FOUNDATION_SEASON_KEY = 'foundation-growth-2026-09';
const FOUNDATION_SEASON_LABEL = 'Six-Month Growth Season · Sep 2026 – Mar 2027';
const FOUNDATION_SEASON_START = new Date('2026-09-22T00:00:00.000+05:30');
const FOUNDATION_SEASON_END = new Date('2027-03-22T23:59:59.999+05:30');

type LeanRecord = Record<string, unknown> & { _id?: unknown };

@Injectable()
export class HobbiesService implements OnModuleInit {
  constructor(
    @InjectModel(Hobby.name)
    private readonly hobbyModel: Model<HobbyDocument>,
    @InjectModel(HobbyPracticeSession.name)
    private readonly sessionModel: Model<HobbyPracticeSessionDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<Task>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItem>,
    @InjectModel(HobbyReview.name)
    private readonly reviewModel: Model<HobbyReviewDocument>,
    private readonly nowService: NowService,
  ) {}

  async onModuleInit() {
    await this.ensureV2Defaults();
    await this.bootstrapStarterHobbies();
  }

  private async ensureV2Defaults() {
    await this.hobbyModel.updateMany(
      { aiCoachingEnabled: { $exists: false } },
      { $set: { aiCoachingEnabled: true } },
    );
    await this.hobbyModel.updateMany(
      { automaticReviewsEnabled: { $exists: false } },
      { $set: { automaticReviewsEnabled: true } },
    );
    await this.hobbyModel.updateMany(
      { preferredPracticeTime: { $exists: false } },
      { $set: { preferredPracticeTime: HobbyPracticeTimeWindow.FLEXIBLE } },
    );
    await this.hobbyModel.updateOne(
      { slug: 'guitar' },
      { $set: { preferredPracticeTime: HobbyPracticeTimeWindow.EVENING } },
    );
    await this.hobbyModel.updateOne(
      { slug: 'voice-singing' },
      { $set: { preferredPracticeTime: HobbyPracticeTimeWindow.MORNING } },
    );
    await this.hobbyModel.updateMany(
      { ownerCompletionRequired: { $exists: false } },
      { $set: { ownerCompletionRequired: true } },
    );
    await this.sessionModel.updateMany(
      {
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: { $exists: false },
        source: {
          $in: [HobbyPracticeSource.MANUAL, HobbyPracticeSource.TIMER],
        },
      },
      { $set: { ownerConfirmed: true } },
    );
    await this.sessionModel.updateMany(
      { ownerConfirmed: { $exists: false } },
      { $set: { ownerConfirmed: false } },
    );
  }

  async bootstrapStarterHobbies() {
    const starters = [
      this.guitarStarter(),
      this.voiceStarter(),
      this.chessStarter(),
      this.spanishStarter(),
      this.storytellingStarter(),
    ];
    const seasonSlugs = starters
      .map((starter) => starter.slug)
      .filter((slug): slug is string => Boolean(slug));
    let created = 0;
    let updated = 0;

    for (const starter of starters) {
      const existing = await this.hobbyModel.findOne({ slug: starter.slug });
      if (!existing) {
        await this.hobbyModel.create(starter);
        created += 1;
        continue;
      }
      if (existing.seasonKey === FOUNDATION_SEASON_KEY) continue;

      const linkedLibraryItemIds = existing.linkedLibraryItemIds ?? [];
      Object.assign(existing, starter);
      existing.linkedLibraryItemIds = linkedLibraryItemIds;
      existing.isActive = true;
      existing.isArchived = false;
      await existing.save();
      updated += 1;
    }

    await this.hobbyModel.updateMany(
      {
        slug: { $nin: seasonSlugs },
        status: { $in: [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE] },
        isActive: true,
        isArchived: false,
      },
      { $set: { status: HobbyStatus.PAUSED } },
    );

    return { created, updated, activeSeason: FOUNDATION_SEASON_KEY };
  }

  async create(dto: CreateHobbyDto) {
    if (
      [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE].includes(
        dto.status ?? HobbyStatus.BACKLOG,
      )
    ) {
      await this.assertActiveHobbyCapacity();
    }
    const slug = this.slugify(dto.slug || dto.name);
    const existing = await this.hobbyModel
      .findOne({ slug, isActive: true })
      .lean();
    if (existing) {
      throw new BadRequestException('A hobby with this name already exists.');
    }

    const curriculum = this.normalizeCurriculum(dto.curriculum ?? []);
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : undefined;
    const targetDate = dto.targetDate
      ? new Date(dto.targetDate)
      : startedAt && dto.targetHorizonWeeks
        ? new Date(startedAt.getTime() + dto.targetHorizonWeeks * 7 * DAY_MS)
        : undefined;
    this.assertTargetWindow(startedAt, targetDate);

    return this.hobbyModel.create({
      ...dto,
      slug,
      startedAt,
      targetDate,
      linkedLibraryItemIds: (dto.linkedLibraryItemIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      tags: this.normalizeTags(dto.tags),
      curriculum,
      source: dto.source ?? HobbySource.MANUAL,
      currentStageKey:
        dto.currentStageKey ??
        curriculum.find((stage) => stage.status === HobbyStageStatus.CURRENT)
          ?.key,
      isActive: true,
      isArchived: false,
    });
  }

  async findAll(query: HobbyQueryDto = {}) {
    const filter: Record<string, unknown> = query.archived
      ? { isArchived: true }
      : { isActive: true, isArchived: false };
    if (query.status) filter.status = query.status;
    return this.hobbyModel.find(filter).sort({ status: 1, name: 1 }).lean();
  }

  async findOne(hobbyId: string) {
    const hobby = await this.hobbyModel
      .findOne({ _id: this.toObjectId(hobbyId), isActive: true })
      .lean();
    if (!hobby) throw new NotFoundException('Hobby not found.');

    const [stats, sessions, resources] = await Promise.all([
      this.getHobbyStats(hobby as unknown as LeanRecord),
      this.sessionModel
        .find({ hobbyId: hobby._id })
        .sort({ startedAt: -1 })
        .limit(20)
        .lean(),
      this.getResources((hobby.linkedLibraryItemIds ?? []).map(String)),
    ]);

    return { ...hobby, stats, recentSessions: sessions, resources };
  }

  async update(hobbyId: string, dto: UpdateHobbyDto) {
    const hobby = await this.getDocument(hobbyId);
    const currentlyActive = [
      HobbyStatus.ACTIVE,
      HobbyStatus.MAINTENANCE,
    ].includes(hobby.status);
    const requestedActive = dto.status
      ? [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE].includes(dto.status)
      : currentlyActive;
    if (!currentlyActive && requestedActive) {
      await this.assertActiveHobbyCapacity(hobby._id);
    }
    if (dto.name !== undefined) hobby.name = dto.name.trim();
    if (dto.slug !== undefined || dto.name !== undefined) {
      hobby.slug = this.slugify(dto.slug || dto.name || hobby.name);
    }
    if (dto.status !== undefined) hobby.status = dto.status;
    if (dto.category !== undefined) hobby.category = dto.category;
    if (dto.intensity !== undefined) hobby.intensity = dto.intensity;
    if (dto.goal !== undefined) hobby.goal = dto.goal.trim();
    if (dto.why !== undefined) hobby.why = dto.why.trim();
    if (dto.currentSkillLevel !== undefined)
      hobby.currentSkillLevel = dto.currentSkillLevel.trim();
    if (dto.startedAt !== undefined) hobby.startedAt = new Date(dto.startedAt);
    if (dto.targetDate !== undefined)
      hobby.targetDate = new Date(dto.targetDate);
    this.assertTargetWindow(hobby.startedAt, hobby.targetDate);
    if (dto.targetHorizonWeeks !== undefined)
      hobby.targetHorizonWeeks = dto.targetHorizonWeeks;
    if (dto.weeklyTargetMinutes !== undefined)
      hobby.weeklyTargetMinutes = dto.weeklyTargetMinutes;
    if (dto.targetSessionsPerWeek !== undefined)
      hobby.targetSessionsPerWeek = dto.targetSessionsPerWeek;
    if (dto.recommendedSessionMinutes !== undefined)
      hobby.recommendedSessionMinutes = dto.recommendedSessionMinutes;
    if (dto.preferredWeekdays !== undefined)
      hobby.preferredWeekdays = [...new Set(dto.preferredWeekdays)].sort();
    if (dto.preferredPracticeTime !== undefined)
      hobby.preferredPracticeTime = dto.preferredPracticeTime;
    if (dto.aiCoachingEnabled !== undefined)
      hobby.aiCoachingEnabled = dto.aiCoachingEnabled;
    if (dto.automaticReviewsEnabled !== undefined)
      hobby.automaticReviewsEnabled = dto.automaticReviewsEnabled;
    if (dto.currentStageKey !== undefined)
      hobby.currentStageKey = dto.currentStageKey.trim();
    if (dto.nextAction !== undefined) hobby.nextAction = dto.nextAction.trim();
    if (dto.nextActionMinutes !== undefined)
      hobby.nextActionMinutes = dto.nextActionMinutes;
    if (dto.curriculum !== undefined)
      hobby.curriculum = this.normalizeCurriculum(dto.curriculum);
    if (dto.linkedLibraryItemIds !== undefined)
      hobby.linkedLibraryItemIds = dto.linkedLibraryItemIds.map(
        (id) => new Types.ObjectId(id),
      );
    if (dto.tags !== undefined) hobby.tags = this.normalizeTags(dto.tags);
    if (dto.candidateProfile !== undefined)
      hobby.candidateProfile = {
        genuineCuriosity: dto.candidateProfile.genuineCuriosity ?? 5,
        lifestyleFit: dto.candidateProfile.lifestyleFit ?? 5,
        novelty: dto.candidateProfile.novelty ?? 5,
        strategicUsefulness: dto.candidateProfile.strategicUsefulness ?? 5,
        mediaUsefulness: dto.candidateProfile.mediaUsefulness ?? 5,
        weeklyMinutes: dto.candidateProfile.weeklyMinutes ?? 120,
        note: dto.candidateProfile.note,
      };
    if (dto.source !== undefined) hobby.source = dto.source;
    if (dto.mediaEligible !== undefined)
      hobby.mediaEligible = dto.mediaEligible;
    return hobby.save();
  }

  async archive(hobbyId: string) {
    const hobby = await this.getDocument(hobbyId);
    hobby.isArchived = true;
    hobby.isActive = false;
    return hobby.save();
  }

  async startSession(hobbyId: string, dto: StartHobbySessionDto) {
    const hobby = await this.getDocument(hobbyId);
    if (![HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE].includes(hobby.status)) {
      throw new BadRequestException(
        'Only active or maintenance hobbies can start practice.',
      );
    }

    const active = await this.sessionModel.findOne({
      status: HobbyPracticeStatus.IN_PROGRESS,
    });
    if (active) {
      throw new BadRequestException(
        'Another hobby practice session is already in progress.',
      );
    }

    const session = await this.sessionModel.create({
      hobbyId: hobby._id,
      status: HobbyPracticeStatus.IN_PROGRESS,
      startedAt: new Date(),
      durationMinutes: 0,
      focus: dto.focus?.trim() || hobby.nextAction || hobby.currentStageKey,
      source: dto.source ?? HobbyPracticeSource.TIMER,
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : undefined,
      metadata: dto.metadata ?? {},
    });

    if (await this.nowService.canAutomaticSourceReplaceCurrent()) {
      const now = await this.nowService.create({
        activityType: NowActivityType.LEARNING,
        activity: `Practising ${hobby.name}`,
        headline: `Learning ${hobby.name}`,
        description: session.focus || 'Hobby practice session',
        currentFocus: session.focus || hobby.nextAction,
        availability: NowAvailability.FOCUSED,
        visibility: NowVisibility.PRIVATE,
        showAvailability: false,
        showMood: false,
        showHealth: false,
        source: NowSource.HOBBY,
        sourceExternalId: session._id.toString(),
        tags: ['hobby', 'practice', hobby.slug],
        metadata: { hobbyId: hobby._id.toString() },
      });
      session.nowStatusId = now._id;
      await session.save();
    }

    return session.toObject();
  }

  async finishSession(sessionId: string, dto: FinishHobbySessionDto) {
    const session = await this.sessionModel.findOne({
      _id: this.toObjectId(sessionId),
      status: HobbyPracticeStatus.IN_PROGRESS,
    });
    if (!session)
      throw new NotFoundException('Active hobby session not found.');

    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    if (endedAt <= session.startedAt) {
      throw new BadRequestException('endedAt must be after startedAt.');
    }

    session.endedAt = endedAt;
    session.durationMinutes = Math.max(
      1,
      Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60_000),
    );
    session.status = HobbyPracticeStatus.COMPLETED;
    session.ownerConfirmed = true;
    session.notes = dto.notes?.trim();
    session.reflection = dto.reflection?.trim();
    session.difficulty = dto.difficulty;
    session.enjoyment = dto.enjoyment;
    session.evidence = dto.evidence ?? [];
    await session.save();

    await Promise.all([
      this.completeLinkedTask(session.taskId),
      this.endLinkedNow(session._id.toString()),
    ]);

    return session.toObject();
  }

  async logSession(hobbyId: string, dto: LogHobbySessionDto) {
    const hobby = await this.getDocument(hobbyId);
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    const startedAt = dto.startedAt
      ? new Date(dto.startedAt)
      : new Date(endedAt.getTime() - dto.durationMinutes * 60_000);
    if (endedAt <= startedAt) {
      throw new BadRequestException('endedAt must be after startedAt.');
    }

    const session = await this.sessionModel.create({
      hobbyId: hobby._id,
      status: HobbyPracticeStatus.COMPLETED,
      startedAt,
      endedAt,
      durationMinutes: dto.durationMinutes,
      focus: dto.focus?.trim() || hobby.nextAction || hobby.currentStageKey,
      notes: dto.notes?.trim(),
      reflection: dto.reflection?.trim(),
      difficulty: dto.difficulty,
      enjoyment: dto.enjoyment,
      evidence: dto.evidence ?? [],
      source: dto.source ?? HobbyPracticeSource.MANUAL,
      ownerConfirmed: true,
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : undefined,
      metadata: dto.metadata ?? {},
    });
    await this.completeLinkedTask(session.taskId);
    return session.toObject();
  }

  async completePlannedSession(
    hobbyId: string,
    dto: CompletePlannedHobbySessionDto,
  ) {
    const hobby = await this.getDocument(hobbyId);
    const dateKey = dto.dateKey.slice(0, 10);
    const dayStart = new Date(`${dateKey}T00:00:00.000+05:30`);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const existing = await this.sessionModel
      .findOne({
        hobbyId: hobby._id,
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: true,
        startedAt: { $gte: dayStart, $lt: dayEnd },
      })
      .lean();
    if (existing) return existing;

    const preferredMinutes =
      hobby.recommendedSessionMinutes || hobby.nextActionMinutes || 20;
    const startClock =
      hobby.preferredPracticeTime === HobbyPracticeTimeWindow.MORNING
        ? '08:00'
        : hobby.preferredPracticeTime === HobbyPracticeTimeWindow.AFTERNOON
          ? '15:00'
          : '19:00';
    const startedAt = new Date(`${dateKey}T${startClock}:00.000+05:30`);
    const endedAt = new Date(startedAt.getTime() + preferredMinutes * 60_000);
    const session = await this.sessionModel.create({
      hobbyId: hobby._id,
      status: HobbyPracticeStatus.COMPLETED,
      startedAt,
      endedAt,
      durationMinutes: preferredMinutes,
      focus:
        hobby.nextAction || hobby.currentStageKey || `Practice ${hobby.name}`,
      source: HobbyPracticeSource.MANUAL,
      ownerConfirmed: true,
      metadata: {
        ownerMarkedComplete: true,
        plannedSession: true,
        planDateKey: dateKey,
      },
    });

    await this.taskModel.updateOne(
      {
        sourceExternalId: `hobby-plan:${hobby._id.toString()}:${dateKey}`,
        isActive: true,
        status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
      {
        $set: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
        },
      },
    );
    return session.toObject();
  }

  async getSessions(hobbyId: string, query: HobbySessionQueryDto = {}) {
    await this.getDocument(hobbyId);
    const filter: Record<string, unknown> = {
      hobbyId: this.toObjectId(hobbyId),
    };
    if (query.from || query.to) {
      filter.startedAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    return this.sessionModel.find(filter).sort({ startedAt: -1 }).lean();
  }

  async advance(hobbyId: string) {
    const hobby = await this.getDocument(hobbyId);
    const stages = [...(hobby.curriculum ?? [])].sort(
      (a, b) => a.order - b.order,
    );
    if (!stages.length) {
      throw new BadRequestException('This hobby has no curriculum to advance.');
    }

    let currentIndex = stages.findIndex(
      (stage) =>
        stage.key === hobby.currentStageKey ||
        stage.status === HobbyStageStatus.CURRENT,
    );
    if (currentIndex < 0) currentIndex = 0;
    stages[currentIndex].status = HobbyStageStatus.COMPLETED;

    const next = stages[currentIndex + 1];
    if (next) {
      next.status = HobbyStageStatus.CURRENT;
      hobby.currentStageKey = next.key;
      hobby.nextAction =
        next.exercises?.[0] || next.objective || `Start ${next.title}`;
      hobby.nextActionMinutes = hobby.recommendedSessionMinutes;
    } else {
      hobby.currentStageKey = stages[currentIndex].key;
      hobby.status = HobbyStatus.MAINTENANCE;
      hobby.intensity = HobbyIntensity.MAINTENANCE;
      hobby.nextAction = `Maintain ${hobby.name} with one deliberate session.`;
      hobby.nextActionMinutes = hobby.recommendedSessionMinutes;
    }
    hobby.curriculum = stages;
    return hobby.save();
  }

  async linkResource(hobbyId: string, libraryItemId: string) {
    const [hobby, item] = await Promise.all([
      this.getDocument(hobbyId),
      this.libraryItemModel.findOne({
        _id: this.toObjectId(libraryItemId),
        isActive: true,
      }),
    ]);
    if (!item) throw new NotFoundException('Library item not found.');
    const exists = hobby.linkedLibraryItemIds.some((id) => id.equals(item._id));
    if (!exists) hobby.linkedLibraryItemIds.push(item._id);
    return hobby.save();
  }

  async unlinkResource(hobbyId: string, libraryItemId: string) {
    const hobby = await this.getDocument(hobbyId);
    hobby.linkedLibraryItemIds = hobby.linkedLibraryItemIds.filter(
      (id) => id.toString() !== libraryItemId,
    );
    return hobby.save();
  }

  async getOverview() {
    const hobbies = await this.hobbyModel
      .find({ isActive: true, isArchived: false })
      .sort({ status: 1, intensity: 1, name: 1 })
      .lean();

    const activeHobbies = hobbies.filter((hobby) =>
      [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE].includes(hobby.status),
    );
    const backlog = hobbies.filter(
      (hobby) => hobby.status === HobbyStatus.BACKLOG,
    );
    const cards = await Promise.all(
      activeHobbies.map(async (hobby) => {
        const [stats, resources, latestReview] = await Promise.all([
          this.getHobbyStats(hobby as unknown as LeanRecord),
          this.getResources((hobby.linkedLibraryItemIds ?? []).map(String)),
          this.reviewModel
            .findOne({ hobbyId: hobby._id, isActive: true })
            .sort({ periodEnd: -1 })
            .select(
              'period periodStart periodEnd summary wins stuckPoints nextFocus suggestedWeeklyMinutes suggestedSessions suggestedSessionMinutes curriculumRecommendation nextPlan resourceSearchTerms evidenceComparison',
            )
            .lean(),
        ]);
        return {
          ...hobby,
          ...stats,
          resources,
          latestReview,
          coachedNextAction:
            latestReview?.nextFocus?.trim() || hobby.nextAction || undefined,
          coachedSessionMinutes:
            latestReview?.suggestedSessionMinutes ||
            hobby.nextActionMinutes ||
            hobby.recommendedSessionMinutes ||
            20,
        };
      }),
    );

    const doNext =
      cards
        .filter((card) => card.recommendedTodayMinutes > 0)
        .sort((a, b) => b.priorityScore - a.priorityScore)[0] ?? null;
    const weeklyTargetMinutes = cards.reduce(
      (sum, hobby) => sum + (hobby.weeklyTargetMinutes ?? 0),
      0,
    );
    const weeklyMinutes = cards.reduce(
      (sum, hobby) => sum + hobby.weeklyMinutes,
      0,
    );
    const sessionsThisWeek = cards.reduce(
      (sum, hobby) => sum + hobby.sessionsThisWeek,
      0,
    );
    const nextHobby = this.nextHobbyRecommendation(
      backlog as unknown as LeanRecord[],
      cards,
    );

    const todayKey = this.getDateKey(new Date());
    const seasonStartKey = this.getDateKey(FOUNDATION_SEASON_START);
    const seasonEndKey = this.getDateKey(FOUNDATION_SEASON_END);
    const seasonDaysTotal = Math.max(
      1,
      Math.round(
        (FOUNDATION_SEASON_END.getTime() - FOUNDATION_SEASON_START.getTime()) /
          DAY_MS,
      ) + 1,
    );
    const seasonElapsedDays =
      todayKey < seasonStartKey
        ? 0
        : todayKey > seasonEndKey
          ? seasonDaysTotal
          : Math.max(
              1,
              Math.round(
                (new Date(`${todayKey}T00:00:00.000+05:30`).getTime() -
                  FOUNDATION_SEASON_START.getTime()) /
                  DAY_MS,
              ) + 1,
            );

    return {
      generatedAt: new Date().toISOString(),
      trackingNote:
        'Only practice that Aakash explicitly finishes or marks complete counts as completed. Scheduled tasks, elapsed time, AI inference and calendar time never count automatically.',
      season: {
        key: FOUNDATION_SEASON_KEY,
        label: FOUNDATION_SEASON_LABEL,
        startDate: seasonStartKey,
        endDate: seasonEndKey,
        maxActiveHobbies: MAX_ACTIVE_HOBBIES,
        maxHobbiesPerDay: 2,
        activeHobbies: cards.length,
        ownerCompletionRequired: true,
        elapsedDays: Math.min(seasonDaysTotal, seasonElapsedDays),
        totalDays: seasonDaysTotal,
        progressPercent: Math.round(
          (Math.min(seasonDaysTotal, seasonElapsedDays) / seasonDaysTotal) *
            100,
        ),
      },
      active: cards,
      backlog,
      doNext: doNext
        ? {
            hobbyId: String(doNext._id),
            name: doNext.name,
            action:
              doNext.coachedNextAction ||
              doNext.nextAction ||
              this.firstString(doNext.currentStage?.exercises) ||
              `Practice ${doNext.name}`,
            recommendedMinutes: Math.min(
              doNext.recommendedTodayMinutes,
              Math.max(5, this.number(doNext.coachedSessionMinutes) || 20),
            ),
            reason:
              doNext.pace === 'behind'
                ? `${doNext.name} is behind its expected weekly pace.`
                : `This is the highest-value next deliberate-practice block today.`,
          }
        : null,
      learningLoad: {
        weeklyTargetMinutes,
        weeklyMinutes,
        sessionsThisWeek,
        load:
          weeklyTargetMinutes > 480
            ? 'high'
            : weeklyTargetMinutes > 240
              ? 'moderate'
              : 'light',
        recommendation:
          cards.length >= MAX_ACTIVE_HOBBIES
            ? 'This six-month season is full at five hobbies. Keep the weekly plan capped at two hobby sessions per day and rotate only after the season review.'
            : 'There is room in the six-month season, but never exceed five active hobbies or two hobby sessions in one day.',
      },
      nextHobby,
    };
  }

  async syncPracticeTasks() {
    const overview = await this.getOverview();
    const dateKey = this.getDateKey(new Date());
    const dueAt = new Date(`${dateKey}T21:00:00.000+05:30`);
    const reminderAt = new Date(`${dateKey}T18:30:00.000+05:30`);
    let created = 0;
    let skipped = 0;

    for (const hobby of overview.active) {
      if (
        hobby.status !== HobbyStatus.ACTIVE ||
        hobby.recommendedTodayMinutes <= 0 ||
        !this.isDateWithinTargetWindow(
          dateKey,
          hobby.startedAt,
          hobby.targetDate,
        )
      ) {
        skipped += 1;
        continue;
      }
      const shouldCreate =
        hobby.pace === 'behind' ||
        hobby.sessionsThisWeek < hobby.expectedSessionsByToday;
      if (!shouldCreate) {
        skipped += 1;
        continue;
      }
      const sourceExternalId = `hobby-practice:${String(hobby._id)}:${dateKey}`;
      const exists = await this.taskModel.exists({
        sourceExternalId,
        isActive: true,
      });
      if (exists) {
        skipped += 1;
        continue;
      }
      await this.taskModel.create({
        title: `Practice ${hobby.name} · ${hobby.recommendedTodayMinutes} min`,
        description:
          hobby.nextAction ||
          `Complete one deliberate ${hobby.name} practice session.`,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        area: 'Hobbies',
        dueAt,
        reminderAt,
        estimatedMinutes: hobby.recommendedTodayMinutes,
        tags: ['hobby', 'practice', hobby.slug],
        source: TaskSource.HSAKAA,
        sourceExternalId,
        metadata: { hobbyId: String(hobby._id), hobbySlug: hobby.slug },
        isFavourite: false,
        isActive: true,
        isArchived: false,
      });
      created += 1;
    }
    return { dateKey, created, skipped };
  }

  private async getHobbyStats(hobby: LeanRecord) {
    const now = new Date();
    const { start: weekStart, end: weekEnd } = this.getWeekRange(now);
    const { start: dayStart, end: dayEnd } = this.getDayRange(now);
    const hobbyId = this.toObjectId(String(hobby._id));
    const sessions = await this.sessionModel
      .find({
        hobbyId,
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: true,
        startedAt: { $gte: weekStart, $lt: weekEnd },
      })
      .sort({ startedAt: 1 })
      .lean();
    const activeSession = await this.sessionModel
      .findOne({ hobbyId, status: HobbyPracticeStatus.IN_PROGRESS })
      .lean();
    const weeklyMinutes = sessions.reduce(
      (sum, session) => sum + (session.durationMinutes ?? 0),
      0,
    );
    const todayMinutes = sessions
      .filter(
        (session) =>
          session.startedAt >= dayStart && session.startedAt < dayEnd,
      )
      .reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0);
    const weeklyTargetMinutes = this.number(hobby.weeklyTargetMinutes);
    const targetSessions = this.number(hobby.targetSessionsPerWeek);
    const elapsedDays = this.weekdayIndex(now) + 1;
    const expectedMinutesByToday = Math.round(
      (weeklyTargetMinutes * elapsedDays) / 7,
    );
    const expectedSessionsByToday = Math.ceil(
      (targetSessions * elapsedDays) / 7,
    );
    const remainingMinutes = Math.max(0, weeklyTargetMinutes - weeklyMinutes);
    const recommendedSessionMinutes =
      this.number(hobby.recommendedSessionMinutes) ||
      this.number(hobby.nextActionMinutes) ||
      20;
    const recommendedTodayMinutes = Math.min(
      recommendedSessionMinutes,
      remainingMinutes,
    );
    const pace =
      weeklyTargetMinutes === 0
        ? 'maintenance'
        : weeklyMinutes >= weeklyTargetMinutes
          ? 'complete'
          : weeklyMinutes + Math.max(20, recommendedSessionMinutes) <
              expectedMinutesByToday
            ? 'behind'
            : 'on_track';
    const curriculum = Array.isArray(hobby.curriculum) ? hobby.curriculum : [];
    const completedStages = curriculum.filter(
      (stage) => this.object(stage)?.status === HobbyStageStatus.COMPLETED,
    ).length;
    const currentStage =
      curriculum
        .map((stage) => this.object(stage))
        .find(
          (stage) =>
            stage?.key === hobby.currentStageKey ||
            stage?.status === HobbyStageStatus.CURRENT,
        ) ?? null;
    const curriculumProgress = curriculum.length
      ? Math.round((completedStages / curriculum.length) * 100)
      : 0;
    const priorityScore =
      (pace === 'behind' ? 40 : pace === 'on_track' ? 20 : 0) +
      (hobby.intensity === HobbyIntensity.PRIMARY
        ? 20
        : hobby.intensity === HobbyIntensity.SECONDARY
          ? 10
          : 0) +
      (todayMinutes === 0 ? 10 : 0) +
      Math.min(
        20,
        Math.round((remainingMinutes / Math.max(weeklyTargetMinutes, 1)) * 20),
      );

    const targetPeriod = await this.getTargetPeriodProgress(
      hobby,
      hobbyId,
      now,
    );

    return {
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      weeklyMinutes,
      todayMinutes,
      sessionsThisWeek: sessions.length,
      expectedMinutesByToday,
      expectedSessionsByToday,
      remainingMinutes,
      recommendedTodayMinutes,
      pace,
      curriculumProgress,
      completedStages,
      totalStages: curriculum.length,
      currentStage,
      activeSession,
      priorityScore,
      targetPeriod,
    };
  }

  private async getTargetPeriodProgress(
    hobby: LeanRecord,
    hobbyId: Types.ObjectId,
    now: Date,
  ) {
    const startedAt = this.date(hobby.startedAt);
    const targetDate = this.date(hobby.targetDate);
    if (!startedAt || !targetDate) return null;

    const startKey = this.getDateKey(startedAt);
    const endKey = this.getDateKey(targetDate);
    const start = new Date(`${startKey}T00:00:00.000+05:30`);
    const endExclusive = new Date(
      new Date(`${endKey}T00:00:00.000+05:30`).getTime() + DAY_MS,
    );
    const todayKey = this.getDateKey(now);
    const totalDays = Math.max(
      1,
      Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS),
    );
    const weeklyTargetMinutes = this.number(hobby.weeklyTargetMinutes);
    const targetSessionsPerWeek = this.number(hobby.targetSessionsPerWeek);
    const targetMinutes = Math.round((weeklyTargetMinutes * totalDays) / 7);
    const targetSessions = Math.round((targetSessionsPerWeek * totalDays) / 7);

    const sessions = await this.sessionModel
      .find({
        hobbyId,
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: true,
        startedAt: { $gte: start, $lt: endExclusive },
      })
      .select('durationMinutes startedAt')
      .lean();
    const actualMinutes = sessions.reduce(
      (sum, session) => sum + (session.durationMinutes ?? 0),
      0,
    );
    const actualSessions = sessions.length;

    const beforeStart = todayKey < startKey;
    const afterEnd = todayKey > endKey;
    const elapsedDays = beforeStart
      ? 0
      : afterEnd
        ? totalDays
        : Math.min(
            totalDays,
            Math.max(
              1,
              Math.floor(
                (new Date(`${todayKey}T00:00:00.000+05:30`).getTime() -
                  start.getTime()) /
                  DAY_MS,
              ) + 1,
            ),
          );
    const daysRemaining = beforeStart
      ? totalDays
      : Math.max(0, totalDays - elapsedDays);
    const timeProgress = Math.round((elapsedDays / totalDays) * 100);
    const expectedMinutesByToday = Math.round(
      (targetMinutes * elapsedDays) / totalDays,
    );
    const expectedSessionsByToday = Math.round(
      (targetSessions * elapsedDays) / totalDays,
    );
    const minutesProgress = targetMinutes
      ? Math.round((actualMinutes / targetMinutes) * 100)
      : 0;
    const sessionsProgress = targetSessions
      ? Math.round((actualSessions / targetSessions) * 100)
      : 0;
    const progressParts = [
      targetMinutes > 0 ? minutesProgress : null,
      targetSessions > 0 ? sessionsProgress : null,
    ].filter((value): value is number => value !== null);
    const overallProgress = progressParts.length
      ? Math.round(
          progressParts.reduce((sum, value) => sum + value, 0) /
            progressParts.length,
        )
      : 0;

    let pace:
      'not_started' | 'ahead' | 'on_track' | 'behind' | 'complete' | 'ended';
    if (beforeStart) pace = 'not_started';
    else if (
      (targetMinutes === 0 || actualMinutes >= targetMinutes) &&
      (targetSessions === 0 || actualSessions >= targetSessions)
    )
      pace = 'complete';
    else if (afterEnd) pace = 'ended';
    else if (overallProgress + 8 < timeProgress) pace = 'behind';
    else if (overallProgress > timeProgress + 8) pace = 'ahead';
    else pace = 'on_track';

    return {
      startDate: startKey,
      targetDate: endKey,
      totalDays,
      elapsedDays,
      daysRemaining,
      targetMinutes,
      targetSessions,
      actualMinutes,
      actualSessions,
      expectedMinutesByToday,
      expectedSessionsByToday,
      minutesProgress,
      sessionsProgress,
      overallProgress,
      timeProgress,
      pace,
    };
  }

  private assertTargetWindow(startedAt?: Date, targetDate?: Date) {
    if (!startedAt || !targetDate) return;
    if (targetDate.getTime() < startedAt.getTime()) {
      throw new BadRequestException(
        'targetDate must be on or after startedAt.',
      );
    }
  }

  private isDateWithinTargetWindow(
    dateKey: string,
    startedAt: unknown,
    targetDate: unknown,
  ) {
    const start = this.date(startedAt);
    const end = this.date(targetDate);
    if (start && dateKey < this.getDateKey(start)) return false;
    if (end && dateKey > this.getDateKey(end)) return false;
    return true;
  }

  private nextHobbyRecommendation(
    backlog: LeanRecord[],
    active: Array<Record<string, unknown>>,
  ) {
    if (!backlog.length) {
      return {
        ready: false,
        hobby: null,
        reason:
          'No backlog candidate exists yet. Add hobbies you are genuinely curious about before HSAKAA chooses the next cycle.',
      };
    }

    const scored = backlog
      .map((hobby) => {
        const profile = this.object(hobby.candidateProfile) ?? {};
        const weeklyMinutes = this.number(profile.weeklyMinutes) || 120;
        const score =
          this.number(profile.genuineCuriosity) * 0.35 +
          this.number(profile.lifestyleFit) * 0.25 +
          this.number(profile.novelty) * 0.15 +
          this.number(profile.strategicUsefulness) * 0.15 +
          this.number(profile.mediaUsefulness) * 0.1 -
          Math.min(1.5, weeklyMinutes / 600);
        return { hobby, score: Math.round(score * 10) / 10, weeklyMinutes };
      })
      .sort((a, b) => b.score - a.score);

    const candidate = scored[0];
    const activeSeasonHobbies = active.filter((hobby) =>
      [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE].includes(
        hobby.status as HobbyStatus,
      ),
    );
    const weeklyLoad = active.reduce(
      (sum, hobby) => sum + this.number(hobby.weeklyTargetMinutes),
      0,
    );
    const earliestTarget = activeSeasonHobbies
      .map((hobby) => this.date(hobby.targetDate))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const ready =
      activeSeasonHobbies.length < MAX_ACTIVE_HOBBIES &&
      weeklyLoad + candidate.weeklyMinutes <= 480;

    return {
      ready,
      hobby: {
        id: String(candidate.hobby._id),
        name: this.text(candidate.hobby.name),
        score: candidate.score,
        expectedWeeklyMinutes: candidate.weeklyMinutes,
        note: this.text(this.object(candidate.hobby.candidateProfile)?.note),
      },
      earliestStartDate: ready
        ? this.getDateKey(new Date())
        : earliestTarget
          ? this.getDateKey(earliestTarget)
          : null,
      reason: ready
        ? `${this.text(candidate.hobby.name)} is the strongest current backlog candidate and fits the available deliberate-practice load.`
        : activeSeasonHobbies.length >= MAX_ACTIVE_HOBBIES
          ? `The current six-month season is already full at five active hobbies. Reconsider ${this.text(candidate.hobby.name)} at the season review.`
          : 'Current learning load is already high enough that another serious hobby would dilute practice quality.',
    };
  }

  private async getResources(ids: string[]) {
    if (!ids.length) return [];
    return this.libraryItemModel
      .find({
        _id: { $in: ids.map((id) => this.toObjectId(id)) },
        isActive: true,
      })
      .select(
        'title type status author authors progressPercentage coverImageUrl',
      )
      .lean();
  }

  private async completeLinkedTask(taskId?: Types.ObjectId) {
    if (!taskId) return;
    await this.taskModel.updateOne(
      {
        _id: taskId,
        status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
      },
      {
        $set: {
          status: TaskStatus.COMPLETED,
          completedAt: new Date(),
          actualMinutes: undefined,
        },
      },
    );
  }

  private async endLinkedNow(sessionId: string) {
    const current = await this.nowService.getCurrent();
    if (
      current &&
      current.source === NowSource.HOBBY &&
      current.sourceExternalId === sessionId
    ) {
      await this.nowService.endCurrent();
    }
  }

  private async assertActiveHobbyCapacity(excludeId?: Types.ObjectId) {
    const filter: Record<string, unknown> = {
      status: { $in: [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE] },
      isActive: true,
      isArchived: false,
    };
    if (excludeId) filter._id = { $ne: excludeId };
    const count = await this.hobbyModel.countDocuments(filter);
    if (count >= MAX_ACTIVE_HOBBIES) {
      throw new BadRequestException(
        'This six-month season is capped at five active hobbies. Pause or archive one before activating another.',
      );
    }
  }

  private async getDocument(hobbyId: string) {
    const hobby = await this.hobbyModel.findOne({
      _id: this.toObjectId(hobbyId),
      isActive: true,
    });
    if (!hobby) throw new NotFoundException('Hobby not found.');
    return hobby;
  }

  private normalizeCurriculum(stages: CreateHobbyDto['curriculum'] = []) {
    const sorted = [...(stages ?? [])].sort((a, b) => a.order - b.order);
    const hasCurrent = sorted.some(
      (stage) => stage.status === HobbyStageStatus.CURRENT,
    );
    return sorted.map((stage, index) => ({
      key: stage.key.trim(),
      title: stage.title.trim(),
      order: stage.order,
      objective: stage.objective?.trim(),
      focusAreas: (stage.focusAreas ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      exercises: (stage.exercises ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      completionCriteria: (stage.completionCriteria ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
      status:
        stage.status ??
        (!hasCurrent && index === 0
          ? HobbyStageStatus.CURRENT
          : HobbyStageStatus.PENDING),
      targetWeeks: stage.targetWeeks,
    }));
  }

  private normalizeTags(tags?: string[]) {
    return [
      ...new Set(
        (tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  private slugify(input: string) {
    const slug = input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (!slug) throw new BadRequestException('Hobby slug is invalid.');
    return slug;
  }

  private toObjectId(value: string) {
    if (!Types.ObjectId.isValid(value))
      throw new BadRequestException('Invalid identifier.');
    return new Types.ObjectId(value);
  }

  private getDateKey(date: Date) {
    return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  }

  private getDayRange(date: Date) {
    const dateKey = this.getDateKey(date);
    const start = new Date(`${dateKey}T00:00:00.000+05:30`);
    return { start, end: new Date(start.getTime() + DAY_MS) };
  }

  private getWeekRange(date: Date) {
    const dayRange = this.getDayRange(date);
    const weekday = this.weekdayIndex(date);
    const start = new Date(dayRange.start.getTime() - weekday * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }

  private weekdayIndex(date: Date) {
    const shifted = new Date(date.getTime() + IST_OFFSET_MS);
    const sundayZero = shifted.getUTCDay();
    return (sundayZero + 6) % 7;
  }

  private number(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  private firstString(value: unknown) {
    if (!Array.isArray(value)) return '';
    const first = value.find(
      (item): item is string => typeof item === 'string',
    );
    return first ?? '';
  }

  private date(value: unknown) {
    const date =
      value instanceof Date
        ? value
        : typeof value === 'string'
          ? new Date(value)
          : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  private object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private guitarStarter(): Partial<Hobby> {
    return {
      name: 'Guitar',
      slug: 'guitar',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.MUSIC,
      intensity: HobbyIntensity.PRIMARY,
      goal: 'Build from beginner chord control to confidently playing a small repertoire with steady rhythm, cleaner transitions and enough musical understanding to continue independently.',
      why: 'A long-form creative skill with visible progress, deliberate practice and a strong non-work identity.',
      currentSkillLevel: 'Beginner',
      startedAt: new Date(FOUNDATION_SEASON_START),
      targetDate: new Date(FOUNDATION_SEASON_END),
      seasonKey: FOUNDATION_SEASON_KEY,
      seasonLabel: FOUNDATION_SEASON_LABEL,
      seasonOrder: 1,
      ownerCompletionRequired: true,
      targetHorizonWeeks: 26,
      weeklyTargetMinutes: 90,
      targetSessionsPerWeek: 3,
      recommendedSessionMinutes: 30,
      preferredWeekdays: [0, 3, 5],
      preferredPracticeTime: HobbyPracticeTimeWindow.EVENING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'guitar-01-foundations',
      nextAction:
        '5 min chord warm-up → 15 min A–D–E transitions → 10 min one song section. Keep every real reset.',
      nextActionMinutes: 30,
      curriculum: [
        this.stage(
          'guitar-01-foundations',
          'Open-chord foundations',
          1,
          4,
          'Build relaxed fretting, tuning, A–D–E shapes and a steady basic pulse.',
          ['tuning', 'posture', 'open chords', 'timing'],
          [
            'Tune without help',
            'Slow A–D–E transitions',
            'Down-strums with a metronome',
          ],
          [
            'Tune independently',
            'Form A, D and E reliably',
            'Hold a steady simple pulse',
          ],
          true,
        ),
        this.stage(
          'guitar-02-transitions',
          'Transitions + rhythm',
          2,
          4,
          'Reduce pauses between common chord shapes and add two usable strumming patterns.',
          ['transition economy', 'rhythm', 'recovery'],
          [
            '60-second chord-change drills',
            'Two strumming patterns',
            'Uninterrupted verse practice',
          ],
          [
            'Transitions are reliable at slow song tempo',
            'Two strumming patterns stay steady',
          ],
        ),
        this.stage(
          'guitar-03-songs',
          'Complete songs',
          3,
          4,
          'Turn isolated practice into complete beginner songs without stopping after every mistake.',
          ['repertoire', 'timing', 'mistake recovery'],
          [
            'Two full-song attempts each week',
            'Record one take',
            'Restart only after full section',
          ],
          [
            'Play two songs end-to-end',
            'Recover after a mistake without stopping',
          ],
        ),
        this.stage(
          'guitar-04-expansion',
          'Chord vocabulary + fretboard',
          4,
          4,
          'Expand beyond the first open chords and understand enough theory to navigate songs.',
          [
            'minor chords',
            'basic barre preparation',
            'fretboard',
            'song structure',
          ],
          [
            'Add Em, Am, C, G',
            'Simple chord-family drills',
            'Name roots on low strings',
          ],
          [
            'Use at least seven common chords in songs',
            'Explain basic I–IV–V relationship in one key',
          ],
        ),
        this.stage(
          'guitar-05-musicality',
          'Musicality + ear',
          5,
          4,
          'Make familiar material sound intentional through dynamics, listening and phrasing.',
          ['dynamics', 'ear training', 'phrasing'],
          [
            'Soft/medium/loud passes',
            'Match simple chord quality by ear',
            'Play along with a slow reference',
          ],
          [
            'Use dynamics intentionally',
            'Recognise obvious timing drift',
            'Make one arrangement choice deliberately',
          ],
        ),
        this.stage(
          'guitar-06-repertoire',
          'Six-month repertoire checkpoint',
          6,
          6,
          'Consolidate a small repertoire, record honest takes and choose the next guitar direction.',
          ['repertoire', 'recording', 'self-review', 'next direction'],
          [
            'Maintain three songs',
            'Weekly unedited take',
            'Try fingerstyle and simple lead',
          ],
          [
            'Play three songs end-to-end',
            'Compare Month 1 and Month 6 recordings',
            'Choose the next six-month guitar focus',
          ],
        ),
      ],
      tags: ['music', 'creative', 'learning', 'season-1'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private voiceStarter(): Partial<Hobby> {
    return {
      name: 'Voice Improvement',
      slug: 'voice-singing',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.MUSIC,
      intensity: HobbyIntensity.SECONDARY,
      goal: 'Improve speaking and singing control, breath, pitch, resonance, clarity and confident delivery through repeatable recordings and deliberate practice.',
      why: 'Supports communication, storytelling, speaking presence and music while giving measurable before-and-after evidence.',
      currentSkillLevel: 'Beginner development block',
      startedAt: new Date(FOUNDATION_SEASON_START),
      targetDate: new Date(FOUNDATION_SEASON_END),
      seasonKey: FOUNDATION_SEASON_KEY,
      seasonLabel: FOUNDATION_SEASON_LABEL,
      seasonOrder: 2,
      ownerCompletionRequired: true,
      targetHorizonWeeks: 26,
      weeklyTargetMinutes: 50,
      targetSessionsPerWeek: 2,
      recommendedSessionMinutes: 25,
      preferredWeekdays: [1, 4],
      preferredPracticeTime: HobbyPracticeTimeWindow.MORNING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'voice-01-baseline',
      nextAction:
        '3 min breathing → 5 min humming/lip trills → 10 min pitch matching → 7 min speaking/song sample.',
      nextActionMinutes: 25,
      curriculum: [
        this.stage(
          'voice-01-baseline',
          'Breath + honest baseline',
          1,
          4,
          'Establish relaxed posture, repeatable warm-up and an unpolished speaking/singing baseline.',
          ['breath', 'tension', 'baseline recording'],
          [
            'Relaxed low breathing',
            'Humming',
            'Lip trills',
            'Repeat the same 20–30 second sample',
          ],
          ['Warm up without strain', 'Record a repeatable baseline sample'],
          true,
        ),
        this.stage(
          'voice-02-pitch',
          'Pitch + resonance',
          2,
          4,
          'Hear pitch differences sooner and produce a clearer resonant sound without forcing.',
          ['pitch matching', 'resonance', 'listening'],
          [
            'Single-note matching',
            'Five-note patterns',
            'Hum-to-vowel transitions',
          ],
          [
            'Match simple notes more consistently',
            'Identify obvious mismatch during or immediately after the attempt',
          ],
        ),
        this.stage(
          'voice-03-clarity',
          'Clarity + range',
          3,
          4,
          'Improve articulation and explore a comfortable usable range while protecting ease.',
          ['articulation', 'range', 'dynamics'],
          [
            'Slow articulation drills',
            'Comfortable scale passes',
            'Soft/medium contrast',
          ],
          [
            'Words sound clearer on playback',
            'Know comfortable upper/lower limits without forcing',
          ],
        ),
        this.stage(
          'voice-04-speaking',
          'Speaking presence',
          4,
          4,
          'Apply breath, pace, pauses and resonance to everyday speaking and camera delivery.',
          ['pace', 'pauses', 'projection', 'camera delivery'],
          [
            '30-second explanation',
            'Pause placement drill',
            'Same message at two energy levels',
          ],
          [
            'Deliver a 60-second explanation clearly without rushing',
            'Use pauses intentionally',
          ],
        ),
        this.stage(
          'voice-05-expression',
          'Expression + performance',
          5,
          4,
          'Add emotional range, phrasing and confidence without sounding performed or artificial.',
          ['expression', 'phrasing', 'confidence'],
          [
            'Song/speech phrasing pass',
            'Read one story paragraph aloud',
            'Compare live vs playback perception',
          ],
          [
            'Show controlled dynamic variation',
            'Sound natural while being more expressive',
          ],
        ),
        this.stage(
          'voice-06-comparison',
          'Six-month voice checkpoint',
          6,
          6,
          'Compare like-for-like recordings, identify genuine changes and define the next vocal block.',
          ['comparison', 'consistency', 'self-review'],
          [
            'Repeat Month 1 samples',
            'Record one camera explanation weekly',
            'Build a maintenance warm-up',
          ],
          [
            'Complete a like-for-like Month 1 vs Month 6 comparison',
            'Choose the next speaking/singing focus',
          ],
        ),
      ],
      tags: ['voice', 'singing', 'communication', 'season-1'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private chessStarter(): Partial<Hobby> {
    return {
      name: 'Chess',
      slug: 'chess',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.COGNITIVE,
      intensity: HobbyIntensity.SECONDARY,
      goal: 'Build a real playing habit, improve tactical awareness, positional thinking, endgames and self-review instead of only reading about chess.',
      why: 'A structured thinking hobby that rewards pattern recognition, patience and honest review of mistakes.',
      currentSkillLevel: 'Beginner',
      startedAt: new Date(FOUNDATION_SEASON_START),
      targetDate: new Date(FOUNDATION_SEASON_END),
      seasonKey: FOUNDATION_SEASON_KEY,
      seasonLabel: FOUNDATION_SEASON_LABEL,
      seasonOrder: 3,
      ownerCompletionRequired: true,
      targetHorizonWeeks: 26,
      weeklyTargetMinutes: 70,
      targetSessionsPerWeek: 2,
      recommendedSessionMinutes: 35,
      preferredWeekdays: [2, 6],
      preferredPracticeTime: HobbyPracticeTimeWindow.AFTERNOON,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'chess-01-board-vision',
      nextAction:
        '10 min tactical puzzles → 15 min one slow position/game → 10 min write the first mistake or unanswered question.',
      nextActionMinutes: 35,
      curriculum: [
        this.stage(
          'chess-01-board-vision',
          'Board vision + tactical basics',
          1,
          4,
          'Move from passive reading to seeing checks, captures, threats and simple tactical patterns on the board.',
          ['board vision', 'tactics', 'calculation discipline'],
          [
            'Checks-captures-threats scan',
            'Mate-in-one/two puzzles',
            'One slow position explanation',
          ],
          [
            'Consistently scan forcing moves before choosing',
            'Explain the idea behind basic forks, pins and skewers',
          ],
          true,
        ),
        this.stage(
          'chess-02-opening',
          'Opening principles',
          2,
          4,
          'Build a small principled opening base without memorising long theory.',
          ['development', 'centre', 'king safety'],
          [
            'One White setup',
            'Responses to 1.e4/1.d4 principles',
            'Review first 10 moves after games',
          ],
          [
            'Reach playable middlegames without obvious opening blunders',
            'Explain why each early move was made',
          ],
        ),
        this.stage(
          'chess-03-calculation',
          'Calculation + tactics',
          3,
          4,
          'Calculate short forcing sequences more accurately and reduce one-move oversights.',
          ['candidate moves', 'visualisation', 'tactics'],
          [
            'Timed puzzle set',
            'Write candidate moves before moving',
            'Blunder-check routine',
          ],
          [
            'Use a repeatable calculation process',
            'Reduce obvious hanging-piece mistakes in reviewed games',
          ],
        ),
        this.stage(
          'chess-04-positional',
          'Positional thinking',
          4,
          4,
          'Learn to identify imbalances and turn them into a practical plan.',
          ['imbalances', 'weaknesses', 'piece activity'],
          [
            'Describe one position before calculating',
            'Compare two candidate plans',
            'Review one master-game position',
          ],
          [
            'Name the main imbalance in a position',
            'Choose a plan connected to that imbalance',
          ],
        ),
        this.stage(
          'chess-05-endgames',
          'Essential endgames',
          5,
          4,
          'Build confidence in basic king, pawn and rook endings that recur frequently.',
          ['king activity', 'pawn endings', 'rook basics'],
          ['King+pawn drills', 'Opposition', 'Basic rook ending positions'],
          [
            'Convert basic winning king+pawn positions',
            'Recognise core drawing/winning ideas',
          ],
        ),
        this.stage(
          'chess-06-game-review',
          'Six-month game-review system',
          6,
          6,
          'Play, review and learn from complete games with a repeatable self-analysis process.',
          ['game review', 'error patterns', 'repertoire direction'],
          [
            'One slow game weekly',
            'Self-review before engine',
            'Track recurring errors',
          ],
          [
            'Maintain a recurring-error list',
            'Show a consistent pre-move and post-game review process',
            'Choose the next six-month chess focus',
          ],
        ),
      ],
      tags: ['chess', 'cognitive', 'strategy', 'season-1'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private spanishStarter(): Partial<Hobby> {
    return {
      name: 'Spanish',
      slug: 'spanish',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.LANGUAGE,
      intensity: HobbyIntensity.SECONDARY,
      goal: 'Reach a practical beginner conversational level: understand common everyday Spanish, handle travel situations and sustain simple conversations without immediately switching to English.',
      why: 'A six-month language track that creates a real-world communication skill and can connect naturally with future travel.',
      currentSkillLevel: 'Beginner',
      startedAt: new Date(FOUNDATION_SEASON_START),
      targetDate: new Date(FOUNDATION_SEASON_END),
      seasonKey: FOUNDATION_SEASON_KEY,
      seasonLabel: FOUNDATION_SEASON_LABEL,
      seasonOrder: 4,
      ownerCompletionRequired: true,
      targetHorizonWeeks: 26,
      weeklyTargetMinutes: 90,
      targetSessionsPerWeek: 3,
      recommendedSessionMinutes: 30,
      preferredWeekdays: [1, 3, 5],
      preferredPracticeTime: HobbyPracticeTimeWindow.FLEXIBLE,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'spanish-01-survival',
      nextAction:
        '10 min vocabulary recall → 10 min listening/shadowing → 10 min speak answers aloud without translating first.',
      nextActionMinutes: 30,
      curriculum: [
        this.stage(
          'spanish-01-survival',
          'Survival Spanish',
          1,
          4,
          'Build pronunciation confidence and the highest-frequency phrases for introductions, needs, directions and basic questions.',
          ['pronunciation', 'greetings', 'high-frequency vocabulary'],
          [
            'Self-introduction',
            'Numbers/time/directions',
            'Daily 20-word recall',
          ],
          [
            'Give a one-minute self-introduction',
            'Handle basic greetings, ordering and directions',
          ],
          true,
        ),
        this.stage(
          'spanish-02-core-grammar',
          'Core sentence building',
          2,
          4,
          'Form useful present-tense sentences and questions without translating every word.',
          ['present tense', 'gender/articles', 'questions'],
          [
            'Ser/estar/tener drills',
            'Question formation',
            'Daily life sentences',
          ],
          [
            'Describe a normal day in simple Spanish',
            'Ask and answer ten common questions',
          ],
        ),
        this.stage(
          'spanish-03-listening',
          'Listening + speaking',
          3,
          4,
          'Understand slow everyday speech and respond with short spontaneous sentences.',
          ['listening', 'shadowing', 'spontaneous answers'],
          [
            'Short beginner audio',
            'Shadow 5–10 lines',
            'Two-minute speaking prompt',
          ],
          [
            'Understand the gist of slow beginner dialogue',
            'Respond without reading a prepared script',
          ],
        ),
        this.stage(
          'spanish-04-time',
          'Past + future',
          4,
          4,
          'Talk about what happened and what you plan to do using practical beginner structures.',
          ['past', 'future', 'time expressions'],
          [
            'Yesterday/tomorrow journal',
            'Trip-planning dialogue',
            'Weekend recap',
          ],
          ['Tell a short past story', 'Explain a simple future plan'],
        ),
        this.stage(
          'spanish-05-conversation',
          'Conversation stamina',
          5,
          4,
          'Stay in Spanish longer, ask follow-ups and recover when vocabulary is missing.',
          ['conversation', 'circumlocution', 'follow-up questions'],
          [
            'Five-minute conversation',
            'Describe unknown words indirectly',
            'Question chains',
          ],
          [
            'Sustain a five-minute beginner conversation',
            'Recover from missing vocabulary without switching immediately to English',
          ],
        ),
        this.stage(
          'spanish-06-real-world',
          'Six-month real-world checkpoint',
          6,
          6,
          'Use Spanish in practical travel and social situations and define the next learning target.',
          ['travel', 'listening', 'conversation', 'self-review'],
          [
            'Restaurant/transport/hotel roleplays',
            'Weekly conversation',
            'Repeat Month 1 introduction',
          ],
          [
            'Complete a ten-minute supported conversation',
            'Handle common travel scenarios',
            'Choose the next six-month Spanish target',
          ],
        ),
      ],
      tags: ['spanish', 'language', 'travel', 'season-1'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private storytellingStarter(): Partial<Hobby> {
    return {
      name: 'Storytelling',
      slug: 'storytelling',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.CREATIVE,
      intensity: HobbyIntensity.PRIMARY,
      goal: 'Become a strong practical storyteller for products, presentations, social content, humour and everyday communication by learning to create scenes, tension, payoff and memorable delivery.',
      why: 'Storytelling improves product communication, leadership, content, public speaking and the ability to make ideas emotionally understandable.',
      currentSkillLevel: 'Beginner deliberate-practice track',
      startedAt: new Date(FOUNDATION_SEASON_START),
      targetDate: new Date(FOUNDATION_SEASON_END),
      seasonKey: FOUNDATION_SEASON_KEY,
      seasonLabel: FOUNDATION_SEASON_LABEL,
      seasonOrder: 5,
      ownerCompletionRequired: true,
      targetHorizonWeeks: 26,
      weeklyTargetMinutes: 120,
      targetSessionsPerWeek: 3,
      recommendedSessionMinutes: 40,
      preferredWeekdays: [2, 4, 6],
      preferredPracticeTime: HobbyPracticeTimeWindow.EVENING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'story-01-scenes',
      nextAction:
        'Write one 150–250 word scene from a real event: place, action, tension, one concrete detail, and an ending beat. Then read it aloud once.',
      nextActionMinutes: 40,
      curriculum: [
        this.stage(
          'story-01-scenes',
          'Scenes, not summaries',
          1,
          4,
          'Learn to turn abstract explanations into concrete moments people can see and feel.',
          ['scene construction', 'specific detail', 'action'],
          [
            'Rewrite one summary as a scene',
            'Start in the middle of an event',
            'Use one sensory detail',
          ],
          [
            'Write three clear scenes from real events',
            'Open a story without background dumping',
          ],
          true,
        ),
        this.stage(
          'story-02-tension',
          'Setup, tension + payoff',
          2,
          4,
          'Create curiosity and forward movement without fake drama.',
          ['stakes', 'open loops', 'turns', 'payoff'],
          [
            'Expectation vs reality story',
            'Failure → response → next attempt',
            'Delay one important reveal',
          ],
          [
            'Hold one clear question through a short story',
            'Land a payoff that resolves or intentionally extends the tension',
          ],
        ),
        this.stage(
          'story-03-character',
          'Character + emotion',
          3,
          4,
          'Make stories feel human through choices, reactions, dialogue and emotional truth.',
          ['character', 'dialogue', 'emotion', 'humour'],
          [
            'Write dialogue from memory without inventing facts',
            'Show emotion through action',
            'Add one self-aware comic beat',
          ],
          [
            'Create a relatable character moment without explaining the emotion',
            'Use humour without breaking the story',
          ],
        ),
        this.stage(
          'story-04-product',
          'Product + founder storytelling',
          4,
          4,
          'Explain products through real people, constraints and decisions rather than feature lists.',
          [
            'customer problem',
            'decision',
            'before/after state',
            'founder story',
          ],
          [
            'Turn a feature into a user scene',
            'Tell one product failure',
            'Explain one decision through the moment that caused it',
          ],
          [
            'Deliver a 2–3 minute product story with a clear human problem',
            'Explain a technical decision without sounding like documentation',
          ],
        ),
        this.stage(
          'story-05-retention',
          'Short-form retention',
          5,
          4,
          'Build hooks, pattern changes and scene progression for Reels, Shorts and social storytelling.',
          ['hooks', 'watch time', 'visual beats', 'compression'],
          [
            'Three hook versions for one story',
            '30–60 second spoken story',
            'Cut every sentence that does not move the story',
          ],
          [
            'Hold one story through a 45–60 second delivery',
            'Create hooks that promise the actual story rather than clickbait',
          ],
        ),
        this.stage(
          'story-06-long-form',
          'Long-form + live storytelling',
          6,
          6,
          'Connect scenes into longer narratives for demos, presentations, YouTube, comedy and live conversation.',
          ['story arcs', 'callbacks', 'delivery', 'story bank'],
          [
            'Five-minute founder story',
            'Ten-minute personal story',
            'Build a reusable story bank',
            'Practice one story live',
          ],
          [
            'Deliver a coherent 5–10 minute story without reading',
            'Maintain a tagged story bank of real events',
            'Choose the next six-month storytelling specialization',
          ],
        ),
      ],
      tags: ['storytelling', 'communication', 'content', 'product', 'season-1'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private stage(
    key: string,
    title: string,
    order: number,
    targetWeeks: number,
    objective: string,
    focusAreas: string[],
    exercises: string[],
    completionCriteria: string[],
    current = false,
  ) {
    return {
      key,
      title,
      order,
      status: current ? HobbyStageStatus.CURRENT : HobbyStageStatus.PENDING,
      targetWeeks,
      objective,
      focusAreas,
      exercises,
      completionCriteria,
    };
  }
}
