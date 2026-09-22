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

import {
  GenerateHobbyReviewDto,
  HobbyReviewQueryDto,
} from './dto/hobby-coaching.dto';
import { CreateHobbyDto } from './dto/create-hobby.dto';
import { HobbyQueryDto, HobbySessionQueryDto } from './dto/hobby-query.dto';
import {
  CompletePlannedHobbySessionDto,
  FinishHobbySessionDto,
  LogHobbySessionDto,
  StartHobbySessionDto,
} from './dto/hobby-session.dto';
import { UpdateHobbyDto } from './dto/update-hobby.dto';
import { HobbiesCoachingService } from './hobbies-coaching.service';
import { HobbiesService } from './hobbies.service';

@Controller('hobbies')
export class HobbiesController {
  constructor(
    private readonly hobbiesService: HobbiesService,
    private readonly hobbiesCoachingService: HobbiesCoachingService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.hobbiesService.getOverview();
  }

  @Post('bootstrap')
  bootstrap() {
    return this.hobbiesService.bootstrapStarterHobbies();
  }

  @Post('sync-practice-tasks')
  syncPracticeTasks() {
    return this.hobbiesService.syncPracticeTasks();
  }

  @Get('practice-plan')
  getPracticePlan() {
    return this.hobbiesCoachingService.getPracticePlan();
  }

  @Post('practice-plan/sync-tasks')
  syncPracticePlanTasks() {
    return this.hobbiesCoachingService.syncPracticePlanTasks();
  }

  @Get()
  findAll(@Query() query: HobbyQueryDto) {
    return this.hobbiesService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateHobbyDto) {
    return this.hobbiesService.create(dto);
  }

  @Get(':hobbyId/coach')
  getCoach(@Param('hobbyId') hobbyId: string) {
    return this.hobbiesCoachingService.getCoach(hobbyId);
  }

  @Get(':hobbyId/reviews')
  getReviews(
    @Param('hobbyId') hobbyId: string,
    @Query() query: HobbyReviewQueryDto,
  ) {
    return this.hobbiesCoachingService.getReviews(hobbyId, query.period);
  }

  @Post(':hobbyId/reviews/generate')
  generateReview(
    @Param('hobbyId') hobbyId: string,
    @Body() dto: GenerateHobbyReviewDto,
  ) {
    return this.hobbiesCoachingService.generateReview(
      hobbyId,
      dto.period,
      dto.force ?? false,
    );
  }

  @Get(':hobbyId')
  findOne(@Param('hobbyId') hobbyId: string) {
    return this.hobbiesService.findOne(hobbyId);
  }

  @Patch(':hobbyId')
  update(@Param('hobbyId') hobbyId: string, @Body() dto: UpdateHobbyDto) {
    return this.hobbiesService.update(hobbyId, dto);
  }

  @Delete(':hobbyId')
  archive(@Param('hobbyId') hobbyId: string) {
    return this.hobbiesService.archive(hobbyId);
  }

  @Post(':hobbyId/start')
  startSession(
    @Param('hobbyId') hobbyId: string,
    @Body() dto: StartHobbySessionDto,
  ) {
    return this.hobbiesService.startSession(hobbyId, dto);
  }

  @Post(':hobbyId/complete-planned')
  completePlannedSession(
    @Param('hobbyId') hobbyId: string,
    @Body() dto: CompletePlannedHobbySessionDto,
  ) {
    return this.hobbiesService.completePlannedSession(hobbyId, dto);
  }

  @Post(':hobbyId/sessions')
  logSession(
    @Param('hobbyId') hobbyId: string,
    @Body() dto: LogHobbySessionDto,
  ) {
    return this.hobbiesService.logSession(hobbyId, dto);
  }

  @Get(':hobbyId/sessions')
  getSessions(
    @Param('hobbyId') hobbyId: string,
    @Query() query: HobbySessionQueryDto,
  ) {
    return this.hobbiesService.getSessions(hobbyId, query);
  }

  @Post(':hobbyId/advance')
  advance(@Param('hobbyId') hobbyId: string) {
    return this.hobbiesService.advance(hobbyId);
  }

  @Post(':hobbyId/resources/:libraryItemId')
  linkResource(
    @Param('hobbyId') hobbyId: string,
    @Param('libraryItemId') libraryItemId: string,
  ) {
    return this.hobbiesService.linkResource(hobbyId, libraryItemId);
  }

  @Delete(':hobbyId/resources/:libraryItemId')
  unlinkResource(
    @Param('hobbyId') hobbyId: string,
    @Param('libraryItemId') libraryItemId: string,
  ) {
    return this.hobbiesService.unlinkResource(hobbyId, libraryItemId);
  }

  @Post('sessions/:sessionId/finish')
  finishSession(
    @Param('sessionId') sessionId: string,
    @Body() dto: FinishHobbySessionDto,
  ) {
    return this.hobbiesService.finishSession(sessionId, dto);
  }
}
