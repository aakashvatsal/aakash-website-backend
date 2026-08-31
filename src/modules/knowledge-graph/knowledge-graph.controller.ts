import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import {
  AskKnowledgeGraphDto,
  KnowledgeGraphNeighborsQueryDto,
  KnowledgeGraphOverviewQueryDto,
  KnowledgeGraphPathQueryDto,
  KnowledgeGraphTimelineQueryDto,
} from './dto/knowledge-graph.dto';
import { KnowledgeGraphReasoningService } from './knowledge-graph-reasoning.service';
import { KnowledgeGraphService } from './knowledge-graph.service';

@UseGuards(HsakaaOwnerSessionGuard)
@Controller('hsakaa/private/knowledge-graph')
export class KnowledgeGraphController {
  constructor(
    private readonly graphService: KnowledgeGraphService,
    private readonly reasoningService: KnowledgeGraphReasoningService,
  ) {}

  @Get('overview')
  getOverview(@Query() query: KnowledgeGraphOverviewQueryDto) {
    return this.graphService.getOverview(query);
  }

  @Post('sync')
  sync() {
    return this.graphService.syncAll();
  }

  @Get('timeline')
  getTimeline(@Query() query: KnowledgeGraphTimelineQueryDto) {
    return this.graphService.getTimeline(query);
  }

  @Get('path')
  findPath(@Query() query: KnowledgeGraphPathQueryDto) {
    return this.graphService.findPath(query);
  }

  @Post('ask')
  ask(@Body() dto: AskKnowledgeGraphDto) {
    return this.reasoningService.ask(dto);
  }

  @Get('nodes/:nodeKey/neighbors')
  getNeighbors(
    @Param('nodeKey') nodeKey: string,
    @Query() query: KnowledgeGraphNeighborsQueryDto,
  ) {
    return this.graphService.getNeighbors(nodeKey, query);
  }

  @Get('nodes/:nodeKey')
  getNode(@Param('nodeKey') nodeKey: string) {
    return this.graphService.getNode(nodeKey);
  }
}
