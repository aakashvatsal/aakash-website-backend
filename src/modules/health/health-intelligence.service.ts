import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { HealthSubstanceUseStatus } from './dto/health-plan-progress.dto';
import { HealthProgressService } from './health-progress.service';
import { HealthGoal, HealthGoalStatus } from './schemas/health-goal.schema';
import { HealthOwnerUpdate } from './schemas/health-owner-update.schema';
import { HealthProgressPhoto } from './schemas/health-progress-photo.schema';
import { HealthSourceReport } from './schemas/health-source-report.schema';

type Severity = 'positive' | 'info' | 'watch' | 'attention';
type GoalTrajectoryStatus =
  | 'on_track'
  | 'slightly_behind'
  | 'off_track'
  | 'insufficient_data'
  | 'ongoing';

type ProgressSummary = Awaited<ReturnType<HealthProgressService['getSummary']>>;
type Execution = ProgressSummary['executions'][number];
type AutomaticMetrics = Execution['automaticMetrics'];

type TrendMetricKey = keyof Pick<
  AutomaticMetrics,
  | 'weightKg'
  | 'recoveryScore'
  | 'strainScore'
  | 'sleepHours'
  | 'sleepPerformancePercentage'
  | 'sleepDebtMinutes'
  | 'restingHeartRateBpm'
  | 'heartRateVariabilityMs'
  | 'bloodOxygenPercentage'
  | 'respiratoryRateBreathsPerMinute'
  | 'steps'
  | 'totalCaloriesBurned'
>;

type TrendPoint = { dateKey: string; value: number };

type Trend = {
  key: TrendMetricKey;
  label: string;
  unit: string;
  current: number | null;
  baseline: number | null;
  delta: number | null;
  deltaPercentage: number | null;
  direction: 'up' | 'down' | 'flat' | 'unknown';
  points: TrendPoint[];
};

type IntelligenceCard = {
  key: string;
  title: string;
  message: string;
  severity: Severity;
  metric?: string;
  current?: number | null;
  baseline?: number | null;
  delta?: number | null;
  evidenceDays: number;
};

type Correlation = {
  key: string;
  factor: string;
  outcome: string;
  sampleSize: number;
  exposedDays: number;
  comparisonDays: number;
  effect: number;
  unit: string;
  confidence: 'low' | 'medium' | 'high';
  interpretation: string;
};

type GoalTrajectory = {
  id: string;
  title: string;
  category: string;
  unit: string;
  currentValue: number | null;
  targetValue: number | null;
  startingValue: number | null;
  progressPercentage: number | null;
  expectedProgressPercentage: number | null;
  targetDate: string | null;
  status: GoalTrajectoryStatus;
  evidence: string;
};

type TrainingProgression = {
  exercise: string;
  recommendation: 'progress' | 'hold' | 'reduce' | 'review';
  rationale: string;
  sessionsObserved: number;
  averageSetCompletionPercentage: number;
  latestAverageRpe: number | null;
};

type PlateauFlag = {
  key: string;
  domain: string;
  severity: 'watch' | 'attention';
  message: string;
  evidence: string;
};

type AttentionItem = {
  key: string;
  severity: 'watch' | 'attention';
  title: string;
  message: string;
  action: string;
};

const TREND_META: Record<TrendMetricKey, { label: string; unit: string }> = {
  weightKg: { label: 'Weight', unit: 'kg' },
  recoveryScore: { label: 'Recovery', unit: '%' },
  strainScore: { label: 'Strain', unit: '' },
  sleepHours: { label: 'Sleep', unit: 'h' },
  sleepPerformancePercentage: { label: 'Sleep performance', unit: '%' },
  sleepDebtMinutes: { label: 'Sleep debt', unit: 'min' },
  restingHeartRateBpm: { label: 'Resting HR', unit: 'bpm' },
  heartRateVariabilityMs: { label: 'HRV', unit: 'ms' },
  bloodOxygenPercentage: { label: 'SpO₂', unit: '%' },
  respiratoryRateBreathsPerMinute: { label: 'Respiratory rate', unit: '/min' },
  steps: { label: 'Steps', unit: '' },
  totalCaloriesBurned: { label: 'Calories burned', unit: 'kcal' },
};

