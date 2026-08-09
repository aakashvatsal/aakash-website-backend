import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Company,
  CompanySchema,
} from '../companies/schemas/company.schema';

import {
  JournalEntry,
  JournalEntrySchema,
} from '../journal/schemas/journal-entry.schema';

import {
  LibraryItem,
  LibraryItemSchema,
} from '../library/schemas/library-item.schema';

import {
  HealthEntry,
  HealthEntrySchema,
} from '../health/schemas/health-entry.schema';

import {
  MediaPost,
  MediaPostSchema,
} from '../media/schemas/media-post.schema';

import {
  NowStatus,
  NowStatusSchema,
} from '../now/schemas/now-status.schema';

import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

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
    ]),
  ],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService],
})
export class AdminDashboardModule {}