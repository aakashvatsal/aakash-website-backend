import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { CompaniesModule } from '../companies/companies.module';
import { RemindersModule } from '../reminders/reminders.module';

import { Task, TaskSchema } from './schemas/task.schema';

import { TasksController } from './tasks.controller';

import { TasksService } from './tasks.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Task.name,
        schema: TaskSchema,
      },
    ]),

    CompaniesModule,
    RemindersModule,
  ],

  controllers: [TasksController],

  providers: [TasksService],

  exports: [TasksService, MongooseModule],
})
export class TasksModule {}
