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
    await this.bootstrapStarterHobbies();
    await this.ensureV2Defaults();
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
  }

  async bootstrapStarterHobbies() {
    const count = await this.hobbyModel.countDocuments({ isActive: true });
    if (count > 0) {
      return { created: 0, skipped: true };
    }

    const starters = [
      this.guitarStarter(),
      this.voiceStarter(),
      this.chessStarter(),
    ];
    await this.hobbyModel.insertMany(starters, { ordered: true });
    return { created: starters.length, skipped: false };
  }

  async create(dto: CreateHobbyDto) {
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
      taskId: dto.taskId ? new Types.ObjectId(dto.taskId) : undefined,
      metadata: dto.metadata ?? {},
    });
    await this.completeLinkedTask(session.taskId);
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

    return {
      generatedAt: new Date().toISOString(),
      trackingNote:
        'Practice minutes are counted only from real sessions recorded in Hobbies; scheduled time is never treated as completed practice.',
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
          weeklyTargetMinutes > 360
            ? 'high'
            : weeklyTargetMinutes > 180
              ? 'moderate'
              : 'light',
        recommendation:
          weeklyTargetMinutes > 360
            ? 'Do not add another acquisition-stage hobby until one active track moves to maintenance.'
            : 'Current deliberate-practice load is sustainable if work and recovery remain normal.',
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
    const acquisition = active.filter(
      (hobby) => hobby.status === HobbyStatus.ACTIVE,
    );
    const weeklyLoad = active.reduce(
      (sum, hobby) => sum + this.number(hobby.weeklyTargetMinutes),
      0,
    );
    const earliestTarget = acquisition
      .map((hobby) => this.date(hobby.targetDate))
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const ready =
      acquisition.length < 2 && weeklyLoad + candidate.weeklyMinutes <= 360;

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
        : acquisition.length >= 2
          ? `Keep only two serious acquisition tracks at once. Reconsider ${this.text(candidate.hobby.name)} when one active hobby reaches maintenance or its target horizon.`
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
    const startedAt = new Date('2026-08-26T00:00:00.000+05:30');
    return {
      name: 'Guitar',
      slug: 'guitar',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.MUSIC,
      intensity: HobbyIntensity.PRIMARY,
      goal: 'Play complete songs cleanly with confident chord changes, steady rhythm and enough musical understanding to keep progressing independently.',
      why: 'A deliberate creative skill that adds a non-work dimension to life and gives visible long-term progression.',
      currentSkillLevel: 'Beginner',
      startedAt,
      targetHorizonWeeks: 12,
      targetDate: new Date(startedAt.getTime() + 12 * 7 * DAY_MS),
      weeklyTargetMinutes: 150,
      targetSessionsPerWeek: 5,
      recommendedSessionMinutes: 30,
      preferredWeekdays: [0, 1, 2, 4, 5],
      preferredPracticeTime: HobbyPracticeTimeWindow.EVENING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'foundations',
      nextAction:
        '5 min chord warm-up → 10 min A–D–E transitions → 10 min first-song practice → 5 min free play.',
      nextActionMinutes: 30,
      curriculum: [
        {
          key: 'foundations',
          title: 'Foundations',
          order: 1,
          status: HobbyStageStatus.CURRENT,
          targetWeeks: 3,
          objective:
            'Build comfortable handling, tuning, basic chord shapes and steady simple rhythm.',
          focusAreas: ['tuning', 'posture', 'open chords', 'basic rhythm'],
          exercises: [
            'Chord-shape warm-up',
            'A–D–E slow transitions',
            'Down-strum timing with metronome',
            '10 minutes on one beginner song',
          ],
          completionCriteria: [
            'Tune independently',
            'Change between core open chords without stopping',
            'Hold a steady simple strumming pattern',
          ],
        },
        {
          key: 'smooth-changes',
          title: 'Smooth changes + strumming',
          order: 2,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 3,
          objective:
            'Make common chord changes automatic enough to support complete songs.',
          focusAreas: ['transition speed', 'strumming patterns', 'timing'],
          exercises: [
            '60-second chord-change drills',
            'Two strumming patterns',
            'Play full verse/chorus without stopping',
          ],
          completionCriteria: [
            'Reliable transitions at song tempo',
            'Two steady strumming patterns',
            'Complete one full song with minor mistakes',
          ],
        },
        {
          key: 'songs-timing',
          title: 'Songs + timing',
          order: 3,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 3,
          objective:
            'Build a small playable repertoire while strengthening timing and recovery from mistakes.',
          focusAreas: ['song repertoire', 'metronome', 'recovery'],
          exercises: [
            'Two complete songs',
            'Metronome practice',
            'Record one take weekly',
          ],
          completionCriteria: [
            'Play two songs end-to-end',
            'Stay in time after a mistake',
            'Hear obvious timing drift in recordings',
          ],
        },
        {
          key: 'musicality',
          title: 'Musicality + direction',
          order: 4,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 3,
          objective:
            'Add dynamics, ear awareness and choose the next musical direction.',
          focusAreas: [
            'dynamics',
            'ear training',
            'fingerstyle or lead direction',
          ],
          exercises: [
            'Dynamics pass on known song',
            'Simple interval/chord listening',
            'Try fingerstyle and simple lead exercises',
          ],
          completionCriteria: [
            'Play familiar material with intentional dynamics',
            'Choose a clear next guitar specialization',
          ],
        },
      ],
      tags: ['music', 'creative', 'learning'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }

  private voiceStarter(): Partial<Hobby> {
    const startedAt = new Date('2026-09-01T00:00:00.000+05:30');
    return {
      name: 'Voice / Singing',
      slug: 'voice-singing',
      status: HobbyStatus.ACTIVE,
      category: HobbyCategory.MUSIC,
      intensity: HobbyIntensity.SECONDARY,
      goal: 'Improve speaking/singing control, pitch stability, resonance and confidence through a simple 30-day deliberate-practice block.',
      why: 'Supports expression, communication and music while giving a measurable short learning cycle.',
      currentSkillLevel: 'Beginner development block',
      startedAt,
      targetHorizonWeeks: 4,
      targetDate: new Date('2026-10-01T00:00:00.000+05:30'),
      weeklyTargetMinutes: 100,
      targetSessionsPerWeek: 5,
      recommendedSessionMinutes: 20,
      preferredWeekdays: [0, 1, 2, 3, 5],
      preferredPracticeTime: HobbyPracticeTimeWindow.MORNING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      currentStageKey: 'breath-baseline',
      nextAction:
        '3 min relaxed breathing → 4 min humming/lip trills → 6 min pitch matching → 7 min one song/speaking section.',
      nextActionMinutes: 20,
      curriculum: [
        {
          key: 'breath-baseline',
          title: 'Breath + baseline',
          order: 1,
          status: HobbyStageStatus.CURRENT,
          targetWeeks: 1,
          objective:
            'Reduce unnecessary tension and establish a repeatable warm-up baseline.',
          focusAreas: ['breath', 'posture', 'relaxation'],
          exercises: [
            'Relaxed low breathing',
            'Gentle humming',
            'Lip trills',
            'Record the same short baseline phrase',
          ],
          completionCriteria: [
            'Warm up without throat strain',
            'Repeat baseline phrase comfortably',
          ],
        },
        {
          key: 'pitch-resonance',
          title: 'Pitch + resonance',
          order: 2,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 1,
          objective:
            'Improve pitch matching and find a clearer resonant sound without forcing volume.',
          focusAreas: ['pitch', 'resonance', 'control'],
          exercises: [
            'Five-note pitch patterns',
            'Hum-to-vowel transitions',
            'Short song phrase repetitions',
          ],
          completionCriteria: [
            'Match simple notes consistently',
            'Maintain relaxed resonance through short phrases',
          ],
        },
        {
          key: 'clarity-range',
          title: 'Clarity + comfortable range',
          order: 3,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 1,
          objective:
            'Improve articulation and usable range while protecting comfort.',
          focusAreas: ['clarity', 'range', 'dynamics'],
          exercises: [
            'Slow articulation drill',
            'Comfortable scale passes',
            'Soft/medium dynamic contrast',
          ],
          completionCriteria: [
            'Clearer recorded words',
            'Know comfortable upper/lower limits without forcing',
          ],
        },
        {
          key: 'application',
          title: 'Song + speaking application',
          order: 4,
          status: HobbyStageStatus.PENDING,
          targetWeeks: 1,
          objective:
            'Apply improvements to one repeatable song section and one speaking sample.',
          focusAreas: ['application', 'consistency', 'confidence'],
          exercises: [
            'Repeat same song section',
            'Record 30-second speaking sample',
            'Compare Day 1 vs current recording',
          ],
          completionCriteria: [
            'Notice measurable control improvement',
            'Choose maintenance routine or next vocal block',
          ],
        },
      ],
      tags: ['voice', 'singing', 'communication', 'music'],
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
      status: HobbyStatus.BACKLOG,
      category: HobbyCategory.COGNITIVE,
      intensity: HobbyIntensity.SECONDARY,
      goal: 'If activated, build a structured chess practice cycle instead of casual consumption.',
      why: 'High genuine curiosity and a strong thinking hobby, but it should not dilute the two current acquisition tracks.',
      weeklyTargetMinutes: 120,
      targetSessionsPerWeek: 4,
      recommendedSessionMinutes: 30,
      preferredPracticeTime: HobbyPracticeTimeWindow.EVENING,
      aiCoachingEnabled: true,
      automaticReviewsEnabled: true,
      candidateProfile: {
        genuineCuriosity: 8,
        lifestyleFit: 8,
        novelty: 6,
        strategicUsefulness: 7,
        mediaUsefulness: 6,
        weeklyMinutes: 120,
        note: 'Strong next candidate once Voice/Singing completes its current 30-day acquisition block or Guitar moves into maintenance.',
      },
      tags: ['chess', 'cognitive', 'strategy'],
      source: HobbySource.HSAKAA,
      mediaEligible: true,
      isActive: true,
      isArchived: false,
    };
  }
}
