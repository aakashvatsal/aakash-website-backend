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

import { CreateTaskDto } from './dto/create-task.dto';

import { TaskQueryDto } from './dto/task-query.dto';

import { UpdateTaskDto } from './dto/update-task.dto';

import { UpdateTaskStatusDto } from './dto/update-task-status.dto';

import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @Body()
    dto: CreateTaskDto,
  ) {
    return this.tasksService.create(dto);
  }

  @Get()
  findAll(
    @Query()
    query: TaskQueryDto,
  ) {
    return this.tasksService.findAll(query);
  }

  @Get('summary')
  getSummary() {
    return this.tasksService.getSummary();
  }

  @Get(':taskId')
  findOne(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.findOne(taskId);
  }

  @Patch(':taskId')
  update(
    @Param('taskId')
    taskId: string,

    @Body()
    dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, dto);
  }

  @Patch(':taskId/status')
  updateStatus(
    @Param('taskId')
    taskId: string,

    @Body()
    dto: UpdateTaskStatusDto,
  ) {
    return this.tasksService.updateStatus(taskId, dto.status);
  }

  @Patch(':taskId/complete')
  complete(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.complete(taskId);
  }

  @Patch(':taskId/reopen')
  reopen(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.reopen(taskId);
  }

  @Patch(':taskId/archive')
  archive(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.archive(taskId);
  }

  @Patch(':taskId/restore')
  restore(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.restore(taskId);
  }

  @Delete(':taskId')
  remove(
    @Param('taskId')
    taskId: string,
  ) {
    return this.tasksService.remove(taskId);
  }
}