@Injectable()
export class HealthIntelligenceService {
  constructor(
    private readonly progressService: HealthProgressService,
    @InjectModel(HealthGoal.name)
    private readonly goalModel: Model<HealthGoal>,
    @InjectModel(HealthProgressPhoto.name)
    private readonly photoModel: Model<HealthProgressPhoto>,
    @InjectModel(HealthSourceReport.name)
    private readonly reportModel: Model<HealthSourceReport>,
    @InjectModel(HealthOwnerUpdate.name)
    private readonly ownerUpdateModel: Model<HealthOwnerUpdate>,
  ) {}

  async getIntelligence(days = 30) {
    const safeDays = Math.min(90, Math.max(14, Math.round(days || 30)));
    const [summary, executions, goals, photos, reports, ownerUpdates] =
      await Promise.all([
        this.progressService.getSummary(safeDays),
        this.progressService.getExecutionHistory(safeDays),
        this.goalModel
          .find({ status: HealthGoalStatus.ACTIVE, isActive: true })
          .sort({ priority: -1 })
          .lean()
          .exec(),
        this.photoModel
          .find({ isActive: true })
          .select('-data')
          .sort({ takenAt: -1 })
          .limit(40)
          .lean()
          .exec(),
        this.reportModel
          .find({ isActive: true })
          .select('-data')
          .sort({ reportDate: -1 })
          .limit(20)
          .lean()
          .exec(),
        this.ownerUpdateModel
          .find({ isActive: true })
          .sort({ effectiveAt: -1 })
          .limit(50)
          .lean()
          .exec(),
      ]);

    const trends = this.buildTrends(executions);
    const correlations = this.buildCorrelations(executions);
    const goalTrajectories = this.buildGoalTrajectories(goals, trends, summary);
    const trainingProgression = this.buildTrainingProgression(executions);
    const plateauFlags = this.buildPlateauFlags(trends, summary);
    const cards = this.buildCards(trends, summary, correlations, plateauFlags);
    const attention = this.buildAttention(
      cards,
      plateauFlags,
      executions,
      photos,
      reports,
    );
    const memory = this.buildMemory(executions, ownerUpdates);
    const status = attention.some((item) => item.severity === 'attention')
      ? 'attention'
      : attention.length || cards.some((card) => card.severity === 'watch')
        ? 'watch'
        : 'good';

    return {
      range: summary.range,
      generatedAt: new Date().toISOString(),
      status,
      headline: this.headline(status, cards, goalTrajectories),
      cards,
      trends,
      correlations,
      goals: goalTrajectories,
      trainingProgression,
      plateauFlags,
      attention,
      memory,
      photoTimeline: photos.map((photo) => ({
        id: String(photo._id),
        category: photo.category,
        angle: photo.angle,
        takenAt: photo.takenAt,
        summary: photo.analysis?.summary ?? '',
        observations: photo.analysis?.observations ?? [],
        improvementOpportunities:
          photo.analysis?.improvementOpportunities ?? [],
        safetyFlags: photo.analysis?.safetyFlags ?? [],
      })),
      reportTimeline: reports.map((report) => ({
        id: String(report._id),
        label: report.label || report.originalName,
        reportDate: report.reportDate,
        summary: report.analysis?.summary ?? '',
        measurements: report.analysis?.measurements ?? [],
        findings: report.analysis?.findings ?? [],
        planningImplications: report.analysis?.planningImplications ?? [],
        professionalInstructions:
          report.analysis?.professionalInstructions ?? [],
        safetyFlags: report.analysis?.safetyFlags ?? [],
      })),
    };
  }

  async getPlanningEvidence(days = 30) {
    const intelligence = await this.getIntelligence(days);
    return {
      status: intelligence.status,
      headline: intelligence.headline,
      cards: intelligence.cards.slice(0, 10),
      correlations: intelligence.correlations.slice(0, 8),
      goals: intelligence.goals,
      trainingProgression: intelligence.trainingProgression.slice(0, 12),
      plateauFlags: intelligence.plateauFlags,
      attention: intelligence.attention,
      memory: intelligence.memory,
    };
  }

