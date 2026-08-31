import { Injectable, NotFoundException } from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';

import { HealthService } from '../health/health.service';

import { LibraryService } from '../library/library.service';

import { NowService } from '../now/now.service';

import {
  JournalEntry,
  JournalEntryDocument,
  JournalEntryType,
  JournalSource,
} from './schemas/journal-entry.schema';

interface JournalHealthSnapshot {
  steps?: unknown;
  sleep?: {
    durationHours?: unknown;
    sleepPerformancePercentage?: unknown;
  };
  recovery?: {
    recoveryScore?: unknown;
  };
  workouts?: JournalWorkoutSnapshot[];
  energyScore?: unknown;
}

interface JournalWorkoutSnapshot {
  completed?: boolean;
  type?: string;
  title?: string;
  durationMinutes?: unknown;
  strainScore?: unknown;
  completedAt?: string | Date;
  startedAt?: string | Date;
}

interface JournalLibraryReadingSnapshot {
  id?: Types.ObjectId;
  title?: string;
  author?: string;
  progressPercentage?: number;
  lastReadAt?: string | Date;
}

interface JournalLibrarySummarySnapshot {
  currentlyReading?: JournalLibraryReadingSnapshot[];
}

@Injectable()
export class JournalEnrichmentService {
  constructor(
    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,

    private readonly healthService: HealthService,

    private readonly libraryService: LibraryService,

    private readonly nowService: NowService,
  ) {}

