import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { AiService } from '../ai/ai.service';
import { LibraryItem } from '../library/schemas/library-item.schema';
import {
  Task,
  TaskPriority,
  TaskSource,
  TaskStatus,
} from '../tasks/schemas/task.schema';
import {
  Hobby,
  HobbyDocument,
  HobbyPracticeTimeWindow,
  HobbyStatus,
} from './schemas/hobby.schema';
import {
  HobbyEvidenceType,
  HobbyPracticeSession,
  HobbyPracticeSessionDocument,
  HobbyPracticeStatus,
} from './schemas/hobby-practice-session.schema';
import {
  HobbyCurriculumRecommendation,
  HobbyReview,
  HobbyReviewDocument,
  HobbyReviewPeriod,
} from './schemas/hobby-review.schema';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type LeanRecord = Record<string, unknown> & { _id?: unknown };

type AiReview = {
  summary: string;
  wins: string[];
  stuckPoints: string[];
  coachingNotes: string[];
  nextFocus: string;
  suggestedWeeklyMinutes: number;
  suggestedSessions: number;
  suggestedSessionMinutes: number;
  curriculumRecommendation: 'hold' | 'advance' | 'simplify' | 'maintenance';
  nextPlan: Array<{ focus: string; minutes: number; reason: string }>;
  resourceSearchTerms: string[];
  evidenceComparison: {
    summary: string;
    observedChanges: string[];
  };
};

const REVIEW_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'summary',
    'wins',
    'stuckPoints',
    'coachingNotes',
    'nextFocus',
    'suggestedWeeklyMinutes',
    'suggestedSessions',
    'suggestedSessionMinutes',
    'curriculumRecommendation',
    'nextPlan',
    'resourceSearchTerms',
    'evidenceComparison',
  ],
  properties: {
    summary: { type: 'string' },
    wins: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    stuckPoints: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    coachingNotes: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    nextFocus: { type: 'string' },
    suggestedWeeklyMinutes: { type: 'integer', minimum: 0, maximum: 3000 },
    suggestedSessions: { type: 'integer', minimum: 0, maximum: 14 },
    suggestedSessionMinutes: { type: 'integer', minimum: 0, maximum: 300 },
    curriculumRecommendation: {
      type: 'string',
      enum: ['hold', 'advance', 'simplify', 'maintenance'],
    },
    nextPlan: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['focus', 'minutes', 'reason'],
        properties: {
          focus: { type: 'string' },
          minutes: { type: 'integer', minimum: 5, maximum: 180 },
          reason: { type: 'string' },
        },
      },
    },
    resourceSearchTerms: {
      type: 'array',
      maxItems: 6,
      items: { type: 'string' },
    },
    evidenceComparison: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'observedChanges'],
      properties: {
        summary: { type: 'string' },
        observedChanges: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string' },
        },
      },
    },
  },
};

@Injectable()
export class HobbiesCoachingService {
  constructor(
    @InjectModel(Hobby.name)
    private readonly hobbyModel: Model<HobbyDocument>,
    @InjectModel(HobbyPracticeSession.name)
    private readonly sessionModel: Model<HobbyPracticeSessionDocument>,
    @InjectModel(HobbyReview.name)
    private readonly reviewModel: Model<HobbyReviewDocument>,
    @InjectModel(Task.name)
    private readonly taskModel: Model<Task>,
    @InjectModel(LibraryItem.name)
    private readonly libraryItemModel: Model<LibraryItem>,
    private readonly aiService: AiService,
  ) {}

  async getCoach(hobbyId: string) {
    const hobby = await this.getHobby(hobbyId);
    const [latestReview, trend, schedule] = await Promise.all([
      this.reviewModel
        .findOne({ hobbyId: hobby._id, isActive: true })
        .sort({ periodEnd: -1 })
        .lean(),
      this.getTrend(hobby._id, 28),
      this.getPracticePlan(),
    ]);

    return {
      hobbyId: hobby._id.toString(),
      hobbyName: hobby.name,
      nextAction: hobby.nextAction,
      nextActionMinutes:
        hobby.nextActionMinutes || hobby.recommendedSessionMinutes || 20,
      latestReview,
      trend,
      nextScheduledPractice:
        schedule.slots.find((slot) => slot.hobbyId === hobby._id.toString()) ??
        null,
      evidencePolicy:
        'Only owner-confirmed practice counts as completed. HSAKAA may recommend what to practice next, but it never marks a session or curriculum stage complete automatically. Audio/video/photo URLs are flagged for multimodal review rather than treated as inspected media.',
    };
  }

