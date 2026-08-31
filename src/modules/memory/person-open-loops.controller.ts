import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ClosePersonOpenLoopDto,
  CreatePersonOpenLoopDto,
  PersonOpenLoopQueryDto,
  ReopenPersonOpenLoopDto,
  UpdatePersonOpenLoopDto,
} from './dto/person-open-loop.dto';
import { PersonOpenLoopsService } from './person-open-loops.service';

@Controller('memory-people')
export class PersonOpenLoopsController {
  constructor(
    private readonly personOpenLoopsService: PersonOpenLoopsService,
  ) {}

  @Get('open-loops')
  getOpenQueue(@Query() query: PersonOpenLoopQueryDto) {
    return this.personOpenLoopsService.getOpenQueue(query);
  }

  @Get(':personId/open-loops')
  findForPerson(
    @Param('personId') personId: string,
    @Query() query: PersonOpenLoopQueryDto,
  ) {
    return this.personOpenLoopsService.findForPerson(personId, query);
  }

  @Post(':personId/open-loops')
  create(
    @Param('personId') personId: string,
    @Body() dto: CreatePersonOpenLoopDto,
  ) {
    return this.personOpenLoopsService.create(personId, dto);
  }

  @Patch(':personId/open-loops/:openLoopId')
  update(
    @Param('personId') personId: string,
    @Param('openLoopId') openLoopId: string,
    @Body() dto: UpdatePersonOpenLoopDto,
  ) {
    return this.personOpenLoopsService.update(personId, openLoopId, dto);
  }

  @Patch(':personId/open-loops/:openLoopId/resolve')
  resolve(
    @Param('personId') personId: string,
    @Param('openLoopId') openLoopId: string,
    @Body() dto: ClosePersonOpenLoopDto,
  ) {
    return this.personOpenLoopsService.resolve(personId, openLoopId, dto);
  }

  @Patch(':personId/open-loops/:openLoopId/dismiss')
  dismiss(
    @Param('personId') personId: string,
    @Param('openLoopId') openLoopId: string,
    @Body() dto: ClosePersonOpenLoopDto,
  ) {
    return this.personOpenLoopsService.dismiss(personId, openLoopId, dto);
  }

  @Patch(':personId/open-loops/:openLoopId/reopen')
  reopen(
    @Param('personId') personId: string,
    @Param('openLoopId') openLoopId: string,
    @Body() dto: ReopenPersonOpenLoopDto,
  ) {
    return this.personOpenLoopsService.reopen(personId, openLoopId, dto);
  }
}
