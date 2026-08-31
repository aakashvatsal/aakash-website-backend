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

import { CreateMemoryPersonDto } from './dto/create-memory-person.dto';
import {
  CreatePersonInteractionDto,
  PersonTimelineQueryDto,
} from './dto/person-interaction.dto';
import { MemoryPersonQueryDto } from './dto/memory-person-query.dto';
import { UpdateMemoryPersonDto } from './dto/update-memory-person.dto';
import { MemoryPeopleService } from './memory-people.service';
import { PersonTimelineService } from './person-timeline.service';

@Controller('memory-people')
export class MemoryPeopleController {
  constructor(
    private readonly memoryPeopleService: MemoryPeopleService,
    private readonly personTimelineService: PersonTimelineService,
  ) {}

  @Post()
  create(
    @Body()
    dto: CreateMemoryPersonDto,
  ) {
    return this.memoryPeopleService.create(dto);
  }

  @Get()
  findAll(
    @Query()
    query: MemoryPersonQueryDto,
  ) {
    return this.memoryPeopleService.findAll(query);
  }

  @Get(':personId/timeline')
  getTimeline(
    @Param('personId') personId: string,
    @Query() query: PersonTimelineQueryDto,
  ) {
    return this.personTimelineService.getTimeline(personId, query);
  }

  @Post(':personId/interactions')
  recordInteraction(
    @Param('personId') personId: string,
    @Body() dto: CreatePersonInteractionDto,
  ) {
    return this.personTimelineService.recordInteraction(personId, dto);
  }

  @Get(':personId')
  findOne(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.findOne(personId);
  }

  @Patch(':personId')
  update(
    @Param('personId')
    personId: string,

    @Body()
    dto: UpdateMemoryPersonDto,
  ) {
    return this.memoryPeopleService.update(personId, dto);
  }

  @Patch(':personId/consent/grant')
  grantConsent(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.grantConsent(personId);
  }

  @Patch(':personId/consent/revoke')
  revokeConsent(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.revokeConsent(personId);
  }

  @Patch(':personId/block')
  block(
    @Param('personId')
    personId: string,

    @Body()
    body: {
      reason?: string;
    },
  ) {
    return this.memoryPeopleService.block(personId, body.reason);
  }

  @Patch(':personId/unblock')
  unblock(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.unblock(personId);
  }

  @Patch(':personId/archive')
  archive(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.archive(personId);
  }

  @Patch(':personId/restore')
  restore(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.restore(personId);
  }

  @Delete(':personId')
  remove(
    @Param('personId')
    personId: string,
  ) {
    return this.memoryPeopleService.remove(personId);
  }
}
