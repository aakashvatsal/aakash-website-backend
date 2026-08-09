import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { MemoryPeopleController } from './memory-people.controller';
import { MemoryPeopleService } from './memory-people.service';
import { MemoryVerificationController } from './memory-verification.controller';
import { MemoryVerificationService } from './memory-verification.service';
import {
  Memory,
  MemorySchema,
} from './schemas/memory.schema';
import {
  MemoryPerson,
  MemoryPersonSchema,
} from './schemas/memory-person.schema';
import {
  PersonVerificationSession,
  PersonVerificationSessionSchema,
} from './schemas/person-verification-session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Memory.name,
        schema: MemorySchema,
      },
      {
        name: MemoryPerson.name,
        schema: MemoryPersonSchema,
      },
      {
        name: PersonVerificationSession.name,
        schema:
          PersonVerificationSessionSchema,
      },
    ]),
  ],
  controllers: [
    MemoryController,
    MemoryPeopleController,
    MemoryVerificationController,
  ],
  providers: [
    MemoryService,
    MemoryPeopleService,
    MemoryVerificationService,
  ],
  exports: [
    MemoryService,
    MemoryPeopleService,
    MemoryVerificationService,
    MongooseModule,
  ],
})
export class MemoryModule {}