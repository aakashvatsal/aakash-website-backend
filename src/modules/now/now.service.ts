import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { CreateNowStatusDto } from './dto/create-now-status.dto';

import { NowHistoryQueryDto } from './dto/now-history-query.dto';

import { UpdateNowStatusDto } from './dto/update-now-status.dto';

import {
  NowActivityType,
  NowSource,
  NowStatus,
  NowStatusDocument,
  NowVisibility,
} from './schemas/now-status.schema';

const PERSONAL_OS_TIMEZONE = 'Asia/Kolkata';
const DEFAULT_STALE_AFTER_MINUTES = 6 * 60;
const SLEEP_STALE_AFTER_MINUTES = 12 * 60;

@Injectable()
export class NowService {
  constructor(
    @InjectModel(NowStatus.name)
    private readonly nowStatusModel: Model<NowStatusDocument>,
  ) {}

  async create(data: CreateNowStatusDto) {
    const now = new Date();

    const startedAt = data.startedAt ? new Date(data.startedAt) : now;

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : undefined;

    const lastActivityAt = data.lastActivityAt
      ? new Date(data.lastActivityAt)
      : now;

    if (Number.isNaN(startedAt.getTime())) {
      throw new BadRequestException('Invalid startedAt date.');
    }

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException('Invalid expiresAt date.');
    }

    if (Number.isNaN(lastActivityAt.getTime())) {
      throw new BadRequestException('Invalid lastActivityAt date.');
    }

    if (expiresAt && expiresAt.getTime() <= startedAt.getTime()) {
      throw new BadRequestException('expiresAt must be later than startedAt.');
    }

    await this.endCurrentStatus(startedAt);

    try {
      const status = await this.nowStatusModel.create({
        ...data,

        startedAt,

        expiresAt,

        lastActivityAt,

        isCurrent: true,

        isActive: true,

        isArchived: false,
      });

      return status;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new BadRequestException('Another current status already exists.');
      }

