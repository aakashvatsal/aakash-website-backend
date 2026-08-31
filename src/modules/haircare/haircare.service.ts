import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateHaircareProductDto } from './dto/create-haircare-product.dto';
import { UpdateHairObservationDto } from './dto/update-hair-observation.dto';
import { UpdateHaircareLogItemDto } from './dto/update-haircare-log-item.dto';
import { UpdateHaircareProductDto } from './dto/update-haircare-product.dto';
import {
  DailyHaircareLog,
  DailyHaircareLogDocument,
  HaircareLogStatus,
} from './schemas/daily-haircare-log.schema';
import {
  HaircareFrequency,
  HaircareProduct,
  HaircareProductDocument,
  HaircareProductStatus,
  HaircareTimeOfDay,
} from './schemas/haircare-product.schema';

@Injectable()
export class HaircareService {
  constructor(
    @InjectModel(HaircareProduct.name)
    private readonly haircareProductModel: Model<HaircareProductDocument>,

    @InjectModel(DailyHaircareLog.name)
    private readonly dailyHaircareLogModel: Model<DailyHaircareLogDocument>,
  ) {}

  async createProduct(dto: CreateHaircareProductDto) {
    return this.haircareProductModel.create({
      ...dto,
      schedule: {
        ...dto.schedule,
        startDate: dto.schedule.startDate
          ? new Date(dto.schedule.startDate)
          : undefined,
        endDate: dto.schedule.endDate
          ? new Date(dto.schedule.endDate)
          : undefined,
      },
      patchTestAt: dto.patchTestAt ? new Date(dto.patchTestAt) : undefined,
    });
  }

  async findProducts(status?: HaircareProductStatus) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (status) {
      filter.status = status;
    }

