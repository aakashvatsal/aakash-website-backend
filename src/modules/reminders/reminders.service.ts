import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  HaircareFrequency,
  HaircareProduct,
  HaircareProductDocument,
  HaircareProductStatus,
} from '../haircare/schemas/haircare-product.schema';
import {
  IntimateCareFrequency,
  IntimateCareProduct,
  IntimateCareProductDocument,
  IntimateCareProductStatus,
} from '../intimate-care/schemas/intimate-care-product.schema';
import {
  SkincareFrequency,
  SkincareProduct,
  SkincareProductDocument,
  SkincareProductStatus,
} from '../skincare/schemas/skincare-product.schema';
import {
  DayOfWeek,
  Supplement,
  SupplementDocument,
  SupplementFrequency,
  SupplementStatus,
  SupplementTimingRelation,
} from '../supplements/schemas/supplement.schema';
import { Task, TaskDocument, TaskStatus } from '../tasks/schemas/task.schema';
import { ReminderQueryDto } from './dto/reminder-query.dto';
import { SnoozeReminderDto } from './dto/snooze-reminder.dto';
import {
  Reminder,
  ReminderDocument,
  ReminderSourceType,
  ReminderStatus,
} from './schemas/reminder.schema';

const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ReminderOccurrence {
  sourceType: ReminderSourceType;
  sourceId: Types.ObjectId;
  occurrenceKey: string;
  title: string;
  message?: string;
  scheduledFor: Date;
  sourcePath: string;
  metadata: Record<string, unknown>;
}

type RoutineSchedule = {
  frequency?: string;
  daysOfWeek?: Array<string | number>;
  timesOfDay?: string[];
  times?: string[];
  timingRelation?: string;
  intervalDays?: number;
  startDate?: Date;
  endDate?: Date;
  instructions?: string;
  customInstructions?: string;
};

type RoutineDocument = {
  _id: Types.ObjectId;
  name: string;
  brand?: string;
  schedule?: RoutineSchedule;
};

@Injectable()
export class RemindersService {
  private syncInFlight: Promise<any> | null = null;

  constructor(
    @InjectModel(Reminder.name)
    private readonly reminderModel: Model<ReminderDocument>,

    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,

    @InjectModel(Supplement.name)
    private readonly supplementModel: Model<SupplementDocument>,

    @InjectModel(SkincareProduct.name)
    private readonly skincareModel: Model<SkincareProductDocument>,

    @InjectModel(HaircareProduct.name)
    private readonly haircareModel: Model<HaircareProductDocument>,

    @InjectModel(IntimateCareProduct.name)
    private readonly intimateCareModel: Model<IntimateCareProductDocument>,
  ) {}

  async findAll(query: ReminderQueryDto) {
    await this.syncUpcoming(2);

    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const now = new Date();

    const filter: Record<string, any> = {
      isActive: true,
    };

    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = {
        $in: [ReminderStatus.PENDING, ReminderStatus.SNOOZED],
      };
    }

    if (query.sourceType) {
      filter.sourceType = query.sourceType;
    }

    if (query.from || query.to || query.dueOnly) {
      const scheduledFor: Record<string, Date> = {};

      if (query.from) {
        scheduledFor.$gte = new Date(query.from);
      }

      if (query.to) {
        scheduledFor.$lte = new Date(query.to);
      }

      if (query.dueOnly) {
        scheduledFor.$lte = now;
      }

      filter.scheduledFor = scheduledFor;
    }

