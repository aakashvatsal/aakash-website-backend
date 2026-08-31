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

import { Public } from '../../common/decorators/public.decorator';

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
    private readonly healthService: HealthService,

    private readonly healthDashboardService: HealthDashboardService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateHealthEntryDto,
  ) {
    return this.healthService.create(dto);
  }

  @Get()
  findAll(
    @Query()
    query: HealthQueryDto,
  ) {
    return this.healthService.findAll(query);
  }

  @Get('public/latest')
  @Public()
  findLatestForPublic() {
    return this.healthService.findLatestForPublic();
  }

  @Get('public/dashboard')
  @Public()
  getPublicDashboard() {
    return this.healthDashboardService.getDashboard();
  }

  @Get('public/trends')
  @Public()
  getPublicTrends(
    @Query('days')
    days?: string,
  ) {
    return this.healthDashboardService.getTrends(days ? Number(days) : 30);
  }

  @Get('summary')
  getSummary(
    @Query('startDate')
    startDate: string,

    @Query('endDate')
    endDate: string,
  ) {
    return this.healthService.getSummary(startDate, endDate);
  }

  @Get('date/:date')
  findByDate(
    @Param('date')
    date: string,
  ) {
    return this.healthService.findByDate(date);
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
    return this.healthDashboardService.getTrends(days ? Number(days) : 30);
  }

  @Get('workouts')
  getWorkouts(
    @Query('days')
    days?: string,
  ) {
    return this.healthDashboardService.getWorkouts(days ? Number(days) : 30);
  }

  @Get(':healthEntryId')
  findOne(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.findOne(healthEntryId);
  }

  @Patch(':healthEntryId')
  update(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: UpdateHealthEntryDto,
  ) {
    return this.healthService.update(healthEntryId, dto);
  }

  @Post(':healthEntryId/workouts')
  addWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: AddWorkoutDto,
  ) {
    return this.healthService.addWorkout(healthEntryId, dto);
  }

  @Patch(':healthEntryId/workouts/:workoutIndex')
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
      Number(workoutIndex),
      dto,
    );
  }

  @Patch(':healthEntryId/workouts/:workoutIndex/complete')
  completeWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('workoutIndex')
    workoutIndex: string,
  ) {
    return this.healthService.completeWorkout(
      healthEntryId,
      Number(workoutIndex),
    );
  }

  @Delete(':healthEntryId/workouts/:workoutIndex')
  removeWorkout(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('workoutIndex')
    workoutIndex: string,
  ) {
    return this.healthService.removeWorkout(
      healthEntryId,
      Number(workoutIndex),
    );
  }

  @Post(':healthEntryId/pain')
  addPainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: AddPainEntryDto,
  ) {
    return this.healthService.addPainEntry(healthEntryId, dto);
  }

  @Patch(':healthEntryId/pain/:painIndex')
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
      Number(painIndex),
      dto,
    );
  }

  @Patch(':healthEntryId/pain/:painIndex/resolve')
  resolvePainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('painIndex')
    painIndex: string,
  ) {
    return this.healthService.resolvePainEntry(
      healthEntryId,
      Number(painIndex),
    );
  }

  @Delete(':healthEntryId/pain/:painIndex')
  removePainEntry(
    @Param('healthEntryId')
    healthEntryId: string,

    @Param('painIndex')
    painIndex: string,
  ) {
    return this.healthService.removePainEntry(healthEntryId, Number(painIndex));
  }

  @Patch(':healthEntryId/habits')
  updateHabits(
    @Param('healthEntryId')
    healthEntryId: string,

    @Body()
    dto: UpdateHealthHabitsDto,
  ) {
    return this.healthService.updateHabits(healthEntryId, dto);
  }

  @Patch(':healthEntryId/archive')
  archive(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.archive(healthEntryId);
  }

  @Patch(':healthEntryId/restore')
  restore(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.restore(healthEntryId);
  }

  @Delete(':healthEntryId')
  remove(
    @Param('healthEntryId')
    healthEntryId: string,
  ) {
    return this.healthService.remove(healthEntryId);
  }
}
