import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Company,
  CompanyDocument,
  CompanyStatus,
} from '../companies/schemas/company.schema';
import {
  HealthEntry,
  HealthEntryDocument,
} from '../health/schemas/health-entry.schema';
import {
  JournalEntry,
  JournalEntryDocument,
} from '../journal/schemas/journal-entry.schema';
import {
  LibraryItem,
  LibraryItemDocument,
  LibraryItemStatus,
} from '../library/schemas/library-item.schema';
import {
  MediaPost,
  MediaPostDocument,
  MediaPostStatus,
} from '../media/schemas/media-post.schema';
import { MeditationService } from '../meditation/meditation.service';
import {
  MeditationEntry,
  MeditationEntryDocument,
  MeditationStatus,
} from '../meditation/schemas/meditation-entry.schema';
import { NowService } from '../now/now.service';
import { NowStatus, NowStatusDocument } from '../now/schemas/now-status.schema';
import { Task, TaskDocument } from '../tasks/schemas/task.schema';
import { TasksService } from '../tasks/tasks.service';
import { RemindersService } from '../reminders/reminders.service';
import { BrainDumpService } from '../brain-dump/brain-dump.service';

type DashboardActivityModule =
  | 'companies'
  | 'journal'
  | 'library'
  | 'health'
  | 'media'
  | 'now'
  | 'tasks'
  | 'meditation'
  | 'brainDump';

export interface DashboardActivity {
  id: string;
  title: string;
  module: DashboardActivityModule;
  createdAt: string;
  href: string;
  personalHref?: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,

    @InjectModel(JournalEntry.name)
    private readonly journalModel: Model<JournalEntryDocument>,

    @InjectModel(LibraryItem.name)
    private readonly libraryModel: Model<LibraryItemDocument>,

    @InjectModel(HealthEntry.name)
    private readonly healthModel: Model<HealthEntryDocument>,

    @InjectModel(MediaPost.name)
    private readonly mediaModel: Model<MediaPostDocument>,

    @InjectModel(NowStatus.name)
    private readonly nowModel: Model<NowStatusDocument>,

    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,

    @InjectModel(MeditationEntry.name)
    private readonly meditationModel: Model<MeditationEntryDocument>,

    private readonly tasksService: TasksService,

    private readonly remindersService: RemindersService,

    private readonly meditationService: MeditationService,

    private readonly nowService: NowService,

