import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  DietEntry,
  DietEntryDocument,
} from '../diet/schemas/diet-entry.schema';
import {
  HealthEntry,
  HealthEntryDocument,
} from '../health/schemas/health-entry.schema';
import {
  DailySupplementLog,
  DailySupplementLogDocument,
} from '../supplements/schemas/daily-supplement-log.schema';
import { GenerateHealthReportDto } from './dto/generate-health-report.dto';
import { UpdateRecommendationDto } from './dto/update-recommendation.dto';
import {
  HealthMetricSummary,
  HealthRecommendation,
  HealthRecommendationPriority,
  HealthReport,
  HealthReportDocument,
  HealthReportStatus,
  HealthReportType,
  HealthTrend,
} from './schemas/health-report.schema';

@Injectable()
export class HealthReportsService {
  constructor(
    @InjectModel(HealthReport.name)
    private readonly healthReportModel: Model<HealthReportDocument>,

    @InjectModel(HealthEntry.name)
    private readonly healthEntryModel: Model<HealthEntryDocument>,

    @InjectModel(DietEntry.name)
    private readonly dietEntryModel: Model<DietEntryDocument>,

    @InjectModel(DailySupplementLog.name)
    private readonly dailySupplementLogModel: Model<DailySupplementLogDocument>,
  ) {}

