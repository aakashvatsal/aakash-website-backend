import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { HealthBaseline } from './schemas/health-baseline.schema';
import {
  DEFAULT_HEALTH_AUTONOMY,
  DEFAULT_HEALTH_SOURCE_PRIORITY,
  HealthAutonomyMode,
  HealthEvidenceSettings,
} from './schemas/health-evidence-settings.schema';
import { HealthEntry, HealthDataSource } from './schemas/health-entry.schema';
import { HealthPlanExecution } from './schemas/health-plan-execution.schema';
import {
  HealthPhotoCategory,
  HealthProgressPhoto,
} from './schemas/health-progress-photo.schema';
import {
  HealthSourceReport,
  HealthSourceReportMeasurement,
} from './schemas/health-source-report.schema';
import { UpdateHealthEvidenceSettingsDto } from './dto/health-evidence.dto';

type HealthProgressPhotoView = HealthProgressPhoto & { _id: unknown };
type HealthSourceReportView = HealthSourceReport & { _id: unknown };

@Injectable()
export class HealthEvidenceService {
  constructor(
    @InjectModel(HealthEvidenceSettings.name)
    private readonly settingsModel: Model<HealthEvidenceSettings>,
    @InjectModel(HealthBaseline.name)
    private readonly baselineModel: Model<HealthBaseline>,
    @InjectModel(HealthEntry.name)
    private readonly healthModel: Model<HealthEntry>,
    @InjectModel(HealthPlanExecution.name)
    private readonly executionModel: Model<HealthPlanExecution>,
    @InjectModel(HealthProgressPhoto.name)
    private readonly photoModel: Model<HealthProgressPhoto>,
    @InjectModel(HealthSourceReport.name)
    private readonly reportModel: Model<HealthSourceReport>,
  ) {}

  async getSettings() {
    const current = await this.settingsModel
      .findOne({ key: 'owner', isActive: true })
      .lean()
      .exec();
    if (current) return current;
    return this.settingsModel.create({
      key: 'owner',
      sourcePriority: [...DEFAULT_HEALTH_SOURCE_PRIORITY],
      autonomy: { ...DEFAULT_HEALTH_AUTONOMY },
      isActive: true,
    });
  }

