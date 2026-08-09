import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { AdminDashboardService } from './admin-dashboard.service';

export type DashboardActivityModule =
  | 'companies'
  | 'journal'
  | 'library'
  | 'health'
  | 'media'
  | 'now';

export interface CompanyDashboardStatsResponse {
  total: number;
  active: number;
}

export interface JournalDashboardStatsResponse {
  total: number;
  published: number;
  drafts: number;
}

export interface LibraryDashboardStatsResponse {
  total: number;
  reading: number;
  completed: number;
}

export interface HealthDashboardStatsResponse {
  total: number;
  workouts: number;
}

export interface MediaDashboardStatsResponse {
  total: number;
  published: number;
  scheduled: number;
}

export interface DashboardActivityResponse {
  id: string;
  title: string;
  module: DashboardActivityModule;
  createdAt: string;
  href: string;
}

export interface AdminDashboardDataResponse {
  stats: {
    companies: CompanyDashboardStatsResponse;
    journal: JournalDashboardStatsResponse;
    library: LibraryDashboardStatsResponse;
    health: HealthDashboardStatsResponse;
    media: MediaDashboardStatsResponse;
  };

  recentActivity: DashboardActivityResponse[];

  publishingProgress: number;
}

export interface AdminDashboardApiResponse {
  statusCode: number;
  message: string;
  data: AdminDashboardDataResponse;
}

@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(
    private readonly adminDashboardService: AdminDashboardService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboard(): Promise<AdminDashboardApiResponse> {
    const data =
      (await this.adminDashboardService.getDashboard()) as AdminDashboardDataResponse;

    return {
      statusCode: HttpStatus.OK,
      message: 'Admin dashboard fetched successfully.',
      data,
    };
  }
}