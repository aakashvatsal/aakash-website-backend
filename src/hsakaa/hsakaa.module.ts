import { Module } from '@nestjs/common';
import { HsakaaService } from './hsakaa.service';
import { HsakaaController } from './hsakaa.controller';

@Module({
  controllers: [HsakaaController],
  providers: [HsakaaService],
})
export class HsakaaModule {}
