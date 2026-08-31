import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { CompaniesService } from '../companies/companies.service';
import { RemindersService } from '../reminders/reminders.service';
import { ReminderSourceType } from '../reminders/schemas/reminder.schema';

import { CreateTaskDto } from './dto/create-task.dto';

import { TaskQueryDto } from './dto/task-query.dto';

import { UpdateTaskDto } from './dto/update-task.dto';

import {
  Task,
  TaskDocument,
  TaskPriority,
  TaskRecurrence,
  TaskRecurrenceFrequency,
  TaskSource,
  TaskStatus,
} from './schemas/task.schema';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,

    private readonly companiesService: CompaniesService,

    private readonly remindersService: RemindersService,
  ) {}

  async create(dto: CreateTaskDto) {
    if (dto.companyId) {
      await this.companiesService.findOne(dto.companyId);
    }

    const recurrence = this.prepareRecurrence(dto.recurrence);

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : undefined;

    this.validateRecurrence(recurrence, dueAt);

    this.validateTaskDates({
      startAt: dto.startAt,
      dueAt: dto.dueAt,
      reminderAt: dto.reminderAt,
    });

    const status = dto.status ?? TaskStatus.TODO;

    const now = new Date();

    return this.taskModel.create({
      title: dto.title.trim(),

      description: dto.description?.trim(),

      status,

      priority: dto.priority ?? TaskPriority.MEDIUM,

      area: dto.area?.trim(),

      companyId: dto.companyId ? new Types.ObjectId(dto.companyId) : undefined,

      startAt: dto.startAt ? new Date(dto.startAt) : undefined,

      dueAt,

      reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : undefined,

      completedAt: status === TaskStatus.COMPLETED ? now : undefined,

      cancelledAt: status === TaskStatus.CANCELLED ? now : undefined,

      estimatedMinutes: dto.estimatedMinutes,

      actualMinutes: dto.actualMinutes,

      tags: this.normalizeTags(dto.tags),

      recurrence,

      recurrenceSeriesId: recurrence.enabled
        ? new Types.ObjectId().toHexString()
        : undefined,

      source: dto.source ?? TaskSource.MANUAL,

      sourceExternalId: dto.sourceExternalId?.trim(),

      sourceUrl: dto.sourceUrl?.trim(),

      memoryIds:
        dto.memoryIds?.map((memoryId) => new Types.ObjectId(memoryId)) ?? [],

      notes: dto.notes?.trim(),

      metadata: dto.metadata ?? {},

      isFavourite: dto.isFavourite ?? false,
    });
  }

  async findAll(query: TaskQueryDto) {
    const page = Math.max(query.page ?? 1, 1);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: Record<string, any> = query.isArchived
      ? {
          isArchived: true,
        }
      : {
          isActive: true,
          isArchived: false,
        };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.priority) {
      filter.priority = query.priority;
    }

    if (query.source) {
      filter.source = query.source;
    }

    if (query.companyId) {
      filter.companyId = new Types.ObjectId(query.companyId);
    }

    if (query.area?.trim()) {
      filter.area = query.area.trim();
    }

    if (query.tag?.trim()) {
      filter.tags = query.tag.trim().toLowerCase();
    }

    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }

    if (query.search?.trim()) {
      const search = this.escapeRegex(query.search.trim());

      filter.$or = [
        {
          title: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          description: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          notes: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          tags: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    this.applyDueDateFilter(filter, query);

    if (query.overdue) {
      filter.dueAt = {
        ...(filter.dueAt ?? {}),
        $lt: new Date(),
      };

      if (!query.status) {
        filter.status = {
          $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
        };
      }
    }

    const sortBy = query.sortBy ?? 'createdAt';

    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({
          [sortBy]: sortDirection,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.taskModel.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getSummary() {
    const now = new Date();

    const { start, end } = this.getTodayRange();

    const openStatuses = {
      $nin: [TaskStatus.COMPLETED, TaskStatus.CANCELLED],
    };

    const baseFilter = {
      isActive: true,
      isArchived: false,
    };

    const [
      totalOpen,
      inbox,
      inProgress,
      dueToday,
      overdue,
      completedToday,
      highPriority,
      upcoming,
    ] = await Promise.all([
      this.taskModel.countDocuments({
        ...baseFilter,
        status: openStatuses,
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: TaskStatus.INBOX,
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: TaskStatus.IN_PROGRESS,
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: openStatuses,
        dueAt: {
          $gte: start,
          $lte: end,
        },
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: openStatuses,
        dueAt: {
          $lt: now,
        },
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: TaskStatus.COMPLETED,
        completedAt: {
          $gte: start,
          $lte: end,
        },
      }),

      this.taskModel.countDocuments({
        ...baseFilter,
        status: openStatuses,
        priority: {
          $in: [TaskPriority.HIGH, TaskPriority.URGENT],
        },
      }),

      this.taskModel
        .find({
          ...baseFilter,
          status: openStatuses,
          dueAt: {
            $gte: now,
          },
        })
        .sort({
          dueAt: 1,
          createdAt: 1,
        })
        .limit(5)
        .lean(),
    ]);

    return {
      totalOpen,
      inbox,
      inProgress,
      dueToday,
      overdue,
      completedToday,
      highPriority,
      upcoming,
    };
  }

  async findOne(taskId: string) {
    this.validateObjectId(taskId, 'task ID');

    const task = await this.taskModel
      .findOne({
        _id: new Types.ObjectId(taskId),
        isActive: true,
      })
      .lean();

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  async update(taskId: string, dto: UpdateTaskDto) {
    const task = await this.getTaskDocument(taskId);

    if (dto.companyId) {
      await this.companiesService.findOne(dto.companyId);
    }

    this.validateTaskDates({
      startAt: dto.startAt ?? task.startAt?.toISOString(),
      dueAt: dto.dueAt ?? task.dueAt?.toISOString(),
      reminderAt: dto.reminderAt ?? task.reminderAt?.toISOString(),
    });

    if (dto.title !== undefined) {
      task.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      task.description = dto.description.trim();
    }

    if (dto.priority) {
      task.priority = dto.priority;
    }

    if (dto.area !== undefined) {
      task.area = dto.area.trim();
    }

    if (dto.companyId) {
      task.companyId = new Types.ObjectId(dto.companyId);
    }

    if (dto.startAt !== undefined) {
      task.startAt = new Date(dto.startAt);
    }

    if (dto.dueAt !== undefined) {
      task.dueAt = new Date(dto.dueAt);

      this.validateRecurrence(task.recurrence, task.dueAt);
    }

    if (dto.reminderAt !== undefined) {
      task.reminderAt = new Date(dto.reminderAt);
    }

    if (dto.estimatedMinutes !== undefined) {
      task.estimatedMinutes = dto.estimatedMinutes;
    }

    if (dto.actualMinutes !== undefined) {
      task.actualMinutes = dto.actualMinutes;
    }

    if (dto.tags !== undefined) {
      task.tags = this.normalizeTags(dto.tags);
    }

    if (dto.recurrence !== undefined) {
      const recurrence = this.prepareRecurrence(dto.recurrence);

      this.validateRecurrence(recurrence, task.dueAt);

      task.recurrence = recurrence;

      if (recurrence.enabled && !task.recurrenceSeriesId) {
        task.recurrenceSeriesId = new Types.ObjectId().toHexString();
      }
    }

    if (dto.source) {
      task.source = dto.source;
    }

    if (dto.sourceExternalId !== undefined) {
      task.sourceExternalId = dto.sourceExternalId.trim();
    }

    if (dto.sourceUrl !== undefined) {
      task.sourceUrl = dto.sourceUrl.trim();
    }

    if (dto.memoryIds !== undefined) {
      task.memoryIds = dto.memoryIds.map(
        (memoryId) => new Types.ObjectId(memoryId),
      );
    }

    if (dto.notes !== undefined) {
      task.notes = dto.notes.trim();
    }

    if (dto.metadata !== undefined) {
      task.metadata = dto.metadata;
    }

    if (dto.isFavourite !== undefined) {
      task.isFavourite = dto.isFavourite;
    }

    const previousStatus = task.status;

    if (dto.status) {
      this.applyStatus(task, dto.status);
    }

    await task.save();

    if (
      dto.status === TaskStatus.COMPLETED ||
      dto.status === TaskStatus.CANCELLED
    ) {
      await this.remindersService.deactivateSourceReminders(
        ReminderSourceType.TASK,
        task._id,
      );
    }

    if (
      dto.status === TaskStatus.COMPLETED &&
      previousStatus !== TaskStatus.COMPLETED
    ) {
      await this.createNextOccurrenceIfNeeded(task);
    }

    return task;
  }

  async updateStatus(taskId: string, status: TaskStatus) {
    const task = await this.getTaskDocument(taskId);

    const previousStatus = task.status;

    this.applyStatus(task, status);

    await task.save();

    if (status === TaskStatus.COMPLETED || status === TaskStatus.CANCELLED) {
      await this.remindersService.deactivateSourceReminders(
        ReminderSourceType.TASK,
        task._id,
      );
    }

    let nextOccurrence: TaskDocument | null = null;

    if (
      status === TaskStatus.COMPLETED &&
      previousStatus !== TaskStatus.COMPLETED
    ) {
      nextOccurrence = await this.createNextOccurrenceIfNeeded(task);
    }

    return {
      task,
      nextOccurrence,
    };
  }

  complete(taskId: string) {
    return this.updateStatus(taskId, TaskStatus.COMPLETED);
  }

  reopen(taskId: string) {
    return this.updateStatus(taskId, TaskStatus.TODO);
  }

  async archive(taskId: string) {
    const task = await this.getTaskDocument(taskId);

    task.isArchived = true;
    task.isActive = false;
    task.archivedAt = new Date();

    await task.save();

    await this.remindersService.deactivateSourceReminders(
      ReminderSourceType.TASK,
      task._id,
    );

    return task;
  }

  async restore(taskId: string) {
    this.validateObjectId(taskId, 'task ID');

    const task = await this.taskModel.findOne({
      _id: new Types.ObjectId(taskId),
      isArchived: true,
    });

    if (!task) {
      throw new NotFoundException('Archived task not found.');
    }

    task.isArchived = false;
    task.isActive = true;
    task.archivedAt = undefined;

    await task.save();

    return task;
  }

  async remove(taskId: string) {
    await this.archive(taskId);

    return {
      message: 'Task deleted successfully.',
    };
  }

  private async getTaskDocument(taskId: string) {
    this.validateObjectId(taskId, 'task ID');

    const task = await this.taskModel.findOne({
      _id: new Types.ObjectId(taskId),
      isActive: true,
      isArchived: false,
    });

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  private applyStatus(task: TaskDocument, status: TaskStatus) {
    task.status = status;

    if (status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
      task.cancelledAt = undefined;
      return;
    }

    if (status === TaskStatus.CANCELLED) {
      task.cancelledAt = new Date();
      task.completedAt = undefined;
      return;
    }

    task.completedAt = undefined;
    task.cancelledAt = undefined;
  }

  private prepareRecurrence(recurrence?: {
    enabled?: boolean;
    frequency?: TaskRecurrenceFrequency;
    interval?: number;
    endAt?: string;
  }): TaskRecurrence {
    return {
      enabled: recurrence?.enabled ?? false,

      frequency: recurrence?.frequency,

      interval: recurrence?.interval ?? 1,

      endAt: recurrence?.endAt ? new Date(recurrence.endAt) : undefined,
    };
  }

  private validateRecurrence(recurrence: TaskRecurrence, dueAt?: Date) {
    if (!recurrence.enabled) {
      return;
    }

    if (!recurrence.frequency) {
      throw new BadRequestException(
        'Recurrence frequency is required when recurrence is enabled.',
      );
    }

    if (!dueAt) {
      throw new BadRequestException(
        'A due date is required for recurring tasks.',
      );
    }

    if (recurrence.endAt && recurrence.endAt <= dueAt) {
      throw new BadRequestException(
        'Recurrence end date must be after the current due date.',
      );
    }
  }

  private validateTaskDates(values: {
    startAt?: string;
    dueAt?: string;
    reminderAt?: string;
  }) {
    const startAt = values.startAt ? new Date(values.startAt) : undefined;

    const dueAt = values.dueAt ? new Date(values.dueAt) : undefined;

    const reminderAt = values.reminderAt
      ? new Date(values.reminderAt)
      : undefined;

    if (startAt && dueAt && startAt > dueAt) {
      throw new BadRequestException(
        'Task start date cannot be after its due date.',
      );
    }

    if (reminderAt && dueAt && reminderAt > dueAt) {
      throw new BadRequestException(
        'Task reminder cannot be after its due date.',
      );
    }
  }

  private async createNextOccurrenceIfNeeded(
    task: TaskDocument,
  ): Promise<TaskDocument | null> {
    if (
      !task.recurrence?.enabled ||
      !task.recurrence.frequency ||
      !task.dueAt
    ) {
      return null;
    }

    const existingNext = await this.taskModel.findOne({
      parentTaskId: task._id,
      isArchived: false,
    });

    if (existingNext) {
      return existingNext;
    }

    const nextDueAt = this.getNextOccurrenceDate(task.dueAt, task.recurrence);

    if (task.recurrence.endAt && nextDueAt > new Date(task.recurrence.endAt)) {
      return null;
    }

    const nextStartAt = task.startAt
      ? this.shiftDateByDueDelta(task.startAt, task.dueAt, nextDueAt)
      : undefined;

    const nextReminderAt = task.reminderAt
      ? this.shiftDateByDueDelta(task.reminderAt, task.dueAt, nextDueAt)
      : undefined;

    return this.taskModel.create({
      title: task.title,
      description: task.description,
      status: TaskStatus.TODO,
      priority: task.priority,
      area: task.area,
      companyId: task.companyId,
      startAt: nextStartAt,
      dueAt: nextDueAt,
      reminderAt: nextReminderAt,
      estimatedMinutes: task.estimatedMinutes,
      tags: task.tags,
      recurrence: task.recurrence,
      recurrenceSeriesId:
        task.recurrenceSeriesId ?? new Types.ObjectId().toHexString(),
      parentTaskId: task._id,
      source: TaskSource.SYSTEM,
      memoryIds: task.memoryIds,
      notes: task.notes,
      metadata: {
        ...(task.metadata ?? {}),
        generatedFromTaskId: String(task._id),
      },
      isFavourite: task.isFavourite,
    });
  }

  private getNextOccurrenceDate(
    currentDueAt: Date,
    recurrence: TaskRecurrence,
  ) {
    const next = new Date(currentDueAt);

    const interval = Math.max(recurrence.interval ?? 1, 1);

    switch (recurrence.frequency) {
      case TaskRecurrenceFrequency.DAILY:
        next.setDate(next.getDate() + interval);
        break;

      case TaskRecurrenceFrequency.WEEKLY:
        next.setDate(next.getDate() + interval * 7);
        break;

      case TaskRecurrenceFrequency.MONTHLY: {
        const originalDay = next.getDate();

        next.setDate(1);
        next.setMonth(next.getMonth() + interval);

        const lastDayOfTargetMonth = new Date(
          next.getFullYear(),
          next.getMonth() + 1,
          0,
        ).getDate();

        next.setDate(Math.min(originalDay, lastDayOfTargetMonth));
        break;
      }

      default:
        throw new BadRequestException('Unsupported recurrence frequency.');
    }

    return next;
  }

  private shiftDateByDueDelta(
    value: Date,
    currentDueAt: Date,
    nextDueAt: Date,
  ) {
    const delta = nextDueAt.getTime() - currentDueAt.getTime();

    return new Date(value.getTime() + delta);
  }

  private applyDueDateFilter(filter: Record<string, any>, query: TaskQueryDto) {
    if (query.dueToday) {
      const { start, end } = this.getTodayRange();

      filter.dueAt = {
        $gte: start,
        $lte: end,
      };

      return;
    }

    if (!query.dueFrom && !query.dueTo) {
      return;
    }

    const dueFilter: Record<string, Date> = {};

    if (query.dueFrom) {
      dueFilter.$gte = new Date(query.dueFrom);
    }

    if (query.dueTo) {
      dueFilter.$lte = new Date(query.dueTo);
    }

    filter.dueAt = dueFilter;
  }

  private getTodayRange() {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const date = formatter.format(new Date());

    return {
      start: new Date(`${date}T00:00:00.000+05:30`),
      end: new Date(`${date}T23:59:59.999+05:30`),
    };
  }

  private normalizeTags(tags?: string[]) {
    if (!tags) {
      return [];
    }

    return [
      ...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)),
    ];
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
