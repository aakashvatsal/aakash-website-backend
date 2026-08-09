import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Model,
  Types,
} from 'mongoose';

import { CreateMeditationEntryDto } from './dto/create-meditation-entry.dto';
import { MeditationQueryDto } from './dto/meditation-query.dto';
import { UpdateMeditationEntryDto } from './dto/update-meditation-entry.dto';
import { UpdateMeditationReflectionDto } from './dto/update-meditation-reflection.dto';
import { UpdateMeditationStatusDto } from './dto/update-meditation-status.dto';
import {
  MeditationEntry,
  MeditationEntryDocument,
  MeditationStatus,
} from './schemas/meditation-entry.schema';

@Injectable()
export class MeditationService {
  constructor(
    @InjectModel(MeditationEntry.name)
    private readonly meditationEntryModel:
      Model<MeditationEntryDocument>,
  ) {}

  async create(dto: CreateMeditationEntryDto) {
    this.validateObjectId(dto.userId, 'user ID');

    const date = this.normalizeDate(dto.date);
    const status =
      dto.status ?? MeditationStatus.PLANNED;

    const statusDates = this.prepareInitialStatusDates(
      status,
      dto,
    );

    return this.meditationEntryModel.create({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      date,
      status,
      scheduledAt: dto.scheduledAt
        ? this.parseDate(
            dto.scheduledAt,
            'scheduledAt',
          )
        : undefined,
      ...statusDates,
      memoryIds: (dto.memoryIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      tags: this.normalizeTags(dto.tags),
      distractions: this.cleanStringArray(
        dto.distractions,
      ),
      insights: this.cleanStringArray(
        dto.insights,
      ),
      intentions: this.cleanStringArray(
        dto.intentions,
      ),
      benefits: this.cleanStringArray(
        dto.benefits,
      ),
    });
  }

  async findAll(query: MeditationQueryDto) {
    this.validateObjectId(query.userId, 'user ID');

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(
      Math.max(query.limit ?? 20, 1),
      100,
    );

    const filter: Record<string, any> = {
      userId: new Types.ObjectId(query.userId),
      isActive: true,
    };

    if (query.startDate || query.endDate) {
      filter.date = {};

      if (query.startDate) {
        filter.date.$gte = this.normalizeDate(
          query.startDate,
        );
      }

      if (query.endDate) {
        filter.date.$lte = this.normalizeEndDate(
          query.endDate,
        );
      }
    }

    if (query.type) {
      filter.type = query.type;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.tag?.trim()) {
      filter.tags = this.normalizeTag(query.tag);
    }

    if (query.isFavourite !== undefined) {
      filter.isFavourite = query.isFavourite;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    if (query.search?.trim()) {
      filter.$text = {
        $search: query.search.trim(),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.meditationEntryModel
        .find(filter)
        .sort({
          date: -1,
          scheduledAt: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.meditationEntryModel.countDocuments(
        filter,
      ),
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

  async findOne(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    return entry.toObject();
  }

  async update(
    meditationEntryId: string,
    userId: string,
    dto: UpdateMeditationEntryDto,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    delete updateData.userId;

    if (dto.date !== undefined) {
      updateData.date = this.normalizeDate(
        dto.date,
      );
    }

    const dateFields = [
      'scheduledAt',
      'startedAt',
      'pausedAt',
      'resumedAt',
      'completedAt',
      'skippedAt',
      'abandonedAt',
    ] as const;

    for (const field of dateFields) {
      const value = dto[field];

      if (value !== undefined) {
        updateData[field] = value
          ? this.parseDate(value, field)
          : null;
      }
    }

    if (dto.memoryIds !== undefined) {
      updateData.memoryIds = dto.memoryIds.map(
        (id) => new Types.ObjectId(id),
      );
    }

    if (dto.tags !== undefined) {
      updateData.tags = this.normalizeTags(
        dto.tags,
      );
    }

    if (dto.distractions !== undefined) {
      updateData.distractions =
        this.cleanStringArray(dto.distractions);
    }

    if (dto.insights !== undefined) {
      updateData.insights =
        this.cleanStringArray(dto.insights);
    }

    if (dto.intentions !== undefined) {
      updateData.intentions =
        this.cleanStringArray(dto.intentions);
    }

    if (dto.benefits !== undefined) {
      updateData.benefits =
        this.cleanStringArray(dto.benefits);
    }

    return this.meditationEntryModel
      .findByIdAndUpdate(
        entry._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();
  }

  async updateStatus(
    meditationEntryId: string,
    userId: string,
    dto: UpdateMeditationStatusDto,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    this.validateStatusTransition(
      entry.status,
      dto.status,
    );

    const statusAt = dto.statusAt
      ? this.parseDate(dto.statusAt, 'statusAt')
      : new Date();

    entry.status = dto.status;

    switch (dto.status) {
      case MeditationStatus.PLANNED:
        this.resetExecutionFields(entry);
        break;

      case MeditationStatus.IN_PROGRESS:
        if (!entry.startedAt) {
          entry.startedAt = statusAt;
        }

        entry.resumedAt = statusAt;
        entry.pausedAt = undefined;
        break;

      case MeditationStatus.PAUSED:
        entry.pausedAt = statusAt;
        break;

      case MeditationStatus.COMPLETED:
        entry.completedAt = statusAt;
        entry.pausedAt = undefined;
        entry.skippedAt = undefined;
        entry.abandonedAt = undefined;
        entry.skippedReason = undefined;
        entry.abandonedReason = undefined;

        if (!entry.startedAt) {
          entry.startedAt = statusAt;
        }

        if (dto.actualDurationMinutes !== undefined) {
          entry.actualDurationMinutes =
            dto.actualDurationMinutes;
        } else if (
          entry.startedAt &&
          entry.completedAt
        ) {
          entry.actualDurationMinutes =
            this.calculateDurationMinutes(
              entry.startedAt,
              entry.completedAt,
              entry.totalPausedMinutes,
            );
        }

        break;

      case MeditationStatus.SKIPPED:
        entry.skippedAt = statusAt;
        entry.skippedReason =
          dto.reason?.trim() ||
          'Meditation session skipped.';
        entry.actualDurationMinutes = 0;
        entry.startedAt = undefined;
        entry.pausedAt = undefined;
        entry.resumedAt = undefined;
        entry.completedAt = undefined;
        entry.abandonedAt = undefined;
        entry.abandonedReason = undefined;
        break;

      case MeditationStatus.ABANDONED:
        entry.abandonedAt = statusAt;
        entry.abandonedReason =
          dto.reason?.trim() ||
          'Meditation session abandoned.';
        entry.pausedAt = undefined;
        entry.completedAt = undefined;
        entry.skippedAt = undefined;
        entry.skippedReason = undefined;

        if (dto.actualDurationMinutes !== undefined) {
          entry.actualDurationMinutes =
            dto.actualDurationMinutes;
        } else if (entry.startedAt) {
          entry.actualDurationMinutes =
            this.calculateDurationMinutes(
              entry.startedAt,
              statusAt,
              entry.totalPausedMinutes,
            );
        }

        break;
    }

    await entry.save();

    return entry;
  }

  async start(
    meditationEntryId: string,
    userId: string,
  ) {
    return this.updateStatus(
      meditationEntryId,
      userId,
      {
        status: MeditationStatus.IN_PROGRESS,
      },
    );
  }

  async pause(
    meditationEntryId: string,
    userId: string,
  ) {
    return this.updateStatus(
      meditationEntryId,
      userId,
      {
        status: MeditationStatus.PAUSED,
      },
    );
  }

  async resume(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    if (entry.status !== MeditationStatus.PAUSED) {
      throw new BadRequestException(
        'Only a paused meditation can be resumed.',
      );
    }

    const now = new Date();

    if (entry.pausedAt) {
      const pausedMinutes = Math.max(
        Math.floor(
          (now.getTime() -
            entry.pausedAt.getTime()) /
            60000,
        ),
        0,
      );

      entry.totalPausedMinutes += pausedMinutes;
    }

    entry.status = MeditationStatus.IN_PROGRESS;
    entry.resumedAt = now;
    entry.pausedAt = undefined;

    await entry.save();

    return entry;
  }

  async complete(
    meditationEntryId: string,
    userId: string,
    actualDurationMinutes?: number,
  ) {
    return this.updateStatus(
      meditationEntryId,
      userId,
      {
        status: MeditationStatus.COMPLETED,
        actualDurationMinutes,
      },
    );
  }

  async skip(
    meditationEntryId: string,
    userId: string,
    reason?: string,
  ) {
    return this.updateStatus(
      meditationEntryId,
      userId,
      {
        status: MeditationStatus.SKIPPED,
        reason,
      },
    );
  }

  async abandon(
    meditationEntryId: string,
    userId: string,
    reason?: string,
  ) {
    return this.updateStatus(
      meditationEntryId,
      userId,
      {
        status: MeditationStatus.ABANDONED,
        reason,
      },
    );
  }

  async updateReflection(
    meditationEntryId: string,
    userId: string,
    dto: UpdateMeditationReflectionDto,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    if (dto.focusScore !== undefined) {
      entry.focusScore = dto.focusScore;
    }

    if (dto.calmnessBefore !== undefined) {
      entry.calmnessBefore =
        dto.calmnessBefore;
    }

    if (dto.calmnessAfter !== undefined) {
      entry.calmnessAfter =
        dto.calmnessAfter;
    }

    if (dto.stressBefore !== undefined) {
      entry.stressBefore = dto.stressBefore;
    }

    if (dto.stressAfter !== undefined) {
      entry.stressAfter = dto.stressAfter;
    }

    if (dto.energyBefore !== undefined) {
      entry.energyBefore = dto.energyBefore;
    }

    if (dto.energyAfter !== undefined) {
      entry.energyAfter = dto.energyAfter;
    }

    if (dto.satisfactionScore !== undefined) {
      entry.satisfactionScore =
        dto.satisfactionScore;
    }

    if (dto.moodBefore !== undefined) {
      entry.moodBefore = dto.moodBefore;
    }

    if (dto.moodAfter !== undefined) {
      entry.moodAfter = dto.moodAfter;
    }

    if (dto.distractionsCount !== undefined) {
      entry.distractionsCount =
        dto.distractionsCount;
    }

    if (dto.distractions !== undefined) {
      entry.distractions =
        this.cleanStringArray(dto.distractions);
    }

    if (dto.insights !== undefined) {
      entry.insights =
        this.cleanStringArray(dto.insights);
    }

    if (dto.benefits !== undefined) {
      entry.benefits =
        this.cleanStringArray(dto.benefits);
    }

    if (dto.notes !== undefined) {
      entry.notes = dto.notes.trim();
    }

    await entry.save();

    return entry;
  }

  async toggleFavourite(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    entry.isFavourite = !entry.isFavourite;

    await entry.save();

    return entry;
  }

  async archive(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    entry.isArchived = true;

    await entry.save();

    return entry;
  }

  async restore(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    entry.isArchived = false;

    await entry.save();

    return entry;
  }

  async getSummary(
    userId: string,
    startDate: string,
    endDate: string,
  ) {
    this.validateObjectId(userId, 'user ID');

    const start = this.normalizeDate(startDate);
    const end = this.normalizeEndDate(endDate);

    if (start > end) {
      throw new BadRequestException(
        'Start date must be before end date.',
      );
    }

    const entries =
      await this.meditationEntryModel
        .find({
          userId: new Types.ObjectId(userId),
          date: {
            $gte: start,
            $lte: end,
          },
          isActive: true,
          isArchived: false,
        })
        .sort({
          date: 1,
        })
        .lean();

    const statusCounts = Object.values(
      MeditationStatus,
    ).reduce<Record<string, number>>(
      (result, status) => {
        result[status] = 0;
        return result;
      },
      {},
    );

    for (const entry of entries) {
      statusCounts[entry.status] =
        (statusCounts[entry.status] ?? 0) + 1;
    }

    const completedEntries = entries.filter(
      (entry) =>
        entry.status ===
        MeditationStatus.COMPLETED,
    );

    const skippedEntries = entries.filter(
      (entry) =>
        entry.status ===
        MeditationStatus.SKIPPED,
    );

    const abandonedEntries = entries.filter(
      (entry) =>
        entry.status ===
        MeditationStatus.ABANDONED,
    );

    const plannedOrFinishedEntries =
      entries.filter((entry) =>
        [
          MeditationStatus.COMPLETED,
          MeditationStatus.SKIPPED,
          MeditationStatus.ABANDONED,
        ].includes(entry.status),
      );

    return {
      period: {
        startDate: start,
        endDate: end,
      },

      totalSessions: entries.length,

      statusCounts,

      completedSessions:
        completedEntries.length,

      skippedSessions: skippedEntries.length,

      abandonedSessions:
        abandonedEntries.length,

      completionRate:
        plannedOrFinishedEntries.length > 0
          ? Number(
              (
                (completedEntries.length /
                  plannedOrFinishedEntries.length) *
                100
              ).toFixed(2),
            )
          : 0,

      totalMeditationMinutes:
        completedEntries.reduce(
          (total, entry) =>
            total +
            (entry.actualDurationMinutes ?? 0),
          0,
        ),

      averageDurationMinutes: this.average(
        completedEntries.map(
          (entry) =>
            entry.actualDurationMinutes ?? 0,
        ),
      ),

      averageFocusScore: this.average(
        completedEntries
          .map((entry) => entry.focusScore)
          .filter(this.isNumber),
      ),

      averageSatisfactionScore: this.average(
        completedEntries
          .map(
            (entry) =>
              entry.satisfactionScore,
          )
          .filter(this.isNumber),
      ),

      calmnessImprovement:
        this.averageImprovement(
          completedEntries,
          'calmnessBefore',
          'calmnessAfter',
        ),

      stressReduction:
        this.averageReduction(
          completedEntries,
          'stressBefore',
          'stressAfter',
        ),

      energyImprovement:
        this.averageImprovement(
          completedEntries,
          'energyBefore',
          'energyAfter',
        ),

      totalInsights: entries.reduce(
        (total, entry) =>
          total + (entry.insights?.length ?? 0),
        0,
      ),

      totalDistractions: entries.reduce(
        (total, entry) =>
          total +
          (entry.distractionsCount ?? 0),
        0,
      ),
    };
  }

  async remove(
    meditationEntryId: string,
    userId: string,
  ) {
    const entry = await this.getEntryDocument(
      meditationEntryId,
      userId,
    );

    entry.isActive = false;
    entry.isArchived = true;

    await entry.save();

    return {
      message:
        'Meditation entry deleted successfully.',
    };
  }

  private async getEntryDocument(
    meditationEntryId: string,
    userId: string,
  ) {
    this.validateObjectId(
      meditationEntryId,
      'meditation entry ID',
    );

    this.validateObjectId(userId, 'user ID');

    const entry =
      await this.meditationEntryModel.findOne({
        _id: new Types.ObjectId(
          meditationEntryId,
        ),
        userId: new Types.ObjectId(userId),
        isActive: true,
      });

    if (!entry) {
      throw new NotFoundException(
        'Meditation entry not found.',
      );
    }

    return entry;
  }

  private validateStatusTransition(
    currentStatus: MeditationStatus,
    nextStatus: MeditationStatus,
  ) {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<
      MeditationStatus,
      MeditationStatus[]
    > = {
      [MeditationStatus.PLANNED]: [
        MeditationStatus.IN_PROGRESS,
        MeditationStatus.COMPLETED,
        MeditationStatus.SKIPPED,
        MeditationStatus.ABANDONED,
      ],

      [MeditationStatus.IN_PROGRESS]: [
        MeditationStatus.PAUSED,
        MeditationStatus.COMPLETED,
        MeditationStatus.ABANDONED,
      ],

      [MeditationStatus.PAUSED]: [
        MeditationStatus.IN_PROGRESS,
        MeditationStatus.COMPLETED,
        MeditationStatus.ABANDONED,
      ],

      [MeditationStatus.COMPLETED]: [
        MeditationStatus.PLANNED,
      ],

      [MeditationStatus.SKIPPED]: [
        MeditationStatus.PLANNED,
        MeditationStatus.IN_PROGRESS,
      ],

      [MeditationStatus.ABANDONED]: [
        MeditationStatus.PLANNED,
        MeditationStatus.IN_PROGRESS,
      ],
    };

    if (
      !allowedTransitions[currentStatus].includes(
        nextStatus,
      )
    ) {
      throw new BadRequestException(
        `Meditation status cannot move from "${currentStatus}" to "${nextStatus}".`,
      );
    }
  }

  private prepareInitialStatusDates(
    status: MeditationStatus,
    dto: CreateMeditationEntryDto,
  ) {
    const now = new Date();

    switch (status) {
      case MeditationStatus.IN_PROGRESS:
        return {
          startedAt: dto.startedAt
            ? this.parseDate(
                dto.startedAt,
                'startedAt',
              )
            : now,
        };

      case MeditationStatus.PAUSED:
        return {
          startedAt: dto.startedAt
            ? this.parseDate(
                dto.startedAt,
                'startedAt',
              )
            : now,
          pausedAt: dto.pausedAt
            ? this.parseDate(
                dto.pausedAt,
                'pausedAt',
              )
            : now,
        };

      case MeditationStatus.COMPLETED:
        return {
          startedAt: dto.startedAt
            ? this.parseDate(
                dto.startedAt,
                'startedAt',
              )
            : now,
          completedAt: dto.completedAt
            ? this.parseDate(
                dto.completedAt,
                'completedAt',
              )
            : now,
        };

      case MeditationStatus.SKIPPED:
        return {
          skippedAt: dto.skippedAt
            ? this.parseDate(
                dto.skippedAt,
                'skippedAt',
              )
            : now,
        };

      case MeditationStatus.ABANDONED:
        return {
          startedAt: dto.startedAt
            ? this.parseDate(
                dto.startedAt,
                'startedAt',
              )
            : now,
          abandonedAt: dto.abandonedAt
            ? this.parseDate(
                dto.abandonedAt,
                'abandonedAt',
              )
            : now,
        };

      default:
        return {};
    }
  }

  private resetExecutionFields(
    entry: MeditationEntryDocument,
  ) {
    entry.actualDurationMinutes = 0;
    entry.totalPausedMinutes = 0;
    entry.startedAt = undefined;
    entry.pausedAt = undefined;
    entry.resumedAt = undefined;
    entry.completedAt = undefined;
    entry.skippedAt = undefined;
    entry.abandonedAt = undefined;
    entry.skippedReason = undefined;
    entry.abandonedReason = undefined;
  }

  private calculateDurationMinutes(
    startedAt: Date,
    endedAt: Date,
    pausedMinutes = 0,
  ) {
    const totalMinutes = Math.floor(
      (endedAt.getTime() -
        startedAt.getTime()) /
        60000,
    );

    return Math.max(
      totalMinutes - pausedMinutes,
      0,
    );
  }

  private averageImprovement(
    entries: MeditationEntry[],
    beforeField:
      | 'calmnessBefore'
      | 'energyBefore',
    afterField:
      | 'calmnessAfter'
      | 'energyAfter',
  ) {
    const differences = entries
      .filter(
        (entry) =>
          this.isNumber(entry[beforeField]) &&
          this.isNumber(entry[afterField]),
      )
      .map(
        (entry) =>
          (entry[afterField] as number) -
          (entry[beforeField] as number),
      );

    return this.average(differences);
  }

  private averageReduction(
    entries: MeditationEntry[],
    beforeField: 'stressBefore',
    afterField: 'stressAfter',
  ) {
    const differences = entries
      .filter(
        (entry) =>
          this.isNumber(entry[beforeField]) &&
          this.isNumber(entry[afterField]),
      )
      .map(
        (entry) =>
          (entry[beforeField] as number) -
          (entry[afterField] as number),
      );

    return this.average(differences);
  }

  private average(values: number[]) {
    if (!values.length) {
      return null;
    }

    return Number(
      (
        values.reduce(
          (total, value) => total + value,
          0,
        ) / values.length
      ).toFixed(2),
    );
  }

  private cleanStringArray(values?: string[]) {
    return [
      ...new Set(
        (values ?? [])
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
  }

  private normalizeTags(tags?: string[]) {
    return [
      ...new Set(
        (tags ?? [])
          .map((tag) =>
            this.normalizeTag(tag),
          )
          .filter(Boolean),
      ),
    ];
  }

  private normalizeTag(tag: string) {
    return tag
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }

  private normalizeDate(value: string) {
    const date = this.parseDate(value, 'date');

    date.setHours(0, 0, 0, 0);

    return date;
  }

  private normalizeEndDate(value: string) {
    const date = this.parseDate(value, 'date');

    date.setHours(23, 59, 59, 999);

    return date;
  }

  private parseDate(
    value: string,
    fieldName: string,
  ) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }

    return date;
  }

  private isNumber(
    value: unknown,
  ): value is number {
    return (
      typeof value === 'number' &&
      Number.isFinite(value)
    );
  }

  private validateObjectId(
    value: string,
    fieldName: string,
  ) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Invalid ${fieldName}.`,
      );
    }
  }
}