    const [data, total] = await Promise.all([
      this.reminderModel
        .find(filter)
        .sort({ scheduledFor: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.reminderModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getToday() {
    await this.syncUpcoming(2);

    const now = new Date();
    const { start, end } = this.getIstDayBounds(now);

    const activeStatuses = [ReminderStatus.PENDING, ReminderStatus.SNOOZED];

    const [due, upcoming, acknowledged] = await Promise.all([
      this.reminderModel
        .find({
          isActive: true,
          status: { $in: activeStatuses },
          scheduledFor: { $lte: now },
        })
        .sort({ scheduledFor: 1 })
        .limit(100)
        .lean(),
      this.reminderModel
        .find({
          isActive: true,
          status: { $in: activeStatuses },
          scheduledFor: {
            $gt: now,
            $lte: end,
          },
        })
        .sort({ scheduledFor: 1 })
        .limit(100)
        .lean(),
      this.reminderModel
        .find({
          isActive: true,
          status: ReminderStatus.ACKNOWLEDGED,
          acknowledgedAt: {
            $gte: start,
            $lte: end,
          },
        })
        .sort({ acknowledgedAt: -1 })
        .limit(100)
        .lean(),
    ]);

    return {
      date: this.getIstDateKey(now),
      due,
      upcoming,
      acknowledged,
    };
  }

  async getSummary() {
    await this.syncUpcoming(2);

    const now = new Date();
    const { start, end } = this.getIstDayBounds(now);

    const activeStatuses = [ReminderStatus.PENDING, ReminderStatus.SNOOZED];

    const [
      dueNow,
      overdue,
      upcomingToday,
      snoozed,
      acknowledgedToday,
      totalToday,
    ] = await Promise.all([
      this.reminderModel.countDocuments({
        isActive: true,
        status: { $in: activeStatuses },
        scheduledFor: { $lte: now },
      }),
      this.reminderModel.countDocuments({
        isActive: true,
        status: { $in: activeStatuses },
        scheduledFor: { $lt: start },
      }),
      this.reminderModel.countDocuments({
        isActive: true,
        status: { $in: activeStatuses },
        scheduledFor: {
          $gt: now,
          $lte: end,
        },
      }),
      this.reminderModel.countDocuments({
        isActive: true,
        status: ReminderStatus.SNOOZED,
      }),
      this.reminderModel.countDocuments({
        isActive: true,
        status: ReminderStatus.ACKNOWLEDGED,
        acknowledgedAt: {
          $gte: start,
          $lte: end,
        },
      }),
      this.reminderModel.countDocuments({
        isActive: true,
        originalScheduledFor: {
          $gte: start,
          $lte: end,
        },
      }),
    ]);

    return {
      date: this.getIstDateKey(now),
      dueNow,
      overdue,
      upcomingToday,
      snoozed,
      acknowledgedToday,
      totalToday,
    };
  }

  async syncUpcoming(days = 2) {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    const safeDays = Math.min(Math.max(Math.floor(days), 1), 14);

    const now = new Date();
    const from = this.getIstDayBounds(now).start;
    const to = new Date(now.getTime() + safeDays * DAY_MS);

    this.syncInFlight = this.syncWindow(from, to);

    try {
      return await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  async deactivateSourceReminders(
    sourceType: ReminderSourceType,
    sourceId: string | Types.ObjectId,
  ) {
    const objectId =
      sourceId instanceof Types.ObjectId
        ? sourceId
        : Types.ObjectId.isValid(sourceId)
          ? new Types.ObjectId(sourceId)
          : null;

    if (!objectId) {
      throw new BadRequestException('Invalid reminder source ID.');
    }

    const result = await this.reminderModel.updateMany(
      {
        sourceType,
        sourceId: objectId,
        isActive: true,
        status: {
          $in: [ReminderStatus.PENDING, ReminderStatus.SNOOZED],
        },
      },
      {
        $set: {
          isActive: false,
        },
      },
    );

    return {
      deactivated: result.modifiedCount ?? 0,
    };
  }

  async findOne(reminderId: string) {
    return this.getReminderDocument(reminderId);
  }

  async acknowledge(reminderId: string) {
    const reminder = await this.getReminderDocument(reminderId);

    reminder.status = ReminderStatus.ACKNOWLEDGED;
    reminder.acknowledgedAt = new Date();
    reminder.snoozedUntil = undefined;
    reminder.dismissedAt = undefined;

    await reminder.save();
    return reminder;
  }

  async snooze(reminderId: string, dto: SnoozeReminderDto) {
    const reminder = await this.getReminderDocument(reminderId);

    if (
      reminder.status === ReminderStatus.ACKNOWLEDGED ||
      reminder.status === ReminderStatus.DISMISSED
    ) {
      throw new BadRequestException(
        'A completed reminder must be reopened before it can be snoozed.',
      );
    }

    if (!dto.minutes && !dto.until) {
      throw new BadRequestException(
        'Provide either snooze minutes or an until timestamp.',
      );
    }

    const until = dto.until
      ? new Date(dto.until)
      : new Date(Date.now() + (dto.minutes ?? 15) * 60 * 1000);

    if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
      throw new BadRequestException('Snooze time must be in the future.');
    }

    reminder.status = ReminderStatus.SNOOZED;
    reminder.scheduledFor = until;
    reminder.snoozedUntil = until;

    await reminder.save();
    return reminder;
  }

  async dismiss(reminderId: string) {
    const reminder = await this.getReminderDocument(reminderId);

    reminder.status = ReminderStatus.DISMISSED;
    reminder.dismissedAt = new Date();
    reminder.snoozedUntil = undefined;

    await reminder.save();
    return reminder;
  }

  async reopen(reminderId: string) {
    const reminder = await this.getReminderDocument(reminderId);

    reminder.status = ReminderStatus.PENDING;
    reminder.acknowledgedAt = undefined;
    reminder.dismissedAt = undefined;
    reminder.snoozedUntil = undefined;
    reminder.scheduledFor =
      reminder.originalScheduledFor.getTime() < Date.now()
        ? new Date()
        : reminder.originalScheduledFor;

    await reminder.save();
    return reminder;
  }

  private async syncWindow(from: Date, to: Date) {
    const [
      taskOccurrences,
      supplementOccurrences,
      skincareOccurrences,
      haircareOccurrences,
      intimateCareOccurrences,
    ] = await Promise.all([
      this.getTaskOccurrences(from, to),
      this.getSupplementOccurrences(from, to),
      this.getSkincareOccurrences(from, to),
      this.getHaircareOccurrences(from, to),
      this.getIntimateCareOccurrences(from, to),
    ]);

    const occurrences = [
      ...taskOccurrences,
      ...supplementOccurrences,
      ...skincareOccurrences,
      ...haircareOccurrences,
      ...intimateCareOccurrences,
    ];

    if (occurrences.length > 0) {
      await this.reminderModel.bulkWrite(
        occurrences.map((occurrence) => ({
          updateOne: {
            filter: {
              occurrenceKey: occurrence.occurrenceKey,
            },
            update: {
              $set: {
                title: occurrence.title,
                message: occurrence.message,
                sourcePath: occurrence.sourcePath,
                metadata: occurrence.metadata,
                isActive: true,
              },
              $setOnInsert: {
                sourceType: occurrence.sourceType,
                sourceId: occurrence.sourceId,
                occurrenceKey: occurrence.occurrenceKey,
                scheduledFor: occurrence.scheduledFor,
                originalScheduledFor: occurrence.scheduledFor,
                status: ReminderStatus.PENDING,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    const desiredKeys = occurrences.map(
      (occurrence) => occurrence.occurrenceKey,
    );

    const staleFilter: Record<string, any> = {
      isActive: true,
      status: {
        $in: [ReminderStatus.PENDING, ReminderStatus.SNOOZED],
      },
      originalScheduledFor: {
        $gte: from,
        $lte: to,
      },
    };

    if (desiredKeys.length > 0) {
      staleFilter.occurrenceKey = {
        $nin: desiredKeys,
      };
    }

    const staleResult = await this.reminderModel.updateMany(staleFilter, {
      $set: {
        isActive: false,
      },
    });

    return {
      from,
      to,
      generated: occurrences.length,
      deactivated: staleResult.modifiedCount ?? 0,
      bySource: {
        tasks: taskOccurrences.length,
        supplements: supplementOccurrences.length,
        skincare: skincareOccurrences.length,
        haircare: haircareOccurrences.length,
        intimateCare: intimateCareOccurrences.length,
      },
    };
  }

  private async getTaskOccurrences(
    from: Date,
    to: Date,
  ): Promise<ReminderOccurrence[]> {
    const tasks = await this.taskModel
      .find({
        isActive: true,
        isArchived: false,
        status: {
          $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
        },
        reminderAt: {
          $gte: from,
          $lte: to,
        },
      })
      .select({
        title: 1,
        description: 1,
        reminderAt: 1,
        dueAt: 1,
        priority: 1,
        area: 1,
      })
      .lean();

    return tasks.flatMap((task) => {
      if (!task.reminderAt) {
        return [];
      }

      return [
        this.createOccurrence({
          sourceType: ReminderSourceType.TASK,
          sourceId: task._id,
          scheduledFor: task.reminderAt,
          title: `Task: ${task.title}`,
          message:
            task.description ??
            (task.dueAt ? `Due ${task.dueAt.toISOString()}` : 'Task reminder'),
          sourcePath: `/tasks/${String(task._id)}`,
          metadata: {
            priority: task.priority,
            area: task.area,
            dueAt: task.dueAt,
          },
        }),
      ];
    });
  }

  private async getSupplementOccurrences(from: Date, to: Date) {
    const supplements = await this.supplementModel
      .find({
        isActive: true,
        isArchived: false,
        reminderEnabled: true,
        status: SupplementStatus.ACTIVE,
      })
      .select({
        name: 1,
        brand: 1,
        dose: 1,
        schedule: 1,
      })
      .lean();

    return supplements.flatMap((supplement) =>
      this.buildRoutineOccurrences(
        supplement as unknown as RoutineDocument,
        ReminderSourceType.SUPPLEMENT,
        from,
        to,
        this.resolveSupplementTimes(supplement.schedule),
        `/health/supplements`,
        {
          dose: supplement.dose,
          timingRelation: supplement.schedule?.timingRelation,
        },
      ),
    );
  }

  private async getSkincareOccurrences(from: Date, to: Date) {
    const products = await this.skincareModel
      .find({
        isActive: true,
        isArchived: false,
        reminderEnabled: true,
        status: SkincareProductStatus.ACTIVE,
      })
      .select({
        name: 1,
        brand: 1,
        category: 1,
        schedule: 1,
        applicationAreas: 1,
      })
      .lean();

    return products.flatMap((product) =>
      this.buildRoutineOccurrences(
        product as unknown as RoutineDocument,
        ReminderSourceType.SKINCARE,
        from,
        to,
        this.resolveDaypartTimes(
          product.schedule?.timesOfDay,
          product.schedule?.frequency,
        ),
        `/health/skincare`,
        {
          category: product.category,
          applicationAreas: product.applicationAreas,
        },
      ),
    );
  }

  private async getHaircareOccurrences(from: Date, to: Date) {
    const products = await this.haircareModel
      .find({
        isActive: true,
        isArchived: false,
        reminderEnabled: true,
        status: HaircareProductStatus.ACTIVE,
      })
      .select({
        name: 1,
        brand: 1,
        category: 1,
        schedule: 1,
        applicationAreas: 1,
      })
      .lean();

    return products.flatMap((product) =>
      this.buildRoutineOccurrences(
        product as unknown as RoutineDocument,
        ReminderSourceType.HAIRCARE,
        from,
        to,
        this.resolveDaypartTimes(
          product.schedule?.timesOfDay,
          product.schedule?.frequency,
        ),
        `/health/haircare`,
        {
          category: product.category,
          applicationAreas: product.applicationAreas,
        },
      ),
    );
  }

  private async getIntimateCareOccurrences(from: Date, to: Date) {
    const products = await this.intimateCareModel
      .find({
        isActive: true,
        isArchived: false,
        reminderEnabled: true,
        status: IntimateCareProductStatus.ACTIVE,
      })
      .select({
        name: 1,
        brand: 1,
        category: 1,
        schedule: 1,
        applicationAreas: 1,
      })
      .lean();

    return products.flatMap((product) =>
      this.buildRoutineOccurrences(
        product as unknown as RoutineDocument,
        ReminderSourceType.INTIMATE_CARE,
        from,
        to,
        this.resolveDaypartTimes(
          product.schedule?.timesOfDay,
          product.schedule?.frequency,
        ),
        `/health/intimate-care`,
        {
          category: product.category,
          applicationAreas: product.applicationAreas,
        },
      ),
    );
  }

  private buildRoutineOccurrences(
    item: RoutineDocument,
    sourceType: ReminderSourceType,
    from: Date,
    to: Date,
    times: Array<{
      hour: number;
      minute: number;
      label: string;
    }>,
    sourcePath: string,
    metadata: Record<string, unknown>,
  ): ReminderOccurrence[] {
    const schedule = item.schedule;

    if (!schedule || schedule.frequency === 'as_needed' || times.length === 0) {
      return [];
    }

    const dateKeys = this.getLocalDateKeys(from, to);

    const anchorDate = schedule.startDate ?? item._id.getTimestamp();

    return dateKeys.flatMap((dateKey) => {
      if (!this.isScheduleActiveOnDate(schedule, dateKey, anchorDate)) {
        return [];
      }

      return times.flatMap((time) => {
        const scheduledFor = this.fromIstDateTime(
          dateKey,
          time.hour,
          time.minute,
        );

        if (scheduledFor < from || scheduledFor > to) {
          return [];
        }

        return [
          this.createOccurrence({
            sourceType,
            sourceId: item._id,
            scheduledFor,
            title: this.getRoutineTitle(sourceType, item.name),
            message:
              schedule.instructions ??
              schedule.customInstructions ??
              `${time.label} reminder`,
            sourcePath,
            metadata: {
              ...metadata,
              brand: item.brand,
              frequency: schedule.frequency,
              timeLabel: time.label,
            },
          }),
        ];
      });
    });
  }

  private createOccurrence(
    input: Omit<ReminderOccurrence, 'occurrenceKey'>,
  ): ReminderOccurrence {
    return {
      ...input,
      occurrenceKey: [
        input.sourceType,
        String(input.sourceId),
        input.scheduledFor.toISOString(),
      ].join(':'),
    };
  }

  private getRoutineTitle(sourceType: ReminderSourceType, name: string) {
    switch (sourceType) {
      case ReminderSourceType.SUPPLEMENT:
        return `Take ${name}`;
      case ReminderSourceType.SKINCARE:
        return `Skincare: ${name}`;
      case ReminderSourceType.HAIRCARE:
        return `Haircare: ${name}`;
      case ReminderSourceType.INTIMATE_CARE:
        return `Care routine: ${name}`;
      default:
        return name;
    }
  }

  private resolveSupplementTimes(schedule?: RoutineSchedule) {
    const explicitTimes = (schedule?.times ?? [])
      .map((value) => this.parseTime(value))
      .filter(
        (
          value,
        ): value is {
          hour: number;
          minute: number;
          label: string;
        } => Boolean(value),
      );

    if (explicitTimes.length > 0) {
      return explicitTimes;
    }

    const relation = schedule?.timingRelation;
    const defaults: Record<string, [number, number, string]> = {
      [SupplementTimingRelation.EMPTY_STOMACH]: [8, 0, 'empty stomach'],
      [SupplementTimingRelation.BEFORE_MEAL]: [12, 30, 'before meal'],
      [SupplementTimingRelation.WITH_MEAL]: [13, 0, 'with meal'],
      [SupplementTimingRelation.AFTER_MEAL]: [13, 30, 'after meal'],
      [SupplementTimingRelation.BEFORE_WORKOUT]: [17, 30, 'before workout'],
      [SupplementTimingRelation.AFTER_WORKOUT]: [20, 0, 'after workout'],
      [SupplementTimingRelation.BEFORE_SLEEP]: [22, 0, 'before sleep'],
      [SupplementTimingRelation.ANYTIME]: [9, 0, 'morning'],
    };

    const value = defaults[relation ?? ''] ?? [9, 0, 'morning'];

    return [
      {
        hour: value[0],
        minute: value[1],
        label: value[2],
      },
    ];
  }

  private resolveDaypartTimes(values?: string[], frequency?: string) {
    let dayparts = (values ?? []).filter((value) => value !== 'as_needed');

    if (dayparts.length === 0) {
      dayparts =
        frequency === 'twice_daily' ? ['morning', 'night'] : ['morning'];
    }

    const defaults: Record<string, [number, number]> = {
      morning: [8, 0],
      afternoon: [13, 0],
      evening: [19, 0],
      night: [22, 0],
      before_wash: [8, 0],
      after_wash: [10, 0],
      after_bath: [9, 0],
      after_workout: [20, 0],
    };

    return dayparts.flatMap((daypart) => {
      const value = defaults[daypart];

      if (!value) {
        return [];
      }

      return [
        {
          hour: value[0],
          minute: value[1],
          label: daypart.replaceAll('_', ' '),
        },
      ];
    });
  }

  private parseTime(value: string) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());

    if (!match) {
      return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return {
      hour,
      minute,
      label: value.trim(),
    };
  }

  private isScheduleActiveOnDate(
    schedule: RoutineSchedule,
    dateKey: string,
    anchorDate: Date,
  ) {
    const dateStart = this.fromIstDateTime(dateKey, 0, 0);
    const dateEnd = this.fromIstDateTime(dateKey, 23, 59);

    if (schedule.startDate && dateEnd < schedule.startDate) {
      return false;
    }

    if (schedule.endDate && dateStart > schedule.endDate) {
      return false;
    }

    const frequency = schedule.frequency ?? 'daily';
    const dateOrdinal = this.getDateOrdinal(dateKey);
    const anchorKey = this.getIstDateKey(anchorDate);
    const anchorOrdinal = this.getDateOrdinal(anchorKey);
    const dayDifference = dateOrdinal - anchorOrdinal;

    if (dayDifference < 0) {
      return false;
    }

    const dayOfWeek = this.getDayOfWeek(dateKey);
    const configuredDays = this.normalizeDaysOfWeek(schedule.daysOfWeek);

    switch (frequency) {
      case SupplementFrequency.DAILY:
      case SkincareFrequency.DAILY:
      case HaircareFrequency.DAILY:
      case IntimateCareFrequency.DAILY:
      case 'twice_daily':
        return true;

      case SupplementFrequency.ALTERNATE_DAYS:
      case SkincareFrequency.ALTERNATE_DAYS:
      case HaircareFrequency.ALTERNATE_DAYS:
      case IntimateCareFrequency.ALTERNATE_DAYS:
        return dayDifference % Math.max(schedule.intervalDays ?? 2, 2) === 0;

      case SupplementFrequency.WEEKLY:
      case SkincareFrequency.WEEKLY:
      case HaircareFrequency.WEEKLY:
      case IntimateCareFrequency.WEEKLY:
        return configuredDays.length > 0
          ? configuredDays.includes(dayOfWeek)
          : dayOfWeek === this.getDayOfWeek(anchorKey);

      case HaircareFrequency.TWICE_WEEKLY:
      case SkincareFrequency.TWICE_WEEKLY:
        return this.matchesWeeklyFrequency(
          dayOfWeek,
          configuredDays,
          this.getDayOfWeek(anchorKey),
          2,
        );

      case HaircareFrequency.THREE_TIMES_WEEKLY:
        return this.matchesWeeklyFrequency(
          dayOfWeek,
          configuredDays,
          this.getDayOfWeek(anchorKey),
          3,
        );

      case SupplementFrequency.CUSTOM:
      case SkincareFrequency.CUSTOM:
      case HaircareFrequency.CUSTOM:
      case IntimateCareFrequency.CUSTOM:
        if (configuredDays.length > 0) {
          return configuredDays.includes(dayOfWeek);
        }

        return dayDifference % Math.max(schedule.intervalDays ?? 1, 1) === 0;

      case SupplementFrequency.AS_NEEDED:
      case SkincareFrequency.AS_NEEDED:
      case HaircareFrequency.AS_NEEDED:
      case IntimateCareFrequency.AS_NEEDED:
        return false;

      default:
        return true;
    }
  }

  private matchesWeeklyFrequency(
    dayOfWeek: number,
    configuredDays: number[],
    anchorDay: number,
    count: 2 | 3,
  ) {
    if (configuredDays.length > 0) {
      return configuredDays.includes(dayOfWeek);
    }

    const offsets = count === 2 ? [0, 3] : [0, 2, 4];

    const generatedDays = offsets.map((offset) => (anchorDay + offset) % 7);

    return generatedDays.includes(dayOfWeek);
  }

  private normalizeDaysOfWeek(values?: Array<string | number>): number[] {
    const supplementDays: Record<string, number> = {
      [DayOfWeek.SUNDAY]: 0,
      [DayOfWeek.MONDAY]: 1,
      [DayOfWeek.TUESDAY]: 2,
      [DayOfWeek.WEDNESDAY]: 3,
      [DayOfWeek.THURSDAY]: 4,
      [DayOfWeek.FRIDAY]: 5,
      [DayOfWeek.SATURDAY]: 6,
    };

    return (values ?? []).flatMap((value) => {
      if (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 6
      ) {
        return [value];
      }

      const normalized = supplementDays[String(value)];

      return normalized === undefined ? [] : [normalized];
    });
  }

  private getLocalDateKeys(from: Date, to: Date) {
    const startKey = this.getIstDateKey(from);
    const endKey = this.getIstDateKey(to);
    const startOrdinal = this.getDateOrdinal(startKey);
    const endOrdinal = this.getDateOrdinal(endKey);

    const keys: string[] = [];

    for (let ordinal = startOrdinal; ordinal <= endOrdinal; ordinal += 1) {
      const date = new Date(ordinal * DAY_MS);
      keys.push(
        [
          date.getUTCFullYear(),
          String(date.getUTCMonth() + 1).padStart(2, '0'),
          String(date.getUTCDate()).padStart(2, '0'),
        ].join('-'),
      );
    }

    return keys;
  }

  private getIstDayBounds(date: Date) {
    const dateKey = this.getIstDateKey(date);

    return {
      start: this.fromIstDateTime(dateKey, 0, 0),
      end: this.fromIstDateTime(dateKey, 23, 59, 59, 999),
    };
  }

  private getIstDateKey(date: Date) {
    const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);

    return [
      shifted.getUTCFullYear(),
      String(shifted.getUTCMonth() + 1).padStart(2, '0'),
      String(shifted.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private fromIstDateTime(
    dateKey: string,
    hour: number,
    minute: number,
    second = 0,
    millisecond = 0,
  ) {
    const [year, month, day] = dateKey.split('-').map(Number);

    return new Date(
      Date.UTC(year, month - 1, day, hour, minute, second, millisecond) -
        IST_OFFSET_MINUTES * 60 * 1000,
    );
  }

  private getDateOrdinal(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);

    return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  }

  private getDayOfWeek(dateKey: string) {
    const [year, month, day] = dateKey.split('-').map(Number);

    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  private async getReminderDocument(reminderId: string) {
    if (!Types.ObjectId.isValid(reminderId)) {
      throw new BadRequestException('Invalid reminder ID.');
    }

    const reminder = await this.reminderModel.findOne({
      _id: new Types.ObjectId(reminderId),
      isActive: true,
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found.');
    }

    return reminder;
  }
}
