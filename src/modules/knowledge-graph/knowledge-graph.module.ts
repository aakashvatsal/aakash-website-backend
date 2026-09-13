import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  HsakaaDecisionCase,
  HsakaaDecisionCaseSchema,
} from '../../hsakaa/schemas/hsakaa-decision-case.schema';
import { AiModule } from '../ai/ai.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import {
  HealthEntry,
  HealthEntrySchema,
} from '../health/schemas/health-entry.schema';
import {
  JournalEntry,
  JournalEntrySchema,
} from '../journal/schemas/journal-entry.schema';
import {
  LibraryHighlight,
  LibraryHighlightSchema,
} from '../library/schemas/library-highlight.schema';
import {
  LibraryItem,
  LibraryItemSchema,
} from '../library/schemas/library-item.schema';
import { MediaPost, MediaPostSchema } from '../media/schemas/media-post.schema';
import { Memory, MemorySchema } from '../memory/schemas/memory.schema';
import {
  MemoryPerson,
  MemoryPersonSchema,
} from '../memory/schemas/memory-person.schema';
import {
  PersonGraphEdge,
  PersonGraphEdgeSchema,
} from '../memory/schemas/person-graph-edge.schema';
import { Task, TaskSchema } from '../tasks/schemas/task.schema';
import { HealthKnowledgeGraphIntegrationService } from './health-knowledge-graph-integration.service';
import {
  BASE_KNOWLEDGE_GRAPH_SERVICE,
  IntegratedKnowledgeGraphService,
} from './integrated-knowledge-graph.service';
import { KnowledgeGraphController } from './knowledge-graph.controller';
import { KnowledgeGraphReasoningService } from './knowledge-graph-reasoning.service';
import { KnowledgeGraphService } from './knowledge-graph.service';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeSchema,
} from './schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeSchema,
} from './schemas/knowledge-graph-node.schema';

@Module({
  imports: [
    AiModule,
    HsakaaRuntimeModule,
    MongooseModule.forFeature([
      { name: KnowledgeGraphNode.name, schema: KnowledgeGraphNodeSchema },
      { name: KnowledgeGraphEdge.name, schema: KnowledgeGraphEdgeSchema },
      { name: MemoryPerson.name, schema: MemoryPersonSchema },
      { name: PersonGraphEdge.name, schema: PersonGraphEdgeSchema },
      { name: Company.name, schema: CompanySchema },
      { name: HsakaaDecisionCase.name, schema: HsakaaDecisionCaseSchema },
      { name: JournalEntry.name, schema: JournalEntrySchema },
      { name: Memory.name, schema: MemorySchema },
      { name: LibraryItem.name, schema: LibraryItemSchema },
      { name: LibraryHighlight.name, schema: LibraryHighlightSchema },
      { name: HealthEntry.name, schema: HealthEntrySchema },
      { name: MediaPost.name, schema: MediaPostSchema },
      { name: Task.name, schema: TaskSchema },
    ]),
  ],
  controllers: [KnowledgeGraphController],
  providers: [
    HsakaaOwnerSessionGuard,
    {
      provide: BASE_KNOWLEDGE_GRAPH_SERVICE,
      useClass: KnowledgeGraphService,
    },
    HealthKnowledgeGraphIntegrationService,
    IntegratedKnowledgeGraphService,
    {
      provide: KnowledgeGraphService,
      useExisting: IntegratedKnowledgeGraphService,
    },
    KnowledgeGraphReasoningService,
  ],
  exports: [KnowledgeGraphService, KnowledgeGraphReasoningService],
})
export class KnowledgeGraphModule {}
