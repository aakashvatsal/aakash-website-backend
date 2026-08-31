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

import { Public } from '../../common/decorators/public.decorator';

import { AddCompanyGoalDto } from './dto/add-company-goal.dto';

import { AddCompanyMetricDto } from './dto/add-company-metric.dto';

import { CompanyQueryDto } from './dto/company-query.dto';

import { CreateCompanyDto } from './dto/create-company.dto';

import { UpdateCompanyGoalDto } from './dto/update-company-goal.dto';

import { UpdateCompanyDto } from './dto/update-company.dto';

import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(
    @Body()
    dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(dto);
  }

  @Get('public')
  @Public()
  findPublic(
    @Query()
    query: CompanyQueryDto,
  ) {
    return this.companiesService.findPublic(query);
  }

  @Get('public/:slug')
  @Public()
  findPublicBySlug(
    @Param('slug')
    slug: string,
  ) {
    return this.companiesService.findPublicBySlug(slug);
  }

  @Get()
  findAll(
    @Query()
    query: CompanyQueryDto,
  ) {
    return this.companiesService.findAll(query);
  }

  @Get('slug/:slug')
  findBySlug(
    @Param('slug')
    slug: string,
  ) {
    return this.companiesService.findBySlug(slug);
  }

  @Get(':companyId')
  findOne(
    @Param('companyId')
    companyId: string,
  ) {
    return this.companiesService.findOne(companyId);
  }

  @Patch(':companyId')
  update(
    @Param('companyId')
    companyId: string,

    @Body()
    dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(companyId, dto);
  }

  @Post(':companyId/metrics')
  addMetric(
    @Param('companyId')
    companyId: string,

    @Body()
    dto: AddCompanyMetricDto,
  ) {
    return this.companiesService.addMetric(companyId, dto);
  }

  @Delete(':companyId/metrics/:metricKey')
  removeMetric(
    @Param('companyId')
    companyId: string,

    @Param('metricKey')
    metricKey: string,
  ) {
    return this.companiesService.removeMetric(companyId, metricKey);
  }

  @Post(':companyId/goals')
  addGoal(
    @Param('companyId')
    companyId: string,

    @Body()
    dto: AddCompanyGoalDto,
  ) {
    return this.companiesService.addGoal(companyId, dto);
  }

  @Patch(':companyId/goals/:goalIndex')
  updateGoal(
    @Param('companyId')
    companyId: string,

    @Param('goalIndex')
    goalIndex: string,

    @Body()
    dto: UpdateCompanyGoalDto,
  ) {
    return this.companiesService.updateGoal(companyId, Number(goalIndex), dto);
  }

  @Delete(':companyId/goals/:goalIndex')
  removeGoal(
    @Param('companyId')
    companyId: string,

    @Param('goalIndex')
    goalIndex: string,
  ) {
    return this.companiesService.removeGoal(companyId, Number(goalIndex));
  }

  @Patch(':companyId/priorities')
  updatePriorities(
    @Param('companyId')
    companyId: string,

    @Body()
    body: {
      priorities: string[];
    },
  ) {
    return this.companiesService.updatePriorities(companyId, body.priorities);
  }

  @Patch(':companyId/archive')
  archive(
    @Param('companyId')
    companyId: string,
  ) {
    return this.companiesService.archive(companyId);
  }

  @Patch(':companyId/restore')
  restore(
    @Param('companyId')
    companyId: string,
  ) {
    return this.companiesService.restore(companyId);
  }

  @Delete(':companyId')
  remove(
    @Param('companyId')
    companyId: string,
  ) {
    return this.companiesService.remove(companyId);
  }
}