  async getReviews(hobbyId: string, period?: HobbyReviewPeriod) {
    const hobby = await this.getHobby(hobbyId);
    return this.reviewModel
      .find({
        hobbyId: hobby._id,
        isActive: true,
        ...(period ? { period } : {}),
      })
      .sort({ periodStart: -1 })
      .limit(24)
      .lean();
  }

  async generateReview(
    hobbyId: string,
    period: HobbyReviewPeriod = HobbyReviewPeriod.WEEKLY,
    force = false,
    anchor = new Date(),
  ) {
    const hobby = await this.getHobby(hobbyId);
    if (hobby.aiCoachingEnabled === false) {
      throw new BadRequestException('AI coaching is disabled for this hobby.');
    }

    const range = this.reviewRange(period, anchor);
    if (!force) {
      const existing = await this.reviewModel.findOne({
        hobbyId: hobby._id,
        period,
        periodStart: range.start,
        isActive: true,
      });
      if (existing) return existing.toObject();
    }

    const sessions = await this.sessionModel
      .find({
        hobbyId: hobby._id,
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: true,
        startedAt: { $gte: range.start, $lt: range.end },
      })
      .sort({ startedAt: 1 })
      .lean();
    const resources = await this.libraryItemModel
      .find({ _id: { $in: hobby.linkedLibraryItemIds ?? [] }, isActive: true })
      .select('title type status author authors progressPercentage')
      .lean();

    const targetMultiplier = period === HobbyReviewPeriod.MONTHLY ? 4 : 1;
    const targetMinutes = (hobby.weeklyTargetMinutes || 0) * targetMultiplier;
    const targetSessions =
      (hobby.targetSessionsPerWeek || 0) * targetMultiplier;
    const metrics = this.metrics(
      sessions as unknown as LeanRecord[],
      targetMinutes,
      targetSessions,
    );
    const evidence = this.evidenceSummary(sessions as unknown as LeanRecord[]);

    const response = await this.aiService.generateStructuredResponse<AiReview>({
      name: `hobby_${period}_review_v2`,
      schema: REVIEW_SCHEMA,
      instructions: [
        'You are HSAKAA acting as a practical deliberate-practice coach for Aakash.',
        'Use only the supplied hobby, curriculum, real completed sessions, ratings, reflections and linked-resource metadata.',
        'Never invent practice, improvement, mastery, media contents, health state or calendar availability.',
        'If practice volume is low, optimize adherence and simplicity before increasing volume.',
        'Recommend advancing curriculum only when the evidence supports the listed completion criteria; otherwise hold or simplify.',
        'Resource suggestions must be search terms/topics, not fabricated book/course titles.',
        'Evidence comparisons may use evidence descriptions and session reflections only. Do not claim you watched/listened to an audio/video/photo URL.',
        'Keep the output concise, concrete and understandable. Prefer exact next exercises over generic encouragement.',
      ].join('\n'),
      input: JSON.stringify({
        period,
        periodStart: range.start.toISOString(),
        periodEnd: range.end.toISOString(),
        hobby: {
          name: hobby.name,
          status: hobby.status,
          goal: hobby.goal,
          why: hobby.why,
          currentSkillLevel: hobby.currentSkillLevel,
          currentStageKey: hobby.currentStageKey,
          nextAction: hobby.nextAction,
          weeklyTargetMinutes: hobby.weeklyTargetMinutes,
          targetSessionsPerWeek: hobby.targetSessionsPerWeek,
          recommendedSessionMinutes: hobby.recommendedSessionMinutes,
          curriculum: hobby.curriculum,
        },
        metrics,
        sessions: sessions.map((session) => ({
          startedAt: session.startedAt,
          durationMinutes: session.durationMinutes,
          focus: session.focus,
          notes: session.notes,
          reflection: session.reflection,
          difficulty: session.difficulty,
          enjoyment: session.enjoyment,
          evidence: (session.evidence ?? []).map((item) => ({
            type: item.type,
            description: item.description,
            hasUrl: Boolean(item.url),
          })),
        })),
        linkedResources: resources,
        evidence,
      }),
      verbosity: 'low',
      reasoningEffort: 'low',
      maxOutputTokens: 2600,
    });

    const ai = this.normalizeReview(response.data, hobby);
    const document = {
      hobbyId: hobby._id,
      period,
      periodStart: range.start,
      periodEnd: range.end,
      stageKey: hobby.currentStageKey,
      metrics,
      summary: ai.summary,
      wins: ai.wins,
      stuckPoints: ai.stuckPoints,
      coachingNotes: ai.coachingNotes,
      nextFocus: ai.nextFocus,
      suggestedWeeklyMinutes: ai.suggestedWeeklyMinutes,
      suggestedSessions: ai.suggestedSessions,
      suggestedSessionMinutes: ai.suggestedSessionMinutes,
      curriculumRecommendation: ai.curriculumRecommendation,
      nextPlan: ai.nextPlan,
      resourceSearchTerms: ai.resourceSearchTerms,
      evidenceComparison: {
        summary: ai.evidenceComparison.summary,
        observedChanges: ai.evidenceComparison.observedChanges,
        evidenceTypes: evidence.types,
        requiresMultimodalReview: evidence.requiresMultimodalReview,
        limitation: evidence.requiresMultimodalReview
          ? 'Audio/video/photo evidence is attached, but this review did not inspect the media bytes. Use descriptions/reflections as evidence until the dedicated multimodal evidence analyzer is enabled.'
          : undefined,
      },
      model: response.model,
      responseId: response.responseId,
      usage: response.usage,
      isActive: true,
    };

    return this.reviewModel
      .findOneAndUpdate(
        { hobbyId: hobby._id, period, periodStart: range.start },
        { $set: document },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean();
  }

  async generateAutomaticReviews(
    period: HobbyReviewPeriod,
    anchor = new Date(),
  ) {
    const hobbies = await this.hobbyModel
      .find({
        status: { $in: [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE] },
        isActive: true,
        isArchived: false,
        automaticReviewsEnabled: { $ne: false },
        aiCoachingEnabled: { $ne: false },
      })
      .select('_id name')
      .lean();
    let generated = 0;
    const failures: Array<{ hobbyId: string; error: string }> = [];
    for (const hobby of hobbies) {
      try {
        await this.generateReview(String(hobby._id), period, false, anchor);
        generated += 1;
      } catch (error) {
        failures.push({
          hobbyId: String(hobby._id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { period, generated, failures };
  }

  async getPracticePlan(anchor = new Date()) {
    const week = this.weekRange(anchor);
    const [hobbies, tasks, sessions] = await Promise.all([
      this.hobbyModel
        .find({
          status: { $in: [HobbyStatus.ACTIVE, HobbyStatus.MAINTENANCE] },
          isActive: true,
          isArchived: false,
        })
        .sort({ seasonOrder: 1, intensity: 1, name: 1 })
        .lean(),
      this.taskModel
        .find({
          isActive: true,
          isArchived: false,
          status: { $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED] },
          $or: [
            { dueAt: { $gte: week.start, $lt: week.end } },
            { startAt: { $gte: week.start, $lt: week.end } },
          ],
        })
        .select('startAt dueAt estimatedMinutes area sourceExternalId')
        .lean(),
      this.sessionModel
        .find({
          status: HobbyPracticeStatus.COMPLETED,
          ownerConfirmed: true,
          startedAt: { $gte: week.start, $lt: week.end },
        })
        .select('hobbyId startedAt durationMinutes')
        .lean(),
    ]);

    const latestReviews = await this.reviewModel
      .find({
        hobbyId: { $in: hobbies.map((hobby) => hobby._id) },
        isActive: true,
      })
      .sort({ periodEnd: -1 })
      .select('hobbyId nextFocus suggestedSessionMinutes')
      .lean();
    const reviewByHobby = new Map<string, (typeof latestReviews)[number]>();
    for (const review of latestReviews) {
      const hobbyId = review.hobbyId.toString();
      if (!reviewByHobby.has(hobbyId)) reviewByHobby.set(hobbyId, review);
    }

    const taskLoad = new Map<string, number>();
    for (const task of tasks) {
      const date = task.startAt ?? task.dueAt;
      if (!date) continue;
      const key = this.dateKey(date);
      taskLoad.set(
        key,
        (taskLoad.get(key) ?? 0) + (task.estimatedMinutes ?? 30),
      );
    }
    const practicedByHobbyDay = new Set(
      sessions.map(
        (session) =>
          `${session.hobbyId.toString()}:${this.dateKey(session.startedAt)}`,
      ),
    );
    const sessionsByHobby = new Map<string, number>();
    const minutesByHobby = new Map<string, number>();
    for (const session of sessions) {
      const id = session.hobbyId.toString();
      sessionsByHobby.set(id, (sessionsByHobby.get(id) ?? 0) + 1);
      minutesByHobby.set(
        id,
        (minutesByHobby.get(id) ?? 0) + (session.durationMinutes ?? 0),
      );
    }

    const todayKey = this.dateKey(anchor);
    const slots: Array<{
      hobbyId: string;
      hobbyName: string;
      dateKey: string;
      startAt: string;
      timeWindow: HobbyPracticeTimeWindow;
      minutes: number;
      focus: string;
      reason: string;
      taskLoadMinutes: number;
    }> = [];
    const slotsPerDay = new Map<string, number>();

    for (const hobby of hobbies) {
      const id = hobby._id.toString();
      const completedSessions = sessionsByHobby.get(id) ?? 0;
      const completedMinutes = minutesByHobby.get(id) ?? 0;
      const targetSessions = Math.max(0, hobby.targetSessionsPerWeek ?? 0);
      const targetMinutes = Math.max(0, hobby.weeklyTargetMinutes ?? 0);
      let remainingSessions = Math.max(0, targetSessions - completedSessions);
      let remainingMinutes = Math.max(0, targetMinutes - completedMinutes);
      if (
        hobby.status === HobbyStatus.MAINTENANCE &&
        remainingSessions === 0 &&
        remainingMinutes === 0
      ) {
        continue;
      }
      if (remainingSessions === 0 && remainingMinutes > 0)
        remainingSessions = 1;
      if (remainingSessions === 0) continue;

      const preferred = new Set(hobby.preferredWeekdays ?? []);
      const candidates = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(week.start.getTime() + index * DAY_MS);
        const dateKey = this.dateKey(date);
        const startedAt = hobby.startedAt
          ? this.dateKey(hobby.startedAt)
          : null;
        const targetDate = hobby.targetDate
          ? this.dateKey(hobby.targetDate)
          : null;
        return {
          index,
          date,
          dateKey,
          preferred: preferred.size === 0 || preferred.has(index),
          load: taskLoad.get(dateKey) ?? 0,
          alreadyPracticed: practicedByHobbyDay.has(`${id}:${dateKey}`),
          past: dateKey < todayKey,
          outsideTargetWindow:
            Boolean(startedAt && dateKey < startedAt) ||
            Boolean(targetDate && dateKey > targetDate),
        };
      })
        .filter(
          (day) =>
            !day.past &&
            !day.outsideTargetWindow &&
            (slotsPerDay.get(day.dateKey) ?? 0) < 2,
        )
        .sort((a, b) => {
          if (a.alreadyPracticed !== b.alreadyPracticed)
            return Number(a.alreadyPracticed) - Number(b.alreadyPracticed);
          if (a.preferred !== b.preferred)
            return Number(b.preferred) - Number(a.preferred);
          const aDayCount = slotsPerDay.get(a.dateKey) ?? 0;
          const bDayCount = slotsPerDay.get(b.dateKey) ?? 0;
          if (aDayCount !== bDayCount) return aDayCount - bDayCount;
          if (a.load !== b.load) return a.load - b.load;
          return a.index - b.index;
        });

      const used = new Set<string>();
      for (let slotIndex = 0; slotIndex < remainingSessions; slotIndex += 1) {
        const candidate = candidates.find(
          (day) =>
            !used.has(day.dateKey) && (slotsPerDay.get(day.dateKey) ?? 0) < 2,
        );
        if (!candidate) break;
        used.add(candidate.dateKey);
        const sessionsLeft = Math.max(1, remainingSessions - slotIndex);
        const latestReview = reviewByHobby.get(id);
        const preferredMinutes =
          latestReview?.suggestedSessionMinutes ||
          hobby.recommendedSessionMinutes ||
          hobby.nextActionMinutes ||
          20;
        const minutes = Math.max(
          5,
          Math.min(
            preferredMinutes,
            Math.ceil(remainingMinutes / sessionsLeft) || preferredMinutes,
          ),
        );
        remainingMinutes = Math.max(0, remainingMinutes - minutes);
        const timeWindow =
          hobby.preferredPracticeTime ?? HobbyPracticeTimeWindow.FLEXIBLE;
        const clock = this.clockFor(timeWindow);
        let startAt = new Date(`${candidate.dateKey}T${clock}:00.000+05:30`);
        const collides = slots.some(
          (slot) =>
            slot.dateKey === candidate.dateKey &&
            new Date(slot.startAt).getTime() === startAt.getTime(),
        );
        if (collides) startAt = new Date(startAt.getTime() + 60 * 60_000);
        slots.push({
          hobbyId: id,
          hobbyName: hobby.name,
          dateKey: candidate.dateKey,
          startAt: startAt.toISOString(),
          timeWindow,
          minutes,
          focus:
            latestReview?.nextFocus?.trim() ||
            hobby.nextAction ||
            `Practice ${hobby.name}`,
          reason:
            candidate.load >= 180
              ? 'This is the lowest-conflict remaining preferred day, but Tasks load is still relatively high.'
              : candidate.preferred
                ? 'Fits the hobby preference and avoids the busiest remaining Task days.'
                : 'Uses the lowest-conflict remaining day to keep the weekly practice target realistic.',
          taskLoadMinutes: candidate.load,
        });
        slotsPerDay.set(
          candidate.dateKey,
          (slotsPerDay.get(candidate.dateKey) ?? 0) + 1,
        );
      }
    }

    slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return {
      generatedAt: new Date().toISOString(),
      weekStart: week.start.toISOString(),
      weekEnd: week.end.toISOString(),
      source: 'six_month_season_plus_tasks',
      calendarIntegration: 'not_connected_in_backend',
      note: 'This is the six-month growth-season plan. It schedules no more than two hobbies per day, adapts around Personal OS Tasks workload, and only owner-confirmed sessions count as completed. Google Calendar availability is not inferred.',
      slots,
    };
  }

  async syncPracticePlanTasks() {
    const plan = await this.getPracticePlan();
    let created = 0;
    let skipped = 0;
    for (const slot of plan.slots) {
      const sourceExternalId = `hobby-plan:${slot.hobbyId}:${slot.dateKey}`;
      const exists = await this.taskModel.exists({
        sourceExternalId,
        isActive: true,
      });
      if (exists) {
        skipped += 1;
        continue;
      }
      const startAt = new Date(slot.startAt);
      const dueAt = new Date(startAt.getTime() + slot.minutes * 60_000);
      await this.taskModel.create({
        title: `Practice ${slot.hobbyName} · ${slot.minutes} min`,
        description: slot.focus,
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        area: 'Hobbies',
        startAt,
        dueAt,
        reminderAt: new Date(startAt.getTime() - 30 * 60_000),
        estimatedMinutes: slot.minutes,
        tags: ['hobby', 'practice', 'planned'],
        source: TaskSource.HSAKAA,
        sourceExternalId,
        metadata: {
          hobbyId: slot.hobbyId,
          plannedBy: 'hobbies-v2',
          timeWindow: slot.timeWindow,
        },
        isFavourite: false,
        isActive: true,
        isArchived: false,
      });
      created += 1;
    }
    return { created, skipped, slots: plan.slots.length };
  }

  async getTrend(hobbyId: Types.ObjectId, days = 28) {
    const end = new Date();
    const start = new Date(end.getTime() - days * DAY_MS);
    const sessions = await this.sessionModel
      .find({
        hobbyId,
        status: HobbyPracticeStatus.COMPLETED,
        ownerConfirmed: true,
        startedAt: { $gte: start, $lte: end },
      })
      .sort({ startedAt: 1 })
      .lean();
    const byWeek = new Map<string, { minutes: number; sessions: number }>();
    for (const session of sessions) {
      const week = this.weekRange(session.startedAt);
      const key = this.dateKey(week.start);
      const current = byWeek.get(key) ?? { minutes: 0, sessions: 0 };
      current.minutes += session.durationMinutes ?? 0;
      current.sessions += 1;
      byWeek.set(key, current);
    }
    return {
      days,
      totalMinutes: sessions.reduce(
        (sum, session) => sum + (session.durationMinutes ?? 0),
        0,
      ),
      totalSessions: sessions.length,
      weeks: [...byWeek.entries()].map(([weekStart, value]) => ({
        weekStart,
        ...value,
      })),
    };
  }

  private metrics(
    sessions: LeanRecord[],
    targetMinutes: number,
    targetSessions: number,
  ) {
    const practiceMinutes = sessions.reduce(
      (sum, session) => sum + this.number(session.durationMinutes),
      0,
    );
    const difficulty = sessions
      .map((session) => this.optionalNumber(session.difficulty))
      .filter((value): value is number => value !== null);
    const enjoyment = sessions
      .map((session) => this.optionalNumber(session.enjoyment))
      .filter((value): value is number => value !== null);
    const evidenceCount = sessions.reduce(
      (sum, session) =>
        sum + (Array.isArray(session.evidence) ? session.evidence.length : 0),
      0,
    );
    return {
      practiceMinutes,
      sessions: sessions.length,
      targetMinutes,
      targetSessions,
      minutesAdherence: targetMinutes
        ? Math.min(100, Math.round((practiceMinutes / targetMinutes) * 100))
        : 0,
      sessionAdherence: targetSessions
        ? Math.min(100, Math.round((sessions.length / targetSessions) * 100))
        : 0,
      averageDifficulty: difficulty.length
        ? this.round1(difficulty.reduce((a, b) => a + b, 0) / difficulty.length)
        : undefined,
      averageEnjoyment: enjoyment.length
        ? this.round1(enjoyment.reduce((a, b) => a + b, 0) / enjoyment.length)
        : undefined,
      evidenceCount,
    };
  }

  private evidenceSummary(sessions: LeanRecord[]) {
    const types = new Set<string>();
    let requiresMultimodalReview = false;
    const descriptions: string[] = [];
    for (const session of sessions) {
      if (!Array.isArray(session.evidence)) continue;
      for (const raw of session.evidence) {
        const evidence = this.object(raw);
        if (!evidence) continue;
        const type = this.text(evidence.type);
        if (type) types.add(type);
        if (
          [
            HobbyEvidenceType.AUDIO,
            HobbyEvidenceType.VIDEO,
            HobbyEvidenceType.PHOTO,
          ].includes(type as HobbyEvidenceType) &&
          this.text(evidence.url)
        ) {
          requiresMultimodalReview = true;
        }
        const description = this.text(evidence.description);
        if (description) descriptions.push(description);
      }
    }
    return {
      types: [...types],
      descriptions: descriptions.slice(-12),
      requiresMultimodalReview,
    };
  }

  private normalizeReview(ai: AiReview, hobby: HobbyDocument) {
    const allowed = new Set(Object.values(HobbyCurriculumRecommendation));
    return {
      summary:
        this.clip(ai.summary, 3000) ||
        'No reliable coaching summary was generated.',
      wins: this.strings(ai.wins, 5),
      stuckPoints: this.strings(ai.stuckPoints, 5),
      coachingNotes: this.strings(ai.coachingNotes, 6),
      nextFocus:
        this.clip(ai.nextFocus, 1800) ||
        hobby.nextAction ||
        `Practice ${hobby.name}`,
      suggestedWeeklyMinutes: this.clampInt(
        ai.suggestedWeeklyMinutes,
        0,
        3000,
        hobby.weeklyTargetMinutes || 0,
      ),
      suggestedSessions: this.clampInt(
        ai.suggestedSessions,
        0,
        14,
        hobby.targetSessionsPerWeek || 0,
      ),
      suggestedSessionMinutes: this.clampInt(
        ai.suggestedSessionMinutes,
        0,
        300,
        hobby.recommendedSessionMinutes || 20,
      ),
      curriculumRecommendation: allowed.has(
        ai.curriculumRecommendation as HobbyCurriculumRecommendation,
      )
        ? (ai.curriculumRecommendation as HobbyCurriculumRecommendation)
        : HobbyCurriculumRecommendation.HOLD,
      nextPlan: (Array.isArray(ai.nextPlan) ? ai.nextPlan : [])
        .slice(0, 6)
        .map((item) => ({
          focus: this.clip(item.focus, 1000),
          minutes: this.clampInt(
            item.minutes,
            5,
            180,
            hobby.recommendedSessionMinutes || 20,
          ),
          reason: this.clip(item.reason, 1000),
        }))
        .filter((item) => item.focus),
      resourceSearchTerms: this.strings(ai.resourceSearchTerms, 6),
      evidenceComparison: {
        summary: this.clip(ai.evidenceComparison?.summary, 2500),
        observedChanges: this.strings(
          ai.evidenceComparison?.observedChanges,
          5,
        ),
      },
    };
  }

  private reviewRange(period: HobbyReviewPeriod, anchor: Date) {
    if (period === HobbyReviewPeriod.WEEKLY) return this.weekRange(anchor);
    const shifted = new Date(anchor.getTime() + IST_OFFSET_MS);
    const year = shifted.getUTCFullYear();
    const month = shifted.getUTCMonth();
    const start = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS);
    const end = new Date(Date.UTC(year, month + 1, 1) - IST_OFFSET_MS);
    return { start, end };
  }

  private weekRange(date: Date) {
    const day = this.dayRange(date);
    const shifted = new Date(date.getTime() + IST_OFFSET_MS);
    const mondayZero = (shifted.getUTCDay() + 6) % 7;
    const start = new Date(day.start.getTime() - mondayZero * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }

  private dayRange(date: Date) {
    const key = this.dateKey(date);
    const start = new Date(`${key}T00:00:00.000+05:30`);
    return { start, end: new Date(start.getTime() + DAY_MS) };
  }

  private dateKey(date: Date) {
    return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
  }

  private clockFor(window: HobbyPracticeTimeWindow) {
    if (window === HobbyPracticeTimeWindow.MORNING) return '08:00';
    if (window === HobbyPracticeTimeWindow.AFTERNOON) return '15:00';
    if (window === HobbyPracticeTimeWindow.EVENING) return '19:00';
    return '19:00';
  }

  private async getHobby(hobbyId: string) {
    if (!Types.ObjectId.isValid(hobbyId))
      throw new BadRequestException('Invalid identifier.');
    const hobby = await this.hobbyModel.findOne({
      _id: new Types.ObjectId(hobbyId),
      isActive: true,
      isArchived: false,
    });
    if (!hobby) throw new NotFoundException('Hobby not found.');
    return hobby;
  }

  private number(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private optionalNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private object(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value : '';
  }

  private strings(value: unknown, limit: number) {
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => this.clip(item, 1000))
          .filter(Boolean)
          .slice(0, limit)
      : [];
  }

  private clip(value: unknown, max: number) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  private clampInt(value: unknown, min: number, max: number, fallback: number) {
    const numeric =
      typeof value === 'number' && Number.isFinite(value)
        ? Math.round(value)
        : fallback;
    return Math.max(min, Math.min(max, numeric));
  }

  private round1(value: number) {
    return Math.round(value * 10) / 10;
  }
}