  private buildTrends(executions: Execution[]): Trend[] {
    return (Object.keys(TREND_META) as TrendMetricKey[]).map((key) => {
      const points = executions
        .map((execution) => ({
          dateKey: execution.dateKey,
          value: execution.automaticMetrics[key],
        }))
        .filter(
          (point): point is TrendPoint => typeof point.value === 'number',
        );
      const current = points.at(-1)?.value ?? null;
      const baselinePoints = points.slice(Math.max(0, points.length - 15), -1);
      const baseline = baselinePoints.length
        ? this.average(baselinePoints.map((point) => point.value))
        : points.length > 1
          ? points[0].value
          : null;
      const delta =
        current != null && baseline != null ? current - baseline : null;
      const deltaPercentage =
        delta != null && baseline != null && Math.abs(baseline) > 0.0001
          ? (delta / Math.abs(baseline)) * 100
          : null;
      return {
        key,
        ...TREND_META[key],
        current: this.roundNullable(current),
        baseline: this.roundNullable(baseline),
        delta: this.roundNullable(delta),
        deltaPercentage: this.roundNullable(deltaPercentage),
        direction:
          deltaPercentage == null
            ? 'unknown'
            : deltaPercentage > 2
              ? 'up'
              : deltaPercentage < -2
                ? 'down'
                : 'flat',
        points: points.slice(-30),
      };
    });
  }

  private buildCards(
    trends: Trend[],
    summary: ProgressSummary,
    correlations: Correlation[],
    plateaus: PlateauFlag[],
  ): IntelligenceCard[] {
    const cards: IntelligenceCard[] = [];
    const trend = (key: TrendMetricKey) =>
      trends.find((item) => item.key === key);
    const recovery = trend('recoveryScore');
    if (
      recovery?.current != null &&
      recovery.baseline != null &&
      recovery.current < recovery.baseline - 8
    ) {
      cards.push({
        key: 'recovery-below-baseline',
        title: 'Recovery is below baseline',
        message: `Recovery is ${Math.round(recovery.current)}% versus a recent baseline of ${Math.round(recovery.baseline)}%. Keep today’s load responsive to recovery and pain signals.`,
        severity:
          recovery.current < recovery.baseline - 15 ? 'attention' : 'watch',
        metric: 'recoveryScore',
        current: recovery.current,
        baseline: recovery.baseline,
        delta: recovery.delta,
        evidenceDays: recovery.points.length,
      });
    }
    const hrv = trend('heartRateVariabilityMs');
    if (hrv && this.consecutiveDirection(hrv.points, 'down') >= 4) {
      cards.push({
        key: 'hrv-decline',
        title: 'HRV has declined repeatedly',
        message: `HRV has moved down across ${this.consecutiveDirection(hrv.points, 'down')} consecutive tracked days. HSAKAA should avoid forcing progression until the trend stabilizes.`,
        severity: 'watch',
        metric: 'heartRateVariabilityMs',
        current: hrv.current,
        baseline: hrv.baseline,
        delta: hrv.delta,
        evidenceDays: hrv.points.length,
      });
    }
    const sleepDebt = trend('sleepDebtMinutes');
    if (sleepDebt?.current != null && sleepDebt.current >= 60) {
      cards.push({
        key: 'sleep-debt',
        title: 'Sleep debt needs attention',
        message: `Current tracked sleep debt is about ${Math.round(sleepDebt.current)} minutes. Recovery planning should prioritize restoring sleep rather than adding load.`,
        severity: sleepDebt.current >= 120 ? 'attention' : 'watch',
        metric: 'sleepDebtMinutes',
        current: sleepDebt.current,
        baseline: sleepDebt.baseline,
        delta: sleepDebt.delta,
        evidenceDays: sleepDebt.points.length,
      });
    }
    if (summary.averages.trackingCoveragePercentage < 60) {
      cards.push({
        key: 'tracking-coverage',
        title: 'Evidence is incomplete',
        message: `Only ${Math.round(summary.averages.trackingCoveragePercentage)}% of planned domains are currently covered by execution evidence. HSAKAA should avoid strong conclusions from missing data.`,
        severity: 'info',
        evidenceDays: summary.totals.finalizedDays,
      });
    }
    if (
      summary.averages.adherencePercentage >= 80 &&
      summary.totals.finalizedDays >= 3
    ) {
      cards.push({
        key: 'adherence-good',
        title: 'Execution is consistent',
        message: `Average adherence is ${Math.round(summary.averages.adherencePercentage)}% across finalized days, with a ${summary.totals.adherenceStreak}-day 80%+ streak.`,
        severity: 'positive',
        evidenceDays: summary.totals.finalizedDays,
      });
    }
    for (const correlation of correlations.slice(0, 2)) {
      cards.push({
        key: `correlation-${correlation.key}`,
        title: `${correlation.factor} vs ${correlation.outcome}`,
        message: correlation.interpretation,
        severity: Math.abs(correlation.effect) >= 8 ? 'watch' : 'info',
        evidenceDays: correlation.sampleSize,
      });
    }
    for (const plateau of plateaus.slice(0, 2)) {
      cards.push({
        key: `plateau-${plateau.key}`,
        title: `${this.titleCase(plateau.domain)} plateau`,
        message: plateau.message,
        severity: plateau.severity,
        evidenceDays: summary.totals.finalizedDays,
      });
    }
    return cards.slice(0, 12);
  }

