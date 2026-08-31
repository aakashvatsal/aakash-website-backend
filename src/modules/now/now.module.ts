import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { NowController } from './now.controller';

import { NowService } from './now.service';

import { NowStatus, NowStatusSchema } from './schemas/now-status.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: NowStatus.name,

        schema: NowStatusSchema,
      },
    ]),
  ],

  controllers: [NowController],

  providers: [NowService],

  exports: [NowService],
})
export class NowModule {}