  async generateReport(dto: GenerateHealthReportDto) {
    const periodStart = this.normalizeStartDate(dto.periodStart);
    const periodEnd = this.normalizeEndDate(dto.periodEnd);

    if (periodStart > periodEnd) {
      throw new BadRequestException('Period start must be before period end.');
    }

    const existing = await this.healthReportModel.findOne({
      reportType: dto.reportType,
      periodStart,
      periodEnd,
      isActive: true,
    });

    if (existing) {
      throw new ConflictException(
        'Health report already exists for this period.',
      );
    }

    const [healthEntries, dietEntries, supplementLogs] = await Promise.all([
      this.healthEntryModel
        .find({
          date: {
            $gte: periodStart,
            $lte: periodEnd,
          },
          isActive: true,
        })
        .sort({
          date: 1,
        })
        .lean(),

      this.dietEntryModel
        .find({
          date: {
            $gte: periodStart,
            $lte: periodEnd,
          },
          isActive: true,
        })
        .sort({
          date: 1,
        })
        .lean(),

      this.dailySupplementLogModel
        .find({
          date: {
            $gte: periodStart,
            $lte: periodEnd,
          },
          isActive: true,
        })
        .sort({
          date: 1,
        })
        .lean(),
    ]);

    const averageSteps = this.average(
      healthEntries.map((entry) => entry.steps).filter(this.isNumber),
    );

    const averageSleep = this.average(
      healthEntries
        .map((entry) => entry.sleep?.durationHours)
        .filter(this.isNumber),
    );

    const averageRecovery = this.average(
      healthEntries
        .map((entry) => entry.recovery?.recoveryScore)
        .filter(this.isNumber),
    );

    const averageVo2Max = this.average(
      healthEntries
        .map((entry) => entry.recovery?.vo2Max)
        .filter(this.isNumber),
    );

    const averageProteinAdherence = this.average(
      dietEntries
        .map((entry) => entry.adherence?.proteinTargetPercentage)
        .filter(this.isNumber),
    );

    const averageCalorieAdherence = this.average(
      dietEntries
        .map((entry) => entry.adherence?.calorieTargetPercentage)
        .filter(this.isNumber),
    );

    const supplementAdherence = this.average(
      supplementLogs
        .map((entry) => entry.adherencePercentage)
        .filter(this.isNumber),
    );

    const weightValues = healthEntries
      .map((entry) => entry.bodyMeasurement?.weightKg)
      .filter(this.isNumber);

    const waistValues = healthEntries
      .map((entry) => entry.bodyMeasurement?.waistCm)
      .filter(this.isNumber);

    const recommendations: HealthRecommendation[] = [];

    if (averageSleep !== null && averageSleep < 7) {
      recommendations.push({
        title: 'Improve sleep duration',
        recommendation:
          'Increase average nightly sleep toward at least seven hours.',
        priority: HealthRecommendationPriority.HIGH,
        reason: `Average sleep was ${averageSleep.toFixed(2)} hours.`,
        basedOnMetrics: ['sleep.durationHours'],
        expectedBenefit: 'Improved recovery, energy and workout performance.',
        actionPlan:
          'Use a consistent sleep window and reduce late-night screen exposure.',
        reviewAt: this.addDays(periodEnd, 7),
        completed: false,
      });
    }

    if (supplementAdherence !== null && supplementAdherence < 80) {
      recommendations.push({
        title: 'Improve supplement adherence',
        recommendation:
          'Follow the active supplement schedule more consistently.',
        priority: HealthRecommendationPriority.MEDIUM,
        reason: `Average adherence was ${supplementAdherence.toFixed(2)}%.`,
        basedOnMetrics: ['dailySupplementLog.adherencePercentage'],
        expectedBenefit:
          'More consistent support for nutrition and recovery goals.',
        actionPlan: 'Prepare supplements in advance and enable reminders.',
        reviewAt: this.addDays(periodEnd, 7),
        completed: false,
      });
    }

    if (averageProteinAdherence !== null && averageProteinAdherence < 85) {
      recommendations.push({
        title: 'Increase protein consistency',
        recommendation:
          'Bring daily protein intake closer to the planned target.',
        priority: HealthRecommendationPriority.MEDIUM,
        reason: `Average protein target adherence was ${averageProteinAdherence.toFixed(
          2,
        )}%.`,
        basedOnMetrics: ['diet.adherence.proteinTargetPercentage'],
        expectedBenefit:
          'Improved recovery, muscle retention and training consistency.',
        actionPlan: 'Plan one reliable protein source with every major meal.',
        reviewAt: this.addDays(periodEnd, 7),
        completed: false,
      });
    }

    const painEntries = healthEntries.flatMap(
      (entry) => entry.painEntries ?? [],
    );

    const unresolvedModeratePain = painEntries.some(
      (pain) =>
        !pain.resolved &&
        typeof pain.painScore === 'number' &&
        pain.painScore >= 5,
    );

    const medicalReviewRecommended = unresolvedModeratePain;

    const missingData: string[] = [];

    if (!healthEntries.length) {
      missingData.push('Daily health entries');
    }

    if (!dietEntries.length) {
      missingData.push('Daily diet entries');
    }

    if (!supplementLogs.length) {
      missingData.push('Daily supplement logs');
    }

    const overallHealthScore = this.calculateOverallScore([
      this.scoreAgainstTarget(averageSleep, 7),
      this.scoreAgainstTarget(averageSteps, 8000),
      averageRecovery,
      averageProteinAdherence,
      supplementAdherence,
    ]);

    const bodyMetrics: HealthMetricSummary[] = [
      this.createMetricSummary({
        metric: 'Weight',
        values: weightValues,
        unit: 'kg',
        higherIsBetter: null,
      }),

      this.createMetricSummary({
        metric: 'Waist',
        values: waistValues,
        unit: 'cm',
        higherIsBetter: false,
      }),
    ].filter((metric): metric is HealthMetricSummary => metric !== null);

    const sleepRecoveryMetrics: HealthMetricSummary[] = [
      {
        metric: 'Average sleep duration',
        averageValue: averageSleep ?? undefined,
        unit: 'hours',
        trend: HealthTrend.STABLE,
      },
      {
        metric: 'Average recovery score',
        averageValue: averageRecovery ?? undefined,
        unit: 'score',
        trend: HealthTrend.STABLE,
      },
      {
        metric: 'Average VO2 max',
        averageValue: averageVo2Max ?? undefined,
        unit: 'ml/kg/min',
        trend: HealthTrend.STABLE,
      },
    ];

    const activityMetrics: HealthMetricSummary[] = [
      {
        metric: 'Average daily steps',
        averageValue: averageSteps ?? undefined,
        unit: 'steps',
        trend: HealthTrend.STABLE,
      },
    ];

    const nutritionMetrics: HealthMetricSummary[] = [
      {
        metric: 'Protein target adherence',
        averageValue: averageProteinAdherence ?? undefined,
        unit: '%',
        trend: HealthTrend.STABLE,
      },
      {
        metric: 'Calorie target adherence',
        averageValue: averageCalorieAdherence ?? undefined,
        unit: '%',
        trend: HealthTrend.STABLE,
      },
    ];

    const supplementMetrics: HealthMetricSummary[] = [
      {
        metric: 'Supplement adherence',
        averageValue: supplementAdherence ?? undefined,
        unit: '%',
        trend: HealthTrend.STABLE,
      },
    ];

    return this.healthReportModel.create({
      reportType: dto.reportType,
      periodStart,
      periodEnd,

      title: this.buildReportTitle(dto.reportType, periodStart, periodEnd),

      executiveSummary:
        'Report generated from health, diet and supplement tracking data.',

      overallTrend: this.determineOverallTrend({
        weightValues,
        waistValues,
        averageRecovery,
        averageSleep,
      }),

      overallHealthScore,

      sections: [
        {
          category: 'Body',

          summary: this.buildBodySummary(weightValues, waistValues),

          trend: this.determineNumericTrend(waistValues, false),

          positives: [],

          concerns: [],

          metrics: bodyMetrics,
        },

        {
          category: 'Sleep and recovery',

          summary:
            `Average sleep: ${averageSleep ?? 0} hours. ` +
            `Average recovery: ${averageRecovery ?? 0}.`,

          trend: HealthTrend.STABLE,

          positives:
            averageSleep !== null && averageSleep >= 7
              ? ['Average sleep met the seven-hour target.']
              : [],

          concerns:
            averageSleep !== null && averageSleep < 7
              ? ['Average sleep remained below seven hours.']
              : [],

          metrics: sleepRecoveryMetrics,
        },

        {
          category: 'Activity',

          summary: `Average daily steps: ${averageSteps ?? 0}.`,

          trend: HealthTrend.STABLE,

          positives:
            averageSteps !== null && averageSteps >= 8000
              ? ['Average daily step target was achieved.']
              : [],

          concerns:
            averageSteps !== null && averageSteps < 6000
              ? ['Daily movement remained low.']
              : [],

          metrics: activityMetrics,
        },

        {
          category: 'Nutrition',

          summary:
            `Protein adherence: ${averageProteinAdherence ?? 0}%. ` +
            `Calorie adherence: ${averageCalorieAdherence ?? 0}%.`,

          trend: HealthTrend.STABLE,

          positives:
            averageProteinAdherence !== null && averageProteinAdherence >= 90
              ? ['Protein target adherence was strong.']
              : [],

          concerns:
            averageProteinAdherence !== null && averageProteinAdherence < 85
              ? ['Protein target adherence needs improvement.']
              : [],

          metrics: nutritionMetrics,
        },

        {
          category: 'Supplements',

          summary: `Average supplement adherence: ${
            supplementAdherence ?? 0
          }%.`,

          trend: HealthTrend.STABLE,

          positives:
            supplementAdherence !== null && supplementAdherence >= 90
              ? ['Supplement adherence was strong.']
              : [],

          concerns:
            supplementAdherence !== null && supplementAdherence < 80
              ? ['Supplement adherence needs improvement.']
              : [],

          metrics: supplementMetrics,
        },
      ],

      recommendations,

      achievements: this.buildAchievements({
        averageSteps,
        averageSleep,
        averageProteinAdherence,
        supplementAdherence,
      }),

      risks: unresolvedModeratePain
        ? ['Unresolved moderate or severe pain was recorded.']
        : [],

      missingData,

      sources: {
        healthEntryIds: healthEntries.map((entry) => entry._id),

        dietEntryIds: dietEntries.map((entry) => entry._id),

        supplementLogIds: supplementLogs.map((entry) => entry._id),

        journalEntryIds: [],
      },

      nextPeriodFocus:
        recommendations[0]?.title ?? 'Maintain consistent tracking.',

      nextReviewAt: this.getNextReviewDate(dto.reportType, periodEnd),

      status: HealthReportStatus.COMPLETED,

      generatedBy: 'hsakaa',

      generationMetadata: {
        healthEntryCount: healthEntries.length,

        dietEntryCount: dietEntries.length,

        supplementLogCount: supplementLogs.length,
      },

      medicalReviewRecommended,

      medicalReviewReason: medicalReviewRecommended
        ? 'Persistent moderate or severe pain was recorded.'
        : undefined,
    });
  }

