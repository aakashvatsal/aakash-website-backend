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

import { AddPainEntryDto } from './dto/add-pain-entry.dto';
import { AddWorkoutDto } from './dto/add-workout.dto';
import { CreateHealthEntryDto } from './dto/create-health-entry.dto';
import { HealthQueryDto } from './dto/health-query.dto';
import { UpdateHealthEntryDto } from './dto/update-health-entry.dto';
import { UpdateHealthHabitsDto } from './dto/update-health-habits.dto';
import { UpdatePainEntryDto } from './dto/update-pain-entry.dto';
import { UpdateWorkoutDto } from './dto/update-workout.dto';
import { HealthDashboardService } from './health-dashboard.service';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService:
      HealthService,

    private readonly healthDashboardService:
      HealthDashboardService,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body()
    dto: CreateHealthEntryDto,
  ) {
    return this.healthService.create(
      dto,
    );
  }

  @Get()
  findAll(
    @Query()
    query: HealthQueryDto,
  ) {
    return this.healthService.findAll(
      query,
    );
  }

  @Get('public/latest')
  findLatestForPublic() {
    return this.healthService.findLatestForPublic();
  }

  @Get('summary')
  getSummary(
    @Query('startDate')
    startDate: string,

    @Query('endDate')
    endDate: string,
  ) {
    return this.healthService.getSummary(
      startDate,
      endDate,
    );
  }

  @Get('date/:date')
  findByDate(
    @Param('date')
    date: string,
  ) {
    return this.healthService.findByDate(
      date,
    );
  }

  @Get('dashboard')
  getDashboard() {
    return this.healthDashboardService.getDashboard();
  }

  @Get('today')
  getToday() {
    return this.healthDashboardService.getToday();
  }

  @Get('trends')
  getTrends(
    @Query('days')
    days?: string,
  ) {
    return this.healthDashboardService.getTrends(
      days
        ? Number(days)
        : 30,
    );
  }

  @Get('workouts')
  getWorkouts(
    @Query('days')
    days?: string,
  ) {
    return this.healthDashboardService.getWorkouts(
      days
        ? Number(days)
        : 30,
    );
  }

  @Get(':healthEntryId')
  findOne(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.findOne(
      healthEntryId,
    );
  }

  @Patch(':healthEntryId')
  @UseGuards(AdminGuard)
  update(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: UpdateHealthEntryDto,
  ) {
    return this.healthService.update(
      healthEntryId,
      dto,
    );
  }

  @Post(':healthEntryId/workouts')
  @UseGuards(AdminGuard)
  addWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: AddWorkoutDto,
  ) {
    return this.healthService.addWorkout(
      healthEntryId,
      dto,
    );
  }

  @Patch(
    ':healthEntryId/workouts/:workoutIndex',
  )
  @UseGuards(AdminGuard)
  updateWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('workoutIndex')
    workoutIndex: string,

    @Body()
    dto: UpdateWorkoutDto,
  ) {
    return this.healthService.updateWorkout(
      healthEntryId,
      Number(
        workoutIndex,
      ),
      dto,
    );
  }

  @Patch(
    ':healthEntryId/workouts/:workoutIndex/complete',
  )
  @UseGuards(AdminGuard)
  completeWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('workoutIndex')
    workoutIndex: string,
  ) {
    return this.healthService.completeWorkout(
      healthEntryId,
      Number(
        workoutIndex,
      ),
    );
  }

  @Delete(
    ':healthEntryId/workouts/:workoutIndex',
  )
  @UseGuards(AdminGuard)
  removeWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('workoutIndex')
    workoutIndex: string,
  ) {
    return this.healthService.removeWorkout(
      healthEntryId,
      Number(
        workoutIndex,
      ),
    );
  }

  @Post(':healthEntryId/pain')
  @UseGuards(AdminGuard)
  addPainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: AddPainEntryDto,
  ) {
    return this.healthService.addPainEntry(
      healthEntryId,
      dto,
    );
  }

  @Patch(
    ':healthEntryId/pain/:painIndex',
  )
  @UseGuards(AdminGuard)
  updatePainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('painIndex')
    painIndex: string,

    @Body()
    dto: UpdatePainEntryDto,
  ) {
    return this.healthService.updatePainEntry(
      healthEntryId,
      Number(
        painIndex,
      ),
      dto,
    );
  }

  @Patch(
    ':healthEntryId/pain/:painIndex/resolve',
  )
  @UseGuards(AdminGuard)
  resolvePainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('painIndex')
    painIndex: string,
  ) {
    return this.healthService.resolvePainEntry(
      healthEntryId,
      Number(
        painIndex,
      ),
    );
  }

  @Delete(
    ':healthEntryId/pain/:painIndex',
  )
  @UseGuards(AdminGuard)
  removePainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('painIndex')
    painIndex: string,
  ) {
    return this.healthService.removePainEntry(
      healthEntryId,
      Number(
        painIndex,
      ),
    );
  }

  @Patch(
    ':healthEntryId/habits',
  )
  @UseGuards(AdminGuard)
  updateHabits(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: UpdateHealthHabitsDto,
  ) {
    return this.healthService.updateHabits(
      healthEntryId,
      dto,
    );
  }

  @Patch(
    ':healthEntryId/archive',
  )
  @UseGuards(AdminGuard)
  archive(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.archive(
      healthEntryId,
    );
  }

  @Patch(
    ':healthEntryId/restore',
  )
  @UseGuards(AdminGuard)
  restore(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.restore(
      healthEntryId,
    );
  }

  @Delete(':healthEntryId')
  @UseGuards(AdminGuard)
  remove(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.remove(
      healthEntryId,
    );
  }
}