import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { GenerateMediaPlanningCycleDto } from './dto/media-planning.dto';
import {
  MediaPlanningProgressUpdate,
  MediaPlanningService,
} from './media-planning.service';
import {
  MediaGenerationPurpose,
  MediaGenerationRun,
  MediaGenerationRunDocument,
  MediaGenerationRunStatus,
} from './schemas/media-generation-run.schema';

@Injectable()
export class MediaPlanningGenerationService {
  private readonly logger = new Logger(MediaPlanningGenerationService.name);

  constructor(
    @InjectModel(MediaGenerationRun.name)
    private readonly generationRunModel: Model<MediaGenerationRunDocument>,
    private readonly planningService: MediaPlanningService,
  ) {}

  async start(dto: GenerateMediaPlanningCycleDto = {}) {
    const mode = dto.mode ?? 'week';
    const totalDays =
      mode === 'week'
        ? 7
        : mode === 'ensure'
          ? Math.max(
              0,
              (await this.planningService.overview()).rolling.missingDates
                .length,
            )
          : 1;
    const existing = await this.generationRunModel
      .findOne({
        purpose: MediaGenerationPurpose.PLANNING,
        status: MediaGenerationRunStatus.GENERATING,
        isActive: true,
      })
      .sort({ createdAt: -1 });

    if (existing) return this.serialize(existing);

    const run = await this.generationRunModel.create({
      purpose: MediaGenerationPurpose.PLANNING,
      status: MediaGenerationRunStatus.GENERATING,
      promptVersion: 'media-planning-v3.15-rolling-growth-whole-os',
      brief:
        dto.notes?.trim() ||
        (mode === 'day'
          ? `Refresh Media planning day ${dto.targetDate ?? ''}.`
          : mode === 'roll'
            ? 'Roll the Media planning window forward by one day.'
            : mode === 'ensure'
              ? 'Generate only missing dates in the rolling seven-day Media Presence plan; preserve every existing day unchanged.'
              : 'Generate the rolling seven-day Media Presence plan.'),
      requestedPlatforms: [],
      strategySnapshot: {},
      candidates: [],
      rankedCandidateKeys: [],
      candidateCount: 0,
      metadata: {
        stage: 'queued',
        progress: 0,
        request: {
          force: dto.force ?? false,
          startDate: dto.startDate ?? null,
          notes: dto.notes?.trim() || null,
          mode,
          targetDate: dto.targetDate ?? null,
          outingStatus: dto.outingStatus ?? null,
          outingDetails: dto.outingDetails?.trim() || null,
        },
        queuedAt: new Date().toISOString(),
        completedDays: 0,
        totalDays,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          calls: 0,
          failedCalls: 0,
          retriedCalls: 0,
        },
        partialPlan: null,
      },
      isActive: true,
    });

    setImmediate(() => {
      void this.execute(run._id.toString(), dto);
    });

