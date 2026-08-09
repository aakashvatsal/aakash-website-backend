import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { GenerateHealthReportDto } from './dto/generate-health-report.dto';
import { UpdateRecommendationDto } from './dto/update-recommendation.dto';
import { HealthReportsService } from './health-reports.service';
import { HealthReportType } from './schemas/health-report.schema';

@Controller('health-reports')
export class HealthReportsController {
  constructor(
    private readonly healthReportsService: HealthReportsService,
  ) {}

  @Post('generate')
  generate(
    @Body() dto: GenerateHealthReportDto,
  ) {
    return this.healthReportsService.generateReport(dto);
  }

  @Get()
  findAll(
    @Query('userId') userId: string,
    @Query('reportType') reportType?: HealthReportType,
  ) {
    return this.healthReportsService.findAll(
      userId,
      reportType,
    );
  }

  @Get(':reportId')
  findOne(
    @Param('reportId') reportId: string,
    @Query('userId') userId: string,
  ) {
    return this.healthReportsService.findOne(
      reportId,
      userId,
    );
  }

  @Patch(':reportId/recommendations/:recommendationIndex')
  updateRecommendation(
    @Param('reportId') reportId: string,
    @Param('recommendationIndex')
    recommendationIndex: string,
    @Query('userId') userId: string,
    @Body() dto: UpdateRecommendationDto,
  ) {
    return this.healthReportsService.updateRecommendation(
      reportId,
      userId,
      Number(recommendationIndex),
      dto,
    );
  }

  @Delete(':reportId')
  remove(
    @Param('reportId') reportId: string,
    @Query('userId') userId: string,
  ) {
    return this.healthReportsService.remove(
      reportId,
      userId,
    );
  }
}