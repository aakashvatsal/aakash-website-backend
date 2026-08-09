import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  AdminGuard,
} from '../../common/guards/admin.guard';

import {
  AddCompanyGoalDto,
} from './dto/add-company-goal.dto';

import {
  AddCompanyMetricDto,
} from './dto/add-company-metric.dto';

import {
  CompanyQueryDto,
} from './dto/company-query.dto';

import {
  CreateCompanyDto,
} from './dto/create-company.dto';

import {
  UpdateCompanyGoalDto,
} from './dto/update-company-goal.dto';

import {
  UpdateCompanyDto,
} from './dto/update-company.dto';

import {
  CompaniesService,
} from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService:
      CompaniesService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(
      dto,
    );
  }

  @Get()
  findAll(
    @Query()
    query: CompanyQueryDto,
  ) {
    return this.companiesService.findAll(
      query,
    );
  }

  @Get('slug/:slug')
  findBySlug(
    @Param('slug')
    slug: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.findBySlug(
      slug,
      userId,
    );
  }

  @Get(':companyId')
  findOne(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.findOne(
      companyId,
    );
  }

  @Patch(':companyId')
  @UseGuards(AdminGuard)
  update(
    @Param('companyId')
    companyId: string,

    @Body()
    dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(
      companyId,
      dto,
    );
  }

  @Post(
    ':companyId/metrics',
  )
  @UseGuards(AdminGuard)
  addMetric(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,

    @Body()
    dto: AddCompanyMetricDto,
  ) {
    return this.companiesService.addMetric(
      companyId,
      userId,
      dto,
    );
  }

  @Delete(
    ':companyId/metrics/:metricKey',
  )
  @UseGuards(AdminGuard)
  removeMetric(
    @Param('companyId')
    companyId: string,

    @Param('metricKey')
    metricKey: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.removeMetric(
      companyId,
      userId,
      metricKey,
    );
  }

  @Post(
    ':companyId/goals',
  )
  @UseGuards(AdminGuard)
  addGoal(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,

    @Body()
    dto: AddCompanyGoalDto,
  ) {
    return this.companiesService.addGoal(
      companyId,
      userId,
      dto,
    );
  }

  @Patch(
    ':companyId/goals/:goalIndex',
  )
  @UseGuards(AdminGuard)
  updateGoal(
    @Param('companyId')
    companyId: string,

    @Param('goalIndex')
    goalIndex: string,

    @Query('userId')
    userId: string,

    @Body()
    dto: UpdateCompanyGoalDto,
  ) {
    return this.companiesService.updateGoal(
      companyId,
      userId,
      Number(
        goalIndex,
      ),
      dto,
    );
  }

  @Delete(
    ':companyId/goals/:goalIndex',
  )
  @UseGuards(AdminGuard)
  removeGoal(
    @Param('companyId')
    companyId: string,

    @Param('goalIndex')
    goalIndex: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.removeGoal(
      companyId,
      userId,
      Number(
        goalIndex,
      ),
    );
  }

  @Patch(
    ':companyId/priorities',
  )
  @UseGuards(AdminGuard)
  updatePriorities(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,

    @Body()
    body: {
      priorities: string[];
    },
  ) {
    return this.companiesService.updatePriorities(
      companyId,
      userId,
      body.priorities,
    );
  }

  @Patch(
    ':companyId/archive',
  )
  @UseGuards(AdminGuard)
  archive(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.archive(
      companyId,
      userId,
    );
  }

  @Patch(
    ':companyId/restore',
  )
  @UseGuards(AdminGuard)
  restore(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.restore(
      companyId,
      userId,
    );
  }

  @Delete(':companyId')
  @UseGuards(AdminGuard)
  remove(
    @Param('companyId')
    companyId: string,

    @Query('userId')
    userId: string,
  ) {
    return this.companiesService.remove(
      companyId,
      userId,
    );
  }
}