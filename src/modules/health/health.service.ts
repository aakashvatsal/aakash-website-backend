import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, QueryFilter, Types } from 'mongoose';

import { AddPainEntryDto } from './dto/add-pain-entry.dto';

import { AddWorkoutDto } from './dto/add-workout.dto';

import {
  CreateHealthEntryDto,
  SleepDataDto,
  WorkoutDataDto,
} from './dto/create-health-entry.dto';

import { HealthQueryDto } from './dto/health-query.dto';

import { UpdateHealthEntryDto } from './dto/update-health-entry.dto';

import { UpdateHealthHabitsDto } from './dto/update-health-habits.dto';

import { UpdatePainEntryDto } from './dto/update-pain-entry.dto';

import { UpdateWorkoutDto } from './dto/update-workout.dto';

import {
  HealthDataSource,
  HealthEntry,
  HealthEntryDocument,
  PainSeverity,
  WorkoutData,
} from './schemas/health-entry.schema';

@Injectable()
export class HealthService {
  constructor(
    @InjectModel(HealthEntry.name)
    private readonly healthEntryModel: Model<HealthEntryDocument>,
  ) {}

  async create(dto: CreateHealthEntryDto) {
    const dateKey = this.getDateKey(dto.date);

    const existing = await this.healthEntryModel.exists({
      dateKey,
    });

    if (existing) {
      throw new ConflictException(
        `Health entry already exists for ${dateKey}.`,
      );
    }

    const date = this.getHealthDate(dateKey);

    const slug = this.getHealthSlug(dateKey);

    const entry = await this.healthEntryModel.create({
      ...dto,

      date,
      dateKey,
      slug,

      sleep: this.prepareSleep(dto.sleep),

      workouts: this.prepareWorkouts(dto.workouts ?? []),

      habits: dto.habits ?? [],

      painEntries:
        dto.painEntries?.map((pain) => this.preparePainEntry(pain)) ?? [],

      sources: dto.sources?.length ? dto.sources : [HealthDataSource.MANUAL],

      symptoms: dto.symptoms ?? [],

      achievements: dto.achievements ?? [],

      goals: dto.goals ?? [],

      wearableData: dto.wearableData ?? {},

      memoryIds: dto.memoryIds?.map((id) => new Types.ObjectId(id)) ?? [],
    });

    return entry;
  }

