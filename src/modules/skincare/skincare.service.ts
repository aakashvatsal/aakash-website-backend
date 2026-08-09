import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateSkincareProductDto } from './dto/create-skincare-product.dto';
import { UpdateSkincareLogItemDto } from './dto/update-skincare-log-item.dto';
import { UpdateSkincareProductDto } from './dto/update-skincare-product.dto';
import {
  DailySkincareLog,
  DailySkincareLogDocument,
  SkincareLogStatus,
} from './schemas/daily-skincare-log.schema';
import {
  SkincareFrequency,
  SkincareProduct,
  SkincareProductDocument,
  SkincareProductStatus,
} from './schemas/skincare-product.schema';

@Injectable()
export class SkincareService {
  constructor(
    @InjectModel(SkincareProduct.name)
    private readonly skincareProductModel:
      Model<SkincareProductDocument>,

    @InjectModel(DailySkincareLog.name)
    private readonly dailySkincareLogModel:
      Model<DailySkincareLogDocument>,
  ) {}

  async createProduct(dto: CreateSkincareProductDto) {
    this.validateObjectId(dto.userId, 'user ID');

    return this.skincareProductModel.create({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      schedule: {
        ...dto.schedule,
        startDate: dto.schedule.startDate
          ? new Date(dto.schedule.startDate)
          : undefined,
        endDate: dto.schedule.endDate
          ? new Date(dto.schedule.endDate)
          : undefined,
      },
      patchTestAt: dto.patchTestAt
        ? new Date(dto.patchTestAt)
        : undefined,
    });
  }

  async findProducts(
    userId: string,
    status?: SkincareProductStatus,
  ) {
    this.validateObjectId(userId, 'user ID');

    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
      isActive: true,
    };

    if (status) {
      filter.status = status;
    }

