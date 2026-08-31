import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AiModule } from '../ai/ai.module';
import {
  JournalEntry,
  JournalEntrySchema,
} from '../journal/schemas/journal-entry.schema';
import { MediaPost, MediaPostSchema } from '../media/schemas/media-post.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseSchema,
} from '../../hsakaa/schemas/hsakaa-decision-case.schema';

import { MemoryController } from './memory.controller';
import { MemoryInboxService } from './memory-inbox.service';
import { MemoryService } from './memory.service';
import { MemoryPeopleController } from './memory-people.controller';
import { MemoryPeopleService } from './memory-people.service';
import { MemoryRecallService } from './memory-recall.service';
import { PersonGraphController } from './person-graph.controller';
import { PersonGraphService } from './person-graph.service';
import { PersonOpenLoopsController } from './person-open-loops.controller';
import { PersonOpenLoopsService } from './person-open-loops.service';
import { PersonRelationshipContextController } from './person-relationship-context.controller';
import { PersonRelationshipContextService } from './person-relationship-context.service';
import { PersonTimelineService } from './person-timeline.service';
import { MemoryReviewService } from './memory-review.service';
import { MemoryVerificationController } from './memory-verification.controller';
import { MemoryVerificationService } from './memory-verification.service';
import { Memory, MemorySchema } from './schemas/memory.schema';
import {
  MemoryInboxItem,
  MemoryInboxItemSchema,
} from './schemas/memory-inbox-item.schema';
import {
  MemoryPerson,
  MemoryPersonSchema,
} from './schemas/memory-person.schema';
import {
  PersonInteraction,
  PersonInteractionSchema,
} from './schemas/person-interaction.schema';
import {
  PersonGraphEdge,
  PersonGraphEdgeSchema,
} from './schemas/person-graph-edge.schema';
import {
  PersonOpenLoop,
  PersonOpenLoopSchema,
} from './schemas/person-open-loop.schema';
import {
  PersonRelationshipContext,
  PersonRelationshipContextSchema,
} from './schemas/person-relationship-context.schema';
import {
  PersonVerificationSession,
  PersonVerificationSessionSchema,
} from './schemas/person-verification-session.schema';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      {
        name: Memory.name,
        schema: MemorySchema,
      },
      {
        name: MemoryInboxItem.name,
        schema: MemoryInboxItemSchema,
      },
      {
        name: MemoryPerson.name,
        schema: MemoryPersonSchema,
      },
      {
        name: PersonVerificationSession.name,
        schema: PersonVerificationSessionSchema,
      },
      { name: PersonInteraction.name, schema: PersonInteractionSchema },
      { name: PersonGraphEdge.name, schema: PersonGraphEdgeSchema },
      { name: PersonOpenLoop.name, schema: PersonOpenLoopSchema },
      {
        name: PersonRelationshipContext.name,
        schema: PersonRelationshipContextSchema,
      },
      { name: Task.name, schema: TaskSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: MediaPost.name, schema: MediaPostSchema },
      { name: HsakaaDecisionCase.name, schema: HsakaaDecisionCaseSchema },
    ]),
  ],
  controllers: [
    MemoryController,
    PersonGraphController,
    PersonOpenLoopsController,
    PersonRelationshipContextController,
    MemoryPeopleController,
    MemoryVerificationController,
  ],
  providers: [
    MemoryService,
    MemoryInboxService,
    MemoryPeopleService,
    MemoryVerificationService,
    MemoryRecallService,
    MemoryReviewService,
    PersonGraphService,
    PersonOpenLoopsService,
    PersonRelationshipContextService,
    PersonTimelineService,
  ],
  exports: [
    MemoryService,
    MemoryInboxService,
    MemoryPeopleService,
    MemoryVerificationService,
    MemoryRecallService,
    MemoryReviewService,
    PersonGraphService,
    PersonOpenLoopsService,
    PersonRelationshipContextService,
    PersonTimelineService,
    MongooseModule,
  ],
})
export class MemoryModule {}