    return this.haircareProductModel
      .find(filter)
      .sort({
        category: 1,
        name: 1,
      })
      .lean();
  }

  async findProduct(productId: string) {
    this.validateObjectId(productId, 'product ID');

    const product = await this.haircareProductModel
      .findOne({
        _id: new Types.ObjectId(productId),
        isActive: true,
      })
      .lean();

    if (!product) {
      throw new NotFoundException('Hair-care product not found.');
    }

    return product;
  }

  async updateProduct(productId: string, dto: UpdateHaircareProductDto) {
    this.validateObjectId(productId, 'product ID');

    const updateData: Record<string, unknown> = {
      ...dto,
    };

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

    if (dto.patchTestAt) {
      updateData.patchTestAt = new Date(dto.patchTestAt);
    }

    const product = await this.haircareProductModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(productId),
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
      throw new NotFoundException('Hair-care product not found.');
    }

    return product;
  }

  async removeProduct(productId: string) {
    this.validateObjectId(productId, 'product ID');

    const product = await this.haircareProductModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(productId),
        isActive: true,
      },
      {
        $set: {
          status: HaircareProductStatus.DISCONTINUED,
          isActive: false,
          isArchived: true,
        },
      },
      {
        new: true,
      },
    );

    if (!product) {
      throw new NotFoundException('Hair-care product not found.');
    }

    return {
      message: 'Hair-care product removed successfully.',
    };
  }

  async generateDailyLog(dateValue: string) {
    const date = this.normalizeDate(dateValue);
    const existing = await this.dailyHaircareLogModel.findOne({
      date,
      isActive: true,
    });

    if (existing) {
      return existing;
    }

    const products = await this.haircareProductModel
      .find({
        status: HaircareProductStatus.ACTIVE,
        isActive: true,
        $and: [
          {
            $or: [
              {
                'schedule.startDate': {
                  $exists: false,
                },
              },
              {
                'schedule.startDate': null,
              },
              {
                'schedule.startDate': {
                  $lte: date,
                },
              },
            ],
          },
          {
            $or: [
              {
                'schedule.endDate': {
                  $exists: false,
                },
              },
              {
                'schedule.endDate': null,
              },
              {
                'schedule.endDate': {
                  $gte: date,
                },
              },
            ],
          },
        ],
      })
      .lean();

    const applicableProducts = products.filter((product) =>
      this.shouldUseOnDate(product, date),
    );

    const routineItems = applicableProducts.flatMap((product) => {
      const times = product.schedule.timesOfDay?.length
        ? product.schedule.timesOfDay
        : [HaircareTimeOfDay.AS_NEEDED];

      return times.map((timeOfDay) => ({
        productId: product._id,
        productName: product.name,
        category: product.category,
        timeOfDay,
        applicationAreas: product.applicationAreas,
        status: HaircareLogStatus.PENDING,
        amountUnit: product.amountUnit,
        completionPercentage: 0,
        reactions: [],
      }));
    });

    return this.dailyHaircareLogModel.create({
      date,
      routineItems,
      totalScheduled: routineItems.length,
      totalApplied: 0,
      totalMissed: 0,
      totalSkipped: 0,
      adherencePercentage: 0,
    });
  }

  async getDailyLog(dateValue: string) {
    const date = this.normalizeDate(dateValue);

    const log = await this.dailyHaircareLogModel
      .findOne({
        date,
        isActive: true,
      })
      .lean();

    if (!log) {
      throw new NotFoundException('Daily hair-care log not found.');
    }

    return log;
  }

  async getLogs(startDate?: string, endDate?: string) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};

      if (startDate) {
        dateFilter.$gte = this.normalizeDate(startDate);
      }

      if (endDate) {
        const end = this.normalizeDate(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.date = dateFilter;
    }

    return this.dailyHaircareLogModel
      .find(filter)
      .sort({
        date: -1,
      })
      .lean();
  }

  async updateRoutineItem(
    logId: string,
    itemIndex: number,
    dto: UpdateHaircareLogItemDto,
  ) {
    this.validateObjectId(logId, 'log ID');

    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      throw new BadRequestException('Invalid hair-care routine item index.');
    }

    const log = await this.dailyHaircareLogModel.findOne({
      _id: new Types.ObjectId(logId),
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException('Daily hair-care log not found.');
    }

    const item = log.routineItems[itemIndex];

    if (!item) {
      throw new BadRequestException('Hair-care routine item does not exist.');
    }

    item.status = dto.status;

    if (dto.appliedAt) {
      item.appliedAt = new Date(dto.appliedAt);
    } else if (dto.status === HaircareLogStatus.APPLIED) {
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

    item.completionPercentage = this.getCompletionPercentage(dto.status);

    this.recalculateLog(log);

    await log.save();

    return log;
  }

  async updateObservation(logId: string, dto: UpdateHairObservationDto) {
    this.validateObjectId(logId, 'log ID');

    const updateData: Record<string, unknown> = {};

    if (dto.observation !== undefined) {
      updateData.observation = dto.observation;
    }

    if (dto.wash !== undefined) {
      updateData.wash = {
        ...dto.wash,
        ...(typeof dto.wash.washedAt === 'string'
          ? {
              washedAt: new Date(dto.wash.washedAt),
            }
          : {}),
      };
    }

    if (dto.lifestyle !== undefined) {
      updateData.lifestyle = dto.lifestyle;
    }

    if (dto.progressPhotoUrls !== undefined) {
      updateData.progressPhotoUrls = dto.progressPhotoUrls;
    }

    if (dto.dermatologistReviewRecommended !== undefined) {
      updateData.dermatologistReviewRecommended =
        dto.dermatologistReviewRecommended;
    }

    if (dto.dermatologistReviewReason !== undefined) {
      updateData.dermatologistReviewReason = dto.dermatologistReviewReason;
    }

    if (dto.notes !== undefined) {
      updateData.notes = dto.notes;
    }

    const updated = await this.dailyHaircareLogModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(logId),
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

    if (!updated) {
      throw new NotFoundException('Daily hair-care log not found.');
    }

    return updated;
  }

  async markPendingAsMissed(dateValue: string) {
    const date = this.normalizeDate(dateValue);

    const log = await this.dailyHaircareLogModel.findOne({
      date,
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException('Daily hair-care log not found.');
    }

    for (const item of log.routineItems) {
      if (item.status === HaircareLogStatus.PENDING) {
        item.status = HaircareLogStatus.MISSED;

        item.completionPercentage = 0;
      }
    }

    this.recalculateLog(log);

    await log.save();

    return log;
  }

  private shouldUseOnDate(
    product: HaircareProductDocument | Record<string, any>,
    date: Date,
  ): boolean {
    const schedule = product.schedule;

    if (schedule.frequency === HaircareFrequency.AS_NEEDED) {
      return false;
    }

    if (
      schedule.frequency === HaircareFrequency.DAILY ||
      schedule.frequency === HaircareFrequency.TWICE_DAILY
    ) {
      return true;
    }

    const dayOfWeek = date.getDay();

    if (
      schedule.frequency === HaircareFrequency.WEEKLY ||
      schedule.frequency === HaircareFrequency.TWICE_WEEKLY ||
      schedule.frequency === HaircareFrequency.THREE_TIMES_WEEKLY
    ) {
      return schedule.daysOfWeek?.includes(dayOfWeek) ?? false;
    }

    if (schedule.frequency === HaircareFrequency.ALTERNATE_DAYS) {
      const start = schedule.startDate ? new Date(schedule.startDate) : date;

      start.setHours(0, 0, 0, 0);

      const differenceInDays = Math.floor(
        (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );

      return differenceInDays % 2 === 0;
    }

    if (
      schedule.frequency === HaircareFrequency.CUSTOM &&
      schedule.daysOfWeek?.length
    ) {
      return schedule.daysOfWeek.includes(dayOfWeek);
    }

    if (
      schedule.frequency === HaircareFrequency.CUSTOM &&
      schedule.intervalDays
    ) {
      const start = schedule.startDate ? new Date(schedule.startDate) : date;

      start.setHours(0, 0, 0, 0);

      const differenceInDays = Math.floor(
        (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
      );

      return differenceInDays % schedule.intervalDays === 0;
    }

    return false;
  }

  private recalculateLog(log: DailyHaircareLogDocument): void {
    log.totalScheduled = log.routineItems.length;

    log.totalApplied = log.routineItems.filter(
      (item) => item.status === HaircareLogStatus.APPLIED,
    ).length;

    log.totalMissed = log.routineItems.filter(
      (item) => item.status === HaircareLogStatus.MISSED,
    ).length;

    log.totalSkipped = log.routineItems.filter(
      (item) => item.status === HaircareLogStatus.SKIPPED,
    ).length;

    const partialCount = log.routineItems.filter(
      (item) => item.status === HaircareLogStatus.PARTIAL,
    ).length;

    const adherenceUnits = log.totalApplied + partialCount * 0.5;

    log.adherencePercentage = log.totalScheduled
      ? Number(((adherenceUnits / log.totalScheduled) * 100).toFixed(2))
      : 0;
  }

  private getCompletionPercentage(status: HaircareLogStatus): number {
    switch (status) {
      case HaircareLogStatus.APPLIED:
        return 100;

      case HaircareLogStatus.PARTIAL:
        return 50;

      case HaircareLogStatus.PENDING:
      case HaircareLogStatus.MISSED:
      case HaircareLogStatus.SKIPPED:
      default:
        return 0;
    }
  }

  private normalizeDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    date.setHours(0, 0, 0, 0);

    return date;
  }

  private validateObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
