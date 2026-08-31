import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model } from 'mongoose';

import {
  HealthDataSource,
  HealthEntry,
  HealthEntryDocument,
  WorkoutIntensity,
  WorkoutType,
} from '../schemas/health-entry.schema';

interface WhoopCollectionResponse<T> {
  records: T[];
  next_token?: string;
}

interface WhoopCycle {
  id: number;
  user_id: number;

  created_at: string;
  updated_at: string;

  start: string;
  end?: string;

  timezone_offset: string;

  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

  score?: {
    strain?: number;

    kilojoule?: number;

    average_heart_rate?: number;

    max_heart_rate?: number;
  };
}

interface WhoopRecovery {
  cycle_id: number;

  sleep_id: string;

  user_id: number;

  created_at: string;
  updated_at: string;

  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

  score?: {
    user_calibrating?: boolean;

    recovery_score?: number;

    resting_heart_rate?: number;

    hrv_rmssd_milli?: number;

    spo2_percentage?: number;

    skin_temp_celsius?: number;
  };
}

interface WhoopSleep {
  id: string;

  cycle_id: number;

  user_id: number;

  created_at: string;
  updated_at: string;

  start: string;
  end: string;

  timezone_offset: string;

  nap: boolean;

  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;

      total_awake_time_milli?: number;

      total_no_data_time_milli?: number;

      total_light_sleep_time_milli?: number;

      total_slow_wave_sleep_time_milli?: number;

      total_rem_sleep_time_milli?: number;

      sleep_cycle_count?: number;

      disturbance_count?: number;
    };

    sleep_needed?: {
      baseline_milli?: number;

      need_from_sleep_debt_milli?: number;

      need_from_recent_strain_milli?: number;

      need_from_recent_nap_milli?: number;
    };

    respiratory_rate?: number;

    sleep_performance_percentage?: number;

    sleep_consistency_percentage?: number;

    sleep_efficiency_percentage?: number;
  };
}

interface WhoopWorkout {
  id: string;

  user_id: number;

  created_at: string;
  updated_at: string;

  start: string;
  end: string;

  timezone_offset: string;

  sport_name?: string;

  sport_id?: number;

  score_state: 'SCORED' | 'PENDING_SCORE' | 'UNSCORABLE';

  score?: {
    strain?: number;

    average_heart_rate?: number;

    max_heart_rate?: number;

    kilojoule?: number;

    percent_recorded?: number;

    distance_meter?: number;

    altitude_gain_meter?: number;

    altitude_change_meter?: number;

    zone_durations?: Record<string, number>;
  };
}

@Injectable()
export class WhoopHealthService {
  private readonly whoopBaseUrl = 'https://api.prod.whoop.com/developer/v2';

  constructor(
    @InjectModel(HealthEntry.name)
    private readonly healthEntryModel: Model<HealthEntryDocument>,
  ) {}