    private readonly brainDumpService: BrainDumpService,
  ) {}

  async getDashboard() {
    const today = this.getIstDateKey(new Date());

    const weekStart = this.getIstDateKey(
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    );

    const [
      companyStats,
      journalStats,
      libraryStats,
      healthStats,
      mediaStats,
      taskStats,
      reminderStats,
      meditationStats,
      currentFocus,
      latestHealth,
      companyActivity,
      journalActivity,
      libraryActivity,
      healthActivity,
      mediaActivity,
      nowActivity,
      taskActivity,
      meditationActivity,
    ] = await Promise.all([
      this.getCompanyStats(),
      this.getJournalStats(),
      this.getLibraryStats(),
      this.getHealthStats(),
      this.getMediaStats(),
      this.tasksService.getSummary(),
      this.remindersService.getSummary(),
      this.meditationService.getSummary(weekStart, today),
      this.nowService.getCurrent(),
      this.getLatestHealth(),
      this.companyModel
        .find({
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          name: 1,
          title: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.journalModel
        .find({
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          title: 1,
          date: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.libraryModel
        .find({
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          title: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.healthModel
        .find({
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          date: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.mediaModel
        .find({
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          title: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.nowModel
        .find({
          isActive: { $ne: false },
          isArchived: { $ne: true },
        })
        .sort({ updatedAt: -1 })
        .limit(1)
        .select({
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.taskModel
        .find({
          isActive: true,
          isArchived: false,
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          title: 1,
          status: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
      this.meditationModel
        .find({
          isActive: true,
          isArchived: false,
        })
        .sort({ updatedAt: -1 })
        .limit(3)
        .select({
          title: 1,
          status: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    const brainDumpStats = await this.brainDumpService.getSummary();

    const recentActivity: DashboardActivity[] = [
      ...companyActivity.map((company: any) => ({
        id: String(company._id),
        title: `Updated ${company.name ?? company.title ?? 'company profile'}`,
        module: 'companies' as const,
        createdAt: this.getActivityDate(company.updatedAt, company.createdAt),
        href: `/admin/companies/${company._id}`,
        personalHref: `/companies/${company._id}`,
      })),
      ...journalActivity.map((entry: any) => ({
        id: String(entry._id),
        title:
          entry.title ??
          `Updated journal entry for ${this.formatDate(entry.date)}`,
        module: 'journal' as const,
        createdAt: this.getActivityDate(entry.updatedAt, entry.createdAt),
        href: `/admin/journal/${entry._id}`,
        personalHref: `/journal/${entry._id}`,
      })),
      ...libraryActivity.map((item: any) => ({
        id: String(item._id),
        title: `Updated ${item.title ?? 'library item'}`,
        module: 'library' as const,
        createdAt: this.getActivityDate(item.updatedAt, item.createdAt),
        href: `/admin/library/${item._id}`,
        personalHref: `/library/${item._id}`,
      })),
      ...healthActivity.map((entry: any) => ({
        id: String(entry._id),
        title: `Updated health record for ${this.formatDate(entry.date)}`,
        module: 'health' as const,
        createdAt: this.getActivityDate(entry.updatedAt, entry.createdAt),
        href: `/admin/health/${entry._id}`,
        personalHref: `/health/${entry._id}`,
      })),
      ...mediaActivity.map((post: any) => ({
        id: String(post._id),
        title: `Updated ${post.title ?? 'media post'}`,
        module: 'media' as const,
        createdAt: this.getActivityDate(post.updatedAt, post.createdAt),
        href: `/admin/media/${post._id}`,
        personalHref: `/media/${post._id}`,
      })),
      ...nowActivity.map((status: any) => ({
        id: String(status._id),
        title: 'Updated current focus',
        module: 'now' as const,
        createdAt: this.getActivityDate(status.updatedAt, status.createdAt),
        href: '/admin/now',
        personalHref: '/now',
      })),
      ...taskActivity.map((task: any) => ({
        id: String(task._id),
        title: `Task: ${task.title ?? 'Untitled task'}`,
        module: 'tasks' as const,
        createdAt: this.getActivityDate(task.updatedAt, task.createdAt),
        href: `/admin/tasks/${task._id}`,
        personalHref: `/tasks/${task._id}`,
      })),
      ...brainDumpStats.recentInbox.map((capture: any) => ({
        id: String(capture._id),
        title: `Captured: ${
          capture.title ?? String(capture.content ?? 'Brain dump').slice(0, 90)
        }`,
        module: 'brainDump' as const,
        createdAt: this.getActivityDate(capture.createdAt, capture.createdAt),
        href: `/admin/brain-dump/${capture._id}`,
        personalHref: `/brain-dump/${capture._id}`,
      })),
      ...meditationActivity.map((entry: any) => ({
        id: String(entry._id),
        title: `Meditation: ${entry.title ?? 'Session'}`,
        module: 'meditation' as const,
        createdAt: this.getActivityDate(entry.updatedAt, entry.createdAt),
        href: `/admin/health/meditation/${entry._id}`,
        personalHref: `/health/meditation/${entry._id}`,
      })),
    ]
      .filter((activity) => Boolean(activity.createdAt))
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      )
      .slice(0, 10);

    const publishableTotal =
      companyStats.total +
      journalStats.total +
      libraryStats.total +
      mediaStats.total;

    const publishedTotal =
      companyStats.active +
      journalStats.published +
      libraryStats.completed +
      mediaStats.published;

    const publishingProgress =
      publishableTotal > 0
        ? Math.min(Math.round((publishedTotal / publishableTotal) * 100), 100)
        : 0;

    return {
      generatedAt: new Date(),
      timezone: 'Asia/Kolkata',
      stats: {
        companies: companyStats,
        journal: journalStats,
        library: libraryStats,
        health: healthStats,
        media: mediaStats,
        tasks: {
          totalOpen: taskStats.totalOpen,
          inbox: taskStats.inbox,
          inProgress: taskStats.inProgress,
          dueToday: taskStats.dueToday,
          overdue: taskStats.overdue,
          completedToday: taskStats.completedToday,
          highPriority: taskStats.highPriority,
        },
        reminders: {
          dueNow: reminderStats.dueNow,
          overdue: reminderStats.overdue,
          upcomingToday: reminderStats.upcomingToday,
          snoozed: reminderStats.snoozed,
          acknowledgedToday: reminderStats.acknowledgedToday,
        },
        brainDump: {
          inbox: brainDumpStats.totalInbox,
          capturedToday: brainDumpStats.capturedToday,
          processedToday: brainDumpStats.processedToday,
          favouriteInbox: brainDumpStats.favouriteInbox,
        },
        meditation: {
          sessionsThisWeek: meditationStats.totalSessions,
          completedThisWeek: meditationStats.completedSessions,
          minutesThisWeek: meditationStats.totalMeditationMinutes,
          completionRate: meditationStats.completionRate,
        },
      },
      today: {
        date: today,
        tasks: {
          dueToday: taskStats.dueToday,
          overdue: taskStats.overdue,
          completedToday: taskStats.completedToday,
          upcoming: taskStats.upcoming,
        },
        reminders: {
          dueNow: reminderStats.dueNow,
          overdue: reminderStats.overdue,
          upcomingToday: reminderStats.upcomingToday,
          snoozed: reminderStats.snoozed,
        },
        currentFocus,
        latestHealth,
        brainDump: {
          inbox: brainDumpStats.totalInbox,
          capturedToday: brainDumpStats.capturedToday,
          recentInbox: brainDumpStats.recentInbox,
        },
        meditation: {
          weekStart,
          totalSessions: meditationStats.totalSessions,
          completedSessions: meditationStats.completedSessions,
          minutes: meditationStats.totalMeditationMinutes,
        },
      },
      recentActivity,
      publishingProgress,
    };
  }

  private async getCompanyStats() {
    const [total, active] = await Promise.all([
      this.companyModel.countDocuments({
        isArchived: { $ne: true },
      }),
      this.companyModel.countDocuments({
        status: CompanyStatus.ACTIVE,
        isActive: true,
        isArchived: { $ne: true },
      }),
    ]);

    return { total, active };
  }

  private async getJournalStats() {
    const [total, published, drafts] = await Promise.all([
      this.journalModel.countDocuments({
        isArchived: { $ne: true },
      }),
      this.journalModel.countDocuments({
        status: 'published',
        isArchived: { $ne: true },
      }),
      this.journalModel.countDocuments({
        status: 'draft',
        isArchived: { $ne: true },
      }),
    ]);

    return {
      total,
      published,
      drafts,
    };
  }

  private async getLibraryStats() {
    const [total, reading, completed] = await Promise.all([
      this.libraryModel.countDocuments({
        isArchived: { $ne: true },
      }),
      this.libraryModel.countDocuments({
        status: LibraryItemStatus.READING,
        isArchived: { $ne: true },
      }),
      this.libraryModel.countDocuments({
        status: LibraryItemStatus.COMPLETED,
        isArchived: { $ne: true },
      }),
    ]);

    return {
      total,
      reading,
      completed,
    };
  }

  private async getHealthStats() {
    const [total, workoutResult] = await Promise.all([
      this.healthModel.countDocuments({
        isArchived: { $ne: true },
      }),
      this.healthModel.aggregate<{
        _id: null;
        total: number;
      }>([
        {
          $match: {
            isArchived: {
              $ne: true,
            },
          },
        },
        {
          $project: {
            workoutCount: {
              $size: {
                $ifNull: ['$workouts', []],
              },
            },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: '$workoutCount',
            },
          },
        },
      ]),
    ]);

    return {
      total,
      workouts: workoutResult[0]?.total ?? 0,
    };
  }

  private async getMediaStats() {
    const [total, published, scheduled] = await Promise.all([
      this.mediaModel.countDocuments({
        isArchived: { $ne: true },
      }),
      this.mediaModel.countDocuments({
        'publishing.status': MediaPostStatus.POSTED,
        isArchived: { $ne: true },
      }),
      this.mediaModel.countDocuments({
        'publishing.status': MediaPostStatus.SCHEDULED,
        isArchived: { $ne: true },
      }),
    ]);

    return {
      total,
      published,
      scheduled,
    };
  }

  private async getLatestHealth() {
    const latest = await this.healthModel
      .findOne({
        isArchived: { $ne: true },
      })
      .sort({ date: -1 })
      .select({
        date: 1,
        steps: 1,
        bodyMeasurement: 1,
        sleep: 1,
        recovery: 1,
        workouts: 1,
      })
      .lean();

    if (!latest) {
      return null;
    }

    return {
      id: String(latest._id),
      date: latest.date,
      steps: latest.steps ?? null,
      weightKg: latest.bodyMeasurement?.weightKg ?? null,
      sleepHours: latest.sleep?.durationHours ?? null,
      sleepScore: latest.sleep?.sleepScore ?? null,
      recoveryScore: latest.recovery?.recoveryScore ?? null,
      workouts: latest.workouts?.length ?? 0,
    };
  }

  private getActivityDate(
    updatedAt?: Date | string,
    createdAt?: Date | string,
  ): string {
    const value = updatedAt ?? createdAt;

    if (!value) {
      return new Date(0).toISOString();
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return new Date(0).toISOString();
    }

    return date.toISOString();
  }

  private formatDate(value?: Date | string): string {
    if (!value) {
      return 'unknown date';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return 'unknown date';
    }

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  private getIstDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const map = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );

    return `${map.year}-${map.month}-${map.day}`;
  }
}
