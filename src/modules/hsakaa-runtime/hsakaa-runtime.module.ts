import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaRuntimeLeaseService } from './hsakaa-runtime-lease.service';
import {
  HsakaaRuntimeLease,
  HsakaaRuntimeLeaseSchema,
} from './schemas/hsakaa-runtime-lease.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HsakaaRuntimeLease.name, schema: HsakaaRuntimeLeaseSchema },
    ]),
  ],
  providers: [HsakaaRuntimeLeaseService],
  exports: [HsakaaRuntimeLeaseService],
})
export class HsakaaRuntimeModule {}