  async updateSettings(dto: UpdateHealthEvidenceSettingsDto) {
    const current = await this.getSettings();
    const currentAutonomy = current.autonomy ?? DEFAULT_HEALTH_AUTONOMY;
    const autonomy = dto.autonomy
      ? { ...currentAutonomy, ...this.sanitizeAutonomy(dto.autonomy) }
      : currentAutonomy;
    return this.settingsModel
      .findOneAndUpdate(
        { key: 'owner' },
        {
          $set: {
            ...dto,
            autonomy,
            sourcePriority: [...DEFAULT_HEALTH_SOURCE_PRIORITY],
            isActive: true,
          },
          $setOnInsert: { key: 'owner' },
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean()
      .exec();
  }

  async markBaselineReviewed() {
    const now = new Date();
    const baseline = await this.baselineModel
      .findOneAndUpdate(
        { key: 'owner', isActive: true },
        { $set: { lastReviewedAt: now }, $inc: { reviewVersion: 1 } },
        { new: true },
      )
      .lean()
      .exec();
    return {
      reviewed: Boolean(baseline),
      lastReviewedAt: baseline?.lastReviewedAt ?? null,
      reviewVersion: baseline?.reviewVersion ?? 0,
    };
  }

  async getOverview() {
    const [settings, baseline, latestHealth, latestExecution, photos, reports] =
      await Promise.all([
        this.getSettings(),
        this.baselineModel
          .findOne({ key: 'owner', isActive: true })
          .lean()
          .exec(),
        this.healthModel.findOne({}).sort({ date: -1 }).lean().exec(),
        this.executionModel
          .findOne({ isActive: true })
          .sort({ date: -1 })
          .lean()
          .exec(),
        this.photoModel
          .find({ isActive: true })
          .select('-data')
          .sort({ takenAt: -1 })
          .lean()
          .exec(),
        this.reportModel
          .find({ isActive: true })
          .select('-data')
          .sort({ reportDate: -1 })
          .lean()
          .exec(),
      ]);

    const now = new Date();
    const baselineDate =
      this.asDate(
        (baseline as Record<string, unknown> | null)?.lastReviewedAt,
      ) ??
      this.asDate((baseline as Record<string, unknown> | null)?.updatedAt) ??
      this.asDate(
        (baseline as Record<string, unknown> | null)?.onboardingCompletedAt,
      );
    const baselineAgeDays = this.ageDays(baselineDate, now);

    const latestByCategory = (category: HealthPhotoCategory) =>
      photos.find((photo) => photo.category === category);
    const bodyPhoto = latestByCategory(HealthPhotoCategory.BODY);
    const skinPhoto = latestByCategory(HealthPhotoCategory.SKIN);
    const hairPhoto = latestByCategory(HealthPhotoCategory.HAIR);
    const latestReport = reports[0];
    const whoopConnected = Boolean(
      latestHealth?.sources?.includes(HealthDataSource.WHOOP),
    );
    const trackedAt = this.asDate(latestHealth?.date);
    const executionAt = this.asDate(latestExecution?.date);

    const quality = [
      this.qualityItem(
        'whoop',
        'WHOOP',
        whoopConnected ? 100 : 0,
        trackedAt,
        whoopConnected
          ? 'Connected objective recovery/sleep/body data.'
          : 'No recent WHOOP-backed Health entry found.',
      ),
      this.qualityItem(
        'sleep_recovery',
        'Sleep & recovery',
        latestHealth?.sleep || latestHealth?.recovery ? 100 : 20,
        trackedAt,
        latestHealth?.sleep || latestHealth?.recovery
          ? 'Objective sleep/recovery signals are available.'
          : 'Sleep/recovery evidence is sparse.',
      ),
      this.qualityItem(
        'body',
        'Body measurements',
        latestHealth?.bodyMeasurement?.weightKg != null ? 90 : 35,
        trackedAt,
        latestHealth?.bodyMeasurement?.weightKg != null
          ? 'Recent weight/body measurement exists.'
          : 'Weight is not available in the latest Health entry.',
      ),
      this.qualityItem(
        'execution',
        'Routine execution',
        latestExecution
          ? Math.max(
              35,
              Math.round(latestExecution.trackingCoveragePercentage ?? 0),
            )
          : 0,
        executionAt,
        latestExecution
          ? `${Math.round(latestExecution.trackingCoveragePercentage ?? 0)}% tracking coverage in the latest execution snapshot.`
          : 'No execution snapshot exists yet.',
      ),
      this.photoQuality(
        'body_photos',
        'Body photos',
        bodyPhoto,
        settings.bodyPhotoRefreshDays,
        now,
      ),
      this.photoQuality(
        'skin_photos',
        'Skin photos',
        skinPhoto,
        settings.skinPhotoRefreshDays,
        now,
      ),
      this.photoQuality(
        'hair_photos',
        'Hair photos',
        hairPhoto,
        settings.hairPhotoRefreshDays,
        now,
      ),
      this.qualityItem(
        'reports',
        'Health reports',
        latestReport
          ? (this.ageDays(this.asDate(latestReport.reportDate), now) ??
              Number.POSITIVE_INFINITY) <= settings.reportFreshnessDays
            ? 90
            : 50
          : 0,
        this.asDate(latestReport?.reportDate),
        latestReport
          ? `Latest uploaded report: ${latestReport.label || latestReport.originalName}.`
          : 'No private source report uploaded.',
      ),
    ];

    const overallScore = quality.length
      ? Math.round(
          quality.reduce((sum, item) => sum + item.score, 0) / quality.length,
        )
      : 0;

    return {
      generatedAt: now,
      sourcePriority: settings.sourcePriority,
      autonomy: settings.autonomy,
      overallScore,
      quality,
      baseline: {
        exists: Boolean(baseline),
        lastReviewedAt: baselineDate,
        ageDays: baselineAgeDays,
        refreshAfterDays: settings.baselineRefreshDays,
        refreshRecommended:
          !baseline ||
          baselineAgeDays == null ||
          baselineAgeDays >= settings.baselineRefreshDays,
      },
      photoComparisons: this.photoComparisons(photos),
      reportComparison: this.reportComparison(reports),
    };
  }

  private photoComparisons(photos: HealthProgressPhotoView[]) {
    const groups = new Map<string, HealthProgressPhotoView[]>();
    for (const photo of photos) {
      const key = `${photo.category}:${String(photo.angle).toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(photo);
      groups.set(key, list);
    }
    return [...groups.entries()].map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) => +new Date(b.takenAt) - +new Date(a.takenAt),
      );
      const latest = sorted[0];
      const previous = sorted[1];
      return {
        key,
        category: latest.category,
        angle: latest.angle,
        latest: this.photoSummary(latest),
        previous: previous ? this.photoSummary(previous) : null,
        comparison: latest.analysis?.comparison ?? null,
      };
    });
  }

  private reportComparison(reports: HealthSourceReportView[]) {
    const latest = reports[0];
    if (!latest) return { latest: null, previous: null, measurements: [] };
    const previous = reports[1] ?? null;
    const priorMeasurements = new Map<string, HealthSourceReportMeasurement>();
    for (const item of previous?.analysis?.structuredMeasurements ?? []) {
      priorMeasurements.set(this.normalizeName(String(item.name ?? '')), item);
    }
    const measurements = (latest.analysis?.structuredMeasurements ?? []).map(
      (item) => {
        const prior = priorMeasurements.get(
          this.normalizeName(String(item.name ?? '')),
        );
        return {
          name: item.name ?? '',
          previousValue: prior?.value ?? '',
          currentValue: item.value ?? '',
          unit: item.unit ?? prior?.unit ?? '',
          referenceRange: item.referenceRange ?? prior?.referenceRange ?? '',
          flag: item.flag ?? 'unknown',
        };
      },
    );
    return {
      latest: {
        id: String(latest._id),
        label: latest.label,
        reportDate: latest.reportDate,
      },
      previous: previous
        ? {
            id: String(previous._id),
            label: previous.label,
            reportDate: previous.reportDate,
          }
        : null,
      measurements,
    };
  }

  private photoSummary(photo: HealthProgressPhotoView) {
    return {
      id: String(photo._id),
      takenAt: photo.takenAt,
      summary: photo.analysis?.summary ?? '',
      observations: photo.analysis?.observations ?? [],
    };
  }

  private photoQuality(
    key: string,
    label: string,
    photo: HealthProgressPhotoView | undefined,
    refreshDays: number,
    now: Date,
  ) {
    if (!photo)
      return this.qualityItem(
        key,
        label,
        0,
        null,
        'No checkpoint uploaded yet.',
      );
    const age =
      this.ageDays(this.asDate(photo.takenAt), now) ?? refreshDays + 1;
    const score = age <= refreshDays ? 90 : age <= refreshDays * 2 ? 55 : 30;
    return this.qualityItem(
      key,
      label,
      score,
      this.asDate(photo.takenAt),
      age <= refreshDays
        ? 'Checkpoint is current.'
        : `Checkpoint is ${age} days old; refresh when practical.`,
    );
  }

  private qualityItem(
    key: string,
    label: string,
    score: number,
    lastObservedAt: Date | null,
    detail: string,
  ) {
    return {
      key,
      label,
      score,
      status:
        score >= 80
          ? 'excellent'
          : score >= 50
            ? 'good'
            : score > 0
              ? 'limited'
              : 'missing',
      lastObservedAt,
      detail,
    };
  }

  private sanitizeAutonomy(input: Record<string, HealthAutonomyMode>) {
    const allowed = new Set(Object.values(HealthAutonomyMode));
    const allowedDomains = new Set(Object.keys(DEFAULT_HEALTH_AUTONOMY));
    const cleaned = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) => allowedDomains.has(key) && allowed.has(value),
      ),
    ) as Record<string, HealthAutonomyMode>;

    // These are safety invariants, not UI preferences. They cannot be relaxed via API.
    cleaned.medication = HealthAutonomyMode.NEVER;
    cleaned.professionalInstructions = HealthAutonomyMode.LOCKED;
    if (cleaned.supplements === HealthAutonomyMode.AUTONOMOUS) {
      cleaned.supplements = HealthAutonomyMode.APPROVAL;
    }

    return cleaned;
  }

  private normalizeName(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private asDate(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private ageDays(value: Date | null, now: Date): number | null {
    if (!value) return null;
    return Math.max(
      0,
      Math.floor((now.getTime() - value.getTime()) / 86400000),
    );
  }
}
