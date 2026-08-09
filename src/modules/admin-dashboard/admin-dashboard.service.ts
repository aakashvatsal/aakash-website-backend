import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

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
  HealthEntry,
  HealthEntryDocument,
} from '../health/schemas/health-entry.schema';

import {
  MediaPost,
  MediaPostDocument,
  MediaPostStatus
} from '../media/schemas/media-post.schema';

import {
  NowStatus,
  NowStatusDocument,
} from '../now/schemas/now-status.schema';

import {
  Company,
  CompanyDocument,
  CompanyStatus,
} from '../companies/schemas/company.schema';

type DashboardActivityModule =
  | 'companies'
  | 'journal'
  | 'library'
  | 'health'
  | 'media'
  | 'now';

interface DashboardActivity {
  id: string;
  title: string;
  module: DashboardActivityModule;
  createdAt: string;
  href: string;
}

interface CompanyDashboardStats {
  total: number;
  active: number;
}

interface JournalDashboardStats {
  total: number;
  published: number;
  drafts: number;
}

interface LibraryDashboardStats {
  total: number;
  reading: number;
  completed: number;
}

interface HealthDashboardStats {
  total: number;
  workouts: number;
}

interface MediaDashboardStats {
  total: number;
  published: number;
  scheduled: number;
}

@Injectable()
export class AdminDashboardService {
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
  ) {}

  async getDashboard() {
    const [
      companyStats,
      journalStats,
      libraryStats,
      healthStats,
      mediaStats,
      companyActivity,
      journalActivity,
      libraryActivity,
      healthActivity,
      mediaActivity,
      nowActivity,
    ] = await Promise.all([
      this.getCompanyStats(),
      this.getJournalStats(),
      this.getLibraryStats(),
      this.getHealthStats(),
      this.getMediaStats(),

      this.companyModel
        .find({
          isArchived: {
            $ne: true,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(3)
        .select({
          name: 1,
          title: 1,
          slug: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),

      this.journalModel
        .find({
          isArchived: {
            $ne: true,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(3)
        .select({
          title: 1,
          date: 1,
          slug: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),

      this.libraryModel
        .find({
          isArchived: {
            $ne: true,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(3)
        .select({
          title: 1,
          slug: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),

      this.healthModel
        .find({
          isArchived: {
            $ne: true,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(3)
        .select({
          date: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),

      this.mediaModel
        .find({
          isArchived: {
            $ne: true,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(3)
        .select({
          title: 1,
          slug: 1,
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),

      this.nowModel
        .find({
          isActive: {
            $ne: false,
          },
        })
        .sort({
          updatedAt: -1,
        })
        .limit(1)
        .select({
          updatedAt: 1,
          createdAt: 1,
        })
        .lean(),
    ]);

    const recentActivity: DashboardActivity[] = [
      ...companyActivity.map((company: any) => ({
        id: String(company._id),

        title: `Updated ${
          company.name ??
          company.title ??
          'company profile'
        }`,

        module: 'companies' as const,

        createdAt: this.getActivityDate(
          company.updatedAt,
          company.createdAt,
        ),

        href: `/admin/companies/${company._id}`,
      })),

      ...journalActivity.map((entry: any) => ({
        id: String(entry._id),

        title:
          entry.title ??
          `Updated journal entry for ${this.formatDate(
            entry.date,
          )}`,

        module: 'journal' as const,

        createdAt: this.getActivityDate(
          entry.updatedAt,
          entry.createdAt,
        ),

        href: `/admin/journal/${entry._id}`,
      })),

      ...libraryActivity.map((item: any) => ({
        id: String(item._id),

        title: `Updated ${
          item.title ?? 'library item'
        }`,

        module: 'library' as const,

        createdAt: this.getActivityDate(
          item.updatedAt,
          item.createdAt,
        ),

        href: `/admin/library/${item._id}`,
      })),

      ...healthActivity.map((entry: any) => ({
        id: String(entry._id),

        title: `Updated health record for ${this.formatDate(
          entry.date,
        )}`,

        module: 'health' as const,

        createdAt: this.getActivityDate(
          entry.updatedAt,
          entry.createdAt,
        ),

        href: `/admin/health/${entry._id}`,
      })),

      ...mediaActivity.map((post: any) => ({
        id: String(post._id),

        title: `Updated ${
          post.title ?? 'media post'
        }`,

        module: 'media' as const,

        createdAt: this.getActivityDate(
          post.updatedAt,
          post.createdAt,
        ),

        href: `/admin/media/${post._id}`,
      })),

      ...nowActivity.map((status: any) => ({
        id: String(status._id),

        title: 'Updated current focus',

        module: 'now' as const,

        createdAt: this.getActivityDate(
          status.updatedAt,
          status.createdAt,
        ),

        href: '/admin/now',
      })),
    ]
      .filter((activity) => Boolean(activity.createdAt))
      .sort(
        (first, second) =>
          new Date(second.createdAt).getTime() -
          new Date(first.createdAt).getTime(),
      )
      .slice(0, 8);

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
        ? Math.min(
            Math.round(
              (publishedTotal / publishableTotal) *
                100,
            ),
            100,
          )
        : 0;

    return {
      stats: {
        companies: companyStats,
        journal: journalStats,
        library: libraryStats,
        health: healthStats,
        media: mediaStats,
      },

      recentActivity,

      publishingProgress,
    };
  }

  private async getCompanyStats(): Promise<CompanyDashboardStats> {
    const [total, active] = await Promise.all([
      this.companyModel.countDocuments({
        isArchived: {
          $ne: true,
        },
      }),

      this.companyModel.countDocuments({
        status: CompanyStatus.ACTIVE,
        isActive: true,
        isArchived: {
          $ne: true,
        },
      }),
    ]);

    return {
      total,
      active,
    };
  }

  private async getJournalStats(): Promise<JournalDashboardStats> {
    const [total, published, drafts] =
      await Promise.all([
        this.journalModel.countDocuments({
          isArchived: {
            $ne: true,
          },
        }),

        this.journalModel.countDocuments({
          status: 'published',
          isArchived: {
            $ne: true,
          },
        }),

        this.journalModel.countDocuments({
          status: 'draft',
          isArchived: {
            $ne: true,
          },
        }),
      ]);

    return {
      total,
      published,
      drafts,
    };
  }

  private async getLibraryStats(): Promise<LibraryDashboardStats> {
    const [total, reading, completed] =
      await Promise.all([
        this.libraryModel.countDocuments({
          isArchived: {
            $ne: true,
          },
        }),

        this.libraryModel.countDocuments({
          status: LibraryItemStatus.READING,
          isArchived: {
            $ne: true,
          },
        }),

        this.libraryModel.countDocuments({
          status: LibraryItemStatus.COMPLETED,
          isArchived: {
            $ne: true,
          },
        }),
      ]);

    return {
      total,
      reading,
      completed,
    };
  }

  private async getHealthStats(): Promise<HealthDashboardStats> {
    const [total, workoutResult] =
      await Promise.all([
        this.healthModel.countDocuments({
          isArchived: {
            $ne: true,
          },
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

  private async getMediaStats(): Promise<MediaDashboardStats> {
    const [total, published, scheduled] =
      await Promise.all([
        this.mediaModel.countDocuments({
          isArchived: {
            $ne: true,
          },
        }),

        this.mediaModel.countDocuments({
          'publishing.status': MediaPostStatus.POSTED,
          isArchived: {
            $ne: true,
          },
        }),

        this.mediaModel.countDocuments({
          'publishing.status': MediaPostStatus.SCHEDULED,
          isArchived: {
            $ne: true,
          },
        }),
      ]);

    return {
      total,
      published,
      scheduled,
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

  private formatDate(
    value?: Date | string,
  ): string {
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
    }).format(date);
  }
}