  private buildCorrelations(executions: Execution[]): Correlation[] {
    const results: Correlation[] = [];
    const nextDayMetric = (
      factorName: string,
      factor: (execution: Execution) => boolean | null,
      outcomeName: string,
      outcome: (execution: Execution) => number | null,
      unit: string,
      key: string,
    ) => {
      const exposed: number[] = [];
      const comparison: number[] = [];
      for (let index = 0; index < executions.length - 1; index += 1) {
        const state = factor(executions[index]);
        const next = outcome(executions[index + 1]);
        if (state == null || next == null) continue;
        (state ? exposed : comparison).push(next);
      }
      if (exposed.length < 2 || comparison.length < 2) return;
      const effect = this.average(exposed) - this.average(comparison);
      const sampleSize = exposed.length + comparison.length;
      const confidence =
        sampleSize >= 16 ? 'high' : sampleSize >= 8 ? 'medium' : 'low';
      const direction = effect > 0 ? 'higher' : 'lower';
      results.push({
        key,
        factor: factorName,
        outcome: outcomeName,
        sampleSize,
        exposedDays: exposed.length,
        comparisonDays: comparison.length,
        effect: Number(effect.toFixed(1)),
        unit,
        confidence,
        interpretation: `${factorName} days were followed by ${Math.abs(effect).toFixed(1)}${unit} ${direction} ${outcomeName.toLowerCase()} on average in the available sample. This is an association, not proof of causation.`,
      });
    };

    const yesNo = (kind: 'alcohol' | 'smoking') => (execution: Execution) => {
      const status = execution.feedback[kind]?.status;
      if (status === HealthSubstanceUseStatus.YES) return true;
      if (status === HealthSubstanceUseStatus.NO) return false;
      return null;
    };
    nextDayMetric(
      'Alcohol use',
      yesNo('alcohol'),
      'Next-day recovery',
      (execution) => execution.automaticMetrics.recoveryScore,
      '%',
      'alcohol-recovery',
    );
    nextDayMetric(
      'Alcohol use',
      yesNo('alcohol'),
      'Next-day sleep performance',
      (execution) => execution.automaticMetrics.sleepPerformancePercentage,
      '%',
      'alcohol-sleep-performance',
    );
    nextDayMetric(
      'Smoking',
      yesNo('smoking'),
      'Next-day recovery',
      (execution) => execution.automaticMetrics.recoveryScore,
      '%',
      'smoking-recovery',
    );
    nextDayMetric(
      'Smoking',
      yesNo('smoking'),
      'Next-day HRV',
      (execution) => execution.automaticMetrics.heartRateVariabilityMs,
      ' ms',
      'smoking-hrv',
    );
    nextDayMetric(
      'High strain (≥14)',
      (execution) =>
        execution.automaticMetrics.strainScore == null
          ? null
          : execution.automaticMetrics.strainScore >= 14,
      'Next-day recovery',
      (execution) => execution.automaticMetrics.recoveryScore,
      '%',
      'strain-recovery',
    );
    nextDayMetric(
      'Sleep target met',
      (execution) => {
        const score = execution.domains.sleep?.score;
        return typeof score === 'number' ? score >= 90 : null;
      },
      'Next-day recovery',
      (execution) => execution.automaticMetrics.recoveryScore,
      '%',
      'sleep-recovery',
    );
    nextDayMetric(
      'Meditation completed',
      (execution) => {
        const score = execution.domains.meditation?.score;
        return typeof score === 'number' ? score >= 90 : null;
      },
      'Next-day recovery',
      (execution) => execution.automaticMetrics.recoveryScore,
      '%',
      'meditation-recovery',
    );
    return results.sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 10);
  }

  private buildGoalTrajectories(
    goals: Array<HealthGoal & { _id: unknown }>,
    trends: Trend[],
    summary: ProgressSummary,
  ): GoalTrajectory[] {
    const latestMetric = (key: TrendMetricKey) =>
      trends.find((item) => item.key === key)?.current ?? null;
    const processMetrics: Record<string, number | null> = {
      adherence: summary.averages.adherencePercentage,
      training: summary.averages.domains.training ?? null,
      workout: summary.averages.domains.training ?? null,
      gym: summary.averages.domains.training ?? null,
      nutrition: summary.averages.domains.nutrition ?? null,
      diet: summary.averages.domains.nutrition ?? null,
      meditation: summary.averages.domains.meditation ?? null,
      supplements: summary.averages.domains.supplements ?? null,
      skincare: summary.averages.domains.skincare ?? null,
      skin: summary.averages.domains.skincare ?? null,
      haircare: summary.averages.domains.haircare ?? null,
      hair: summary.averages.domains.haircare ?? null,
    };

    return goals.map((goal) => {
      const text = `${goal.category} ${goal.title}`.toLowerCase();
      const metricKey = this.goalMetricKey(text);
      let current = metricKey ? latestMetric(metricKey) : null;
      if (current == null) {
        const processKey = Object.keys(processMetrics).find((key) =>
          text.includes(key),
        );
        current = processKey ? processMetrics[processKey] : null;
      }
      const target = this.parseNumber(goal.targetValue);
      const starting = this.parseNumber(goal.currentValue);
      const progress = this.progressBetween(starting, current, target);
      const targetDate = this.resolveGoalTargetDate(goal);
      const expected = targetDate
        ? this.expectedProgress(summary.range.startDateKey, targetDate)
        : null;
      const status = this.goalStatus(
        progress,
        expected,
        target,
        current,
        targetDate,
      );
      return {
        id: String(goal._id),
        title: goal.title,
        category: goal.category,
        unit: goal.unit,
        currentValue: this.roundNullable(current),
        targetValue: target,
        startingValue: starting,
        progressPercentage: this.roundNullable(progress),
        expectedProgressPercentage: this.roundNullable(expected),
        targetDate,
        status,
        evidence:
          current == null
            ? 'No matching automatic metric or execution score is available yet.'
            : metricKey
              ? `Current value is derived from ${TREND_META[metricKey].label} in automatic Health/WHOOP evidence.`
              : 'Current value is derived from recent plan-execution adherence.',
      };
    });
  }

  private buildTrainingProgression(
    executions: Execution[],
  ): TrainingProgression[] {
    type ExerciseObservation = {
      completedSets: number;
      plannedSets: number;
      rpes: number[];
      dateKey: string;
    };
    const byExercise = new Map<string, ExerciseObservation[]>();
    for (const execution of executions.slice(-21)) {
      const actual = this.record(execution.domains.training?.actual);
      const matched = Array.isArray(actual?.matchedExercises)
        ? actual.matchedExercises
        : [];
      for (const raw of matched) {
        const exercise = this.record(raw);
        const name = typeof exercise?.name === 'string' ? exercise.name : '';
        const plannedSets = this.numeric(exercise?.plannedSets);
        const completedSets = this.numeric(exercise?.completedSets);
        if (!name || plannedSets == null || completedSets == null) continue;
        const actualSets = Array.isArray(exercise?.actualSets)
          ? exercise.actualSets
          : [];
        const rpes = actualSets
          .map((set) => this.numeric(this.record(set)?.perceivedExertion))
          .filter((value): value is number => value != null);
        const key = name.trim().toLowerCase();
        const bucket = byExercise.get(key) ?? [];
        bucket.push({
          completedSets,
          plannedSets,
          rpes,
          dateKey: execution.dateKey,
        });
        byExercise.set(key, bucket);
      }
    }
    const recommendations: TrainingProgression[] = [];
    for (const [key, observations] of byExercise) {
      const recent = observations.slice(-3);
      if (recent.length < 2) continue;
      const completion = this.average(
        recent.map((item) =>
          item.plannedSets > 0
            ? (item.completedSets / item.plannedSets) * 100
            : 100,
        ),
      );
      const latestRpes = recent.at(-1)?.rpes ?? [];
      const latestAverageRpe = latestRpes.length
        ? this.average(latestRpes)
        : null;
      let recommendation: TrainingProgression['recommendation'] = 'hold';
      let rationale =
        'Keep the current prescription while more performance evidence accumulates.';
      if (
        completion >= 95 &&
        latestAverageRpe != null &&
        latestAverageRpe <= 8
      ) {
        recommendation = 'progress';
        rationale =
          'Recent planned sets were completed consistently without excessive reported exertion. A small load/rep progression is reasonable if recovery and pain signals are also supportive.';
      } else if (completion < 70) {
        recommendation = 'reduce';
        rationale =
          'Recent set completion is low. Reduce complexity/load or improve scheduling instead of forcing progression.';
      } else if (latestAverageRpe != null && latestAverageRpe >= 9.5) {
        recommendation = 'review';
        rationale =
          'Reported exertion is very high. Review load, technique, recovery and pain signals before progressing.';
      }
      recommendations.push({
        exercise: key.replace(/\b\w/g, (letter) => letter.toUpperCase()),
        recommendation,
        rationale,
        sessionsObserved: recent.length,
        averageSetCompletionPercentage: Number(completion.toFixed(1)),
        latestAverageRpe: this.roundNullable(latestAverageRpe),
      });
    }
    return recommendations
      .sort(
        (a, b) =>
          this.progressionRank(a.recommendation) -
          this.progressionRank(b.recommendation),
      )
      .slice(0, 20);
  }

  private buildPlateauFlags(
    trends: Trend[],
    summary: ProgressSummary,
  ): PlateauFlag[] {
    const flags: PlateauFlag[] = [];
    const weight = trends.find((item) => item.key === 'weightKg');
    if (weight && weight.points.length >= 10) {
      const recent = weight.points.slice(-10).map((point) => point.value);
      const spread = Math.max(...recent) - Math.min(...recent);
      if (spread <= 0.4) {
        flags.push({
          key: 'weight-flat-10',
          domain: 'weight',
          severity: 'watch',
          message:
            'Weight has been nearly flat across the last 10 tracked points.',
          evidence: `Observed range ${spread.toFixed(1)} kg across ${recent.length} measurements. Interpret against the active goal before changing calories.`,
        });
      }
    }
    if (
      summary.totals.finalizedDays >= 7 &&
      summary.averages.adherencePercentage < 60
    ) {
      flags.push({
        key: 'execution-low',
        domain: 'execution',
        severity: 'watch',
        message:
          'Low adherence is more likely to be limiting progress than a lack of plan complexity.',
        evidence: `${Math.round(summary.averages.adherencePercentage)}% average adherence across the current evidence window.`,
      });
    }
    const sleep = trends.find((item) => item.key === 'sleepHours');
    if (sleep && sleep.points.length >= 7) {
      const recent = sleep.points.slice(-7).map((point) => point.value);
      if (this.average(recent) < 6.5) {
        flags.push({
          key: 'sleep-low-week',
          domain: 'sleep',
          severity: 'attention',
          message:
            'Average tracked sleep remains below 6.5 hours across the recent week.',
          evidence: `${this.average(recent).toFixed(1)} h average across ${recent.length} tracked nights.`,
        });
      }
    }
    return flags;
  }

  private buildAttention(
    cards: IntelligenceCard[],
    plateaus: PlateauFlag[],
    executions: Execution[],
    photos: Array<HealthProgressPhoto & { _id: unknown }>,
    reports: Array<HealthSourceReport & { _id: unknown }>,
  ): AttentionItem[] {
    const items: AttentionItem[] = [];
    for (const card of cards.filter((item) => item.severity === 'attention')) {
      items.push({
        key: card.key,
        severity: 'attention',
        title: card.title,
        message: card.message,
        action:
          'Keep the rolling plan conservative and review the underlying signal before adding load.',
      });
    }
    for (const plateau of plateaus) {
      items.push({
        key: plateau.key,
        severity: plateau.severity,
        title: `${this.titleCase(plateau.domain)} needs review`,
        message: plateau.message,
        action: plateau.evidence,
      });
    }
    const recentPain = executions
      .slice(-7)
      .flatMap((execution) => execution.feedback.blockers ?? [])
      .filter((item) => /pain|injur|ache|knee|shoulder|back|joint/i.test(item));
    if (recentPain.length >= 2) {
      items.push({
        key: 'repeated-pain-blocker',
        severity: 'attention',
        title: 'Repeated pain signal',
        message: `Pain/injury-related blockers were recorded ${recentPain.length} times in the recent execution window.`,
        action:
          'Avoid automatic load progression for the affected movement and consider physio/clinician review if symptoms persist or worsen.',
      });
    }
    const photoFlags = photos.flatMap(
      (photo) => photo.analysis?.safetyFlags ?? [],
    );
    if (photoFlags.length) {
      items.push({
        key: 'photo-safety-review',
        severity: 'attention',
        title: 'Photo review flag',
        message: photoFlags[0],
        action:
          'Treat this as a review prompt, not a diagnosis; use an appropriate clinician/dermatologist when warranted.',
      });
    }
    const reportFlags = reports.flatMap(
      (report) => report.analysis?.safetyFlags ?? [],
    );
    if (reportFlags.length) {
      items.push({
        key: 'report-safety-review',
        severity: 'attention',
        title: 'Report review flag',
        message: reportFlags[0],
        action:
          'Follow documented professional guidance and review clinically significant findings with the relevant professional.',
      });
    }
    return this.uniqueBy(items, (item) => item.key).slice(0, 12);
  }

  private buildMemory(
    executions: Execution[],
    ownerUpdates: Array<HealthOwnerUpdate & { _id: unknown }>,
  ) {
    const whatWorked = executions.flatMap(
      (execution) => execution.feedback.whatWorked ?? [],
    );
    const blockers = executions.flatMap(
      (execution) => execution.feedback.blockers ?? [],
    );
    const requestedChanges = executions.flatMap(
      (execution) => execution.feedback.requestedChanges ?? [],
    );
    const updates = ownerUpdates.map(
      (item) => `${item.domain}: ${item.update}`,
    );
    return {
      successfulPatterns: this.frequentStrings(whatWorked, 8),
      failedPatterns: this.frequentStrings(blockers, 8),
      avoidOrReview: this.frequentStrings(
        [...requestedChanges, ...updates],
        12,
      ),
    };
  }

  private goalMetricKey(text: string): TrendMetricKey | null {
    const mappings: Array<[RegExp, TrendMetricKey]> = [
      [/weight|body mass/, 'weightKg'],
      [/sleep performance/, 'sleepPerformancePercentage'],
      [/sleep debt/, 'sleepDebtMinutes'],
      [/sleep|hours asleep/, 'sleepHours'],
      [/recovery/, 'recoveryScore'],
      [/hrv|heart rate variability/, 'heartRateVariabilityMs'],
      [/resting heart|\brhr\b/, 'restingHeartRateBpm'],
      [/steps|walking/, 'steps'],
      [/strain/, 'strainScore'],
      [/spo2|oxygen/, 'bloodOxygenPercentage'],
    ];
    return mappings.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  }

  private resolveGoalTargetDate(goal: HealthGoal): string | null {
    if (goal.targetDate) return this.dateKey(goal.targetDate);
    if (goal.relativeMonths) {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() + goal.relativeMonths);
      return this.dateKey(date);
    }
    return null;
  }

  private goalStatus(
    progress: number | null,
    expected: number | null,
    target: number | null,
    current: number | null,
    targetDate: string | null,
  ): GoalTrajectoryStatus {
    if (target == null || current == null) return 'insufficient_data';
    if (progress != null && progress >= 100) return 'on_track';
    if (!targetDate || expected == null || progress == null) return 'ongoing';
    if (progress >= expected - 8) return 'on_track';
    if (progress >= expected - 20) return 'slightly_behind';
    return 'off_track';
  }

  private progressBetween(
    start: number | null,
    current: number | null,
    target: number | null,
  ) {
    if (start == null || current == null || target == null || start === target)
      return null;
    const progress = ((current - start) / (target - start)) * 100;
    return Math.max(0, Math.min(120, progress));
  }

  private expectedProgress(startDateKey: string, targetDateKey: string) {
    const start = new Date(`${startDateKey}T12:00:00+05:30`).getTime();
    const target = new Date(`${targetDateKey}T12:00:00+05:30`).getTime();
    const now = Date.now();
    if (target <= start) return 100;
    return Math.max(0, Math.min(100, ((now - start) / (target - start)) * 100));
  }

  private consecutiveDirection(points: TrendPoint[], direction: 'up' | 'down') {
    if (points.length < 2) return 0;
    let count = 1;
    for (let index = points.length - 1; index > 0; index -= 1) {
      const moved =
        direction === 'down'
          ? points[index].value < points[index - 1].value
          : points[index].value > points[index - 1].value;
      if (!moved) break;
      count += 1;
    }
    return count;
  }

  private frequentStrings(values: string[], limit: number) {
    const counts = new Map<string, { text: string; count: number }>();
    for (const value of values.map((item) => item.trim()).filter(Boolean)) {
      const key = value.toLowerCase().replace(/\s+/g, ' ');
      const current = counts.get(key);
      counts.set(key, {
        text: current?.text ?? value,
        count: (current?.count ?? 0) + 1,
      });
    }
    return [...counts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((item) =>
        item.count > 1 ? `${item.text} (${item.count}×)` : item.text,
      );
  }

  private headline(
    status: string,
    cards: IntelligenceCard[],
    goals: GoalTrajectory[],
  ) {
    const goal = goals.find((item) => item.status === 'off_track') ?? goals[0];
    const card =
      cards.find((item) => item.severity === 'attention') ?? cards[0];
    if (card) return card.message;
    if (goal) return `${goal.title}: ${this.goalStatusLabel(goal.status)}.`;
    return status === 'good'
      ? 'Available Health signals are stable; keep executing the rolling plan.'
      : 'HSAKAA is watching the available Health signals and will adapt the rolling plan as evidence accumulates.';
  }

  private goalStatusLabel(status: GoalTrajectoryStatus) {
    return status.replaceAll('_', ' ');
  }

  private progressionRank(value: TrainingProgression['recommendation']) {
    return value === 'review'
      ? 0
      : value === 'reduce'
        ? 1
        : value === 'progress'
          ? 2
          : 3;
  }

  private parseNumber(value: string | undefined | null) {
    if (!value) return null;
    const match = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  private numeric(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private average(values: number[]) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  private roundNullable(value: number | null) {
    return value == null ? null : Number(value.toFixed(1));
  }

  private dateKey(value: Date | string) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value));
  }

  private titleCase(value: string) {
    return value.replace(
      /(^|\s|_)(\w)/g,
      (_, prefix: string, letter: string) =>
        `${prefix === '_' ? ' ' : prefix}${letter.toUpperCase()}`,
    );
  }

  private uniqueBy<T>(items: T[], key: (item: T) => string) {
    const seen = new Set<string>();
    return items.filter((item) => {
      const value = key(item);
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }
}