      throw error;
    }
  }

  async findAll(query: NowHistoryQueryDto) {
    const page = query.page ?? 1;

    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {};

    if (query.activityType) {
      filter.activityType = query.activityType;
    }

    if (query.visibility) {
      filter.visibility = query.visibility;
    }

    if (query.source) {
      filter.source = query.source;
    }

    if (typeof query.isCurrent === 'boolean') {
      filter.isCurrent = query.isCurrent;
    }

    if (typeof query.isActive === 'boolean') {
      filter.isActive = query.isActive;
    } else {
      filter.isActive = true;
    }

    if (typeof query.isArchived === 'boolean') {
      filter.isArchived = query.isArchived;
    } else {
      filter.isArchived = false;
    }

    const [data, total] = await Promise.all([
      this.nowStatusModel
        .find(filter)
        .sort({
          startedAt: -1,
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      this.nowStatusModel.countDocuments(filter),
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

  async findById(nowStatusId: string) {
    const status = await this.nowStatusModel
      .findOne({
        _id: this.toObjectId(nowStatusId),

        isActive: true,
      })
      .lean();

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    return status;
  }

  async getCurrent() {
    await this.refreshCurrentState();

    const status = await this.nowStatusModel
      .findOne({
        isCurrent: true,

        isActive: true,

        isArchived: false,
      })
      .sort({
        createdAt: -1,
      })
      .lean();

    return status ?? null;
  }

  async getCurrentDocument() {
    await this.refreshCurrentState();

    return this.nowStatusModel.findOne({
      isCurrent: true,

      isActive: true,

      isArchived: false,
    });
  }

  async canAutomaticSourceReplaceCurrent() {
    const current = await this.getCurrentDocument();

    if (!current) {
      return true;
    }

    if (current.source === NowSource.MANUAL) {
      return false;
    }

    if (current.source === NowSource.HSAKAA) {
      return false;
    }

    return true;
  }

  async getPublicCurrent() {
    await this.refreshCurrentState();

    const status = await this.nowStatusModel
      .findOne({
        isCurrent: true,

        isActive: true,

        isArchived: false,

        visibility: NowVisibility.PUBLIC,
      })
      .sort({
        createdAt: -1,
      })
      .lean();

    if (!status) {
      return null;
    }

    return this.toPublicStatus(status);
  }

  getTemporalContext(referenceTime = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: PERSONAL_OS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(referenceTime);

    const value = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    const hour = Number.parseInt(value('hour'), 10);
    const localHour = Number.isFinite(hour) ? hour : 0;
    const daypart = this.resolveDaypart(localHour);

    return {
      timezone: PERSONAL_OS_TIMEZONE,
      utcIso: referenceTime.toISOString(),
      localDate: `${value('year')}-${value('month')}-${value('day')}`,
      localTime: `${value('hour')}:${value('minute')}:${value('second')}`,
      weekday: value('weekday'),
      hour24: localHour,
      daypart,
      isNight: daypart === 'night' || daypart === 'late_night',
    };
  }

  async refreshCurrentState(referenceTime = new Date()) {
    await this.expireCurrentIfNeeded(referenceTime);
    await this.expireStaleCurrentIfNeeded(referenceTime);
  }

  async getHistory(page = 1, limit = 20) {
    const safePage = Math.max(1, Math.floor(page));

    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

    const filter = {
      isCurrent: false,

      isActive: true,

      isArchived: false,
    };

    const [data, total] = await Promise.all([
      this.nowStatusModel
        .find(filter)
        .sort({
          startedAt: -1,
        })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),

      this.nowStatusModel.countDocuments(filter),
    ]);

    return {
      data,

      pagination: {
        page: safePage,

        limit: safeLimit,

        total,

        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async getPublicHistory(page = 1, limit = 20) {
    const safePage = Math.max(1, Math.floor(page));

    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);

    const filter = {
      isCurrent: false,
      isActive: true,
      isArchived: false,
      visibility: NowVisibility.PUBLIC,
    };

    const [data, total] = await Promise.all([
      this.nowStatusModel
        .find(filter)
        .sort({
          startedAt: -1,
        })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),

      this.nowStatusModel.countDocuments(filter),
    ]);

    return {
      data: data.map((status) => this.toPublicStatus(status)),

      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async update(nowStatusId: string, data: UpdateNowStatusDto) {
    const status = await this.nowStatusModel.findOne({
      _id: this.toObjectId(nowStatusId),

      isActive: true,
    });

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    if (data.startedAt) {
      const startedAt = new Date(data.startedAt);

      if (Number.isNaN(startedAt.getTime())) {
        throw new BadRequestException('Invalid startedAt date.');
      }

      status.startedAt = startedAt;
    }

    if (data.expiresAt !== undefined) {
      if (data.expiresAt) {
        const expiresAt = new Date(data.expiresAt);

        if (Number.isNaN(expiresAt.getTime())) {
          throw new BadRequestException('Invalid expiresAt date.');
        }

        status.expiresAt = expiresAt;
      } else {
        status.expiresAt = undefined;
      }
    }

    if (data.lastActivityAt) {
      const lastActivityAt = new Date(data.lastActivityAt);

      if (Number.isNaN(lastActivityAt.getTime())) {
        throw new BadRequestException('Invalid lastActivityAt date.');
      }

      status.lastActivityAt = lastActivityAt;
    }

    const rest: Partial<UpdateNowStatusDto> = { ...data };
    delete rest.startedAt;
    delete rest.expiresAt;
    delete rest.lastActivityAt;

    Object.assign(status, rest);

    if (
      status.expiresAt &&
      status.expiresAt.getTime() <= status.startedAt.getTime()
    ) {
      throw new BadRequestException('expiresAt must be later than startedAt.');
    }

    await status.save();

    return status;
  }

  async setCurrent(nowStatusId: string) {
    const status = await this.nowStatusModel.findOne({
      _id: this.toObjectId(nowStatusId),

      isActive: true,

      isArchived: false,
    });

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    if (status.isCurrent) {
      return status;
    }

    const now = new Date();

    await this.endCurrentStatus(now);

    status.isCurrent = true;

    status.startedAt = now;

    status.endedAt = undefined;

    status.lastActivityAt = now;

    if (status.expiresAt && status.expiresAt.getTime() <= now.getTime()) {
      status.expiresAt = undefined;
    }

    await status.save();

    return status;
  }

  async endCurrent() {
    const status = await this.nowStatusModel.findOne({
      isCurrent: true,

      isActive: true,

      isArchived: false,
    });

    if (!status) {
      return null;
    }

    const now = new Date();

    status.isCurrent = false;

    status.endedAt = now;

    status.lastActivityAt = now;

    await status.save();

    return status;
  }

  async touchCurrent() {
    const status = await this.nowStatusModel.findOne({
      isCurrent: true,

      isActive: true,

      isArchived: false,
    });

    if (!status) {
      return null;
    }

    status.lastActivityAt = new Date();

    await status.save();

    return status;
  }

  async archive(nowStatusId: string) {
    const status = await this.nowStatusModel.findOne({
      _id: this.toObjectId(nowStatusId),

      isActive: true,
    });

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    const now = new Date();

    status.isArchived = true;

    status.isCurrent = false;

    status.endedAt = status.endedAt ?? now;

    await status.save();

    return status;
  }

  async restore(nowStatusId: string) {
    const status = await this.nowStatusModel.findOne({
      _id: this.toObjectId(nowStatusId),

      isActive: true,
    });

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    status.isArchived = false;

    await status.save();

    return status;
  }

  async remove(nowStatusId: string) {
    const status = await this.nowStatusModel.findOne({
      _id: this.toObjectId(nowStatusId),

      isActive: true,
    });

    if (!status) {
      throw new NotFoundException('Now status not found.');
    }

    const now = new Date();

    status.isActive = false;

    status.isCurrent = false;

    status.endedAt = status.endedAt ?? now;

    await status.save();

    return {
      success: true,

      message: 'Now status removed successfully.',
    };
  }

  private async endCurrentStatus(endedAt: Date) {
    await this.nowStatusModel.updateMany(
      {
        isCurrent: true,

        isActive: true,
      },
      {
        $set: {
          isCurrent: false,

          endedAt,
        },
      },
    );
  }

  private async expireCurrentIfNeeded(now = new Date()) {
    await this.nowStatusModel.updateMany(
      {
        isCurrent: true,
        isActive: true,
        expiresAt: {
          $lte: now,
        },
      },
      {
        $set: {
          isCurrent: false,
          endedAt: now,
        },
      },
    );
  }

  private async expireStaleCurrentIfNeeded(now: Date) {
    const defaultCutoff = new Date(
      now.getTime() - DEFAULT_STALE_AFTER_MINUTES * 60_000,
    );
    const sleepCutoff = new Date(
      now.getTime() - SLEEP_STALE_AFTER_MINUTES * 60_000,
    );

    await Promise.all([
      this.expireStaleStatuses(now, defaultCutoff, {
        $ne: NowActivityType.SLEEPING,
      }),
      this.expireStaleStatuses(now, sleepCutoff, NowActivityType.SLEEPING),
    ]);
  }

  private async expireStaleStatuses(
    now: Date,
    cutoff: Date,
    activityType: NowActivityType | { $ne: NowActivityType },
  ) {
    await this.nowStatusModel.updateMany(
      {
        isCurrent: true,
        isActive: true,
        isArchived: false,
        activityType,
        // Explicit expiry remains authoritative. This fallback only protects
        // statuses that otherwise have no natural end and could live forever.
        expiresAt: { $exists: false },
        $or: [
          { lastActivityAt: { $lte: cutoff } },
          {
            lastActivityAt: { $exists: false },
            updatedAt: { $lte: cutoff },
          },
          {
            lastActivityAt: { $exists: false },
            updatedAt: { $exists: false },
            startedAt: { $lte: cutoff },
          },
        ],
      },
      {
        $set: {
          isCurrent: false,
          endedAt: now,
        },
      },
    );
  }

  private resolveDaypart(hour: number) {
    if (hour < 4) return 'late_night';
    if (hour < 6) return 'early_morning';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
  }

  private toPublicStatus(status: unknown): Record<string, unknown> {
    const response = this.toPlainRecord(status);

    if (response.showLocation !== true) {
      delete response.locationName;
      delete response.locationType;
    }

    if (response.showAvailability !== true) {
      delete response.availability;
    }

    if (response.showMood !== true) {
      delete response.mood;
    }

    if (response.showHealth !== true) {
      delete response.health;
      delete response.energyScore;
    }

    // Never expose internal integration/lifecycle fields
    // through the public website response.
    delete response.metadata;
    delete response.sourceExternalId;
    delete response.isActive;
    delete response.isArchived;
    delete response.showLocation;
    delete response.showAvailability;
    delete response.showMood;
    delete response.showHealth;

    return response;
  }

  private toPlainRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null) {
      return {};
    }

    if (
      'toObject' in value &&
      typeof (value as { toObject?: unknown }).toObject === 'function'
    ) {
      const converted = (value as { toObject: () => unknown }).toObject();

      return this.toPlainRecord(converted);
    }

    return { ...(value as Record<string, unknown>) };
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return (error as { code?: unknown }).code === 11000;
  }

  private toObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid now status ID.');
    }

    return new Types.ObjectId(id);
  }
}