    return this.serialize(run);
  }

  async latest() {
    const run = await this.generationRunModel
      .findOne({
        purpose: MediaGenerationPurpose.PLANNING,
        isActive: true,
      })
      .sort({ createdAt: -1 });
    return run ? this.serialize(run) : null;
  }

  async get(jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) {
      throw new NotFoundException('Media planning generation job not found.');
    }
    const run = await this.generationRunModel.findOne({
      _id: jobId,
      purpose: MediaGenerationPurpose.PLANNING,
      isActive: true,
    });
    if (!run) {
      throw new NotFoundException('Media planning generation job not found.');
    }
    return this.serialize(run);
  }

  private async execute(jobId: string, dto: GenerateMediaPlanningCycleDto) {
    const startedAt = new Date().toISOString();
    await this.generationRunModel.updateOne(
      { _id: jobId },
      {
        $set: {
          'metadata.stage': 'generating_plan',
          'metadata.progress': 10,
          'metadata.startedAt': startedAt,
        },
      },
    );

    try {
      const mode = dto.mode ?? 'week';
      const totalDays =
        mode === 'week'
          ? 7
          : mode === 'ensure'
            ? Math.max(
                0,
                (await this.planningService.overview()).rolling.missingDates
                  .length,
              )
            : 1;
      const plan =
        mode === 'day'
          ? await this.planningService.refreshDay(
              dto.targetDate ?? '',
              dto,
              async (progress) => this.checkpoint(jobId, progress),
            )
          : mode === 'roll'
            ? await this.planningService.rollForward(dto, async (progress) =>
                this.checkpoint(jobId, progress),
              )
            : await this.planningService.generate(dto, async (progress) =>
                this.checkpoint(jobId, progress),
              );
      const planId =
        plan && '_id' in plan && plan._id ? String(plan._id) : null;
      await this.generationRunModel.updateOne(
        { _id: jobId },
        {
          $set: {
            status: MediaGenerationRunStatus.GENERATED,
            'metadata.stage': 'completed',
            'metadata.progress': 100,
            'metadata.completedDays': totalDays,
            'metadata.totalDays': totalDays,
            'metadata.completedAt': new Date().toISOString(),
            'metadata.planId': planId,
            'metadata.planStartDate':
              plan && 'startDate' in plan ? plan.startDate : null,
            'metadata.planEndDate':
              plan && 'endDate' in plan ? plan.endDate : null,
          },
          $unset: {
            'metadata.error': 1,
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown planning error.';
      this.logger.error(
        `Media planning generation ${jobId} failed: ${message}`,
      );
      await this.generationRunModel.updateOne(
        { _id: jobId },
        {
          $set: {
            status: MediaGenerationRunStatus.FAILED,
            'metadata.stage': 'failed',
            'metadata.completedAt': new Date().toISOString(),
            'metadata.error': message,
          },
        },
      );
    }
  }

  private async checkpoint(
    jobId: string,
    progress: MediaPlanningProgressUpdate,
  ) {
    await this.generationRunModel.updateOne(
      { _id: jobId },
      {
        $set: {
          'metadata.stage': progress.stage,
          'metadata.progress': progress.progress,
          'metadata.completedDays': progress.completedDays,
          'metadata.totalDays': progress.totalDays,
          'metadata.usage': progress.usage,
          'metadata.partialPlan': progress.partialPlan ?? null,
          'metadata.lastCheckpointAt': new Date().toISOString(),
        },
      },
    );
  }

  private serialize(run: MediaGenerationRunDocument) {
    const metadata = run.metadata ?? {};
    return {
      jobId: run._id.toString(),
      status: run.status,
      stage: typeof metadata.stage === 'string' ? metadata.stage : 'queued',
      progress: typeof metadata.progress === 'number' ? metadata.progress : 0,
      error: typeof metadata.error === 'string' ? metadata.error : null,
      planId: typeof metadata.planId === 'string' ? metadata.planId : null,
      planStartDate:
        typeof metadata.planStartDate === 'string'
          ? metadata.planStartDate
          : null,
      planEndDate:
        typeof metadata.planEndDate === 'string' ? metadata.planEndDate : null,
      queuedAt:
        typeof metadata.queuedAt === 'string' ? metadata.queuedAt : null,
      startedAt:
        typeof metadata.startedAt === 'string' ? metadata.startedAt : null,
      completedAt:
        typeof metadata.completedAt === 'string' ? metadata.completedAt : null,
      completedDays:
        typeof metadata.completedDays === 'number' ? metadata.completedDays : 0,
      totalDays:
        typeof metadata.totalDays === 'number' ? metadata.totalDays : 7,
      usage:
        metadata.usage && typeof metadata.usage === 'object'
          ? metadata.usage
          : {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              cachedInputTokens: 0,
              reasoningTokens: 0,
              calls: 0,
              failedCalls: 0,
              retriedCalls: 0,
            },
      partialPlan:
        metadata.partialPlan && typeof metadata.partialPlan === 'object'
          ? metadata.partialPlan
          : null,
    };
  }
}