  async findAll(reportType?: HealthReportType) {
    const filter: Record<string, unknown> = {
      isActive: true,
    };

    if (reportType) {
      filter.reportType = reportType;
    }

    return this.healthReportModel
      .find(filter)
      .sort({
        periodEnd: -1,
      })
      .lean();
  }

  async findOne(reportId: string) {
    this.validateObjectId(reportId, 'report ID');

    const report = await this.healthReportModel
      .findOne({
        _id: new Types.ObjectId(reportId),
        isActive: true,
      })
      .lean();

    if (!report) {
      throw new NotFoundException('Health report not found.');
    }

    return report;
  }

  async updateRecommendation(
    reportId: string,
    recommendationIndex: number,
    dto: UpdateRecommendationDto,
  ) {
    this.validateObjectId(reportId, 'report ID');

    const report = await this.healthReportModel.findOne({
      _id: new Types.ObjectId(reportId),
      isActive: true,
    });

    if (!report) {
      throw new NotFoundException('Health report not found.');
    }

    if (
      !Number.isInteger(recommendationIndex) ||
      recommendationIndex < 0 ||
      !report.recommendations[recommendationIndex]
    ) {
      throw new BadRequestException('Invalid recommendation index.');
    }

    const recommendation = report.recommendations[recommendationIndex];

    recommendation.completed = dto.completed;

    recommendation.completedAt = dto.completed
      ? dto.completedAt
        ? this.parseDate(dto.completedAt, 'completedAt')
        : new Date()
      : undefined;

    if (dto.result !== undefined) {
      recommendation.result = dto.result.trim();
    }

    await report.save();

    return report;
  }

