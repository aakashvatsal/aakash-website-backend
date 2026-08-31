import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MeditationController } from './meditation.controller';
import { MeditationService } from './meditation.service';
import {
  MeditationEntry,
  MeditationEntrySchema,
} from './schemas/meditation-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MeditationEntry.name,
        schema: MeditationEntrySchema,
      },
    ]),
  ],
  controllers: [MeditationController],
  providers: [MeditationService],
  exports: [MeditationService, MongooseModule],
})
export class MeditationModule {}
