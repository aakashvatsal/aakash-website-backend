import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { JournalModule } from '../journal/journal.module';
import { MemoryModule } from '../memory/memory.module';
import { TasksModule } from '../tasks/tasks.module';

import { BrainDumpController } from './brain-dump.controller';
import { BrainDumpService } from './brain-dump.service';
import { BrainDump, BrainDumpSchema } from './schemas/brain-dump.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: BrainDump.name,
        schema: BrainDumpSchema,
      },
    ]),
    TasksModule,
    JournalModule,
    MemoryModule,
  ],
  controllers: [BrainDumpController],
  providers: [BrainDumpService],
  exports: [BrainDumpService, MongooseModule],
})
export class BrainDumpModule {}
