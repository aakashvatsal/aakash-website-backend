import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { DietController } from './diet.controller';
import { DietService } from './diet.service';
import { DietEntry, DietEntrySchema } from './schemas/diet-entry.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DietEntry.name,
        schema: DietEntrySchema,
      },
    ]),
  ],
  controllers: [DietController],
  providers: [DietService],
  exports: [DietService],
})
export class DietModule {}
