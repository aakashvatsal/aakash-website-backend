import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';

import { DashboardService } from './dashboard.service';

@Controller(['dashboard', 'admin/dashboard'])
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getDashboard() {
    const data = await this.dashboardService.getDashboard();

    return {
      statusCode: HttpStatus.OK,
      message: 'Dashboard fetched successfully.',
      data,
    };
  }
}
