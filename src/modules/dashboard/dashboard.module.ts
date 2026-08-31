import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Company, CompanySchema } from '../companies/schemas/company.schema';
import {
  HealthEntry,
  HealthEntrySchema,
} from '../health/schemas/health-entry.schema';
import {
  JournalEntry,
  JournalEntrySchema,
} from '../journal/schemas/journal-entry.schema';
import {
  LibraryItem,
  LibraryItemSchema,
} from '../library/schemas/library-item.schema';
import { MediaPost, MediaPostSchema } from '../media/schemas/media-post.schema';
import { MeditationModule } from '../meditation/meditation.module';
import {
  MeditationEntry,
  MeditationEntrySchema,
} from '../meditation/schemas/meditation-entry.schema';
import { NowModule } from '../now/now.module';
import { NowStatus, NowStatusSchema } from '../now/schemas/now-status.schema';
import { TasksModule } from '../tasks/tasks.module';
import { RemindersModule } from '../reminders/reminders.module';
import { BrainDumpModule } from '../brain-dump/brain-dump.module';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Company.name,
        schema: CompanySchema,
      },
      {
        name: JournalEntry.name,
        schema: JournalEntrySchema,
      },
      {
        name: LibraryItem.name,
        schema: LibraryItemSchema,
      },
      {
        name: HealthEntry.name,
        schema: HealthEntrySchema,
      },
      {
        name: MediaPost.name,
        schema: MediaPostSchema,
      },
      {
        name: NowStatus.name,
        schema: NowStatusSchema,
      },
      {
        name: Task.name,
        schema: TaskSchema,
      },
      {
        name: MeditationEntry.name,
        schema: MeditationEntrySchema,
      },
    ]),
    TasksModule,
    RemindersModule,
    BrainDumpModule,
    MeditationModule,
    NowModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