    return this.skincareProductModel
      .find(filter)
      .sort({ category: 1, name: 1 })
      .lean();
  }

  async updateProduct(
    productId: string,
    userId: string,
    dto: UpdateSkincareProductDto,
  ) {
    this.validateObjectId(productId, 'product ID');
    this.validateObjectId(userId, 'user ID');

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    delete updateData.userId;

    if (dto.schedule) {
      updateData.schedule = {
        ...dto.schedule,
        startDate: dto.schedule.startDate
          ? new Date(dto.schedule.startDate)
          : undefined,
        endDate: dto.schedule.endDate
          ? new Date(dto.schedule.endDate)
          : undefined,
      };
    }

    const product = await this.skincareProductModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(productId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!product) {
      throw new NotFoundException(
        'Skincare product not found.',
      );
    }

    return product;
  }

  async removeProduct(productId: string, userId: string) {
    this.validateObjectId(productId, 'product ID');
    this.validateObjectId(userId, 'user ID');

    const product = await this.skincareProductModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(productId),
        userId: new Types.ObjectId(userId),
        isActive: true,
      },
      {
        $set: {
          status: SkincareProductStatus.DISCONTINUED,
          isActive: false,
          isArchived: true,
        },
      },
      {
        new: true,
      },
    );

    if (!product) {
      throw new NotFoundException(
        'Skincare product not found.',
      );
    }

    return {
      message: 'Skincare product removed successfully.',
    };
  }

  async generateDailyLog(userId: string, dateValue: string) {
    this.validateObjectId(userId, 'user ID');

    const date = this.normalizeDate(dateValue);
    const objectUserId = new Types.ObjectId(userId);

    const existing = await this.dailySkincareLogModel.findOne({
      userId: objectUserId,
      date,
      isActive: true,
    });

    if (existing) {
      return existing;
    }

    const products = await this.skincareProductModel
      .find({
        userId: objectUserId,
        status: SkincareProductStatus.ACTIVE,
        isActive: true,
      })
      .lean();

    const applicableProducts = products.filter((product) =>
      this.shouldUseOnDate(product, date),
    );

    const routineItems = applicableProducts.flatMap((product) => {
      const times = product.schedule.timesOfDay?.length
        ? product.schedule.timesOfDay
        : [];

      return times.map((timeOfDay) => ({
        productId: product._id,
        productName: product.name,
        category: product.category,
        timeOfDay,
        applicationAreas: product.applicationAreas,
        status: SkincareLogStatus.PENDING,
        amountUnit: product.amountUnit,
        completionPercentage: 0,
        reactions: [],
      }));
    });

    return this.dailySkincareLogModel.create({
      userId: objectUserId,
      date,
      routineItems,
      totalScheduled: routineItems.length,
      totalApplied: 0,
      totalMissed: 0,
      totalSkipped: 0,
      adherencePercentage: 0,
    });
  }

  async getDailyLog(userId: string, dateValue: string) {
    this.validateObjectId(userId, 'user ID');

    const date = this.normalizeDate(dateValue);

    const log = await this.dailySkincareLogModel
      .findOne({
        userId: new Types.ObjectId(userId),
        date,
        isActive: true,
      })
      .lean();

    if (!log) {
      throw new NotFoundException(
        'Daily skincare log not found.',
      );
    }

    return log;
  }

  async updateRoutineItem(
    logId: string,
    userId: string,
    itemIndex: number,
    dto: UpdateSkincareLogItemDto,
  ) {
    this.validateObjectId(logId, 'log ID');
    this.validateObjectId(userId, 'user ID');

    const log = await this.dailySkincareLogModel.findOne({
      _id: new Types.ObjectId(logId),
      userId: new Types.ObjectId(userId),
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException(
        'Daily skincare log not found.',
      );
    }

    const item = log.routineItems[itemIndex];

    if (!item) {
      throw new BadRequestException(
        'Invalid skincare routine item index.',
      );
    }

    item.status = dto.status;

    if (dto.appliedAt) {
      item.appliedAt = new Date(dto.appliedAt);
    } else if (dto.status === SkincareLogStatus.APPLIED) {
      item.appliedAt = new Date();
    }

    if (dto.amountUsed !== undefined) {
      item.amountUsed = dto.amountUsed;
    }

    if (dto.reactions !== undefined) {
      item.reactions = dto.reactions;
    }

    if (dto.reactionSeverity !== undefined) {
      item.reactionSeverity = dto.reactionSeverity;
    }

    if (dto.reactionNotes !== undefined) {
      item.reactionNotes = dto.reactionNotes;
    }

    if (dto.skipReason !== undefined) {
      item.skipReason = dto.skipReason;
    }

    if (dto.notes !== undefined) {
      item.notes = dto.notes;
    }

    item.completionPercentage =
      this.getCompletionPercentage(dto.status);

    this.recalculateLog(log);

    await log.save();

    return log;
  }

  async updateObservation(
    logId: string,
    userId: string,
    data: {
      observation?: Record<string, unknown>;
      environment?: Record<string, unknown>;
      progressPhotoUrls?: string[];
      notes?: string;
    },
  ) {
    this.validateObjectId(logId, 'log ID');
    this.validateObjectId(userId, 'user ID');

    const updated = await this.dailySkincareLogModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(logId),
          userId: new Types.ObjectId(userId),
          isActive: true,
        },
        {
          $set: {
            ...(data.observation
              ? { observation: data.observation }
              : {}),
            ...(data.environment
              ? { environment: data.environment }
              : {}),
            ...(data.progressPhotoUrls
              ? {
                  progressPhotoUrls:
                    data.progressPhotoUrls,
                }
              : {}),
            ...(data.notes !== undefined
              ? { notes: data.notes }
              : {}),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException(
        'Daily skincare log not found.',
      );
    }

    return updated;
  }

  private shouldUseOnDate(
    product: SkincareProductDocument | any,
    date: Date,
  ): boolean {
    const schedule = product.schedule;

    if (
      schedule.startDate &&
      date < new Date(schedule.startDate)
    ) {
      return false;
    }

    if (
      schedule.endDate &&
      date > new Date(schedule.endDate)
    ) {
      return false;
    }

    if (
      schedule.frequency ===
        SkincareFrequency.DAILY ||
      schedule.frequency ===
        SkincareFrequency.TWICE_DAILY
    ) {
      return true;
    }

    const dayOfWeek = date.getDay();

    if (
      schedule.frequency ===
        SkincareFrequency.WEEKLY ||
      schedule.frequency ===
        SkincareFrequency.TWICE_WEEKLY
    ) {
      return schedule.daysOfWeek?.includes(dayOfWeek);
    }

    if (
      schedule.frequency ===
      SkincareFrequency.ALTERNATE_DAYS
    ) {
      const start = schedule.startDate
        ? new Date(schedule.startDate)
        : date;

      start.setHours(0, 0, 0, 0);

      const differenceInDays = Math.floor(
        (date.getTime() - start.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return differenceInDays % 2 === 0;
    }

    if (
      schedule.frequency === SkincareFrequency.CUSTOM &&
      schedule.intervalDays
    ) {
      const start = schedule.startDate
        ? new Date(schedule.startDate)
        : date;

      start.setHours(0, 0, 0, 0);

      const differenceInDays = Math.floor(
        (date.getTime() - start.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return (
        differenceInDays % schedule.intervalDays === 0
      );
    }

    return false;
  }

  private recalculateLog(
    log: DailySkincareLogDocument,
  ) {
    log.totalScheduled = log.routineItems.length;

    log.totalApplied = log.routineItems.filter(
      (item) =>
        item.status === SkincareLogStatus.APPLIED,
    ).length;

    log.totalMissed = log.routineItems.filter(
      (item) =>
        item.status === SkincareLogStatus.MISSED,
    ).length;

    log.totalSkipped = log.routineItems.filter(
      (item) =>
        item.status === SkincareLogStatus.SKIPPED,
    ).length;

    const partial = log.routineItems.filter(
      (item) =>
        item.status === SkincareLogStatus.PARTIAL,
    ).length;

    const completedUnits =
      log.totalApplied + partial * 0.5;

    log.adherencePercentage = log.totalScheduled
      ? Number(
          (
            (completedUnits / log.totalScheduled) *
            100
          ).toFixed(2),
        )
      : 0;
  }

  private getCompletionPercentage(
    status: SkincareLogStatus,
  ) {
    switch (status) {
      case SkincareLogStatus.APPLIED:
        return 100;

      case SkincareLogStatus.PARTIAL:
        return 50;

      default:
        return 0;
    }
  }

  private normalizeDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    date.setHours(0, 0, 0, 0);

    return date;
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