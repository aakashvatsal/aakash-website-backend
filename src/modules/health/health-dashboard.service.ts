import {
    Injectable,
} from '@nestjs/common';

import {
    InjectModel,
} from '@nestjs/mongoose';

import {
    Model,
} from 'mongoose';

import {
    HealthEntry,
    HealthEntryDocument,
} from './schemas/health-entry.schema';

@Injectable()
export class HealthDashboardService {
    constructor(
        @InjectModel(
            HealthEntry.name,
        )
        private readonly healthEntryModel:
            Model<HealthEntryDocument>,
    ) { }

    async getDashboard() {
        const todayKey =
            this.getDateKey(
                new Date(),
            );

        const sevenDaysAgo =
            this.addDays(
                todayKey,
                -6,
            );

        const thirtyDaysAgo =
            this.addDays(
                todayKey,
                -29,
            );

        const [
            today,
            last7Days,
            last30Days,
            latestBodyMeasurement,
        ] =
            await Promise.all([
                this.healthEntryModel
                    .findOne({
                        dateKey:
                            todayKey,

                        isActive:
                            true,

                        isArchived:
                            false,
                    })
                    .lean(),

                this.healthEntryModel
                    .find({
                        dateKey: {
                            $gte:
                                sevenDaysAgo,

                            $lte:
                                todayKey,
                        },

                        isActive:
                            true,

                        isArchived:
                            false,
                    })
                    .sort({
                        dateKey: 1,
                    })
                    .lean(),

                this.healthEntryModel
                    .find({
                        dateKey: {
                            $gte:
                                thirtyDaysAgo,

                            $lte:
                                todayKey,
                        },

                        isActive:
                            true,

                        isArchived:
                            false,
                    })
                    .sort({
                        dateKey: 1,
                    })
                    .lean(),

                this.healthEntryModel
                    .findOne({
                        isActive:
                            true,

                        isArchived:
                            false,

                        bodyMeasurement: {
                            $exists: true,
                        },
                    })
                    .sort({
                        dateKey: -1,
                    })
                    .lean(),
            ]);

        /**
         * Recovery
         */
        const recovery7DayAverage =
            this.average(
                last7Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.recoveryScore,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        const recovery30DayAverage =
            this.average(
                last30Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.recoveryScore,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        /**
         * Sleep
         */
        const sleep7DayAverageHours =
            this.average(
                last7Days
                    .map(
                        (entry) =>
                            entry.sleep
                                ?.durationHours,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        const sleep30DayAverageHours =
            this.average(
                last30Days
                    .map(
                        (entry) =>
                            entry.sleep
                                ?.durationHours,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        /**
         * Strain
         */
        const strain7DayAverage =
            this.average(
                last7Days
                    .map(
                        (entry) =>
                            entry.strainScore,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        const strain30DayAverage =
            this.average(
                last30Days
                    .map(
                        (entry) =>
                            entry.strainScore,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        /**
         * HRV
         */
        const hrv7DayAverage =
            this.average(
                last7Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.heartRateVariabilityMs,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        const hrv30DayAverage =
            this.average(
                last30Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.heartRateVariabilityMs,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        /**
         * Resting HR
         */
        const restingHeartRate7DayAverage =
            this.average(
                last7Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.restingHeartRateBpm,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        const restingHeartRate30DayAverage =
            this.average(
                last30Days
                    .map(
                        (entry) =>
                            entry.recovery
                                ?.restingHeartRateBpm,
                    )
                    .filter(
                        this.isNumber,
                    ),
            );

        return {
            today:
                today
                    ? this.mapToday(
                        today,
                    )
                    : {
                        dateKey:
                            todayKey,

                        recoveryScore:
                            null,

                        strainScore:
                            null,

                        sleepPerformance:
                            null,

                        sleepHours:
                            null,

                        hrvMs:
                            null,

                        restingHeartRateBpm:
                            null,

                        bloodOxygenPercentage:
                            null,

                        respiratoryRate:
                            null,
                    },

            trends: {
                recovery7DayAverage,

                recovery30DayAverage,

                sleep7DayAverageHours,

                sleep30DayAverageHours,

                strain7DayAverage,

                strain30DayAverage,

                hrv7DayAverage,

                hrv30DayAverage,

                restingHeartRate7DayAverage,

                restingHeartRate30DayAverage,

                recoveryChange:
                    this.percentageChange(
                        recovery30DayAverage,
                        recovery7DayAverage,
                    ),

                sleepChange:
                    this.percentageChange(
                        sleep30DayAverageHours,
                        sleep7DayAverageHours,
                    ),

                hrvChange:
                    this.percentageChange(
                        hrv30DayAverage,
                        hrv7DayAverage,
                    ),

                restingHeartRateChange:
                    this.percentageChange(
                        restingHeartRate30DayAverage,
                        restingHeartRate7DayAverage,
                    ),

                strainChange:
                    this.percentageChange(
                        strain30DayAverage,
                        strain7DayAverage,
                    ),
            },

            body: {
                latestWeightKg:
                    latestBodyMeasurement
                        ?.bodyMeasurement
                        ?.weightKg ??
                    null,

                latestBodyFatPercentage:
                    latestBodyMeasurement
                        ?.bodyMeasurement
                        ?.bodyFatPercentage ??
                    null,

                latestWaistCm:
                    latestBodyMeasurement
                        ?.bodyMeasurement
                        ?.waistCm ??
                    null,

                measuredAt:
                    latestBodyMeasurement
                        ?.dateKey ??
                    null,
            },

            workouts: {
                last7Days:
                    this.countWorkouts(
                        last7Days,
                    ),

                last30Days:
                    this.countWorkouts(
                        last30Days,
                    ),

                strainLast7Days:
                    this.averageWorkoutStrain(
                        last7Days,
                    ),

                strainLast30Days:
                    this.averageWorkoutStrain(
                        last30Days,
                    ),
            },

            consistency: {
                trackedDays7:
                    last7Days.length,

                trackedDays30:
                    last30Days.length,
            },
        };
    }

    async getToday() {
        const dateKey =
            this.getDateKey(
                new Date(),
            );

        const entry =
            await this.healthEntryModel
                .findOne({
                    dateKey,

                    isActive:
                        true,

                    isArchived:
                        false,
                })
                .lean();

        if (!entry) {
            return {
                dateKey,

                exists:
                    false,
            };
        }

        return {
            exists:
                true,

            ...this.mapToday(
                entry,
            ),

            sleep:
                entry.sleep ??
                null,

            recovery:
                entry.recovery ??
                null,

            workouts:
                entry.workouts ??
                [],

            habits:
                entry.habits ??
                [],

            painEntries:
                entry.painEntries ??
                [],

            bodyMeasurement:
                entry.bodyMeasurement ??
                null,

            mood:
                entry.mood ??
                null,

            energyScore:
                entry.energyScore ??
                null,

            motivationScore:
                entry.motivationScore ??
                null,

            notes:
                entry.notes ??
                null,

            sources:
                entry.sources ??
                [],
        };
    }

    async getTrends(
        days = 30,
    ) {
        const safeDays =
            Math.min(
                Math.max(
                    Math.floor(
                        days,
                    ),
                    7,
                ),
                365,
            );

        const endDate =
            this.getDateKey(
                new Date(),
            );

        const startDate =
            this.addDays(
                endDate,
                -(safeDays - 1),
            );

        const entries =
            await this.healthEntryModel
                .find({
                    dateKey: {
                        $gte:
                            startDate,

                        $lte:
                            endDate,
                    },

                    isActive:
                        true,

                    isArchived:
                        false,
                })
                .sort({
                    dateKey: 1,
                })
                .lean();

        return {
            period: {
                startDate,
                endDate,
                days:
                    safeDays,
            },

            data:
                entries.map(
                    (
                        entry,
                    ) => ({
                        dateKey:
                            entry.dateKey,

                        recoveryScore:
                            entry.recovery
                                ?.recoveryScore ??
                            null,

                        strainScore:
                            entry.strainScore ??
                            null,

                        sleepHours:
                            entry.sleep
                                ?.durationHours ??
                            null,

                        sleepPerformance:
                            entry.sleep
                                ?.sleepPerformancePercentage ??
                            null,

                        sleepEfficiency:
                            entry.sleep
                                ?.sleepEfficiencyPercentage ??
                            null,

                        hrvMs:
                            entry.recovery
                                ?.heartRateVariabilityMs ??
                            null,

                        restingHeartRateBpm:
                            entry.recovery
                                ?.restingHeartRateBpm ??
                            null,

                        bloodOxygenPercentage:
                            entry.recovery
                                ?.bloodOxygenPercentage ??
                            null,

                        respiratoryRate:
                            entry.recovery
                                ?.respiratoryRateBreathsPerMinute ??
                            null,

                        weightKg:
                            entry.bodyMeasurement
                                ?.weightKg ??
                            null,

                        workouts:
                            entry.workouts
                                ?.length ??
                            0,

                        activeMinutes:
                            entry.activeMinutes ??
                            null,

                        steps:
                            entry.steps ??
                            null,
                    }),
                ),

            averages: {
                recovery:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.recovery
                                        ?.recoveryScore,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),

                strain:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.strainScore,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),

                sleepHours:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.sleep
                                        ?.durationHours,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),

                sleepPerformance:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.sleep
                                        ?.sleepPerformancePercentage,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),

                hrvMs:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.recovery
                                        ?.heartRateVariabilityMs,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),

                restingHeartRateBpm:
                    this.average(
                        entries
                            .map(
                                (
                                    entry,
                                ) =>
                                    entry.recovery
                                        ?.restingHeartRateBpm,
                            )
                            .filter(
                                this.isNumber,
                            ),
                    ),
            },
        };
    }

    async getWorkouts(
        days = 30,
    ) {
        const safeDays =
            Math.min(
                Math.max(
                    Math.floor(
                        days,
                    ),
                    1,
                ),
                365,
            );

        const endDate =
            this.getDateKey(
                new Date(),
            );

        const startDate =
            this.addDays(
                endDate,
                -(safeDays - 1),
            );

        const entries =
            await this.healthEntryModel
                .find({
                    dateKey: {
                        $gte:
                            startDate,

                        $lte:
                            endDate,
                    },

                    isActive:
                        true,

                    isArchived:
                        false,

                    'workouts.0': {
                        $exists:
                            true,
                    },
                })
                .select({
                    dateKey: 1,
                    workouts: 1,
                })
                .sort({
                    dateKey: -1,
                })
                .lean();

        const workouts =
            entries.flatMap(
                (
                    entry,
                ) =>
                    (
                        entry.workouts ??
                        []
                    ).map(
                        (
                            workout,
                        ) => ({
                            dateKey:
                                entry.dateKey,

                            type:
                                workout.type,

                            title:
                                workout.title,

                            source:
                                workout.source,

                            externalId:
                                workout.externalId,

                            intensity:
                                workout.intensity,

                            durationMinutes:
                                workout.durationMinutes,

                            caloriesBurned:
                                workout.caloriesBurned,

                            averageHeartRateBpm:
                                workout.averageHeartRateBpm,

                            maximumHeartRateBpm:
                                workout.maximumHeartRateBpm,

                            strainScore:
                                workout.strainScore,

                            completed:
                                workout.completed,

                            startedAt:
                                workout.startedAt,

                            completedAt:
                                workout.completedAt,

                            cardio:
                                workout.cardio,
                        }),
                    ),
            );

        workouts.sort(
            (
                a,
                b,
            ) => {
                const aTime =
                    a.startedAt
                        ? new Date(
                            a.startedAt,
                        ).getTime()
                        : 0;

                const bTime =
                    b.startedAt
                        ? new Date(
                            b.startedAt,
                        ).getTime()
                        : 0;

                return (
                    bTime -
                    aTime
                );
            },
        );

        return {
            period: {
                startDate,
                endDate,
                days:
                    safeDays,
            },

            total:
                workouts.length,

            data:
                workouts,
        };
    }

    private mapToday(
        entry: any,
    ) {
        return {
            dateKey:
                entry.dateKey,

            recoveryScore:
                entry.recovery
                    ?.recoveryScore ??
                null,

            strainScore:
                entry.strainScore ??
                null,

            sleepPerformance:
                entry.sleep
                    ?.sleepPerformancePercentage ??
                null,

            sleepHours:
                entry.sleep
                    ?.durationHours ??
                null,

            hrvMs:
                entry.recovery
                    ?.heartRateVariabilityMs ??
                null,

            restingHeartRateBpm:
                entry.recovery
                    ?.restingHeartRateBpm ??
                null,

            bloodOxygenPercentage:
                entry.recovery
                    ?.bloodOxygenPercentage ??
                null,

            respiratoryRate:
                entry.recovery
                    ?.respiratoryRateBreathsPerMinute ??
                null,

            skinTemperatureCelsius:
                entry.recovery
                    ?.skinTemperatureCelsius ??
                null,

            sleepConsistencyPercentage:
                entry.sleep
                    ?.sleepConsistencyPercentage ??
                null,

            sleepEfficiencyPercentage:
                entry.sleep
                    ?.sleepEfficiencyPercentage ??
                null,

            sleepNeedMinutes:
                entry.sleep
                    ?.sleepNeedMinutes ??
                null,

            sleepDebtMinutes:
                entry.sleep
                    ?.sleepDebtMinutes ??
                null,

            workouts:
                entry.workouts
                    ?.length ??
                0,

            sources:
                entry.sources ??
                [],
        };
    }

    private countWorkouts(
        entries: any[],
    ) {
        return entries.reduce(
            (
                total,
                entry,
            ) =>
                total +
                (
                    entry.workouts ??
                    []
                ).length,
            0,
        );
    }

    private averageWorkoutStrain(
        entries: any[],
    ) {
        const values =
            entries.flatMap(
                (
                    entry,
                ) =>
                    (
                        entry.workouts ??
                        []
                    )
                        .map(
                            (
                                workout,
                            ) =>
                                workout.strainScore,
                        )
                        .filter(
                            this.isNumber,
                        ),
            );

        return this.average(
            values,
        );
    }

    private average(
        values: number[],
    ) {
        if (
            values.length ===
            0
        ) {
            return null;
        }

        const total =
            values.reduce(
                (
                    sum,
                    value,
                ) =>
                    sum +
                    value,
                0,
            );

        return Number(
            (
                total /
                values.length
            ).toFixed(
                2,
            ),
        );
    }

    private isNumber(
        value: unknown,
    ): value is number {
        return (
            typeof value ===
            'number' &&
            Number.isFinite(
                value,
            )
        );
    }

    private getDateKey(
        date: Date,
    ) {
        const parts =
            new Intl.DateTimeFormat(
                'en-US',
                {
                    timeZone:
                        'Asia/Kolkata',

                    year:
                        'numeric',

                    month:
                        '2-digit',

                    day:
                        '2-digit',
                },
            ).formatToParts(
                date,
            );

        const year =
            parts.find(
                (
                    part,
                ) =>
                    part.type ===
                    'year',
            )?.value;

        const month =
            parts.find(
                (
                    part,
                ) =>
                    part.type ===
                    'month',
            )?.value;

        const day =
            parts.find(
                (
                    part,
                ) =>
                    part.type ===
                    'day',
            )?.value;

        return `${year}-${month}-${day}`;
    }

    private addDays(
        dateKey: string,
        days: number,
    ) {
        const [
            year,
            month,
            day,
        ] =
            dateKey
                .split('-')
                .map(Number);

        const date =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day,
                ),
            );

        date.setUTCDate(
            date.getUTCDate() +
            days,
        );

        return [
            date.getUTCFullYear(),

            String(
                date.getUTCMonth() +
                1,
            ).padStart(
                2,
                '0',
            ),

            String(
                date.getUTCDate(),
            ).padStart(
                2,
                '0',
            ),
        ].join(
            '-',
        );
    }

    private percentageChange(
        baseline: number | null,
        current: number | null,
    ) {
        if (
            baseline === null ||
            current === null ||
            baseline === 0
        ) {
            return null;
        }

        return Number(
            (
                ((current - baseline) /
                    baseline) *
                100
            ).toFixed(2),
        );
    }
}