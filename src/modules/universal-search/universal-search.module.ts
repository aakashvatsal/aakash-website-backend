import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { AiModule } from '../ai/ai.module';
import { HsakaaObservabilityModule } from '../hsakaa-observability/hsakaa-observability.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeSchema,
} from '../knowledge-graph/schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeSchema,
} from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import {
  UniversalSearchEmbedding,
  UniversalSearchEmbeddingSchema,
} from './schemas/universal-search-embedding.schema';
import { UniversalSearchController } from './universal-search.controller';
import { UniversalSearchService } from './universal-search.service';

@Module({
  imports: [
    AiModule,
    HsakaaObservabilityModule,
    HsakaaRuntimeModule,
    KnowledgeGraphModule,
    MongooseModule.forFeature([
      { name: KnowledgeGraphNode.name, schema: KnowledgeGraphNodeSchema },
      { name: KnowledgeGraphEdge.name, schema: KnowledgeGraphEdgeSchema },
      {
        name: UniversalSearchEmbedding.name,
        schema: UniversalSearchEmbeddingSchema,
      },
    ]),
  ],
  controllers: [UniversalSearchController],
  providers: [HsakaaOwnerSessionGuard, UniversalSearchService],
  exports: [UniversalSearchService],
})
export class UniversalSearchModule {}
