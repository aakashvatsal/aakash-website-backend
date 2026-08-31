import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { ContextEngineModule } from '../context-engine/context-engine.module';
import { HsakaaRuntimeModule } from '../hsakaa-runtime/hsakaa-runtime.module';
import {
  HsakaaRuntimeLease,
  HsakaaRuntimeLeaseSchema,
} from '../hsakaa-runtime/schemas/hsakaa-runtime-lease.schema';
import {
  KnowledgeGraphEdge,
  KnowledgeGraphEdgeSchema,
} from '../knowledge-graph/schemas/knowledge-graph-edge.schema';
import {
  KnowledgeGraphNode,
  KnowledgeGraphNodeSchema,
} from '../knowledge-graph/schemas/knowledge-graph-node.schema';
import { ProactiveModule } from '../proactive/proactive.module';
import {
  ProactiveReview,
  ProactiveReviewSchema,
} from '../proactive/schemas/proactive-review.schema';
import {
  ProactiveSignal,
  ProactiveSignalSchema,
} from '../proactive/schemas/proactive-signal.schema';
import {
  UniversalSearchEmbedding,
  UniversalSearchEmbeddingSchema,
} from '../universal-search/schemas/universal-search-embedding.schema';
import { ReleaseHardeningController } from './release-hardening.controller';
import { ReleaseHardeningService } from './release-hardening.service';

@Module({
  imports: [
    ContextEngineModule,
    ProactiveModule,
    HsakaaRuntimeModule,
    MongooseModule.forFeature([
      { name: KnowledgeGraphNode.name, schema: KnowledgeGraphNodeSchema },
      { name: KnowledgeGraphEdge.name, schema: KnowledgeGraphEdgeSchema },
      {
        name: UniversalSearchEmbedding.name,
        schema: UniversalSearchEmbeddingSchema,
      },
      { name: ProactiveSignal.name, schema: ProactiveSignalSchema },
      { name: ProactiveReview.name, schema: ProactiveReviewSchema },
      { name: HsakaaRuntimeLease.name, schema: HsakaaRuntimeLeaseSchema },
    ]),
  ],
  controllers: [ReleaseHardeningController],
  providers: [HsakaaOwnerSessionGuard, ReleaseHardeningService],
  exports: [ReleaseHardeningService],
})
export class ReleaseHardeningModule {}
