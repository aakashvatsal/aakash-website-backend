import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  CreatePersonGraphEdgeDto,
  PersonGraphOverviewQueryDto,
  PersonGraphPathQueryDto,
  UpdatePersonGraphEdgeDto,
} from './dto/person-graph.dto';
import { PersonGraphService } from './person-graph.service';

@Controller('memory-people')
export class PersonGraphController {
  constructor(private readonly personGraphService: PersonGraphService) {}

  @Get('graph/overview')
  getOverview(@Query() query: PersonGraphOverviewQueryDto) {
    return this.personGraphService.getOverview(query);
  }

  @Get('graph/path')
  findPath(@Query() query: PersonGraphPathQueryDto) {
    return this.personGraphService.findPath(
      query.fromPersonId,
      query.toPersonId,
      query.maxDepth,
    );
  }

  @Get('graph/mutuals/:firstPersonId/:secondPersonId')
  getMutualConnections(
    @Param('firstPersonId') firstPersonId: string,
    @Param('secondPersonId') secondPersonId: string,
  ) {
    return this.personGraphService.getMutualConnections(
      firstPersonId,
      secondPersonId,
    );
  }

  @Get(':personId/graph')
  getForPerson(@Param('personId') personId: string) {
    return this.personGraphService.getForPerson(personId);
  }

  @Post(':personId/graph/connections')
  createConnection(
    @Param('personId') personId: string,
    @Body() dto: CreatePersonGraphEdgeDto,
  ) {
    return this.personGraphService.createConnection(personId, dto);
  }

  @Patch(':personId/graph/connections/:edgeId')
  updateConnection(
    @Param('personId') personId: string,
    @Param('edgeId') edgeId: string,
    @Body() dto: UpdatePersonGraphEdgeDto,
  ) {
    return this.personGraphService.updateConnection(personId, edgeId, dto);
  }

  @Delete(':personId/graph/connections/:edgeId')
  deleteConnection(
    @Param('personId') personId: string,
    @Param('edgeId') edgeId: string,
  ) {
    return this.personGraphService.deleteConnection(personId, edgeId);
  }
}
