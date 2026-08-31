import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { CreateSupplementDto } from './dto/create-supplement.dto';
import { UpdateSupplementDto } from './dto/update-supplement.dto';
import { UpdateSupplementLogItemDto } from './dto/update-supplement-log-item.dto';
import {
  DailySupplementLog,
  DailySupplementLogDocument,
  SupplementLogStatus,
} from './schemas/daily-supplement-log.schema';
import {
  DayOfWeek,
  Supplement,
  SupplementFrequency,
  SupplementStatus,
} from './schemas/supplement.schema';

type SupplementWithTimestamps = Supplement & {
  createdAt?: Date;
};

@Injectable()
export class SupplementsService {
  constructor(
    @InjectModel(Supplement.name)
    private readonly supplementModel: Model<Supplement>,

    @InjectModel(DailySupplementLog.name)
    private readonly dailySupplementLogModel: Model<DailySupplementLog>,
  ) {}

  async create(dto: CreateSupplementDto) {
    return this.supplementModel.create({
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
    });
  }

  async findAll(status?: SupplementStatus) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (status) {
      filter.status = status;
    }

    return this.supplementModel.find(filter).sort({ name: 1 }).lean();
  }

  async findOne(supplementId: string) {
    this.validateObjectId(supplementId, 'supplement ID');

    const supplement = await this.supplementModel
      .findOne({
        _id: new Types.ObjectId(supplementId),
        isActive: true,
      })
      .lean();

    if (!supplement) {
      throw new NotFoundException('Supplement not found.');
    }

    return supplement;
  }

  async update(supplementId: string, dto: UpdateSupplementDto) {
    this.validateObjectId(supplementId, 'supplement ID');

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

    const updated = await this.supplementModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(supplementId),
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
      throw new NotFoundException('Supplement not found.');
    }

    return updated;
  }

  async remove(supplementId: string) {
    this.validateObjectId(supplementId, 'supplement ID');

    const updated = await this.supplementModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(supplementId),
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          isArchived: true,
          status: SupplementStatus.STOPPED,
        },
      },
      {
        new: true,
      },
    );

    if (!updated) {
      throw new NotFoundException('Supplement not found.');
    }

    return {
      message: 'Supplement removed successfully.',
    };
  }

  async generateDailyLog(dateValue: string) {
    const date = this.normalizeDate(dateValue);

    const existing = await this.dailySupplementLogModel.findOne({
      date,
      isActive: true,
    });

    if (existing) {
      return existing;
    }

    const supplements = await this.supplementModel
      .find({
        status: SupplementStatus.ACTIVE,
        isActive: true,
        $and: [
          {
            $or: [
              { 'schedule.startDate': { $exists: false } },
              { 'schedule.startDate': null },
              { 'schedule.startDate': { $lte: date } },
            ],
          },
          {
            $or: [
              { 'schedule.endDate': { $exists: false } },
              { 'schedule.endDate': null },
              { 'schedule.endDate': { $gte: date } },
            ],
          },
        ],
      })
      .lean();

    const applicableSupplements = supplements.filter((supplement) =>
      this.shouldTakeOnDate(supplement, date),
    );

    const scheduledItems = applicableSupplements.flatMap((supplement) => {
      const times = supplement.schedule.times?.length
        ? supplement.schedule.times
        : ['anytime'];

      return times.map((scheduledTime) => ({
        supplementId: supplement._id,
        supplementName: supplement.name,
        scheduledTime,
        status: SupplementLogStatus.PENDING,
        plannedAmount: supplement.dose.amount,
        actualAmount: 0,
        unit: supplement.dose.unit,
        symptomsAfterTaking: [],
        sideEffects: [],
      }));
    });

    return this.dailySupplementLogModel.create({
      date,
      supplements: scheduledItems,
      totalScheduled: scheduledItems.length,
      totalTaken: 0,
      totalMissed: 0,
      totalSkipped: 0,
      adherencePercentage: 0,
    });
  }

  async getDailyLog(dateValue: string) {
    const date = this.normalizeDate(dateValue);

    const log = await this.dailySupplementLogModel
      .findOne({
        date,
        isActive: true,
      })
      .lean();

    if (!log) {
      throw new NotFoundException(
        'Daily supplement log not found for this date.',
      );
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

    return this.dailySupplementLogModel.find(filter).sort({ date: -1 }).lean();
  }

  async updateSupplementLogItem(
    logId: string,
    itemIndex: number,
    dto: UpdateSupplementLogItemDto,
  ) {
    this.validateObjectId(logId, 'daily supplement log ID');

    const log = await this.dailySupplementLogModel.findOne({
      _id: new Types.ObjectId(logId),
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException('Daily supplement log not found.');
    }

    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      throw new BadRequestException('Invalid supplement item index.');
    }

    const item = log.supplements[itemIndex];

    if (!item) {
      throw new BadRequestException('Supplement item does not exist.');
    }

    item.status = dto.status;

    if (dto.actualAmount !== undefined) {
      item.actualAmount = dto.actualAmount;
    }

    if (dto.takenAt) {
      item.takenAt = new Date(dto.takenAt);
    } else if (dto.status === SupplementLogStatus.TAKEN) {
      item.takenAt = new Date();
    }

    if (dto.skipReason !== undefined) {
      item.skipReason = dto.skipReason;
    }

    if (dto.notes !== undefined) {
      item.notes = dto.notes;
    }

    if (dto.symptomsAfterTaking !== undefined) {
      item.symptomsAfterTaking = dto.symptomsAfterTaking;
    }

    if (dto.sideEffects !== undefined) {
      item.sideEffects = dto.sideEffects;
    }

    this.recalculateDailyLog(log);

    await log.save();

    return log;
  }

  async markPendingAsMissed(dateValue: string) {
    const date = this.normalizeDate(dateValue);

    const log = await this.dailySupplementLogModel.findOne({
      date,
      isActive: true,
    });

    if (!log) {
      throw new NotFoundException('Daily supplement log not found.');
    }

    for (const item of log.supplements) {
      if (item.status === SupplementLogStatus.PENDING) {
        item.status = SupplementLogStatus.MISSED;
      }
    }

    this.recalculateDailyLog(log);

    await log.save();

    return log;
  }

  private shouldTakeOnDate(
    supplement: SupplementWithTimestamps,
    date: Date,
  ): boolean {
    const frequency = supplement.schedule.frequency;

    if (frequency === SupplementFrequency.AS_NEEDED) {
      return false;
    }

    if (frequency === SupplementFrequency.DAILY) {
      return true;
    }

    const dayName = date
      .toLocaleDateString('en-US', {
        weekday: 'long',
      })
      .toLowerCase() as DayOfWeek;

    const anchorDate = supplement.schedule.startDate
      ? new Date(supplement.schedule.startDate)
      : supplement.createdAt
        ? new Date(supplement.createdAt)
        : new Date(date);

    anchorDate.setHours(0, 0, 0, 0);

    const differenceInDays = Math.floor(
      (date.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (differenceInDays < 0) {
      return false;
    }

    if (frequency === SupplementFrequency.WEEKLY) {
      if (supplement.schedule.daysOfWeek?.length) {
        return supplement.schedule.daysOfWeek.includes(dayName);
      }

      return differenceInDays % 7 === 0;
    }

    if (frequency === SupplementFrequency.ALTERNATE_DAYS) {
      return differenceInDays % 2 === 0;
    }

    if (frequency === SupplementFrequency.CUSTOM) {
      if (supplement.schedule.daysOfWeek?.length) {
        return supplement.schedule.daysOfWeek.includes(dayName);
      }

      if (supplement.schedule.intervalDays) {
        return differenceInDays % supplement.schedule.intervalDays === 0;
      }
    }

    return false;
  }

  private recalculateDailyLog(log: DailySupplementLogDocument): void {
    log.totalScheduled = log.supplements.length;

    log.totalTaken = log.supplements.filter(
      (item) => item.status === SupplementLogStatus.TAKEN,
    ).length;

    log.totalMissed = log.supplements.filter(
      (item) => item.status === SupplementLogStatus.MISSED,
    ).length;

    log.totalSkipped = log.supplements.filter(
      (item) => item.status === SupplementLogStatus.SKIPPED,
    ).length;

    const partialCount = log.supplements.filter(
      (item) => item.status === SupplementLogStatus.PARTIAL,
    ).length;

    const adherenceUnits = log.totalTaken + partialCount * 0.5;

    log.adherencePercentage = log.totalScheduled
      ? Number(((adherenceUnits / log.totalScheduled) * 100).toFixed(2))
      : 0;
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