  async sync(
    accessToken: string,
    options?: {
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (!accessToken?.trim()) {
      throw new UnauthorizedException('WHOOP access token is required.');
    }

    const start = options?.startDate
      ? this.toWhoopStartDate(options.startDate)
      : undefined;

    const end = options?.endDate
      ? this.toWhoopEndDate(options.endDate)
      : undefined;

    const [cycles, recoveries, sleeps, workouts] = await Promise.all([
      this.fetchAll<WhoopCycle>('/cycle', accessToken, start, end),

      this.fetchAll<WhoopRecovery>('/recovery', accessToken, start, end),

      this.fetchAll<WhoopSleep>('/activity/sleep', accessToken, start, end),

      this.fetchAll<WhoopWorkout>('/activity/workout', accessToken, start, end),
    ]);

    const sleepsByCycle = new Map<number, WhoopSleep[]>();

    for (const sleep of sleeps) {
      const existing = sleepsByCycle.get(sleep.cycle_id) ?? [];

      existing.push(sleep);

      sleepsByCycle.set(sleep.cycle_id, existing);
    }

    const recoveryByCycle = new Map(
      recoveries.map((recovery) => [recovery.cycle_id, recovery]),
    );

    let dailyEntriesUpdated = 0;

    for (const cycle of cycles) {
      const dateKey = this.getDateKey(cycle.start);

      const recovery = recoveryByCycle.get(cycle.id);

      const cycleSleeps = sleepsByCycle.get(cycle.id) ?? [];

      const mainSleep = cycleSleeps.find((sleep) => sleep.nap === false);

      const naps = cycleSleeps.filter((sleep) => sleep.nap === true);

      const setData: Record<string, unknown> = {};

      if (cycle.score_state === 'SCORED' && cycle.score) {
        if (cycle.score.strain !== undefined) {
          setData.strainScore = cycle.score.strain;
        }

        if (cycle.score.kilojoule !== undefined) {
          setData.totalCaloriesBurned = this.kilojouleToCalories(
            cycle.score.kilojoule,
          );
        }
      }

      if (recovery?.score_state === 'SCORED' && recovery.score) {
        setData.recovery = {
          recoveryScore: recovery.score.recovery_score,

          restingHeartRateBpm: recovery.score.resting_heart_rate,

          heartRateVariabilityMs: recovery.score.hrv_rmssd_milli,

          bloodOxygenPercentage: recovery.score.spo2_percentage,

          skinTemperatureCelsius: recovery.score.skin_temp_celsius,

          respiratoryRateBreathsPerMinute: mainSleep?.score?.respiratory_rate,
        };
      }

      if (mainSleep?.score_state === 'SCORED') {
        setData.sleep = this.mapSleep(mainSleep, naps);
      }

      setData['wearableData.whoop.cycle'] = cycle;

      if (recovery) {
        setData['wearableData.whoop.recovery'] = recovery;
      }

      if (mainSleep) {
        setData['wearableData.whoop.sleep'] = mainSleep;
      }

      if (naps.length > 0) {
        setData['wearableData.whoop.naps'] = naps;
      }

      await this.healthEntryModel.findOneAndUpdate(
        {
          dateKey,
        },
        {
          $set: setData,

          $setOnInsert: {
            date: this.getHealthDate(dateKey),

            dateKey,

            slug: `health-${dateKey}`,

            workouts: [],

            habits: [],

            painEntries: [],

            symptoms: [],

            achievements: [],

            goals: [],

            memoryIds: [],

            isArchived: false,

            isActive: true,
          },

          $addToSet: {
            sources: HealthDataSource.WHOOP,
          },
        },
        {
          upsert: true,
          new: true,

          setDefaultsOnInsert: true,
        },
      );

      dailyEntriesUpdated++;
    }

    let workoutsCreated = 0;

    let workoutsUpdated = 0;

    for (const workout of workouts) {
      const result = await this.syncWorkout(workout);

      if (result === 'created') {
        workoutsCreated++;
      } else if (result === 'updated') {
        workoutsUpdated++;
      }
    }

    return {
      message: 'WHOOP health synchronization completed.',

      data: {
        cycles: cycles.length,

        recoveries: recoveries.length,

        sleeps: sleeps.length,

        workouts: workouts.length,

        dailyEntriesUpdated,

        workoutsCreated,

        workoutsUpdated,
      },
    };
  }

  private async syncWorkout(
    workout: WhoopWorkout,
  ): Promise<'created' | 'updated'> {
    const dateKey = this.getDateKey(workout.start);

    const entry = await this.healthEntryModel.findOneAndUpdate(
      {
        dateKey,
      },
      {
        $setOnInsert: {
          date: this.getHealthDate(dateKey),

          dateKey,

          slug: `health-${dateKey}`,

          workouts: [],

          habits: [],

          painEntries: [],

          symptoms: [],

          achievements: [],

          goals: [],

          wearableData: {},

          memoryIds: [],

          isArchived: false,

          isActive: true,
        },

        $addToSet: {
          sources: HealthDataSource.WHOOP,
        },
      },
      {
        upsert: true,
        new: true,

        setDefaultsOnInsert: true,
      },
    );

    if (!entry) {
      throw new BadRequestException(
        'Unable to create health entry for WHOOP workout.',
      );
    }

    const existingIndex = entry.workouts.findIndex(
      (existing) =>
        existing.source === HealthDataSource.WHOOP &&
        existing.externalId === workout.id,
    );

    const mapped = this.mapWorkout(workout);

    if (existingIndex >= 0) {
      entry.workouts[existingIndex] = mapped;

      entry.markModified('workouts');

      await entry.save();

      return 'updated';
    }

    entry.workouts.push(mapped);

    entry.markModified('workouts');

    await entry.save();

    return 'created';
  }

  private mapWorkout(workout: WhoopWorkout) {
    const durationMinutes = this.durationMinutes(workout.start, workout.end);

    const score = workout.score;

    const type = this.mapWorkoutType(workout.sport_name);

    const intensity = this.getWorkoutIntensity(score?.strain);

    return {
      type,

      title: workout.sport_name ?? 'WHOOP Workout',

      intensity,

      source: HealthDataSource.WHOOP,

      externalId: workout.id,

      durationMinutes,

      caloriesBurned:
        score?.kilojoule !== undefined
          ? this.kilojouleToCalories(score.kilojoule)
          : undefined,

      averageHeartRateBpm: score?.average_heart_rate,

      maximumHeartRateBpm: score?.max_heart_rate,

      strainScore: score?.strain,

      exercises: [],

      cardio: {
        distanceKm:
          score?.distance_meter !== undefined
            ? Number((score.distance_meter / 1000).toFixed(3))
            : undefined,

        durationMinutes,

        averageHeartRateBpm: score?.average_heart_rate,

        maximumHeartRateBpm: score?.max_heart_rate,

        caloriesBurned:
          score?.kilojoule !== undefined
            ? this.kilojouleToCalories(score.kilojoule)
            : undefined,

        elevationGainMetres: score?.altitude_gain_meter,
      },

      completed: true,

      startedAt: new Date(workout.start),

      completedAt: new Date(workout.end),

      notes: undefined,
    };
  }

  private mapSleep(sleep: WhoopSleep, naps: WhoopSleep[]) {
    const stage = sleep.score?.stage_summary;

    const needed = sleep.score?.sleep_needed;

    const lightSleepMinutes = this.millisecondsToMinutes(
      stage?.total_light_sleep_time_milli,
    );

    const deepSleepMinutes = this.millisecondsToMinutes(
      stage?.total_slow_wave_sleep_time_milli,
    );

    const remSleepMinutes = this.millisecondsToMinutes(
      stage?.total_rem_sleep_time_milli,
    );

    const awakeMinutes = this.millisecondsToMinutes(
      stage?.total_awake_time_milli,
    );

    const durationMinutes =
      lightSleepMinutes + deepSleepMinutes + remSleepMinutes;

    const timeInBedMinutes = this.millisecondsToMinutes(
      stage?.total_in_bed_time_milli,
    );

    const napMinutes = naps.reduce((total, nap) => {
      const napStage = nap.score?.stage_summary;

      return (
        total +
        this.millisecondsToMinutes(napStage?.total_light_sleep_time_milli) +
        this.millisecondsToMinutes(napStage?.total_slow_wave_sleep_time_milli) +
        this.millisecondsToMinutes(napStage?.total_rem_sleep_time_milli)
      );
    }, 0);

    const sleepNeedMinutes =
      this.millisecondsToMinutes(needed?.baseline_milli) +
      this.millisecondsToMinutes(needed?.need_from_sleep_debt_milli) +
      this.millisecondsToMinutes(needed?.need_from_recent_strain_milli) +
      this.millisecondsToMinutes(needed?.need_from_recent_nap_milli);

    return {
      sleepAt: new Date(sleep.start),

      wakeAt: new Date(sleep.end),

      durationHours: Number((durationMinutes / 60).toFixed(2)),

      timeInBedHours: Number((timeInBedMinutes / 60).toFixed(2)),

      lightSleepMinutes,

      deepSleepMinutes,

      remSleepMinutes,

      awakeMinutes,

      disturbances: stage?.disturbance_count,

      sleepNeedMinutes,

      sleepDebtMinutes: this.millisecondsToMinutes(
        needed?.need_from_sleep_debt_milli,
      ),

      sleepPerformancePercentage: sleep.score?.sleep_performance_percentage,

      sleepEfficiencyPercentage: sleep.score?.sleep_efficiency_percentage,

      sleepConsistencyPercentage: sleep.score?.sleep_consistency_percentage,

      napTaken: naps.length > 0,

      napMinutes,
    };
  }

  private async fetchAll<T>(
    endpoint: string,
    accessToken: string,
    start?: string,
    end?: string,
  ): Promise<T[]> {
    const records: T[] = [];

    let nextToken: string | undefined;

    do {
      const params = new URLSearchParams();

      params.set('limit', '25');

      if (start) {
        params.set('start', start);
      }

      if (end) {
        params.set('end', end);
      }

      if (nextToken) {
        params.set('nextToken', nextToken);
      }

      const response = await fetch(
        `${this.whoopBaseUrl}${endpoint}?${params.toString()}`,
        {
          method: 'GET',

          headers: {
            Authorization: `Bearer ${accessToken}`,

            Accept: 'application/json',
          },
        },
      );

      if (response.status === 401) {
        throw new UnauthorizedException(
          'WHOOP access token is invalid or expired.',
        );
      }

      if (response.status === 429) {
        throw new BadRequestException('WHOOP rate limit exceeded.');
      }

      if (!response.ok) {
        const body = await response.text();

        throw new BadRequestException(
          `WHOOP request failed: ${response.status} ${body}`,
        );
      }

      const result = (await response.json()) as WhoopCollectionResponse<T>;

      records.push(...(result.records ?? []));

      nextToken = result.next_token;
    } while (nextToken);

    return records;
  }

  private mapWorkoutType(sportName?: string): WorkoutType {
    const value = sportName?.trim().toLowerCase() ?? '';

    if (value.includes('run')) {
      return WorkoutType.RUN;
    }

    if (value.includes('walk')) {
      return WorkoutType.WALK;
    }

    if (value.includes('cycl') || value.includes('bike')) {
      return WorkoutType.CYCLING;
    }

    if (value.includes('swim')) {
      return WorkoutType.SWIMMING;
    }

    if (value.includes('yoga')) {
      return WorkoutType.YOGA;
    }

    if (value.includes('mobility') || value.includes('stretch')) {
      return WorkoutType.MOBILITY;
    }

    if (
      value.includes('strength') ||
      value.includes('weight') ||
      value.includes('functional')
    ) {
      return WorkoutType.FULL_BODY;
    }

    return WorkoutType.OTHER;
  }

  private getWorkoutIntensity(strain?: number): WorkoutIntensity {
    if (strain === undefined) {
      return WorkoutIntensity.MODERATE;
    }

    if (strain < 8) {
      return WorkoutIntensity.LOW;
    }

    if (strain < 14) {
      return WorkoutIntensity.MODERATE;
    }

    return WorkoutIntensity.HIGH;
  }

  private kilojouleToCalories(kilojoule: number) {
    return Number((kilojoule / 4.184).toFixed(2));
  }

  private millisecondsToMinutes(value?: number) {
    if (value === undefined || value === null) {
      return 0;
    }

    return Number((value / 60000).toFixed(2));
  }

  private durationMinutes(start: string, end: string) {
    const startDate = new Date(start);

    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return undefined;
    }

    return Number(
      ((endDate.getTime() - startDate.getTime()) / 60000).toFixed(2),
    );
  }

  private getDateKey(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid WHOOP date.');
    }

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  private getHealthDate(dateKey: string) {
    return new Date(`${dateKey}T00:00:00.000+05:30`);
  }

  private toWhoopStartDate(date: string) {
    return new Date(`${date}T00:00:00.000+05:30`).toISOString();
  }

  private toWhoopEndDate(date: string) {
    return new Date(`${date}T23:59:59.999+05:30`).toISOString();
  }
}
