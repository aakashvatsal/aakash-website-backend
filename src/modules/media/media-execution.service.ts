import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MediaDailyExecution,
  MediaDailyExecutionDocument,
  MediaExecutionKind,
  MediaExecutionStatus,
} from './schemas/media-daily-execution.schema';
import { MediaPlatform } from './schemas/media-post.schema';
import { UpdateMediaExecutionDto } from './dto/media-execution.dto';

export interface MediaExecutionSeed {
  key: string;
  date: string;
  kind: MediaExecutionKind;
  platform?: MediaPlatform;
  title: string;
  time?: string;
  sourceKey?: string;
  sourceId?: string;
  plannedCount?: number;
  instruction?: string;
}

@Injectable()
export class MediaExecutionService {
  constructor(
    @InjectModel(MediaDailyExecution.name)
    private readonly model: Model<MediaDailyExecutionDocument>,
  ) {}

  async sync(date: string, seeds: MediaExecutionSeed[]) {
    await Promise.all(
      seeds.map((seed) =>
        this.model.updateOne(
          { key: seed.key },
          {
            $setOnInsert: {
              key: seed.key,
              date: seed.date,
              kind: seed.kind,
              status: MediaExecutionStatus.PENDING,
              completedCount: 0,
            },
            $set: {
              title: seed.title,
              time: seed.time,
              instruction: seed.instruction,
              plannedCount: seed.plannedCount ?? 0,
              platform: seed.platform,
              sourceKey: seed.sourceKey,
              sourceId: seed.sourceId,
              isActive: true,
            },
          },
          { upsert: true },
        ),
      ),
    );
    return this.list(date);
  }

  async list(date: string) {
    return this.model
      .find({ date, isActive: true })
      .sort({ time: 1, kind: 1 })
      .lean();
  }

  async carryForward(date: string, lookbackDays = 7) {
    const from = new Date(`${date}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - Math.max(1, lookbackDays));
    const fromDate = from.toISOString().slice(0, 10);
    return this.model
      .find({
        date: { $gte: fromDate, $lt: date },
        isActive: true,
        status: {
          $in: [
            MediaExecutionStatus.PENDING,
            MediaExecutionStatus.MISSED,
            MediaExecutionStatus.BLOCKED,
          ],
        },
      })
      .sort({ date: -1, time: 1 })
      .limit(30)
      .lean();
  }

  async update(key: string, dto: UpdateMediaExecutionDto) {
    const existing = await this.model.findOne({ key, isActive: true });
    if (!existing)
      throw new NotFoundException('Media execution task not found.');
    if (dto.status === MediaExecutionStatus.RESCHEDULED && !dto.rescheduledTo) {
      throw new BadRequestException(
        'rescheduledTo is required when rescheduling a Media task.',
      );
    }
    existing.status = dto.status;
    if (dto.completedCount !== undefined)
      existing.completedCount = dto.completedCount;
    if (dto.notes !== undefined) existing.notes = dto.notes.trim();
    if (dto.blockedReason !== undefined)
      existing.blockedReason = dto.blockedReason.trim();
    if (dto.rescheduledTo !== undefined)
      existing.rescheduledTo = dto.rescheduledTo;
    existing.completedAt =
      dto.status === MediaExecutionStatus.DONE ? new Date() : undefined;
    await existing.save();
    return existing.toObject();
  }

  summary(tasks: Array<Pick<MediaDailyExecution, 'status'>>) {
    const counts = Object.values(MediaExecutionStatus).reduce<
      Record<string, number>
    >((acc, status) => {
      acc[status] = tasks.filter((item) => item.status === status).length;
      return acc;
    }, {});
    const actionable = tasks.filter(
      (item) => item.status !== MediaExecutionStatus.SKIPPED,
    ).length;
    const done = tasks.filter(
      (item) => item.status === MediaExecutionStatus.DONE,
    ).length;
    return {
      total: tasks.length,
      actionable,
      done,
      completionPercent: actionable
        ? Math.round((done / actionable) * 100)
        : 100,
      counts,
    };
  }
}