  async enrichToday() {
    const now = new Date();

    const dateKey = this.getDateKey(now);

    const journalEntry = await this.findTodayJournalEntry(dateKey);

    const [health, librarySummary, nowStatus] = await Promise.all([
      this.getHealthSafely(dateKey),

      this.getLibrarySafely(),

      this.getNowSafely(),
    ]);

    const enrichedFields: string[] = [];

    /**
     * -------------------------------------------------------
     * HEALTH
     * -------------------------------------------------------
     *
     * Health remains canonical.
     *
     * Journal only receives a snapshot.
     * Existing journal values are not blindly overwritten.
     * -------------------------------------------------------
     */

    if (health) {
      if (
        this.shouldSetNumber(journalEntry.steps) &&
        this.isNumber(health.steps)
      ) {
        journalEntry.steps = health.steps;

        enrichedFields.push('steps');
      }

      if (health.sleep) {
        const existingSleep = journalEntry.sleep ?? {};

        const sleep = {
          ...existingSleep,
        };

        let changed = false;

        if (
          !this.isNumber(sleep.durationHours) &&
          this.isNumber(health.sleep.durationHours)
        ) {
          sleep.durationHours = health.sleep.durationHours;

          changed = true;
        }

        if (
          !this.isNumber(sleep.performancePercentage) &&
          this.isNumber(health.sleep.sleepPerformancePercentage)
        ) {
          sleep.performancePercentage = health.sleep.sleepPerformancePercentage;

          changed = true;
        }

        if (
          !this.isNumber(sleep.recoveryScore) &&
          this.isNumber(health.recovery?.recoveryScore)
        ) {
          sleep.recoveryScore = health.recovery.recoveryScore;

          changed = true;
        }

        if (changed) {
          journalEntry.sleep = sleep;

          journalEntry.markModified('sleep');

          enrichedFields.push('sleep');
        }
      }

      const workout = this.getBestWorkout(health.workouts ?? []);

      if (workout) {
        const existingWorkout = journalEntry.workout ?? {
          completed: false,
        };

        const workoutSnapshot = {
          ...existingWorkout,
        };

        let changed = false;

        if (existingWorkout.completed !== true && workout.completed === true) {
          workoutSnapshot.completed = true;

          changed = true;
        }

        if (!existingWorkout.type && workout.type) {
          workoutSnapshot.type = workout.type;

          changed = true;
        }

        if (!existingWorkout.title && workout.title) {
          workoutSnapshot.title = workout.title;

          changed = true;
        }

        if (
          !this.isNumber(existingWorkout.durationMinutes) &&
          this.isNumber(workout.durationMinutes)
        ) {
          workoutSnapshot.durationMinutes = workout.durationMinutes;

          changed = true;
        }

        if (
          !this.isNumber(existingWorkout.strainScore) &&
          this.isNumber(workout.strainScore)
        ) {
          workoutSnapshot.strainScore = workout.strainScore;

          changed = true;
        }

        if (changed) {
          journalEntry.workout = workoutSnapshot;

          journalEntry.markModified('workout');

          enrichedFields.push('workout');
        }
      }

      if (
        !this.isNumber(journalEntry.energyScore) &&
        this.isNumber(health.energyScore)
      ) {
        journalEntry.energyScore = health.energyScore;

        enrichedFields.push('energyScore');
      }
    }

    /**
     * -------------------------------------------------------
     * LIBRARY
     * -------------------------------------------------------
     *
     * We only consider reading activity whose lastReadAt
     * falls on today's Asia/Kolkata date.
     *
     * We do NOT infer pagesRead.
     * -------------------------------------------------------
     */

    const reading = this.getTodayReading(librarySummary, dateKey);

    if (reading) {
      const existingReading = journalEntry.reading ?? {
        completed: false,
      };

      const readingSnapshot = {
        ...existingReading,
      };

      let changed = false;

      if (existingReading.completed !== true) {
        readingSnapshot.completed = true;

        changed = true;
      }

      if (!existingReading.libraryItemId && reading.id) {
        readingSnapshot.libraryItemId = reading.id;

        changed = true;
      }

      if (!existingReading.title && reading.title) {
        readingSnapshot.title = reading.title;

        changed = true;
      }

      if (!existingReading.author && reading.author) {
        readingSnapshot.author = reading.author;

        changed = true;
      }

      if (
        !this.isNumber(existingReading.progressPercentage) &&
        this.isNumber(reading.progressPercentage)
      ) {
        readingSnapshot.progressPercentage = reading.progressPercentage;

        changed = true;
      }

      /**
       * Do NOT populate pagesRead here.
       *
       * currentPage is cumulative book progress,
       * not today's pages read.
       */

      if (changed) {
        journalEntry.reading = readingSnapshot;

        journalEntry.markModified('reading');

        enrichedFields.push('reading');
      }
    }

    /**
     * -------------------------------------------------------
     * NOW
     * -------------------------------------------------------
     *
     * We don't overwrite journal prose.
     *
     * Current context goes into metadata so HSAKAA
     * can use it later for reflection/generation.
     * -------------------------------------------------------
     */

    if (nowStatus) {
      const existingMetadata = journalEntry.metadata ?? {};

      const existingContext = this.asObject(existingMetadata['nowContext']);

      const nowContext = {
        ...existingContext,

        capturedAt: new Date(),

        activityType: nowStatus.activityType,

        activity: nowStatus.activity,

        headline: nowStatus.headline,

        currentFocus: nowStatus.currentFocus,

        availability: nowStatus.availability,

        mood: nowStatus.mood,

        energyScore: nowStatus.energyScore,

        focusScore: nowStatus.focusScore,

        building: nowStatus.building,

        reading: nowStatus.reading,

        thinking: nowStatus.thinking,

        writing: nowStatus.writing,

        health: nowStatus.health,

        source: nowStatus.source,

        startedAt: nowStatus.startedAt,

        lastActivityAt: nowStatus.lastActivityAt,
      };

      journalEntry.metadata = {
        ...existingMetadata,

        nowContext,
      };

      journalEntry.markModified('metadata');

      enrichedFields.push('nowContext');
    }

    /**
     * -------------------------------------------------------
     * ENRICHMENT METADATA
     * -------------------------------------------------------
     */

    const metadata = journalEntry.metadata ?? {};

    journalEntry.metadata = {
      ...metadata,

      enrichment: {
        enrichedAt: new Date(),

        dateKey,

        sources: {
          health: Boolean(health),

          library: Boolean(reading),

          now: Boolean(nowStatus),
        },

        fields: [...new Set(enrichedFields)],
      },
    };

    journalEntry.markModified('metadata');

    /**
     * We preserve manual source.
     *
     * If this was already MANUAL, it remains MANUAL.
     *
     * Only automatically-created/system entries should
     * carry HSAKAA as their source.
     */
    if (!journalEntry.source) {
      journalEntry.source = JournalSource.HSAKAA;
    }

    await journalEntry.save();

    return {
      message: 'Journal entry enriched successfully.',

      dateKey,

      enrichedFields: [...new Set(enrichedFields)],

      sources: {
        health: Boolean(health),

        library: Boolean(reading),

        now: Boolean(nowStatus),
      },

      data: journalEntry,
    };
  }