  async findAll(query: HealthQueryDto) {
    const page = Math.max(query.page ?? 1, 1);

    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const filter: QueryFilter<HealthEntryDocument> = {
      isActive: true,
    };

    if (query.startDate || query.endDate) {
      const dateKeyFilter: {
        $gte?: string;
        $lte?: string;
      } = {};

      if (query.startDate) {
        dateKeyFilter.$gte = this.getDateKey(query.startDate);
      }

      if (query.endDate) {
        dateKeyFilter.$lte = this.getDateKey(query.endDate);
      }

      filter.dateKey = dateKeyFilter;
    }

    if (query.workoutType) {
      filter['workouts.type'] = query.workoutType;
    }

    if (query.mood) {
      filter.mood = query.mood;
    }

    if (query.hasPain === true) {
      filter['painEntries.0'] = {
        $exists: true,
      };
    }

    if (query.hasPain === false) {
      filter['painEntries.0'] = {
        $exists: false,
      };
    }

    if (query.workoutCompleted !== undefined) {
      filter['workouts.completed'] = query.workoutCompleted;
    }

    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.healthEntryModel
        .find(filter)
        .sort({
          date: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.healthEntryModel.countDocuments(filter),
    ]);

    return {
      data,

      pagination: {
        page,
        limit,
        total,

        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(healthEntryId: string) {
    return this.getEntry(healthEntryId, true);
  }

  async findLatestForPublic() {
    const entry = await this.healthEntryModel
      .findOne({
        isActive: true,
        isArchived: false,
      })
      .sort({
        date: -1,
        _id: -1,
      })
      .lean();

    if (!entry) {
      throw new NotFoundException('Health entry not found.');
    }

    return entry;
  }

  async findByDate(dateValue: string) {
    const dateKey = this.getDateKey(dateValue);

    const entry = await this.healthEntryModel
      .findOne({
        dateKey,
        isActive: true,
      })
      .lean();

    if (!entry) {
      throw new NotFoundException(`Health entry not found for ${dateKey}.`);
    }

    return entry;
  }

  async update(healthEntryId: string, dto: UpdateHealthEntryDto) {
    const entry = await this.getEntry(healthEntryId);

    const updateData: Record<string, unknown> = {
      ...dto,
    };

    if (dto.date !== undefined) {
      const dateKey = this.getDateKey(dto.date);

      const duplicate = await this.healthEntryModel.exists({
        _id: {
          $ne: entry._id,
        },

        dateKey,
      });

      if (duplicate) {
        throw new ConflictException(
          `Health entry already exists for ${dateKey}.`,
        );
      }

      updateData.date = this.getHealthDate(dateKey);

      updateData.dateKey = dateKey;

      updateData.slug = this.getHealthSlug(dateKey);
    }

    if (dto.sleep !== undefined) {
      updateData.sleep = this.prepareSleep(dto.sleep);
    }

    if (dto.workouts !== undefined) {
      updateData.workouts = this.prepareWorkouts(dto.workouts);
    }

    if (dto.painEntries !== undefined) {
      updateData.painEntries = dto.painEntries.map((pain) =>
        this.preparePainEntry(pain),
      );
    }

    if (dto.memoryIds !== undefined) {
      updateData.memoryIds = dto.memoryIds.map((id) => new Types.ObjectId(id));
    }

    const updated = await this.healthEntryModel
      .findByIdAndUpdate(
        entry._id,
        {
          $set: updateData,
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .lean();

    return updated;
  }

  async addWorkout(healthEntryId: string, dto: AddWorkoutDto) {
    const entry = await this.getEntry(healthEntryId);

    entry.workouts.push(this.prepareWorkout(dto) as WorkoutData);

    entry.markModified('workouts');

    await entry.save();

    return entry;
  }

  async updateWorkout(
    healthEntryId: string,
    workoutIndex: number,
    dto: UpdateWorkoutDto,
  ) {
    const entry = await this.getEntry(healthEntryId);

    this.validateArrayIndex(workoutIndex, entry.workouts, 'workout');

    const workout = entry.workouts[workoutIndex];

    if (dto.type !== undefined) {
      workout.type = dto.type;
    }

    if (dto.title !== undefined) {
      workout.title = dto.title;
    }

    if (dto.intensity !== undefined) {
      workout.intensity = dto.intensity;
    }

    if (dto.source !== undefined) {
      workout.source = dto.source;
    }

    if (dto.externalId !== undefined) {
      workout.externalId = dto.externalId;
    }

    if (dto.durationMinutes !== undefined) {
      workout.durationMinutes = dto.durationMinutes;
    }

    if (dto.caloriesBurned !== undefined) {
      workout.caloriesBurned = dto.caloriesBurned;
    }

    if (dto.averageHeartRateBpm !== undefined) {
      workout.averageHeartRateBpm = dto.averageHeartRateBpm;
    }

    if (dto.maximumHeartRateBpm !== undefined) {
      workout.maximumHeartRateBpm = dto.maximumHeartRateBpm;
    }

    if (dto.strainScore !== undefined) {
      workout.strainScore = dto.strainScore;
    }

    if (dto.perceivedExertion !== undefined) {
      workout.perceivedExertion = dto.perceivedExertion;
    }

    if (dto.exercises !== undefined) {
      workout.exercises = (dto.exercises ?? []).map((exercise) => ({
        ...exercise,

        sets: exercise.sets ?? [],
      }));
    }

    if (dto.cardio !== undefined) {
      workout.cardio = dto.cardio;
    }

    if (dto.notes !== undefined) {
      workout.notes = dto.notes;
    }

    if (dto.startedAt !== undefined) {
      workout.startedAt = dto.startedAt
        ? this.parseDate(dto.startedAt, 'startedAt')
        : undefined;
    }

    if (dto.completedAt !== undefined) {
      workout.completedAt = dto.completedAt
        ? this.parseDate(dto.completedAt, 'completedAt')
        : undefined;
    }

    if (dto.completed !== undefined) {
      workout.completed = dto.completed;

      if (dto.completed && !workout.completedAt) {
        workout.completedAt = new Date();
      }

      if (!dto.completed) {
        workout.completedAt = undefined;
      }
    }

    entry.markModified('workouts');

    await entry.save();

    return entry;
  }

  async completeWorkout(healthEntryId: string, workoutIndex: number) {
    const entry = await this.getEntry(healthEntryId);

    this.validateArrayIndex(workoutIndex, entry.workouts, 'workout');

    const workout = entry.workouts[workoutIndex];

    workout.completed = true;

    workout.completedAt = new Date();

    if (!workout.startedAt) {
      workout.startedAt = new Date();
    }

    for (const exercise of workout.exercises ?? []) {
      for (const set of exercise.sets ?? []) {
        if (set.completed === undefined) {
          set.completed = true;
        }
      }
    }

    entry.markModified('workouts');

    await entry.save();

    return entry;
  }

  async removeWorkout(healthEntryId: string, workoutIndex: number) {
    const entry = await this.getEntry(healthEntryId);

    this.validateArrayIndex(workoutIndex, entry.workouts, 'workout');

    entry.workouts.splice(workoutIndex, 1);

    entry.markModified('workouts');

    await entry.save();

    return entry;
  }

  async addPainEntry(healthEntryId: string, dto: AddPainEntryDto) {
    const entry = await this.getEntry(healthEntryId);

    entry.painEntries.push({
      bodyPart: dto.bodyPart,

      severity: dto.severity ?? PainSeverity.MILD,

      painScore: dto.painScore ?? 0,

      description: dto.description,

      trigger: dto.trigger,

      treatment: dto.treatment,

      startedAt: dto.startedAt
        ? this.parseDate(dto.startedAt, 'startedAt')
        : undefined,

      resolvedAt: dto.resolvedAt
        ? this.parseDate(dto.resolvedAt, 'resolvedAt')
        : undefined,

      resolved: dto.resolved ?? false,
    });

    entry.markModified('painEntries');

    await entry.save();

    return entry;
  }

  async updatePainEntry(
    healthEntryId: string,
    painIndex: number,
    dto: UpdatePainEntryDto,
  ) {
    const entry = await this.getEntry(healthEntryId);

    this.validateArrayIndex(painIndex, entry.painEntries, 'pain entry');

    const painEntry = entry.painEntries[painIndex];

    if (dto.bodyPart !== undefined) {
      painEntry.bodyPart = dto.bodyPart;
    }

    if (dto.severity !== undefined) {
      painEntry.severity = dto.severity;
    }

    if (dto.painScore !== undefined) {
      painEntry.painScore = dto.painScore;
    }

    if (dto.description !== undefined) {
      painEntry.description = dto.description;
    }

    if (dto.trigger !== undefined) {
      painEntry.trigger = dto.trigger;
    }

    if (dto.treatment !== undefined) {
      painEntry.treatment = dto.treatment;
    }

    if (dto.startedAt !== undefined) {
      painEntry.startedAt = dto.startedAt
        ? this.parseDate(dto.startedAt, 'startedAt')
        : undefined;
    }

    if (dto.resolvedAt !== undefined) {
      painEntry.resolvedAt = dto.resolvedAt
        ? this.parseDate(dto.resolvedAt, 'resolvedAt')
        : undefined;
    }

    if (dto.resolved !== undefined) {
      painEntry.resolved = dto.resolved;

      if (dto.resolved && !painEntry.resolvedAt) {
        painEntry.resolvedAt = new Date();
      }

      if (!dto.resolved) {
        painEntry.resolvedAt = undefined;
      }
    }

    entry.markModified('painEntries');

    await entry.save();

    return entry;
  }

  async resolvePainEntry(healthEntryId: string, painIndex: number) {
    return this.updatePainEntry(healthEntryId, painIndex, {
      resolved: true,
    });
  }

  async removePainEntry(healthEntryId: string, painIndex: number) {
    const entry = await this.getEntry(healthEntryId);

    this.validateArrayIndex(painIndex, entry.painEntries, 'pain entry');

    entry.painEntries.splice(painIndex, 1);

    entry.markModified('painEntries');

    await entry.save();

    return entry;
  }

  async updateHabits(healthEntryId: string, dto: UpdateHealthHabitsDto) {
    const entry = await this.getEntry(healthEntryId);

    const existingHabits = entry.habits ?? [];

    const habitMap = new Map(existingHabits.map((habit) => [habit.key, habit]));

    for (const incomingHabit of dto.habits) {
      const existing = habitMap.get(incomingHabit.key);

      if (existing) {
        existing.label = incomingHabit.label;

        if (incomingHabit.completed !== undefined) {
          existing.completed = incomingHabit.completed;
        }
      } else {
        habitMap.set(incomingHabit.key, {
          key: incomingHabit.key,

          label: incomingHabit.label,

          completed: incomingHabit.completed ?? false,
        });
      }
    }

    entry.habits = Array.from(habitMap.values());

    entry.markModified('habits');

    await entry.save();

    return entry;
  }

  async getSummary(startDate: string, endDate: string) {
    const startDateKey = this.getDateKey(startDate);

    const endDateKey = this.getDateKey(endDate);

    if (startDateKey > endDateKey) {
      throw new BadRequestException('Start date must be before end date.');
    }

    const entries = await this.healthEntryModel
      .find({
        dateKey: {
          $gte: startDateKey,

          $lte: endDateKey,
        },

        isActive: true,

        isArchived: false,
      })
      .sort({
        date: 1,
      })
      .lean();

    const completedWorkouts = entries.reduce(
      (total, entry) =>
        total +
        (entry.workouts ?? []).filter((workout) => workout.completed).length,
      0,
    );

    const plannedWorkouts = entries.reduce(
      (total, entry) => total + (entry.workouts ?? []).length,
      0,
    );

    const unresolvedPainCount = entries.reduce(
      (total, entry) =>
        total +
        (entry.painEntries ?? []).filter((pain) => !pain.resolved).length,
      0,
    );

    return {
      period: {
        startDate: startDateKey,

        endDate: endDateKey,
      },

      entriesCount: entries.length,

      activity: {
        averageSteps: this.average(
          entries.map((entry) => entry.steps).filter(this.isNumber),
        ),

        totalSteps: this.sum(
          entries.map((entry) => entry.steps).filter(this.isNumber),
        ),

        averageActiveMinutes: this.average(
          entries.map((entry) => entry.activeMinutes).filter(this.isNumber),
        ),

        averageStrain: this.average(
          entries.map((entry) => entry.strainScore).filter(this.isNumber),
        ),

        totalCaloriesBurned: this.sum(
          entries
            .map((entry) => entry.totalCaloriesBurned)
            .filter(this.isNumber),
        ),
      },

      sleep: {
        averageDurationHours: this.average(
          entries
            .map((entry) => entry.sleep?.durationHours)
            .filter(this.isNumber),
        ),

        averageSleepScore: this.average(
          entries.map((entry) => entry.sleep?.sleepScore).filter(this.isNumber),
        ),

        averageSleepPerformance: this.average(
          entries
            .map((entry) => entry.sleep?.sleepPerformancePercentage)
            .filter(this.isNumber),
        ),

        averageSleepEfficiency: this.average(
          entries
            .map((entry) => entry.sleep?.sleepEfficiencyPercentage)
            .filter(this.isNumber),
        ),
      },

      recovery: {
        averageRecoveryScore: this.average(
          entries
            .map((entry) => entry.recovery?.recoveryScore)
            .filter(this.isNumber),
        ),

        averageRestingHeartRateBpm: this.average(
          entries
            .map((entry) => entry.recovery?.restingHeartRateBpm)
            .filter(this.isNumber),
        ),

        averageHrvMs: this.average(
          entries
            .map((entry) => entry.recovery?.heartRateVariabilityMs)
            .filter(this.isNumber),
        ),

        averageVo2Max: this.average(
          entries.map((entry) => entry.recovery?.vo2Max).filter(this.isNumber),
        ),
      },

      workouts: {
        planned: plannedWorkouts,

        completed: completedWorkouts,

        completionPercentage:
          plannedWorkouts > 0
            ? Number(((completedWorkouts / plannedWorkouts) * 100).toFixed(2))
            : 0,
      },

      body: {
        startingWeightKg: this.firstNumber(
          entries.map((entry) => entry.bodyMeasurement?.weightKg),
        ),

        latestWeightKg: this.lastNumber(
          entries.map((entry) => entry.bodyMeasurement?.weightKg),
        ),

        startingWaistCm: this.firstNumber(
          entries.map((entry) => entry.bodyMeasurement?.waistCm),
        ),

        latestWaistCm: this.lastNumber(
          entries.map((entry) => entry.bodyMeasurement?.waistCm),
        ),
      },

      wellbeing: {
        averageEnergyScore: this.average(
          entries.map((entry) => entry.energyScore).filter(this.isNumber),
        ),

        averageMotivationScore: this.average(
          entries.map((entry) => entry.motivationScore).filter(this.isNumber),
        ),
      },

      pain: {
        unresolvedCount: unresolvedPainCount,
      },
    };
  }

  async archive(healthEntryId: string) {
    return this.setArchiveStatus(healthEntryId, true);
  }

  async restore(healthEntryId: string) {
    return this.setArchiveStatus(healthEntryId, false);
  }

  async remove(healthEntryId: string) {
    this.validateObjectId(healthEntryId, 'health entry ID');

    const entry = await this.healthEntryModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(healthEntryId),

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
      )
      .lean();

    if (!entry) {
      throw new NotFoundException('Health entry not found.');
    }

    return {
      message: 'Health entry deleted successfully.',
    };
  }

  private async setArchiveStatus(healthEntryId: string, isArchived: boolean) {
    this.validateObjectId(healthEntryId, 'health entry ID');

    const entry = await this.healthEntryModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(healthEntryId),

          isActive: true,
        },
        {
          $set: {
            isArchived,
          },
        },
        {
          new: true,
        },
      )
      .lean();

    if (!entry) {
      throw new NotFoundException('Health entry not found.');
    }

    return entry;
  }

  /**
   * This is intentionally private for now.
   *
   * Later the Whoop sync methods can use this
   * so each provider updates the same canonical
   * daily HealthEntry.
   */
  private async getOrCreateDailyEntry(
    value: string | Date,
    source?: HealthDataSource,
  ) {
    const dateKey = this.getDateKey(value);

    const update: {
      $setOnInsert: Record<string, unknown>;

      $addToSet?: {
        sources: HealthDataSource;
      };
    } = {
      $setOnInsert: {
        date: this.getHealthDate(dateKey),

        dateKey,

        slug: this.getHealthSlug(dateKey),

        workouts: [],

        habits: [],

        painEntries: [],

        symptoms: [],

        achievements: [],

        goals: [],

        sources: [],

        wearableData: {},

        memoryIds: [],

        isArchived: false,

        isActive: true,
      },
    };

    if (source) {
      update.$addToSet = {
        sources: source,
      };
    }

    return this.healthEntryModel.findOneAndUpdate(
      {
        dateKey,
      },
      update,
      {
        upsert: true,
        new: true,

        setDefaultsOnInsert: true,
      },
    );
  }

  private async getEntry(
    healthEntryId: string,
    lean: true,
  ): Promise<Record<string, any>>;

  private async getEntry(
    healthEntryId: string,
    lean?: false,
  ): Promise<HealthEntryDocument>;

  private async getEntry(healthEntryId: string, lean = false) {
    this.validateObjectId(healthEntryId, 'health entry ID');

    const query = this.healthEntryModel.findOne({
      _id: new Types.ObjectId(healthEntryId),

      isActive: true,
    });

    const entry = lean ? await query.lean() : await query.exec();

    if (!entry) {
      throw new NotFoundException('Health entry not found.');
    }

    return entry;
  }

  private prepareSleep(sleep?: SleepDataDto) {
    if (!sleep) {
      return undefined;
    }

    return {
      ...sleep,

      sleepAt: sleep.sleepAt
        ? this.parseDate(sleep.sleepAt, 'sleepAt')
        : undefined,

      wakeAt: sleep.wakeAt ? this.parseDate(sleep.wakeAt, 'wakeAt') : undefined,
    };
  }

  private prepareWorkouts(workouts: Array<WorkoutDataDto | AddWorkoutDto>) {
    return workouts.map((workout) => this.prepareWorkout(workout));
  }

  private prepareWorkout(workout: WorkoutDataDto | AddWorkoutDto) {
    return {
      ...workout,

      source: workout.source ?? HealthDataSource.MANUAL,

      startedAt: workout.startedAt
        ? this.parseDate(workout.startedAt, 'startedAt')
        : undefined,

      completedAt: workout.completedAt
        ? this.parseDate(workout.completedAt, 'completedAt')
        : undefined,

      completed: workout.completed ?? false,

      exercises: (workout.exercises ?? []).map((exercise) => ({
        ...exercise,

        sets: exercise.sets ?? [],
      })),
    };
  }

  private preparePainEntry(pain: {
    bodyPart: string;
    severity?: PainSeverity;
    painScore?: number;
    description?: string;
    trigger?: string;
    treatment?: string;
    startedAt?: string;
    resolvedAt?: string;
    resolved?: boolean;
  }) {
    return {
      ...pain,

      severity: pain.severity ?? PainSeverity.MILD,

      painScore: pain.painScore ?? 0,

      startedAt: pain.startedAt
        ? this.parseDate(pain.startedAt, 'startedAt')
        : undefined,

      resolvedAt: pain.resolvedAt
        ? this.parseDate(pain.resolvedAt, 'resolvedAt')
        : undefined,

      resolved: pain.resolved ?? false,
    };
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }

    return date;
  }

  private getDateKey(value: string | Date): string {
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

      if (match) {
        const [, year, month, day] = match;

        const candidate = `${year}-${month}-${day}`;

        const date = new Date(`${candidate}T00:00:00.000+05:30`);

        if (!Number.isNaN(date.getTime())) {
          return candidate;
        }
      }
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    });

    const parts = formatter.formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new BadRequestException('Invalid date.');
    }

    return `${year}-${month}-${day}`;
  }

  private getHealthDate(dateKey: string): Date {
    const date = new Date(`${dateKey}T00:00:00.000+05:30`);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    return date;
  }

  private getHealthSlug(dateKey: string) {
    return `health-${dateKey}`;
  }

  private validateArrayIndex(
    index: number,
    values: unknown[],
    fieldName: string,
  ) {
    if (!Number.isInteger(index) || index < 0 || !values[index]) {
      throw new BadRequestException(`Invalid ${fieldName} index.`);
    }
  }

  private average(values: number[]) {
    if (!values.length) {
      return null;
    }

    return Number((this.sum(values) / values.length).toFixed(2));
  }

  private sum(values: number[]) {
    return Number(values.reduce((total, value) => total + value, 0).toFixed(2));
  }

  private firstNumber(values: Array<number | undefined>) {
    return values.find(this.isNumber) ?? null;
  }

  private lastNumber(values: Array<number | undefined>) {
    return [...values].reverse().find(this.isNumber) ?? null;
  }

  private isNumber(this: void, value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private validateObjectId(value: string, fieldName: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid ${fieldName}.`);
    }
  }
}
