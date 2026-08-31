import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateIntimateCareProductDto } from './dto/create-intimate-care-product.dto';
import { UpdateIntimateCareLogItemDto } from './dto/update-intimate-care-log-item.dto';
import { UpdateIntimateCareProductDto } from './dto/update-intimate-care-product.dto';
import {
  DailyIntimateCareLog,
  DailyIntimateCareLogDocument,
  IntimateCareLogStatus,
} from './schemas/daily-intimate-care-log.schema';
import {
  IntimateCareFrequency,
  IntimateCareProduct,
  IntimateCareProductDocument,
  IntimateCareProductStatus,
  IntimateCareTimeOfDay,
} from './schemas/intimate-care-product.schema';

@Injectable()
export class IntimateCareService {
  constructor(
    @InjectModel(IntimateCareProduct.name)
    private readonly productModel: Model<IntimateCareProductDocument>,

    @InjectModel(DailyIntimateCareLog.name)
    private readonly dailyLogModel: Model<DailyIntimateCareLogDocument>,
  ) {}

  async createProduct(dto: CreateIntimateCareProductDto) {
    return this.productModel.create({
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

  async findProducts(status?: IntimateCareProductStatus) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (status) {
      filter.status = status;
    }

    return this.productModel.find(filter).sort({ category: 1, name: 1 }).lean();
  }

  async updateProduct(productId: string, dto: UpdateIntimateCareProductDto) {
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

    const updated = await this.productModel
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

    if (!updated) {
      throw new NotFoundException('Intimate-care product not found.');
    }

    return updated;
  }

  async generateDailyLog(dateValue: string) {
    const date = this.normalizeDate(dateValue);
    const existing = await this.dailyLogModel.findOne({
      date,
      isActive: true,
    });

    if (existing) {
      return existing;
    }

    const products = await this.productModel
      .find({
        status: IntimateCareProductStatus.ACTIVE,
        isActive: true,
      })
      .lean();

    const applicableProducts = products.filter((product) =>
      this.shouldUseOnDate(product, date),
    );

    const routineItems = applicableProducts.flatMap((product) => {
      const times = product.schedule.timesOfDay?.length
        ? product.schedule.timesOfDay
        : [IntimateCareTimeOfDay.AS_NEEDED];

      return times.map((timeOfDay) => ({
        productId: product._id,
        productName: product.name,
        category: product.category,
        timeOfDay,
        applicationAreas: product.applicationAreas,
        status: IntimateCareLogStatus.PENDING,
        amountUnit: product.amountUnit,
        completionPercentage: 0,
        reactions: [],
      }));
    });

    return this.dailyLogModel.create({
      date,
      routineItems,
      totalScheduled: routineItems.length,
      totalApplied: 0,
      totalMissed: 0,
      totalSkipped: 0,
      adherencePercentage: 0,
      isPrivate: true,
    });
  }

  async getDailyLog(dateValue: string) {
    const log = await this.dailyLogModel
      .findOne({
        date: this.normalizeDate(dateValue),
        isActive: true,
      })
      .lean();

    if (!log) {
      throw new NotFoundException('Daily intimate-care log not found.');
    }

    return log;
  }

  async updateRoutineItem(
    logId: string,
    itemIndex: number,
    dto: UpdateIntimateCareLogItemDto,
  ) {
    this.validateObjectId(logId, 'log ID');

    const log = await this.dailyLogModel.findOne({
      _id: new Types.ObjectId(logId),
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException('Daily intimate-care log not found.');
    }

    const item = log.routineItems[itemIndex];

    if (!item) {
      throw new BadRequestException('Invalid routine item index.');
    }

    item.status = dto.status;

    if (dto.appliedAt) {
      item.appliedAt = new Date(dto.appliedAt);
    } else if (dto.status === IntimateCareLogStatus.APPLIED) {
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

  async updateObservation(
    logId: string,
    data: {
      observation?: Record<string, unknown>;
      hygiene?: Record<string, unknown>;
      notes?: string;
    },
  ) {
    this.validateObjectId(logId, 'log ID');

    const updateData: Record<string, unknown> = {};

    if (data.observation !== undefined) {
      updateData.observation = data.observation;
    }

    if (data.hygiene !== undefined) {
      updateData.hygiene = data.hygiene;
    }

    if (data.notes !== undefined) {
      updateData.notes = data.notes;
    }

    const updated = await this.dailyLogModel
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
      throw new NotFoundException('Daily intimate-care log not found.');
    }

    return updated;
  }

  private shouldUseOnDate(
    product: IntimateCareProductDocument | any,
    date: Date,
  ): boolean {
    const schedule = product.schedule;

    if (schedule.frequency === IntimateCareFrequency.AS_NEEDED) {
      return false;
    }

    if (
      schedule.frequency === IntimateCareFrequency.DAILY ||
      schedule.frequency === IntimateCareFrequency.TWICE_DAILY
    ) {
      return true;
    }

    if (schedule.frequency === IntimateCareFrequency.WEEKLY) {
      return schedule.daysOfWeek?.includes(date.getDay());
    }

    const start = schedule.startDate ? new Date(schedule.startDate) : date;

    start.setHours(0, 0, 0, 0);

    const differenceInDays = Math.floor(
      (date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (schedule.frequency === IntimateCareFrequency.ALTERNATE_DAYS) {
      return differenceInDays % 2 === 0;
    }

    if (
      schedule.frequency === IntimateCareFrequency.CUSTOM &&
      schedule.intervalDays
    ) {
      return differenceInDays % schedule.intervalDays === 0;
    }

    return false;
  }

  private recalculateLog(log: DailyIntimateCareLogDocument) {
    log.totalScheduled = log.routineItems.length;

    log.totalApplied = log.routineItems.filter(
      (item) => item.status === IntimateCareLogStatus.APPLIED,
    ).length;

    log.totalMissed = log.routineItems.filter(
      (item) => item.status === IntimateCareLogStatus.MISSED,
    ).length;

    log.totalSkipped = log.routineItems.filter(
      (item) => item.status === IntimateCareLogStatus.SKIPPED,
    ).length;

    const partial = log.routineItems.filter(
      (item) => item.status === IntimateCareLogStatus.PARTIAL,
    ).length;

    const completedUnits = log.totalApplied + partial * 0.5;

    log.adherencePercentage = log.totalScheduled
      ? Number(((completedUnits / log.totalScheduled) * 100).toFixed(2))
      : 0;
  }

  private getCompletionPercentage(status: IntimateCareLogStatus) {
    if (status === IntimateCareLogStatus.APPLIED) {
      return 100;
    }

    if (status === IntimateCareLogStatus.PARTIAL) {
      return 50;
    }

    return 0;
  }

  private normalizeDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    date.setHours(0, 0, 0, 0);

    return date;
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