  private async findTodayJournalEntry(dateKey: string) {
    /**
     * Prefer today's DAILY entry.
     *
     * There may be multiple journal records on a day,
     * such as ideas/decisions/meeting notes.
     */
    const journalEntry = await this.journalModel.findOne({
      dateKey,

      type: JournalEntryType.DAILY,

      isActive: true,

      isArchived: false,
    });

    if (!journalEntry) {
      throw new NotFoundException(
        `Daily journal entry not found for ${dateKey}.`,
      );
    }

    return journalEntry;
  }

  private async getHealthSafely(
    dateKey: string,
  ): Promise<JournalHealthSnapshot | null> {
    try {
      return await this.healthService.findByDate(dateKey);
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    }
  }

  private async getLibrarySafely(): Promise<JournalLibrarySummarySnapshot | null> {
    try {
      return await this.libraryService.getSummary();
    } catch {
      return null;
    }
  }

  private async getNowSafely() {
    try {
      return await this.nowService.getCurrent();
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      throw error;
    }
  }

  private getBestWorkout(workouts: JournalWorkoutSnapshot[]) {
    if (!workouts.length) {
      return null;
    }

    const completed = workouts.filter((workout) => workout.completed === true);

    const candidates = completed.length ? completed : workouts;

    return [...candidates].sort((first, second) => {
      const firstTime = this.getWorkoutTime(first);

      const secondTime = this.getWorkoutTime(second);

      return secondTime - firstTime;
    })[0];
  }

  private getWorkoutTime(workout: JournalWorkoutSnapshot) {
    const value = workout.completedAt ?? workout.startedAt;

    if (!value) {
      return 0;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  private getTodayReading(
    librarySummary: JournalLibrarySummarySnapshot | null,
    dateKey: string,
  ): JournalLibraryReadingSnapshot | null {
    const currentlyReading = librarySummary?.currentlyReading ?? [];

    const readToday = currentlyReading.filter((item) => {
      if (!item.lastReadAt) {
        return false;
      }

      const lastReadAt = new Date(item.lastReadAt);

      if (Number.isNaN(lastReadAt.getTime())) {
        return false;
      }

      return this.getDateKey(lastReadAt) === dateKey;
    });

    if (!readToday.length) {
      return null;
    }

    return [...readToday].sort((first, second) => {
      const firstTime = first.lastReadAt
        ? new Date(first.lastReadAt).getTime()
        : 0;

      const secondTime = second.lastReadAt
        ? new Date(second.lastReadAt).getTime()
        : 0;

      return secondTime - firstTime;
    })[0];
  }

  private getDateKey(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid date.');
    }

    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',

      year: 'numeric',

      month: '2-digit',

      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;

    const month = parts.find((part) => part.type === 'month')?.value;

    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new Error('Could not generate date key.');
    }

    return `${year}-${month}-${day}`;
  }

  private shouldSetNumber(value: unknown) {
    /**
     * Journal schema defaults steps to 0,
     * therefore zero is treated as "not enriched yet".
     */
    return !this.isNumber(value) || value === 0;
  }

  private isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }
}