  async remove(reportId: string) {
    this.validateObjectId(reportId, 'report ID');

    const report = await this.healthReportModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(reportId),
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          isArchived: true,
        },
      },
      {
        new: true,
      },
    );

    if (!report) {
      throw new NotFoundException('Health report not found.');
    }

    return {
      message: 'Health report deleted successfully.',
    };
  }

  private createMetricSummary(params: {
    metric: string;
    values: number[];
    unit: string;
    higherIsBetter: boolean | null;
  }): HealthMetricSummary | null {
    if (!params.values.length) {
      return null;
    }

    const averageValue = this.average(params.values);

    return {
      metric: params.metric,

      startValue: params.values[0],

      endValue: params.values[params.values.length - 1],

      averageValue: averageValue ?? undefined,

      minimumValue: Math.min(...params.values),

      maximumValue: Math.max(...params.values),

      trend:
        params.higherIsBetter === null
          ? HealthTrend.STABLE
          : this.determineNumericTrend(params.values, params.higherIsBetter),

      unit: params.unit,
    };
  }

  private determineNumericTrend(
    values: number[],
    higherIsBetter: boolean,
  ): HealthTrend {
    if (values.length < 2) {
      return HealthTrend.INSUFFICIENT_DATA;
    }

    const first = values[0];

    const last = values[values.length - 1];

    const difference = last - first;

    if (Math.abs(difference) < 0.01) {
      return HealthTrend.STABLE;
    }

    const movedInDesiredDirection = higherIsBetter
      ? difference > 0
      : difference < 0;

    return movedInDesiredDirection
      ? HealthTrend.IMPROVING
      : HealthTrend.DECLINING;
  }

  private determineOverallTrend(params: {
    weightValues: number[];
    waistValues: number[];
    averageRecovery: number | null;
    averageSleep: number | null;
  }): HealthTrend {
    if (
      !params.weightValues.length &&
      !params.waistValues.length &&
      params.averageRecovery === null &&
      params.averageSleep === null
    ) {
      return HealthTrend.INSUFFICIENT_DATA;
    }

    const waistTrend = this.determineNumericTrend(params.waistValues, false);

    if (waistTrend === HealthTrend.IMPROVING) {
      return HealthTrend.IMPROVING;
    }

    if (waistTrend === HealthTrend.DECLINING) {
      return HealthTrend.DECLINING;
    }

    return HealthTrend.STABLE;
  }

  private calculateOverallScore(
    scores: Array<number | null>,
  ): number | undefined {
    const validScores = scores.filter(
      (score): score is number =>
        typeof score === 'number' && Number.isFinite(score),
    );

    if (!validScores.length) {
      return undefined;
    }

    return Number(
      (
        validScores.reduce((total, score) => total + score, 0) /
        validScores.length
      ).toFixed(2),
    );
  }

  private scoreAgainstTarget(
    actual: number | null,
    target: number,
  ): number | null {
    if (actual === null || target <= 0) {
      return null;
    }

    return Math.min(Number(((actual / target) * 100).toFixed(2)), 100);
  }

  private buildAchievements(params: {
    averageSteps: number | null;
    averageSleep: number | null;
    averageProteinAdherence: number | null;
    supplementAdherence: number | null;
  }): string[] {
    const achievements: string[] = [];

    if (params.averageSteps !== null && params.averageSteps >= 8000) {
      achievements.push('Maintained at least 8,000 average daily steps.');
    }

    if (params.averageSleep !== null && params.averageSleep >= 7) {
      achievements.push('Maintained at least seven hours of average sleep.');
    }

    if (
      params.averageProteinAdherence !== null &&
      params.averageProteinAdherence >= 90
    ) {
      achievements.push('Maintained strong protein target adherence.');
    }

    if (
      params.supplementAdherence !== null &&
      params.supplementAdherence >= 90
    ) {
      achievements.push('Maintained strong supplement adherence.');
    }

    return achievements;
  }

  private buildBodySummary(
    weightValues: number[],
    waistValues: number[],
  ): string {
    const parts: string[] = [];

    if (weightValues.length) {
      parts.push(
        `Weight changed from ${weightValues[0]} kg to ${
          weightValues[weightValues.length - 1]
        } kg.`,
      );
    }

    if (waistValues.length) {
      parts.push(
        `Waist changed from ${waistValues[0]} cm to ${
          waistValues[waistValues.length - 1]
        } cm.`,
      );
    }

    return parts.length
      ? parts.join(' ')
      : 'Insufficient body measurement data.';
  }

  private buildReportTitle(
    reportType: HealthReportType,
    periodStart: Date,
    periodEnd: Date,
  ): string {
    return `${reportType.replaceAll('_', ' ')} health report: ${periodStart
      .toISOString()
      .slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`;
  }

  private getNextReviewDate(
    reportType: HealthReportType,
    periodEnd: Date,
  ): Date {
    switch (reportType) {
      case HealthReportType.WEEKLY:
        return this.addDays(periodEnd, 7);

      case HealthReportType.FORTNIGHTLY:
        return this.addDays(periodEnd, 14);

      case HealthReportType.MONTHLY:
        return this.addMonths(periodEnd, 1);

      case HealthReportType.QUARTERLY:
        return this.addMonths(periodEnd, 3);

      case HealthReportType.CUSTOM:
      default:
        return this.addDays(periodEnd, 7);
    }
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);

    result.setDate(result.getDate() + days);

    return result;
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date);

    result.setMonth(result.getMonth() + months);

    return result;
  }

  private average(values: number[]): number | null {
    if (!values.length) {
      return null;
    }

    return Number(
      (
        values.reduce((total, value) => total + value, 0) / values.length
      ).toFixed(2),
    );
  }

  private isNumber(this: void, value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private normalizeStartDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid period start date.');
    }

    date.setHours(0, 0, 0, 0);

    return date;
  }

  private normalizeEndDate(value: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid period end date.');
    }

    date.setHours(23, 59, 59, 999);

    return date;
  }

  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }

    return date;
  }

  private validateObjectId(value: string, fieldName: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
