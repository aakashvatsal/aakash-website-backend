import {
  Module,
} from '@nestjs/common';

import {
  MongooseModule,
} from '@nestjs/mongoose';

import {
  HealthModule,
} from '../health/health.module';

import {
  LibraryModule,
} from '../library/library.module';

import {
  NowModule,
} from '../now/now.module';

import {
  JournalController,
} from './journal.controller';

import {
  JournalEnrichmentService,
} from './journal-enrichment.service';

import {
  JournalService,
} from './journal.service';

import {
  JournalEntry,
  JournalEntrySchema,
} from './schemas/journal-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name:
          JournalEntry.name,

        schema:
          JournalEntrySchema,
      },
    ]),

    HealthModule,

    LibraryModule,

    NowModule,
  ],

  controllers: [
    JournalController,
  ],

  providers: [
    JournalService,

    JournalEnrichmentService,
  ],

  exports: [
    JournalService,

    JournalEnrichmentService,
  ],
})
export class JournalModule {}